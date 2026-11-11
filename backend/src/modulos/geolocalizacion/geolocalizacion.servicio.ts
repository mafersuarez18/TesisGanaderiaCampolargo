import { Readable } from 'stream';
import { randomBytes } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorConflicto, ErrorNoAutorizado, ErrorNoEncontrado, ErrorValidacionDatos } from '../../compartido/tipos/respuesta';

// ─── Posiciones actuales ───────────────────────────────────────────────────────

export interface FiltrosAnimalesUbicacion {
  fincaId?: string;
  loteId?: string;
}

/**
 * Última posición conocida de cada animal activo. La posición no se guarda en
 * Animal — se deriva del registro de ubicación más reciente (RegistroUbicacion)
 * de cada uno.
 */
export async function listarAnimalesConUbicacion(filtros: FiltrosAnimalesUbicacion = {}) {
  const { fincaId, loteId } = filtros;

  const ultimasUbicaciones = await prisma.registroUbicacion.findMany({
    where: {
      animal: {
        estado: 'ACTIVO',
        ...(loteId ? { loteId } : {}),
        ...(fincaId ? { lote: { fincaId } } : {}),
      },
    },
    orderBy: [{ animalId: 'asc' }, { fechaRegistro: 'desc' }],
    distinct: ['animalId'],
    select: {
      latitud: true,
      longitud: true,
      fechaRegistro: true,
      animal: {
        select: {
          id: true,
          numeroIdentificacion: true,
          nombre: true,
          lote: { select: { id: true, nombre: true, finca: { select: { id: true, nombre: true } } } },
          raza: { select: { nombre: true } },
          sexo: true,
          estadoSanitario: true,
        },
      },
    },
  });

  return ultimasUbicaciones.map((u) => ({
    id: u.animal.id,
    numeroIdentificacion: u.animal.numeroIdentificacion,
    nombre: u.animal.nombre,
    latitudActual: u.latitud,
    longitudActual: u.longitud,
    fechaUltimaSenal: u.fechaRegistro,
    lote: u.animal.lote,
    raza: u.animal.raza,
    sexo: u.animal.sexo,
    estadoSanitario: u.animal.estadoSanitario,
  }));
}

// ─── Historial de ubicaciones ──────────────────────────────────────────────────

export async function obtenerHistorialUbicacion(animalId: string, limite: number) {
  return prisma.registroUbicacion.findMany({
    where: { animalId },
    orderBy: { fechaRegistro: 'desc' },
    take: limite,
  });
}

// ─── Ingesta de posición desde un dispositivo GPS ─────────────────────────────

export interface DatosUbicacionDispositivo {
  latitud: number;
  longitud: number;
  precision?: number;
  velocidad?: number;
}

export async function registrarUbicacionDispositivo(apiKey: string, datos: DatosUbicacionDispositivo) {
  const dispositivo = await prisma.dispositivoGPS.findUnique({
    where: { apiKey },
    select: { id: true, animalId: true },
  });
  if (!dispositivo) throw new ErrorNoAutorizado('API key del dispositivo no válida');

  const [registro] = await prisma.$transaction([
    prisma.registroUbicacion.create({
      data: {
        animalId: dispositivo.animalId,
        dispositivoGPSId: dispositivo.id,
        ...datos,
      },
    }),
    // Cada posición recibida es, por definición, una señal del dispositivo:
    // se actualiza su última conexión para que el estado "en línea" del
    // panel de dispositivos refleje la realidad.
    prisma.dispositivoGPS.update({
      where: { id: dispositivo.id },
      data: { ultimaConexion: new Date(), estado: 'ACTIVO' },
    }),
  ]);

  return registro;
}

// ─── Catálogo de dispositivos ──────────────────────────────────────────────────

export async function listarDispositivos() {
  return prisma.dispositivoGPS.findMany({
    include: {
      animal: {
        select: {
          numeroIdentificacion: true,
          nombre: true,
          lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: { codigoDispositivo: 'asc' },
  });
}

export interface DatosNuevoDispositivo {
  codigoDispositivo: string;
  animalId: string;
  modelo?: string;
  fabricante?: string;
  frecuenciaActualizacion?: number; // segundos
}

/**
 * Registra un collar y lo asigna a un animal. Nace sin señal: pasa a "en
 * línea" cuando llega su primera posición (importada o por el endpoint).
 */
export async function crearDispositivo(datos: DatosNuevoDispositivo) {
  const animal = await prisma.animal.findUnique({
    where: { id: datos.animalId },
    select: { estado: true, dispositivoGPS: { select: { codigoDispositivo: true } } },
  });
  if (!animal) throw new ErrorNoEncontrado('Animal no encontrado');
  if (animal.estado !== 'ACTIVO') throw new ErrorValidacionDatos('Solo se puede asignar un collar a un animal activo');
  if (animal.dispositivoGPS) {
    throw new ErrorConflicto(`Este animal ya tiene asignado el collar ${animal.dispositivoGPS.codigoDispositivo}`);
  }
  const existente = await prisma.dispositivoGPS.findUnique({
    where: { codigoDispositivo: datos.codigoDispositivo }, select: { id: true },
  });
  if (existente) throw new ErrorConflicto('Ya existe un dispositivo con ese código');

  return prisma.dispositivoGPS.create({
    data: {
      ...datos,
      estado: 'SIN_SEÑAL',
      apiKey: randomBytes(24).toString('hex'),
    },
  });
}

// ─── Reporte de movilidad ──────────────────────────────────────────────────────
// Distancia recorrida, tiempo de actividad y velocidad promedio de un animal,
// calculados a partir de su historial de RegistroUbicacion. Este cálculo vivía
// solo en el frontend (a partir de datos simulados); ahora es un cálculo del
// backend que funciona igual con datos reales de dispositivos IoT.

const RADIO_TIERRA_METROS = 6_371_000;

function distanciaHaversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_METROS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface FiltrosMovilidad {
  desde?: Date;
  hasta?: Date;
  limite?: number;
}

export async function obtenerMovilidadAnimal(animalId: string, filtros: FiltrosMovilidad = {}) {
  const { desde, hasta, limite = 200 } = filtros;

  const registros = await prisma.registroUbicacion.findMany({
    where: {
      animalId,
      ...((desde || hasta) && {
        fechaRegistro: {
          ...(desde && { gte: desde }),
          ...(hasta && { lte: hasta }),
        },
      }),
    },
    // Las más recientes dentro del rango, devueltas en orden cronológico
    orderBy: { fechaRegistro: 'desc' },
    take: limite,
  });
  registros.reverse();

  if (registros.length === 0) {
    return {
      animalId,
      cantidadRegistros: 0,
      distanciaMetros: 0,
      duracionMinutos: 0,
      velocidadPromedioKmH: 0,
      puntos: [] as typeof registros,
    };
  }

  let distanciaMetros = 0;
  for (let i = 1; i < registros.length; i++) {
    distanciaMetros += distanciaHaversineMetros(
      registros[i - 1]!.latitud, registros[i - 1]!.longitud,
      registros[i]!.latitud, registros[i]!.longitud,
    );
  }

  const duracionMinutos = registros.length > 1
    ? Math.round(
        (registros[registros.length - 1]!.fechaRegistro.getTime() - registros[0]!.fechaRegistro.getTime())
        / 60_000,
      )
    : 0;

  // Velocidad promedio: si el dispositivo reporta velocidad instantánea, se
  // promedian esos valores; si no, se estima a partir de distancia/tiempo.
  const velocidadesRegistradas = registros
    .map((r) => r.velocidad)
    .filter((v): v is number => v != null);

  const velocidadPromedioKmH = velocidadesRegistradas.length > 0
    ? +(velocidadesRegistradas.reduce((s, v) => s + v, 0) / velocidadesRegistradas.length).toFixed(1)
    : duracionMinutos > 0
      ? +((distanciaMetros / 1000) / (duracionMinutos / 60)).toFixed(1)
      : 0;

  return {
    animalId,
    cantidadRegistros: registros.length,
    distanciaMetros: Math.round(distanciaMetros),
    duracionMinutos,
    velocidadPromedioKmH,
    puntos: registros,
  };
}

// ─── Importación de reportes de dispositivos satelitales ──────────────────────
// Los collares GPS satelitales (p. ej. Digitanimal SAT) no llaman a un
// endpoint propio en tiempo real: reportan su posición por vía satelital a la
// plataforma del fabricante, que expone esos datos para descarga en CSV/XLS.
// Esta función toma ese archivo exportado y lo convierte en RegistroUbicacion,
// exactamente como si el dispositivo hubiera llamado al endpoint de ingesta —
// es la vía de "configurar y listo" para este tipo de hardware cerrado.

// Nombres de columna reconocidos por campo (comparados ya normalizados: sin
// acentos, en minúsculas y sin símbolos). Cubre los encabezados en español e
// inglés más comunes en exportaciones de plataformas de rastreo GPS ganadero;
// si el archivo real trae encabezados distintos, el error de importación lista
// los encabezados encontrados para ajustar este diccionario en minutos.
const COLUMNAS_RECONOCIDAS = {
  latitud:   ['latitud', 'latitude', 'lat'],
  longitud:  ['longitud', 'longitude', 'lng', 'lon', 'long'],
  fecha:     ['fecha', 'fechahora', 'fechayhora', 'timestamp', 'datetime', 'date', 'gpstime', 'fecharegistro'],
  velocidad: ['velocidad', 'speed', 'velocidadkmh', 'speedkmh'],
  altitud:   ['altitud', 'altitude', 'alt', 'elevation'],
} as const satisfies Record<string, readonly string[]>;

type CampoColumna = keyof typeof COLUMNAS_RECONOCIDAS;

function detectarDelimitadorCsv(buffer: Buffer): string {
  const primeraLinea = buffer.toString('utf8', 0, 2000).split(/\r?\n/, 1)[0] ?? '';
  const candidatos = [',', ';', '\t'] as const;
  const conteos = candidatos.map((c) => (primeraLinea.match(new RegExp(`\\${c}`, 'g')) ?? []).length);
  const indiceMax = conteos.indexOf(Math.max(...conteos));
  return conteos[indiceMax]! > 0 ? candidatos[indiceMax]! : ',';
}

function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // ignora espacios, guiones y unidades entre paréntesis
}

function detectarColumnas(encabezados: (string | undefined)[]): Partial<Record<CampoColumna, number>> {
  const detectadas: Partial<Record<CampoColumna, number>> = {};
  encabezados.forEach((encabezado, indice) => {
    if (!encabezado) return;
    const normalizado = normalizarEncabezado(encabezado);
    for (const campo of Object.keys(COLUMNAS_RECONOCIDAS) as CampoColumna[]) {
      if (detectadas[campo] != null) continue;
      if (COLUMNAS_RECONOCIDAS[campo].some((alias) => normalizarEncabezado(alias) === normalizado)) {
        detectadas[campo] = indice;
      }
    }
  });
  return detectadas;
}

// Convierte "10,1875" (coma decimal, habitual en exportaciones en español) o
// "10.1875" a número; también acepta el valor ya numérico de una celda Excel.
function aNumero(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return valor;
  const num = Number(String(valor).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function aFecha(valor: unknown): Date | null {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const texto = String(valor).trim();

  // Formato DD/MM/YYYY [HH:mm[:ss]], el habitual en exportaciones en español —
  // se comprueba ANTES que el parseo nativo porque new Date("01/09/2026") lo
  // interpreta como MM/DD/YYYY (formato estadounidense) y da una fecha
  // distinta a la que trae el archivo.
  const conBarras = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})[ T]?(\d{1,2}:\d{2}(:\d{2})?)?$/);
  if (conBarras) {
    const [, d, m, a, hora] = conBarras;
    const anio = a!.length === 2 ? Number(`20${a}`) : Number(a);
    const fecha = new Date(`${anio}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}T${hora ?? '00:00:00'}`);
    if (!Number.isNaN(fecha.getTime())) return fecha;
  }

  // Cualquier otro formato (ISO 8601 "YYYY-MM-DD...", nombres de mes, etc.),
  // donde el parseo nativo no tiene la ambigüedad DD/MM vs MM/DD anterior.
  const directa = new Date(texto);
  if (!Number.isNaN(directa.getTime())) return directa;

  return null;
}

export interface ResultadoImportacion {
  filasProcesadas: number;
  registrosImportados: number;
  filasOmitidas: number;
  errores: string[];
  columnasDetectadas: string[];
}

export async function importarUbicacionesDesdeArchivo(
  dispositivoId: string,
  buffer: Buffer,
  nombreArchivo: string,
): Promise<ResultadoImportacion> {
  const dispositivo = await prisma.dispositivoGPS.findUnique({
    where: { id: dispositivoId },
    select: { id: true, animalId: true },
  });
  if (!dispositivo) throw new ErrorNoEncontrado('Dispositivo GPS');

  const libro = new ExcelJS.Workbook();
  if (/\.csv$/i.test(nombreArchivo)) {
    // Las exportaciones en español suelen usar ";" como separador de columnas
    // (la "," queda reservada para el decimal); se detecta a partir de la
    // primera línea en vez de asumir uno fijo.
    const delimitador = detectarDelimitadorCsv(buffer);
    await libro.csv.read(Readable.from(buffer), { parserOptions: { delimiter: delimitador } });
  } else {
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  }
  const hoja = libro.worksheets[0];
  if (!hoja || hoja.rowCount < 2) {
    throw new ErrorValidacionDatos('El archivo no contiene filas de datos (se esperaba un encabezado y al menos una fila)');
  }

  const encabezados: (string | undefined)[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, col) => {
    encabezados[col] = celda.text?.trim();
  });

  const columnas = detectarColumnas(encabezados);
  if (columnas.latitud == null || columnas.longitud == null) {
    throw new ErrorValidacionDatos(
      `No se pudieron identificar las columnas de latitud/longitud. Encabezados encontrados: ${encabezados.filter(Boolean).join(', ') || '(sin encabezados)'}`,
    );
  }

  const registros: {
    animalId: string; dispositivoGPSId: string; latitud: number; longitud: number;
    altitud?: number; velocidad?: number; fechaRegistro?: Date;
  }[] = [];
  const errores: string[] = [];
  let filasProcesadas = 0;

  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila++) {
    const fila = hoja.getRow(numeroFila);
    if (fila.actualCellCount === 0) continue;
    filasProcesadas++;

    const latitud  = aNumero(fila.getCell(columnas.latitud).value);
    const longitud = aNumero(fila.getCell(columnas.longitud).value);
    if (latitud == null || longitud == null || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
      errores.push(`Fila ${numeroFila}: latitud/longitud inválida o vacía`);
      continue;
    }

    const fecha     = columnas.fecha     != null ? aFecha(fila.getCell(columnas.fecha).value)         : null;
    const velocidad = columnas.velocidad != null ? aNumero(fila.getCell(columnas.velocidad).value)    : null;
    const altitud   = columnas.altitud   != null ? aNumero(fila.getCell(columnas.altitud).value)      : null;

    registros.push({
      animalId: dispositivo.animalId,
      dispositivoGPSId: dispositivo.id,
      latitud,
      longitud,
      ...(altitud != null && { altitud }),
      ...(velocidad != null && { velocidad }),
      ...(fecha != null && { fechaRegistro: fecha }),
    });
  }

  if (registros.length === 0) {
    throw new ErrorValidacionDatos('Ninguna fila del archivo pudo convertirse en un registro de ubicación válido');
  }

  const ultimaFecha = registros.reduce<Date | null>((max, r) => (
    r.fechaRegistro && (!max || r.fechaRegistro > max) ? r.fechaRegistro : max
  ), null);

  await prisma.$transaction([
    prisma.registroUbicacion.createMany({ data: registros }),
    prisma.dispositivoGPS.update({
      where: { id: dispositivo.id },
      data: { ultimaConexion: ultimaFecha ?? new Date(), estado: 'ACTIVO' },
    }),
  ]);

  return {
    filasProcesadas,
    registrosImportados: registros.length,
    filasOmitidas: filasProcesadas - registros.length,
    errores: errores.slice(0, 20), // no saturar la respuesta si hay muchas filas con problemas
    columnasDetectadas: (Object.keys(columnas) as CampoColumna[]).map((campo) => `${campo}: "${encabezados[columnas[campo]!]}"`),
  };
}
