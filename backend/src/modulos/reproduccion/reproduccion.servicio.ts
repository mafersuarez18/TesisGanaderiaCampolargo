import { Prisma, TipoEventoReproductivo, EstadoGestacion, EstadoAnimal, Sexo, ClasificacionIA, TecnicaDeposicionSemen, NivelEstres, TipoParto, EstadoCria } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacionDatos } from '../../compartido/tipos/respuesta';
import { resolverNotificacionesDeEntidad } from '../notificaciones/notificaciones.servicio';

// Ciclo reproductivo completo: eventos (celo, monta, inseminación,
// diagnóstico), gestaciones abiertas/cerradas y los indicadores que se
// calculan a partir de ese historial (tasas de preñez, natalidad, aborto,
// repetición de celo, efectividad de IA por semental, etc.).

// Días después de un servicio (inseminación o monta) en que se le pide al
// veterinario confirmar si la hembra quedó preñada.
export const DIAS_REVISION_SERVICIO = 21;
// Duración media de la gestación bovina, para estimar la fecha de parto.
export const DIAS_GESTACION_BOVINA = 283;

const MS_DIA = 24 * 60 * 60 * 1000;
const TIPOS_SERVICIO: TipoEventoReproductivo[] = [
  TipoEventoReproductivo.INSEMINACION_ARTIFICIAL,
  TipoEventoReproductivo.MONTA_NATURAL,
];

// ─── Situación reproductiva antes de un servicio o celo ──────────────────────
// Una hembra no se puede inseminar, servir con monta ni registrarle un celo
// mientras esté preñada o mientras su último servicio siga sin confirmar. En
// esos casos se responde un conflicto con los datos del caso para que la
// pantalla pregunte "¿quedó preñada?": si sigue preñada no se registra nada;
// si está vacía, se reenvía con resolucionPrevia = 'VACIA' y aquí se cierra
// lo pendiente (diagnóstico negativo del servicio, o la gestación como
// perdida) antes de registrar lo nuevo.

export type ResolucionPrevia = 'VACIA';

const TIPOS_QUE_REQUIEREN_VACIA: TipoEventoReproductivo[] = [
  TipoEventoReproductivo.INSEMINACION_ARTIFICIAL,
  TipoEventoReproductivo.MONTA_NATURAL,
  TipoEventoReproductivo.DETECCION_CELO,
];

const fmtFecha = (d: Date) => d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export async function verificarSituacionReproductiva(
  animalId: string,
  tipo: TipoEventoReproductivo,
  fecha: Date,
  registradoPorId: string,
  resolucion?: ResolucionPrevia,
) {
  if (!TIPOS_QUE_REQUIEREN_VACIA.includes(tipo)) return;

  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { id: true, numeroIdentificacion: true, nombre: true, sexo: true, estado: true },
  });
  if (!animal) throw new ErrorNoEncontrado('Animal');
  const nombre = animal.nombre ? `${animal.nombre} (#${animal.numeroIdentificacion})` : `#${animal.numeroIdentificacion}`;
  if (animal.sexo !== Sexo.HEMBRA) throw new ErrorValidacionDatos(`${nombre} es macho: este registro solo aplica a hembras`);
  if (animal.estado !== EstadoAnimal.ACTIVO) {
    throw new ErrorValidacionDatos(`${nombre} no está activa (estado: ${animal.estado.toLowerCase()})`);
  }
  if (fecha.getTime() > Date.now() + MS_DIA) throw new ErrorValidacionDatos('La fecha no puede ser futura');

  const queSeRegistra = tipo === TipoEventoReproductivo.INSEMINACION_ARTIFICIAL ? 'inseminarla'
    : tipo === TipoEventoReproductivo.MONTA_NATURAL ? 'registrarle una monta natural' : 'registrarle un celo';
  const hoy = Date.now();

  const gestacion = await prisma.gestacion.findFirst({
    where: { madreId: animalId, estadoGestacion: EstadoGestacion.EN_CURSO },
    select: { id: true, fechaInicio: true, fechaPartoEsperado: true, eventoReproductivo: { select: { tipo: true } } },
  });
  if (gestacion) {
    if (resolucion !== 'VACIA') {
      const dias = Math.floor((hoy - gestacion.fechaInicio.getTime()) / MS_DIA);
      throw new ErrorConflicto(
        `${nombre} tiene una gestación en curso (${dias} días, parto esperado el ${fmtFecha(gestacion.fechaPartoEsperado)}). `
          + `No se puede ${queSeRegistra} mientras esté preñada.`,
        {
          codigo: 'GESTACION_EN_CURSO',
          animal: { id: animal.id, nombre },
          gestacion: {
            id: gestacion.id,
            fechaInicio: gestacion.fechaInicio,
            fechaPartoEsperado: gestacion.fechaPartoEsperado,
            dias,
            origen: gestacion.eventoReproductivo?.tipo ?? null,
          },
        },
      );
    }
    if (fecha < gestacion.fechaInicio) {
      throw new ErrorValidacionDatos(`La fecha no puede ser anterior al inicio de la gestación (${fmtFecha(gestacion.fechaInicio)})`);
    }
    // Está vacía: la gestación se perdió (o el diagnóstico fue errado)
    await cerrarGestacion(gestacion.id, 'PERDIDA', fecha, undefined, registradoPorId);
    return;
  }

  const pendiente = (await listarServiciosPorConfirmar()).find((s) => s.animal.id === animalId);
  if (pendiente) {
    if (fecha < pendiente.fecha) {
      throw new ErrorValidacionDatos(`La fecha no puede ser anterior a su último servicio (${fmtFecha(pendiente.fecha)})`);
    }
    if (resolucion !== 'VACIA') {
      const dias = Math.floor((hoy - pendiente.fecha.getTime()) / MS_DIA);
      const servicio = pendiente.tipo === TipoEventoReproductivo.INSEMINACION_ARTIFICIAL ? 'se inseminó' : 'tuvo monta natural';
      throw new ErrorConflicto(
        `${nombre} ${servicio} hace ${dias} ${dias === 1 ? 'día' : 'días'} (${fmtFecha(pendiente.fecha)}) y aún no se confirma si quedó preñada.`,
        {
          codigo: 'SERVICIO_PENDIENTE',
          animal: { id: animal.id, nombre },
          servicio: { id: pendiente.id, tipo: pendiente.tipo, fecha: pendiente.fecha, dias },
        },
      );
    }
    const nuevo = tipo === TipoEventoReproductivo.DETECCION_CELO ? 'un nuevo celo' : 'un nuevo servicio';
    await confirmarServicio(pendiente.id, {
      prenada: false,
      fechaDiagnostico: fecha,
      observaciones: `Vacía: se registró ${nuevo}`,
    }, registradoPorId);
  }
}

// ─── Partos próximos ────────────────────────────────────────────────────────

// Con incluirVencidos también devuelve las gestaciones en curso cuya fecha
// de parto ya pasó sin que se registrara el resultado (diasRestantes < 0),
// para que no desaparezcan de la lista hasta que alguien las cierre.
/**
 * Valida el toro indicado como padre de una gestación o en una monta: debe
 * existir, ser macho y no ser la propia hembra.
 */
async function validarToro(toroId: string | undefined, hembraId: string) {
  if (!toroId) return undefined;
  if (toroId === hembraId) throw new ErrorValidacionDatos('El toro no puede ser la misma hembra');
  const toro = await prisma.animal.findUnique({ where: { id: toroId }, select: { sexo: true } });
  if (!toro) throw new ErrorValidacionDatos('El toro indicado no existe');
  if (toro.sexo !== Sexo.MACHO) throw new ErrorValidacionDatos('El toro debe ser un macho');
  return toroId;
}

export async function listarPartosProximos(diasHorizonte: number = 30, limite: number = 20, incluirVencidos = false) {
  const hoy = new Date();
  const horizonte = new Date(hoy.getTime() + diasHorizonte * 24 * 60 * 60 * 1000);
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const gestaciones = await prisma.gestacion.findMany({
    where: {
      estadoGestacion: EstadoGestacion.EN_CURSO,
      fechaPartoEsperado: { ...(!incluirVencidos && { gte: inicioHoy }), lte: horizonte },
    },
    include: {
      madre: {
        select: {
          id: true,
          numeroIdentificacion: true,
          nombre: true,
          lote: { select: { finca: { select: { id: true, nombre: true } } } },
        },
      },
      padre: { select: { numeroIdentificacion: true, nombre: true } },
      eventoReproductivo: {
        select: { tipo: true, inseminacion: { select: { inventarioSemen: { select: { semental: { select: { nombre: true } } } } } } },
      },
    },
    orderBy: { fechaPartoEsperado: 'asc' },
    take: limite,
  });

  return gestaciones.map((g) => {
    // Se cuentan días de calendario (no horas): 0 = hoy, -2 = anteayer.
    const f = g.fechaPartoEsperado;
    const diaParto = new Date(f.getFullYear(), f.getMonth(), f.getDate());
    const diasRestantes = Math.round((diaParto.getTime() - inicioHoy.getTime()) / MS_DIA);
    const clasificacion: 'vencido' | 'urgente' | 'proximo' | 'futuro' =
      diasRestantes < 0 ? 'vencido' : diasRestantes <= 7 ? 'urgente' : diasRestantes <= 30 ? 'proximo' : 'futuro';

    return {
      id: g.id,
      madreId: g.madreId,
      madreNumeroIdentificacion: g.madre.numeroIdentificacion,
      madreNombre: g.madre.nombre,
      finca: g.madre.lote.finca.nombre,
      fechaInicio: g.fechaInicio,
      fechaPartoEsperado: g.fechaPartoEsperado,
      diasRestantes,
      clasificacion,
      // Días de gestación cumplidos hoy (para la cuenta regresiva)
      diasGestacion: Math.max(0, Math.round((inicioHoy.getTime() - g.fechaInicio.getTime()) / MS_DIA)),
      // Servicio del que viene: inseminación, monta natural o sin registrar
      origen: g.eventoReproductivo?.tipo ?? null,
      // Padre: el toro (si se registró) o el semental de la inseminación
      padre: g.padre
        ? `#${g.padre.numeroIdentificacion}${g.padre.nombre ? ` · ${g.padre.nombre}` : ''}`
        : g.eventoReproductivo?.inseminacion?.inventarioSemen?.semental.nombre
          ? `${g.eventoReproductivo.inseminacion.inventarioSemen.semental.nombre} (semen)`
          : null,
    };
  });
}

// ─── Eventos reproductivos ───────────────────────────────────────────────────

export interface FiltrosEventoReproductivo {
  animalId?: string;
  fincaId?: string;
  tipoEvento?: TipoEventoReproductivo;
  desde?: Date;
  hasta?: Date;
  pagina?: number;
  porPagina?: number;
}

export async function listarEventosReproductivos(filtros: FiltrosEventoReproductivo = {}) {
  const { animalId, fincaId, tipoEvento, desde, hasta, pagina = 1, porPagina = 20 } = filtros;

  const donde: Prisma.EventoReproductivoWhereInput = {
    ...(animalId   && { animalId }),
    ...(tipoEvento && { tipo: tipoEvento }),
    ...((desde || hasta) && {
      fecha: {
        ...(desde && { gte: desde }),
        ...(hasta && { lte: hasta }),
      },
    }),
    ...(fincaId && { animal: { lote: { fincaId } } }),
  };

  const [registros, total] = await prisma.$transaction([
    prisma.eventoReproductivo.findMany({
      where: donde,
      include: {
        animal: {
          select: {
            id: true,
            numeroIdentificacion: true,
            nombre: true,
            lote: { select: { finca: { select: { nombre: true } } } },
          },
        },
        registradoPor: { select: { nombre: true, apellido: true } },
      },
      orderBy: { fecha: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.eventoReproductivo.count({ where: donde }),
  ]);

  return { registros, total };
}

export async function obtenerEventoReproductivo(id: string) {
  const evento = await prisma.eventoReproductivo.findUnique({
    where: { id },
    include: {
      animal: {
        select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { nombre: true, finca: { select: { nombre: true } } } } },
      },
      registradoPor: { select: { nombre: true, apellido: true } },
      // Para el detalle del servicio: semental y lote de semen usados
      inseminacion: {
        include: {
          inventarioSemen: {
            select: { codigoDosis: true, semental: { select: { nombre: true, raza: { select: { nombre: true } } } } },
          },
        },
      },
      toro: { select: { id: true, numeroIdentificacion: true, nombre: true } },
      // Gestación que abrió este servicio, si ya se confirmó la preñez
      gestacion: {
        select: {
          id: true, estadoGestacion: true, fechaPartoEsperado: true, fechaPartoReal: true,
          padre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
        },
      },
      // En un diagnóstico positivo: la gestación que confirmó
      diagnosticoGestacion: {
        include: {
          gestacion: {
            select: {
              estadoGestacion: true, fechaInicio: true, fechaPartoEsperado: true,
              padre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
            },
          },
        },
      },
    },
  });
  if (!evento) throw new ErrorNoEncontrado(`Evento reproductivo con id '${id}' no encontrado`);

  // Un parto o aborto no queda enlazado a su gestación: se busca la de la
  // misma hembra cerrada ese día, con sus nacimientos (datos de la cría).
  let gestacionCerrada = null;
  if (evento.tipo === TipoEventoReproductivo.PARTO || evento.tipo === TipoEventoReproductivo.ABORTO) {
    gestacionCerrada = await prisma.gestacion.findFirst({
      where: {
        madreId: evento.animalId,
        fechaPartoReal: { gte: new Date(evento.fecha.getTime() - MS_DIA), lte: new Date(evento.fecha.getTime() + MS_DIA) },
      },
      select: {
        fechaInicio: true, fechaPartoEsperado: true, fechaPartoReal: true, estadoGestacion: true, observaciones: true,
        padre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
        nacimientos: {
          select: {
            tipoParto: true, pesoAlNacer: true, estadoCria: true, sexoCria: true, observaciones: true, complicaciones: true,
            cria: { select: { id: true, numeroIdentificacion: true, nombre: true } },
          },
        },
      },
    });
  }
  return { ...evento, gestacionCerrada };
}

export interface DatosCrearEvento {
  animalId:       string;
  tipo:           TipoEventoReproductivo;
  fecha:          Date;
  descripcion?:   string;
  observaciones?: string;
  registradoPorId: string;
  // Campos específicos de Inseminación Artificial
  clasificacionIA?:     ClasificacionIA;
  tecnicaDeposicion?:   TecnicaDeposicionSemen;
  patologiasVaca?:      string;
  tasaMetabolicaBasal?: number;
  balanceEnergetico?:   string;
  temperaturaUterina?:  number;
  manejoHato?:          NivelEstres;
  // Solo para MONTA_NATURAL: el toro que sirvió
  toroId?: string;
  // Solo para DIAGNOSTICO_GESTACION
  resultadoDiagnostico?: 'POSITIVO' | 'NEGATIVO';
  metodoDiagnostico?:    string;
  // Diagnóstico positivo sin servicio registrado: fecha estimada de la
  // concepción, parto esperado (si no, a 283 días) y toro (si se sabe)
  fechaInicioGestacion?: Date;
  fechaPartoEsperado?:   Date;
  padreId?:              string;
  // La pantalla ya preguntó y la hembra está vacía (ver verificarSituacionReproductiva)
  resolucionPrevia?:     ResolucionPrevia;
}

export async function crearEventoReproductivo(datos: DatosCrearEvento) {
  const animal = await prisma.animal.findUnique({
    where: { id: datos.animalId },
    select: { id: true, sexo: true, numeroIdentificacion: true },
  });
  if (!animal) throw new ErrorNoEncontrado('Animal');

  // Validar que el evento aplica al sexo del animal
  const eventosHembra: TipoEventoReproductivo[] = [
    'INSEMINACION_ARTIFICIAL', 'MONTA_NATURAL', 'DIAGNOSTICO_GESTACION',
    'PARTO', 'ABORTO', 'DETECCION_CELO',
  ];
  if (eventosHembra.includes(datos.tipo) && animal.sexo !== 'HEMBRA') {
    throw new ErrorValidacionDatos(
      `El evento '${datos.tipo}' solo aplica a hembras. El animal ${animal.numeroIdentificacion} es macho.`,
    );
  }

  const {
    registradoPorId, animalId,
    clasificacionIA, tecnicaDeposicion, patologiasVaca,
    tasaMetabolicaBasal, balanceEnergetico, temperaturaUterina, manejoHato,
    resultadoDiagnostico, metodoDiagnostico, fechaInicioGestacion, fechaPartoEsperado, padreId, toroId,
    resolucionPrevia,
    ...resto
  } = datos;
  // Solo campos válidos de EventoReproductivo van en resto: tipo, fecha, descripcion, observaciones
  const { tipo, fecha, descripcion, observaciones } = resto;

  // Cada registro tiene su lugar: la inseminación en el módulo de
  // Inseminación (descuenta la dosis de semen) y el parto o aborto al cerrar
  // la gestación (registra la cría y su estado).
  if (tipo === TipoEventoReproductivo.INSEMINACION_ARTIFICIAL) {
    throw new ErrorValidacionDatos('Las inseminaciones se registran desde el módulo de Inseminación');
  }
  if (tipo === TipoEventoReproductivo.PARTO || tipo === TipoEventoReproductivo.ABORTO) {
    throw new ErrorValidacionDatos(
      'El parto o aborto se registra desde la gestación de la hembra (Reproducción → Gestaciones → Registrar resultado)',
    );
  }

  const toroValido = tipo === TipoEventoReproductivo.MONTA_NATURAL ? await validarToro(toroId, animalId) : undefined;

  // Monta o celo: la hembra no puede estar preñada ni con un servicio sin confirmar
  await verificarSituacionReproductiva(animalId, tipo, fecha, registradoPorId, resolucionPrevia);

  if (tipo === TipoEventoReproductivo.DIAGNOSTICO_GESTACION && resultadoDiagnostico) {
    if (fecha.getTime() > Date.now() + MS_DIA) throw new ErrorValidacionDatos('La fecha no puede ser futura');
    // Con una gestación en curso: positivo no aplica (ya está preñada); un
    // negativo significa que la perdió, y se cierra la gestación.
    const enCurso = await prisma.gestacion.findFirst({
      where: { madreId: animalId, estadoGestacion: EstadoGestacion.EN_CURSO },
      select: { id: true, fechaInicio: true, fechaPartoEsperado: true },
    });
    if (enCurso) {
      if (resultadoDiagnostico === 'POSITIVO') {
        throw new ErrorValidacionDatos(
          `La hembra ya tiene una gestación en curso desde el ${fmtFecha(enCurso.fechaInicio)} `
            + `(parto esperado el ${fmtFecha(enCurso.fechaPartoEsperado)})`,
        );
      }
      if (fecha < enCurso.fechaInicio) {
        throw new ErrorValidacionDatos('El diagnóstico no puede ser anterior al inicio de la gestación');
      }
      await cerrarGestacion(enCurso.id, 'PERDIDA', fecha, undefined, registradoPorId);
    }
    // Con un servicio por confirmar, el diagnóstico lo confirma o lo descarta.
    const pendiente = (await listarServiciosPorConfirmar()).find((s) => s.animal.id === animalId);
    if (pendiente) {
      const { evento } = await confirmarServicio(pendiente.id, {
        prenada: resultadoDiagnostico === 'POSITIVO',
        fechaDiagnostico: fecha,
        metodoDiagnostico,
        fechaPartoEsperado,
        observaciones,
        padreId,
      }, registradoPorId);
      return evento;
    }

    // Positivo sin servicio registrado: se asume monta natural (p. ej. con el
    // toro en el potrero). Se deja la monta en la fecha estimada de la
    // concepción, vinculada a la gestación, y empieza la cuenta regresiva.
    if (resultadoDiagnostico === 'POSITIVO') {
      const padreValido = await validarToro(padreId, animalId);
      // Sin fecha de concepción, se asume un diagnóstico a los 35 días
      const inicio = fechaInicioGestacion ?? new Date(fecha.getTime() - 35 * MS_DIA);
      if (inicio > fecha) throw new ErrorValidacionDatos('La concepción no puede ser posterior al diagnóstico');
      const semanaGestacion = Math.floor((fecha.getTime() - inicio.getTime()) / (7 * MS_DIA));

      return prisma.$transaction(async (tx) => {
        const monta = await tx.eventoReproductivo.create({
          data: {
            tipo: TipoEventoReproductivo.MONTA_NATURAL,
            fecha: inicio,
            descripcion: 'Monta natural (registrada con el diagnóstico de gestación)',
            animal:        { connect: { id: animalId } },
            registradoPor: { connect: { id: registradoPorId } },
            ...(padreValido && { toro: { connect: { id: padreValido } } }),
          },
        });
        const gestacion = await tx.gestacion.create({
          data: {
            madreId: animalId,
            padreId: padreValido,
            fechaInicio: inicio,
            fechaPartoEsperado: fechaPartoEsperado ?? new Date(inicio.getTime() + DIAS_GESTACION_BOVINA * MS_DIA),
            estadoGestacion: EstadoGestacion.EN_CURSO,
            observaciones,
            eventoReproductivoId: monta.id,
          },
        });
        return tx.eventoReproductivo.create({
          data: {
            tipo, fecha, observaciones, descripcion: descripcion ?? 'Preñez confirmada',
            animal:        { connect: { id: animalId } },
            registradoPor: { connect: { id: registradoPorId } },
            diagnosticoGestacion: {
              create: {
                fechaDiagnostico: fecha, resultado: 'POSITIVO', metodoDiagnostico, semanaGestacion,
                observaciones, gestacionId: gestacion.id,
              },
            },
          },
        });
      });
    }
  }

  const esInseminacion = datos.tipo === TipoEventoReproductivo.INSEMINACION_ARTIFICIAL;

  return prisma.eventoReproductivo.create({
    data: {
      tipo, fecha, descripcion, observaciones,
      animal:        { connect: { id: animalId } },
      registradoPor: { connect: { id: registradoPorId } },
      ...(toroValido && { toro: { connect: { id: toroValido } } }),
      ...(tipo === TipoEventoReproductivo.DIAGNOSTICO_GESTACION && resultadoDiagnostico && {
        diagnosticoGestacion: {
          create: { fechaDiagnostico: fecha, resultado: resultadoDiagnostico, observaciones },
        },
      }),
      ...(esInseminacion && {
        inseminacion: {
          create: {
            fechaInseminacion: datos.fecha,
            numeroIntento:     1,
            clasificacionIA,
            tecnicaDeposicion,
            patologiasVaca,
            tasaMetabolicaBasal,
            balanceEnergetico,
            temperaturaUterina,
            manejoHato,
          },
        },
      }),
    },
  });
}

// ─── Gestaciones ─────────────────────────────────────────────────────────────

export async function listarGestacionesActivas(fincaId?: string) {
  return prisma.gestacion.findMany({
    where: {
      estadoGestacion: EstadoGestacion.EN_CURSO,
      ...(fincaId && { madre: { lote: { fincaId } } }),
    },
    include: {
      madre: {
        select: {
          id: true,
          numeroIdentificacion: true,
          nombre: true,
          lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: { fechaPartoEsperado: 'asc' },
  });
}

// Detalle completo de una gestación: madre, de qué servicio viene
// (inseminación o monta), padre, diagnósticos, cuenta regresiva y resultado.
export async function obtenerGestacion(id: string) {
  const g = await prisma.gestacion.findUnique({
    where: { id },
    include: {
      madre: {
        select: {
          id: true, numeroIdentificacion: true, nombre: true,
          raza: { select: { nombre: true } },
          lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
        },
      },
      padre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
      eventoReproductivo: {
        select: {
          id: true, tipo: true, fecha: true, descripcion: true, observaciones: true,
          registradoPor: { select: { nombre: true, apellido: true } },
          toro: { select: { id: true, numeroIdentificacion: true, nombre: true } },
          inseminacion: {
            select: {
              numeroIntento: true, tecnicaDeposicion: true, clasificacionIA: true,
              inventarioSemen: { select: { codigoDosis: true, semental: { select: { nombre: true, raza: { select: { nombre: true } } } } } },
            },
          },
        },
      },
      diagnosticos: {
        select: { fechaDiagnostico: true, resultado: true, metodoDiagnostico: true, semanaGestacion: true, observaciones: true },
        orderBy: { fechaDiagnostico: 'asc' },
      },
      nacimientos: {
        select: {
          fechaNacimiento: true, tipoParto: true, pesoAlNacer: true, sexoCria: true, estadoCria: true,
          cria: { select: { id: true, numeroIdentificacion: true, nombre: true } },
        },
      },
    },
  });
  if (!g) throw new ErrorNoEncontrado('Gestación');

  const inicioHoy = new Date(new Date().setHours(0, 0, 0, 0));
  const f = g.fechaPartoEsperado;
  const diaParto = new Date(f.getFullYear(), f.getMonth(), f.getDate());
  const fin = g.fechaPartoReal ?? inicioHoy;
  return {
    ...g,
    diasGestacion: Math.max(0, Math.round((fin.getTime() - g.fechaInicio.getTime()) / MS_DIA)),
    diasRestantes: g.estadoGestacion === EstadoGestacion.EN_CURSO
      ? Math.round((diaParto.getTime() - inicioHoy.getTime()) / MS_DIA)
      : null,
  };
}

export interface DatosCrearGestacion {
  madreId:              string;
  fechaInicio:          Date;
  fechaPartoEsperado:   Date;
  observaciones?:       string;
  // Evento de monta natural o inseminación que originó esta gestación,
  // cuando el celo/servicio quedó registrado formalmente (opcional).
  eventoReproductivoId?: string;
  // Toro que la preñó, si se sabe
  padreId?: string;
}

export async function crearGestacion(datos: DatosCrearGestacion) {
  const madre = await prisma.animal.findUnique({
    where: { id: datos.madreId },
    select: { sexo: true },
  });
  if (!madre) throw new ErrorNoEncontrado('Animal madre no encontrada');
  if (madre.sexo !== 'HEMBRA') throw new ErrorValidacionDatos('Solo las hembras pueden tener gestaciones');

  const gestacionActiva = await prisma.gestacion.findFirst({
    where: { madreId: datos.madreId, estadoGestacion: EstadoGestacion.EN_CURSO },
    select: { id: true },
  });
  if (gestacionActiva) {
    throw new ErrorValidacionDatos('La hembra ya tiene una gestación activa registrada');
  }

  if (datos.eventoReproductivoId) {
    const evento = await prisma.eventoReproductivo.findUnique({
      where: { id: datos.eventoReproductivoId },
      select: { animalId: true, tipo: true, gestacion: { select: { id: true } } },
    });
    if (!evento) throw new ErrorNoEncontrado('Evento reproductivo no encontrado');
    if (evento.animalId !== datos.madreId) {
      throw new ErrorValidacionDatos('El evento reproductivo no corresponde a esta hembra');
    }
    if (!['INSEMINACION_ARTIFICIAL', 'MONTA_NATURAL'].includes(evento.tipo)) {
      throw new ErrorValidacionDatos('El evento debe ser una inseminación artificial o monta natural');
    }
    if (evento.gestacion) {
      throw new ErrorValidacionDatos('Ese evento ya tiene una gestación vinculada');
    }
  }

  // Si no se indicó de qué servicio viene, se vincula el que la hembra tenga
  // pendiente de confirmar: así deja de aparecer en "Por confirmar".
  const eventoReproductivoId = datos.eventoReproductivoId
    ?? (await listarServiciosPorConfirmar()).find((s) => s.animal.id === datos.madreId)?.id;

  await validarToro(datos.padreId, datos.madreId);

  const gestacion = await prisma.gestacion.create({
    data: {
      ...datos,
      eventoReproductivoId,
      estadoGestacion: EstadoGestacion.EN_CURSO,
    },
  });

  if (eventoReproductivoId) {
    await resolverNotificacionesDeEntidad('EventoReproductivo', eventoReproductivoId).catch(() => {});
  }
  return gestacion;
}

// ─── Servicios por confirmar ─────────────────────────────────────────────────
// Una inseminación o monta queda "por confirmar" hasta que se registra si la
// hembra quedó preñada. Solo cuenta el último servicio de cada hembra, y deja
// de estar pendiente cuando tiene una gestación vinculada, cuando hay un
// diagnóstico de gestación posterior, o cuando la hembra ya tiene otra
// gestación en curso o dejó de estar activa.

// Con tipo se devuelven solo las inseminaciones (módulo Inseminación) o solo
// las montas naturales (módulo Reproducción); siempre se toma el último
// servicio de cada hembra, sea del tipo que sea.
export async function listarServiciosPorConfirmar(fincaId?: string, tipo?: TipoEventoReproductivo) {
  const servicios = await prisma.eventoReproductivo.findMany({
    where: {
      tipo: { in: TIPOS_SERVICIO },
      animal: {
        estado: EstadoAnimal.ACTIVO,
        gestacionesComoMadre: { none: { estadoGestacion: EstadoGestacion.EN_CURSO } },
        ...(fincaId && { lote: { fincaId } }),
      },
    },
    select: {
      id: true,
      tipo: true,
      fecha: true,
      observaciones: true,
      gestacion: { select: { id: true } },
      animal: {
        select: {
          id: true,
          numeroIdentificacion: true,
          nombre: true,
          lote: { select: { fincaId: true, finca: { select: { nombre: true } } } },
        },
      },
      inseminacion: {
        select: { numeroIntento: true, inventarioSemen: { select: { semental: { select: { nombre: true } } } } },
      },
      toro: { select: { numeroIdentificacion: true, nombre: true } },
    },
    orderBy: { fecha: 'desc' },
  });

  const ultimoPorHembra = new Map<string, (typeof servicios)[number]>();
  for (const s of servicios) {
    if (!ultimoPorHembra.has(s.animal.id)) ultimoPorHembra.set(s.animal.id, s);
  }
  const candidatos = [...ultimoPorHembra.values()].filter((s) => !s.gestacion);
  if (!candidatos.length) return [];

  const diagnosticos = await prisma.eventoReproductivo.findMany({
    where: {
      tipo: TipoEventoReproductivo.DIAGNOSTICO_GESTACION,
      animalId: { in: candidatos.map((s) => s.animal.id) },
    },
    select: { animalId: true, fecha: true },
  });

  const hoy = Date.now();
  return candidatos
    .filter((s) => !tipo || s.tipo === tipo)
    .filter((s) => !diagnosticos.some((d) => d.animalId === s.animal.id && d.fecha >= s.fecha))
    .map((s) => {
      const diasTranscurridos = Math.floor((hoy - s.fecha.getTime()) / MS_DIA);
      return {
        id: s.id,
        tipo: s.tipo,
        fecha: s.fecha,
        observaciones: s.observaciones,
        animal: s.animal,
        semental: s.inseminacion?.inventarioSemen?.semental.nombre ?? null,
        toro: s.toro ? `#${s.toro.numeroIdentificacion}${s.toro.nombre ? ` · ${s.toro.nombre}` : ''}` : null,
        numeroIntento: s.inseminacion?.numeroIntento ?? null,
        diasTranscurridos,
        fechaRevision: new Date(s.fecha.getTime() + DIAS_REVISION_SERVICIO * MS_DIA),
        listoParaRevisar: diasTranscurridos >= DIAS_REVISION_SERVICIO,
      };
    })
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

export interface DatosConfirmarServicio {
  prenada:             boolean;
  fechaDiagnostico?:   Date;
  metodoDiagnostico?:  string;
  fechaPartoEsperado?: Date;
  observaciones?:      string;
  // Toro que la preñó; en una monta, por defecto el toro de la monta
  padreId?:            string;
}

// Registra el resultado de un servicio: deja un evento de diagnóstico de
// gestación (positivo o negativo) y, si quedó preñada, abre la gestación
// vinculada al servicio con la fecha de parto estimada.
export async function confirmarServicio(eventoId: string, datos: DatosConfirmarServicio, registradoPorId: string) {
  const servicio = await prisma.eventoReproductivo.findUnique({
    where: { id: eventoId },
    select: { id: true, tipo: true, fecha: true, animalId: true, toroId: true, gestacion: { select: { id: true } } },
  });
  if (!servicio) throw new ErrorNoEncontrado('Servicio reproductivo');
  if (!TIPOS_SERVICIO.includes(servicio.tipo)) {
    throw new ErrorValidacionDatos('Solo se puede confirmar una inseminación artificial o monta natural');
  }
  if (servicio.gestacion) throw new ErrorValidacionDatos('Este servicio ya tiene una gestación registrada');
  if (datos.fechaDiagnostico && datos.fechaDiagnostico < new Date(servicio.fecha.getTime() - MS_DIA / 2)) {
    throw new ErrorValidacionDatos(`El diagnóstico no puede ser anterior al servicio (${fmtFecha(servicio.fecha)})`);
  }

  if (datos.prenada) {
    const gestacionActiva = await prisma.gestacion.findFirst({
      where: { madreId: servicio.animalId, estadoGestacion: EstadoGestacion.EN_CURSO },
      select: { id: true },
    });
    if (gestacionActiva) throw new ErrorValidacionDatos('La hembra ya tiene una gestación activa registrada');
  }

  const padreId = datos.prenada ? await validarToro(datos.padreId ?? servicio.toroId ?? undefined, servicio.animalId) : undefined;
  const fechaDiagnostico = datos.fechaDiagnostico ?? new Date();
  const semanaGestacion = Math.max(0, Math.floor((fechaDiagnostico.getTime() - servicio.fecha.getTime()) / (7 * MS_DIA)));

  const resultado = await prisma.$transaction(async (tx) => {
    const gestacion = datos.prenada
      ? await tx.gestacion.create({
          data: {
            madreId: servicio.animalId,
            padreId,
            fechaInicio: servicio.fecha,
            fechaPartoEsperado: datos.fechaPartoEsperado
              ?? new Date(servicio.fecha.getTime() + DIAS_GESTACION_BOVINA * MS_DIA),
            observaciones: datos.observaciones,
            eventoReproductivoId: servicio.id,
            estadoGestacion: EstadoGestacion.EN_CURSO,
          },
        })
      : null;

    const evento = await tx.eventoReproductivo.create({
      data: {
        tipo: TipoEventoReproductivo.DIAGNOSTICO_GESTACION,
        fecha: fechaDiagnostico,
        descripcion: datos.prenada ? 'Preñez confirmada' : 'No quedó preñada',
        observaciones: datos.observaciones,
        animal: { connect: { id: servicio.animalId } },
        registradoPor: { connect: { id: registradoPorId } },
        diagnosticoGestacion: {
          create: {
            fechaDiagnostico,
            resultado: datos.prenada ? 'POSITIVO' : 'NEGATIVO',
            metodoDiagnostico: datos.metodoDiagnostico,
            semanaGestacion: datos.prenada ? semanaGestacion : undefined,
            observaciones: datos.observaciones,
            ...(gestacion && { gestacionId: gestacion.id }),
          },
        },
      },
    });

    return { evento, gestacion };
  });

  await resolverNotificacionesDeEntidad('EventoReproductivo', servicio.id, registradoPorId).catch(() => {});
  return resultado;
}

// ─── Indicadores reproductivos ────────────────────────────────────────────────

export interface FiltrosIndicadores {
  fincaId?: string;
  loteId?:  string;
  razaId?:  string;
}

export async function obtenerIndicadoresReproductivos(anio: number, filtros: FiltrosIndicadores = {}) {
  // Filtro común sobre el animal (la hembra o la madre, según la tabla).
  const filtroAnimal: Prisma.AnimalWhereInput = {
    ...(filtros.fincaId && { lote: { fincaId: filtros.fincaId } }),
    ...(filtros.loteId  && { loteId: filtros.loteId }),
    ...(filtros.razaId  && { razaId: filtros.razaId }),
  };
  const inicioAnio = new Date(anio, 0, 1);
  const finAnio    = new Date(anio, 11, 31, 23, 59, 59);

  const [
    totalHembras,
    gestacionesEnCurso,
    gestacionesAnio,
    gestacionesParto,
    abortos,
    totalCelos,
    totalInseminaciones,
    nacimientosAnio,
  ] = await Promise.all([
    prisma.animal.count({
      where: { sexo: Sexo.HEMBRA, estado: EstadoAnimal.ACTIVO, ...filtroAnimal },
    }),
    prisma.gestacion.count({
      where: { estadoGestacion: EstadoGestacion.EN_CURSO, madre: filtroAnimal },
    }),
    prisma.gestacion.count({
      where: { fechaInicio: { gte: inicioAnio, lte: finAnio }, madre: filtroAnimal },
    }),
    prisma.gestacion.count({
      where: {
        estadoGestacion: EstadoGestacion.FINALIZADA_PARTO,
        fechaPartoReal: { gte: inicioAnio, lte: finAnio },
        madre: filtroAnimal,
      },
    }),
    prisma.gestacion.count({
      where: {
        estadoGestacion: EstadoGestacion.FINALIZADA_ABORTO,
        fechaInicio: { gte: inicioAnio, lte: finAnio },
        madre: filtroAnimal,
      },
    }),
    prisma.eventoReproductivo.count({
      where: {
        tipo: TipoEventoReproductivo.DETECCION_CELO,
        fecha: { gte: inicioAnio, lte: finAnio },
        animal: filtroAnimal,
      },
    }),
    prisma.eventoReproductivo.count({
      where: {
        tipo: { in: [TipoEventoReproductivo.INSEMINACION_ARTIFICIAL, TipoEventoReproductivo.MONTA_NATURAL] },
        fecha: { gte: inicioAnio, lte: finAnio },
        animal: filtroAnimal,
      },
    }),
    prisma.nacimiento.count({
      where: {
        fechaNacimiento: { gte: inicioAnio, lte: finAnio },
        gestacion: { madre: filtroAnimal },
      },
    }),
  ]);

  // Tasa de repetición de celo: animales con 2+ detecciones en el período
  const celosEnPeriodo = await prisma.eventoReproductivo.findMany({
    where: {
      tipo: TipoEventoReproductivo.DETECCION_CELO,
      fecha: { gte: inicioAnio, lte: finAnio },
      animal: filtroAnimal,
    },
    select: { animalId: true },
  });

  const conteoCelosPorAnimal: Record<string, number> = {};
  for (const ev of celosEnPeriodo) {
    conteoCelosPorAnimal[ev.animalId] = (conteoCelosPorAnimal[ev.animalId] ?? 0) + 1;
  }
  const animalesConRepeticion = Object.values(conteoCelosPorAnimal).filter((c) => c >= 2).length;

  // Tasa de mortalidad de crías: animales fallecidos antes de cumplir su primer
  // año de vida, dentro del período, sobre el total de nacimientos del período.
  // No existe un campo "fechaMuerte" dedicado; se usa actualizadoEn como la
  // fecha del último cambio de estado del animal (igual que en el dashboard).
  const animalesFallecidos = await prisma.animal.findMany({
    where: {
      estado: EstadoAnimal.MUERTO,
      fechaNacimiento: { not: null },
      actualizadoEn: { gte: inicioAnio, lte: finAnio },
      ...filtroAnimal,
    },
    select: { fechaNacimiento: true, actualizadoEn: true },
  });
  // Más las crías que nacieron muertas (o murieron en sus primeras 24 h)
  // según el registro del parto y que nunca se dieron de alta como animal.
  const criasNacidasMuertas = await prisma.nacimiento.count({
    where: {
      estadoCria: { in: [EstadoCria.MUERTO_AL_NACER, EstadoCria.MUERTO_NEONATAL] },
      criaId: null,
      fechaNacimiento: { gte: inicioAnio, lte: finAnio },
      gestacion: { madre: filtroAnimal },
    },
  });
  const criasFallecidas = criasNacidasMuertas + animalesFallecidos.filter((a) => {
    const edadDias = (a.actualizadoEn.getTime() - a.fechaNacimiento!.getTime()) / (1000 * 60 * 60 * 24);
    return edadDias <= 365;
  }).length;

  // Inseminaciones del año que terminaron en gestación, y montas naturales del año
  const [inseminacionesExitosas, montasNaturales] = await Promise.all([
    prisma.eventoReproductivo.count({
      where: {
        tipo: TipoEventoReproductivo.INSEMINACION_ARTIFICIAL,
        fecha: { gte: inicioAnio, lte: finAnio },
        gestacion: { isNot: null },
        animal: filtroAnimal,
      },
    }),
    prisma.eventoReproductivo.count({
      where: {
        tipo: TipoEventoReproductivo.MONTA_NATURAL,
        fecha: { gte: inicioAnio, lte: finAnio },
        animal: filtroAnimal,
      },
    }),
  ]);

  const intervaloPartosPromedioDias = await calcularIntervaloPartosPromedio(filtroAnimal);
  const diasAbiertos = await calcularDiasAbiertos(filtroAnimal, finAnio);

  return {
    anio,
    totalHembras,
    gestacionesEnCurso,
    gestacionesAnio,
    gestacionesParto,
    abortos,
    nacimientosAnio,
    criasFallecidas,
    tasaPreniez:        totalHembras > 0 ? +((gestacionesEnCurso / totalHembras) * 100).toFixed(1) : 0,
    // Natalidad = crías nacidas en el año / hembras activas (misma definición
    // que el dashboard). "Gestaciones a término" es la proporción de las
    // gestaciones del año que terminaron en parto.
    tasaNatalidad:      totalHembras > 0 ? +((nacimientosAnio / totalHembras) * 100).toFixed(1) : 0,
    tasaGestacionesATermino: gestacionesAnio > 0 ? +((gestacionesParto / gestacionesAnio) * 100).toFixed(1) : 0,
    tasaAborto:         gestacionesAnio > 0 ? +((abortos / gestacionesAnio) * 100).toFixed(1) : 0,
    tasaMortalidadCrias: nacimientosAnio > 0 ? +((criasFallecidas / nacimientosAnio) * 100).toFixed(1) : 0,
    totalCelos,
    totalInseminaciones,
    inseminacionesExitosas,
    montasNaturales,
    animalesConRepeticion,
    tasaRepeticionCelo: totalInseminaciones > 0 ? +((animalesConRepeticion / totalInseminaciones) * 100).toFixed(1) : 0,
    intervaloPartosPromedioDias,
    diasAbiertosPromedio: diasAbiertos.promedio,
    hembrasConDiasAbiertos: diasAbiertos.hembras,
  };
}

// Intervalo entre partos: promedio de días transcurridos entre partos
// consecutivos de una misma hembra, sobre la totalidad de su historial
// (no se acota al año consultado, ya que es un indicador de ciclo de vida).
async function calcularIntervaloPartosPromedio(filtroAnimal: Prisma.AnimalWhereInput): Promise<number | null> {
  const partos = await prisma.gestacion.findMany({
    where: {
      estadoGestacion: EstadoGestacion.FINALIZADA_PARTO,
      fechaPartoReal: { not: null },
      madre: filtroAnimal,
    },
    select: { madreId: true, fechaPartoReal: true },
    orderBy: { fechaPartoReal: 'asc' },
  });

  const fechasPorMadre = new Map<string, Date[]>();
  for (const p of partos) {
    if (!p.fechaPartoReal) continue;
    const lista = fechasPorMadre.get(p.madreId) ?? [];
    lista.push(p.fechaPartoReal);
    fechasPorMadre.set(p.madreId, lista);
  }

  const intervalos: number[] = [];
  for (const fechas of fechasPorMadre.values()) {
    for (let i = 1; i < fechas.length; i++) {
      intervalos.push((fechas[i]!.getTime() - fechas[i - 1]!.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  if (!intervalos.length) return null;
  return +(intervalos.reduce((a, b) => a + b, 0) / intervalos.length).toFixed(1);
}

// Días abiertos: días desde el último parto de cada hembra (hasta el fin del
// período) hasta su siguiente concepción; si todavía no volvió a preñarse y
// sigue activa, se cuentan los días transcurridos hasta hoy (o hasta el fin
// del período, si ya pasó).
export async function calcularDiasAbiertos(filtroAnimal: Prisma.AnimalWhereInput, finPeriodo: Date) {
  const gestaciones = await prisma.gestacion.findMany({
    where: { madre: { ...filtroAnimal, sexo: Sexo.HEMBRA } },
    select: {
      madreId: true, estadoGestacion: true, fechaInicio: true, fechaPartoReal: true,
      madre: { select: { estado: true } },
    },
  });
  const corte = Math.min(Date.now(), finPeriodo.getTime());

  const porMadre = new Map<string, typeof gestaciones>();
  for (const g of gestaciones) porMadre.set(g.madreId, [...(porMadre.get(g.madreId) ?? []), g]);

  const dias: number[] = [];
  for (const lista of porMadre.values()) {
    const ultimoParto = lista
      .filter((g) => g.estadoGestacion === EstadoGestacion.FINALIZADA_PARTO && g.fechaPartoReal && g.fechaPartoReal.getTime() <= corte)
      .map((g) => g.fechaPartoReal!)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!ultimoParto) continue;
    const concepcion = lista
      .filter((g) => g.fechaInicio.getTime() > ultimoParto.getTime())
      .map((g) => g.fechaInicio)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (concepcion) dias.push((concepcion.getTime() - ultimoParto.getTime()) / MS_DIA);
    else if (lista[0]!.madre.estado === EstadoAnimal.ACTIVO) dias.push((corte - ultimoParto.getTime()) / MS_DIA);
  }

  return {
    promedio: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : null,
    hembras: dias.length,
  };
}

// ─── Efectividad de la inseminación artificial por semental ──────────────────
// Efectiva = la inseminación derivó en una gestación que no terminó en aborto
// ni en pérdida (sigue en curso o finalizó en parto).

export async function obtenerEfectividadInseminacion(fincaId?: string) {
  const inseminaciones = await prisma.inseminacionArtificial.findMany({
    where: {
      inventarioSemen: { isNot: null },
      ...(fincaId && { eventoReproductivo: { animal: { lote: { fincaId } } } }),
    },
    select: {
      inventarioSemen: {
        select: { sementalId: true, semental: { select: { nombre: true } } },
      },
      eventoReproductivo: {
        select: { gestacion: { select: { estadoGestacion: true } } },
      },
    },
  });

  const porSemental = new Map<string, { nombre: string; total: number; efectivas: number }>();
  for (const ins of inseminaciones) {
    const sementalId = ins.inventarioSemen?.sementalId;
    if (!sementalId) continue;
    const entrada = porSemental.get(sementalId) ?? {
      nombre: ins.inventarioSemen!.semental.nombre,
      total: 0,
      efectivas: 0,
    };
    entrada.total += 1;
    const estadoGestacion = ins.eventoReproductivo.gestacion?.estadoGestacion;
    if (estadoGestacion && estadoGestacion !== 'FINALIZADA_ABORTO' && estadoGestacion !== 'PERDIDA') {
      entrada.efectivas += 1;
    }
    porSemental.set(sementalId, entrada);
  }

  return Array.from(porSemental.entries())
    .map(([sementalId, v]) => ({
      sementalId,
      sementalNombre: v.nombre,
      totalInseminaciones: v.total,
      inseminacionesEfectivas: v.efectivas,
      tasaEfectividad: v.total > 0 ? +((v.efectivas / v.total) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.totalInseminaciones - a.totalInseminaciones);
}

export interface DatosNacimiento {
  tipoParto?:      TipoParto;
  pesoAlNacer?:    number;
  sexoCria?:       Sexo;
  estadoCria?:     EstadoCria;
  observaciones?:  string;
  complicaciones?: string;
}

// Resumen legible del parto para el historial reproductivo, p. ej.
// "Parto — cría hembra, muerta al nacer, parto distócico, 28 kg".
function describirParto(n?: DatosNacimiento): string {
  if (!n?.estadoCria && !n?.sexoCria) return 'Parto registrado';
  const estado: Record<EstadoCria, string> = {
    VIVO: 'viva',
    MUERTO_AL_NACER: 'muerta al nacer',
    MUERTO_NEONATAL: 'murió en sus primeras 24 h',
  };
  const tipo: Partial<Record<TipoParto, string>> = {
    DISTOCICO: 'parto distócico', CESAREA: 'cesárea', PREMATURO: 'parto prematuro',
  };
  const partes = [
    `cría${n.sexoCria ? ` ${n.sexoCria === 'HEMBRA' ? 'hembra' : 'macho'}` : ''}`,
    n.estadoCria && estado[n.estadoCria],
    n.tipoParto && tipo[n.tipoParto],
    n.pesoAlNacer != null && `${n.pesoAlNacer} kg`,
  ].filter(Boolean);
  return `Parto — ${partes.join(', ')}`;
}

// Además de cambiar el estado de la gestación, deja el parto o aborto como
// evento en el historial reproductivo de la hembra (una pérdida se registra
// como aborto, con la descripción correspondiente).
export async function cerrarGestacion(
  id: string,
  resultado: 'PARTO' | 'ABORTO' | 'PERDIDA',
  fechaPartoReal: Date | undefined,
  datosNacimiento: DatosNacimiento | undefined,
  registradoPorId: string,
) {
  const gestacion = await prisma.gestacion.findUnique({
    where: { id },
    select: { id: true, estadoGestacion: true, madreId: true },
  });
  if (!gestacion) throw new ErrorNoEncontrado('Gestación no encontrada');
  if (gestacion.estadoGestacion !== EstadoGestacion.EN_CURSO) {
    throw new ErrorValidacionDatos('La gestación ya está cerrada');
  }

  const estadoFinal: Record<string, EstadoGestacion> = {
    PARTO:  EstadoGestacion.FINALIZADA_PARTO,
    ABORTO: EstadoGestacion.FINALIZADA_ABORTO,
    PERDIDA: EstadoGestacion.PERDIDA,
  };

  const fechaCierre = fechaPartoReal ?? new Date();
  const descripcionEvento: Record<string, string> = {
    PARTO: describirParto(datosNacimiento),
    ABORTO: 'Aborto',
    PERDIDA: 'Pérdida de la gestación',
  };

  // Un parto deja, además del cambio de estado de la gestación, el registro
  // de Nacimiento del que dependen los indicadores de días abiertos e
  // intervalo entre partos — todas las escrituras van en una sola transacción
  // para no dejar una gestación "parida" sin su nacimiento asociado.
  const [gestacionActualizada, evento] = await prisma.$transaction([
    prisma.gestacion.update({
      where: { id },
      data: {
        estadoGestacion: estadoFinal[resultado],
        fechaPartoReal: fechaCierre,
      },
    }),
    prisma.eventoReproductivo.create({
      data: {
        tipo: resultado === 'PARTO' ? TipoEventoReproductivo.PARTO : TipoEventoReproductivo.ABORTO,
        fecha: fechaCierre,
        descripcion: descripcionEvento[resultado],
        observaciones: datosNacimiento?.observaciones,
        animal: { connect: { id: gestacion.madreId } },
        registradoPor: { connect: { id: registradoPorId } },
      },
    }),
    ...(resultado === 'PARTO'
      ? [prisma.nacimiento.create({
          data: {
            gestacionId: id,
            fechaNacimiento: fechaCierre,
            tipoParto: datosNacimiento?.tipoParto,
            pesoAlNacer: datosNacimiento?.pesoAlNacer,
            sexoCria: datosNacimiento?.sexoCria,
            estadoCria: datosNacimiento?.estadoCria,
            observaciones: datosNacimiento?.observaciones,
            complicaciones: datosNacimiento?.complicaciones,
          },
        })]
      : []),
  ]);

  // Auto-resolver alertas de parto próximo / fecha de parto cumplida
  await resolverNotificacionesDeEntidad('Gestacion', id, registradoPorId).catch(() => {});

  return { gestacion: gestacionActualizada, evento };
}
