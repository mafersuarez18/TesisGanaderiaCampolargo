import { Prisma, Sexo, EstadoAnimal, TipoPropositoAnimal, CondicionReproductivaVacuna } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorNoEncontrado, ErrorConflicto } from '../../compartido/tipos/respuesta';
import { resolverNotificacionesDeEntidad } from '../notificaciones/notificaciones.servicio';
import { motivosNoAplica, cargarEstadoReproductivo, SELECCION_CRITERIOS } from './aplicabilidad';

// Al registrar una vacunación se calcula automáticamente proximaFecha
// (fecha + intervaloDias del calendario), que es lo que luego usa el motor
// de alertas para avisar de vacunas próximas a vencer.

// ─── Calendarios ─────────────────────────────────────────────────────────────

export async function listarCalendarios() {
  return prisma.calendarioVacunacion.findMany({
    include: {
      medicamento: { select: { id: true, nombre: true, principioActivo: true, laboratorio: true } },
      _count: { select: { registrosVacunacion: true } },
    },
    orderBy: { nombreVacuna: 'asc' },
  });
}

export async function obtenerCalendario(id: string) {
  const calendario = await prisma.calendarioVacunacion.findUnique({
    where: { id },
    include: {
      medicamento: true,
      registrosVacunacion: {
        include: {
          animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
          aplicadoPor: { select: { nombre: true, apellido: true } },
        },
        orderBy: { fechaAplicacion: 'desc' },
        take: 50,
      },
    },
  });
  if (!calendario) throw new ErrorNoEncontrado(`Calendario con id '${id}' no encontrado`);
  return calendario;
}

export interface DatosCalendario {
  nombreVacuna:    string;
  descripcion?:    string;
  medicamentoId?:  string;
  intervaloDias:   number;
  edadMinimasDias?: number | null;
  edadMaximaDias?:  number | null;
  aplicaASexo?:    Sexo | null;
  aplicaAPropositos?: TipoPropositoAnimal[];
  aplicaACondicion?:  CondicionReproductivaVacuna | null;
}

export async function crearCalendario(datos: DatosCalendario) {
  const { medicamentoId, ...resto } = datos;
  return prisma.calendarioVacunacion.create({
    data: {
      ...resto,
      ...(medicamentoId && { medicamento: { connect: { id: medicamentoId } } }),
    },
    include: {
      medicamento: { select: { id: true, nombre: true } },
      _count: { select: { registrosVacunacion: true } },
    },
  });
}

export async function actualizarCalendario(id: string, datos: Partial<DatosCalendario>) {
  const calendario = await prisma.calendarioVacunacion.findUnique({ where: { id }, select: { id: true } });
  if (!calendario) throw new ErrorNoEncontrado(`Calendario con id '${id}' no encontrado`);

  const { medicamentoId, ...resto } = datos;
  return prisma.calendarioVacunacion.update({
    where: { id },
    data: {
      ...resto,
      ...(medicamentoId !== undefined && {
        medicamento: medicamentoId
          ? { connect: { id: medicamentoId } }
          : { disconnect: true },
      }),
    },
  });
}

// ─── Registros de vacunación ──────────────────────────────────────────────────

export interface FiltrosRegistroVacunacion {
  animalId?:              string;
  calendarioVacunacionId?: string;
  fincaId?:               string;
  desde?:                 Date;
  hasta?:                 Date;
  pagina?:                number;
  porPagina?:             number;
}

export async function listarRegistrosVacunacion(filtros: FiltrosRegistroVacunacion = {}) {
  const { animalId, calendarioVacunacionId, fincaId, desde, hasta, pagina = 1, porPagina = 20 } = filtros;

  const donde: Prisma.RegistroVacunacionWhereInput = {
    ...(calendarioVacunacionId && { calendarioVacunacionId }),
    ...(animalId  && { animalId }),
    ...(fincaId   && { animal: { lote: { fincaId } } }),
    ...((desde || hasta) && {
      fechaAplicacion: {
        ...(desde && { gte: desde }),
        ...(hasta && { lte: hasta }),
      },
    }),
  };

  const [registros, total] = await prisma.$transaction([
    prisma.registroVacunacion.findMany({
      where: donde,
      include: {
        animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
        calendarioVacunacion: {
          select: { id: true, nombreVacuna: true, intervaloDias: true },
        },
        medicamento: { select: { id: true, nombre: true } },
        aplicadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
      orderBy: { fechaAplicacion: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.registroVacunacion.count({ where: donde }),
  ]);

  return { registros, total };
}

export interface DatosRegistroVacunacion {
  animalId:               string;
  calendarioVacunacionId: string;
  medicamentoId?:         string;
  fechaAplicacion:        Date;
  dosis?:                 string;
  viaAdministracion?:     string;
  lote?:                  string;
  observaciones?:         string;
  aplicadoPorId:          string;
}

// Si el calendario le corresponde al animal según sus categorías; el
// formulario de aplicación lo consulta para advertir antes de guardar.
export async function verificarAplicabilidad(calendarioId: string, animalId: string) {
  const [calendario, animal] = await Promise.all([
    prisma.calendarioVacunacion.findUnique({ where: { id: calendarioId }, select: SELECCION_CRITERIOS }),
    prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true, sexo: true, fechaNacimiento: true, proposito: true },
    }),
  ]);
  if (!calendario) throw new ErrorNoEncontrado('Calendario de vacunación');
  if (!animal) throw new ErrorNoEncontrado('Animal');

  const { gestantes, ultimoParto } = await cargarEstadoReproductivo([animal.id]);
  const motivos = motivosNoAplica(calendario, {
    ...animal,
    gestante: gestantes.has(animal.id),
    ultimoParto: ultimoParto.get(animal.id) ?? null,
  });
  return { aplica: motivos.length === 0, motivos };
}

export async function registrarVacunacion(datos: DatosRegistroVacunacion) {
  const calendario = await prisma.calendarioVacunacion.findUnique({
    where: { id: datos.calendarioVacunacionId },
    select: { id: true, intervaloDias: true },
  });
  if (!calendario) throw new ErrorNoEncontrado('Calendario de vacunación no encontrado');

  const animal = await prisma.animal.findUnique({ where: { id: datos.animalId }, select: { id: true } });
  if (!animal) throw new ErrorNoEncontrado('Animal no encontrado');

  // Calcular próxima fecha de aplicación sugerida
  const proximaFecha = new Date(
    datos.fechaAplicacion.getTime() + calendario.intervaloDias * 24 * 60 * 60 * 1000,
  );

  const { aplicadoPorId, animalId, medicamentoId, calendarioVacunacionId, ...resto } = datos;

  const registro = await prisma.registroVacunacion.create({
    data: {
      ...resto,
      proximaFecha,
      animal: { connect: { id: animalId } },
      aplicadoPor: { connect: { id: aplicadoPorId } },
      calendarioVacunacion: { connect: { id: datos.calendarioVacunacionId } },
      ...(medicamentoId && { medicamento: { connect: { id: medicamentoId } } }),
    },
    include: {
      animal: { select: { id: true, numeroIdentificacion: true } },
      calendarioVacunacion: { select: { nombreVacuna: true } },
      aplicadoPor: { select: { nombre: true, apellido: true } },
    },
  });

  // Auto-resolver alertas de vacunación pendientes para este registro concreto
  // El scheduler usa el RegistroVacunacion.id como entidadId
  await resolverNotificacionesDeEntidad('RegistroVacunacion', registro.id).catch(() => {});

  return registro;
}

export async function actualizarRegistroVacunacion(
  id: string,
  datos: {
    fechaAplicacion?:  Date;
    dosis?:            string;
    viaAdministracion?: string;
    lote?:             string;
    observaciones?:    string;
  },
) {
  const registro = await prisma.registroVacunacion.findUnique({
    where: { id },
    select: { id: true, calendarioVacunacion: { select: { intervaloDias: true } } },
  });
  if (!registro) throw new ErrorNoEncontrado('Registro de vacunación no encontrado');

  // Recalcular próxima fecha si cambia la fecha de aplicación
  const proximaFecha = datos.fechaAplicacion
    ? new Date(datos.fechaAplicacion.getTime() + registro.calendarioVacunacion.intervaloDias * 24 * 60 * 60 * 1000)
    : undefined;

  return prisma.registroVacunacion.update({
    where: { id },
    data: {
      ...datos,
      ...(proximaFecha && { proximaFecha }),
    },
    include: {
      animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
      calendarioVacunacion: { select: { id: true, nombreVacuna: true, intervaloDias: true } },
      medicamento: { select: { id: true, nombre: true } },
      aplicadoPor: { select: { id: true, nombre: true, apellido: true } },
    },
  });
}

export async function eliminarRegistroVacunacion(id: string) {
  const registro = await prisma.registroVacunacion.findUnique({ where: { id }, select: { id: true } });
  if (!registro) throw new ErrorNoEncontrado('Registro de vacunación no encontrado');
  return prisma.registroVacunacion.delete({ where: { id } });
}

export async function listarMedicamentos() {
  return prisma.medicamento.findMany({
    orderBy: { nombre: 'asc' },
  });
}

export interface DatosCrearMedicamento {
  nombre: string;
  principioActivo?: string;
}

export async function crearMedicamento(datos: DatosCrearMedicamento) {
  const existente = await prisma.medicamento.findFirst({
    where: { nombre: { equals: datos.nombre, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existente) throw new ErrorConflicto(`Ya existe un medicamento llamado '${datos.nombre}'`);

  return prisma.medicamento.create({ data: datos });
}

// ─── Cumplimiento del calendario de vacunación por lote ───────────────────────
// Para cada lote, sobre cada par (animal activo, calendario que le aplica
// según sexo, edad, propósito y condición reproductiva — ver aplicabilidad.ts),
// se considera "al día" cuando existe un RegistroVacunacion cuya próxima
// fecha aún no venció. El cumplimiento es el % de esos pares al día.

export async function obtenerCumplimientoVacunacionPorLote() {
  const [lotes, calendarios] = await Promise.all([
    prisma.lote.findMany({
      select: {
        id: true,
        nombre: true,
        finca: { select: { id: true, nombre: true } },
        animales: {
          where: { estado: EstadoAnimal.ACTIVO },
          select: { id: true, sexo: true, fechaNacimiento: true, proposito: true },
        },
      },
      orderBy: [{ finca: { nombre: 'asc' } }, { nombre: 'asc' }],
    }),
    prisma.calendarioVacunacion.findMany({
      select: { id: true, nombreVacuna: true, ...SELECCION_CRITERIOS },
    }),
  ]);
  const { gestantes, ultimoParto } = await cargarEstadoReproductivo(
    lotes.flatMap((l) => l.animales.filter((a) => a.sexo === 'HEMBRA').map((a) => a.id)),
  );

  const registros = await prisma.registroVacunacion.findMany({
    select: { calendarioVacunacionId: true, proximaFecha: true, animalId: true },
    orderBy: { fechaAplicacion: 'desc' },
  });

  // Se conserva solo el registro más reciente por (animal, calendario), dado
  // el orderBy fechaAplicacion desc: la primera vez que se ve una clave es la más reciente.
  const ultimaProximaFecha = new Map<string, Date | null>();
  for (const r of registros) {
    const clave = `${r.animalId}::${r.calendarioVacunacionId}`;
    if (!ultimaProximaFecha.has(clave)) {
      ultimaProximaFecha.set(clave, r.proximaFecha);
    }
  }

  const hoy = new Date();

  return lotes.map((lote) => {
    let paresEsperados = 0;
    let paresAlDia = 0;

    for (const animal of lote.animales) {
      const perfil = {
        ...animal,
        gestante: gestantes.has(animal.id),
        ultimoParto: ultimoParto.get(animal.id) ?? null,
      };
      for (const cal of calendarios) {
        if (motivosNoAplica(cal, perfil, hoy).length) continue;
        paresEsperados += 1;
        const proximaFecha = ultimaProximaFecha.get(`${animal.id}::${cal.id}`);
        if (proximaFecha === undefined) continue; // nunca aplicado -> pendiente
        if (proximaFecha === null || proximaFecha >= hoy) paresAlDia += 1;
      }
    }

    return {
      loteId: lote.id,
      loteNombre: lote.nombre,
      fincaId: lote.finca.id,
      fincaNombre: lote.finca.nombre,
      totalAnimales: lote.animales.length,
      paresEsperados,
      paresAlDia,
      cumplimiento: paresEsperados > 0 ? +((paresAlDia / paresEsperados) * 100).toFixed(1) : 0,
    };
  });
}
