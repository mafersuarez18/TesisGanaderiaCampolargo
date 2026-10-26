import { Prisma, EstadoSanitario, EstadoReproductivo, TipoDesparasitante, NivelGravedad, TipoPruebaComplementaria } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorNoEncontrado, ErrorConflicto } from '../../compartido/tipos/respuesta';

/**
 * Recalcula Animal.estadoSanitario a partir de lo que sigue activo/en curso
 * para ese animal en todo su historial médico: si tiene algún tratamiento
 * EN_CURSO pasa a EN_TRATAMIENTO, si no pero tiene alguna enfermedad activa
 * pasa a ENFERMO, y si no tiene ninguna de las dos pasa a SANO. No toca
 * estados que solo se asignan manualmente (EN_OBSERVACION, CUARENTENA) salvo
 * que un tratamiento/enfermedad real los sobrescriba.
 */
async function recalcularEstadoSanitarioAnimal(animalId: string): Promise<EstadoSanitario> {
  const [tratamientoEnCurso, enfermedadActiva] = await Promise.all([
    prisma.tratamiento.findFirst({
      where: { estado: 'EN_CURSO', historialMedico: { animalId } },
      select: { id: true },
    }),
    prisma.enfermedadDiagnosticada.findFirst({
      where: { activa: true, historialMedico: { animalId } },
      select: { id: true },
    }),
  ]);

  const nuevoEstado: EstadoSanitario = tratamientoEnCurso
    ? EstadoSanitario.EN_TRATAMIENTO
    : enfermedadActiva
      ? EstadoSanitario.ENFERMO
      : EstadoSanitario.SANO;

  await prisma.animal.update({ where: { id: animalId }, data: { estadoSanitario: nuevoEstado } });
  return nuevoEstado;
}

// Registra la consulta médica y todo lo que se diagnosticó/trató/aplicó en
// ella en una sola operación (enfermedades, tratamientos, desparasitaciones,
// información epidemiológica), y sincroniza la desparasitación con el
// calendario de vacunación correspondiente.

// ─── Pre-fill de nueva consulta ───────────────────────────────────────────────

/**
 * Devuelve los datos que sirven para pre-rellenar el formulario de nueva consulta
 * cuando el veterinario selecciona un animal:
 *   - última desparasitación registrada (de cualquier consulta anterior)
 *   - calendarios de vacunación activos para saber si hay uno de "desparasitación"
 */
export async function obtenerPrefillConsulta(animalId: string) {
  const [ultimaDesparasitacion, calendarios, enfermedadesActivas] = await Promise.all([
    // Última desparasitación del animal
    prisma.programaDesparasitacion.findFirst({
      where: { animalId },
      orderBy: { fecha: 'desc' },
    }),
    // Calendarios de tipo desparasitación (nombre contiene la palabra)
    prisma.calendarioVacunacion.findMany({
      select: { id: true, nombreVacuna: true, intervaloDias: true },
      orderBy: { nombreVacuna: 'asc' },
    }),
    // Enfermedades activas del animal (de cualquier consulta anterior), para poder
    // vincular un nuevo tratamiento a la enfermedad que atiende
    prisma.enfermedadDiagnosticada.findMany({
      where: { historialMedico: { animalId }, activa: true },
      select: { id: true, nombreEnfermedad: true, fechaInicio: true },
      orderBy: { fechaInicio: 'desc' },
    }),
  ]);

  return { ultimaDesparasitacion, calendarios, enfermedadesActivas };
}

export interface FiltrosHistorial {
  animalId?: string;
  fincaId?:  string;
  desde?:    Date;
  hasta?:    Date;
  pagina?:   number;
  porPagina?: number;
}

const seleccionHistorial = {
  id: true,
  fechaConsulta: true,
  motivoConsulta: true,
  sintomasObservados: true,
  observaciones: true,
  estadoSanitario: true,
  // Anamnesis
  tratamientosPrevios: true,
  cirugias: true,
  // Exploración física
  temperatura: true,
  frecuenciaCardiaca: true,
  frecuenciaRespiratoria: true,
  tiempoLlenadoCapilar: true,
  movimientosRuminales: true,
  condicionCorporal: true,
  // Estado del animal
  estadoReproductivo: true,
  litrosLechesDiarios: true,
  gananciaPeso: true,
  // Diagnóstico y plan
  diagnosticoDefinitivo: true,
  resultadosPruebas: true,
  animal: {
    select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { finca: { select: { nombre: true } } } } },
  },
  veterinario: { select: { id: true, nombre: true, apellido: true } },
  enfermedades: true,
  tratamientos: {
    select: {
      id: true,
      dosis: true,
      viaAdministracion: true,
      frecuencia: true,
      duracionDias: true,
      estado: true,
      enfermedadDiagnosticadaId: true,
      medicamento: { select: { nombre: true } },
      enfermedadDiagnosticada: { select: { nombreEnfermedad: true } },
    },
  },
  informacionEpidemiologica: true,
  pruebasComplementarias: true,
} satisfies Prisma.HistorialMedicoSelect;

export async function listarHistorialMedico(filtros: FiltrosHistorial = {}) {
  const { animalId, fincaId, desde, hasta, pagina = 1, porPagina = 20 } = filtros;

  const donde: Prisma.HistorialMedicoWhereInput = {
    ...(animalId && { animalId }),
    ...(fincaId  && { animal: { lote: { fincaId } } }),
    ...((desde || hasta) && {
      fechaConsulta: {
        ...(desde && { gte: desde }),
        ...(hasta && { lte: hasta }),
      },
    }),
  };

  const [registros, total] = await prisma.$transaction([
    prisma.historialMedico.findMany({
      where: donde,
      select: seleccionHistorial,
      orderBy: { fechaConsulta: 'desc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.historialMedico.count({ where: donde }),
  ]);

  return { registros, total };
}

export async function obtenerHistorialPorId(id: string) {
  const historial = await prisma.historialMedico.findUnique({
    where: { id },
    select: seleccionHistorial,
  });
  if (!historial) throw new ErrorNoEncontrado(`Historial médico con id '${id}' no encontrado`);
  return historial;
}

export interface DatosCrearHistorial {
  animalId:              string;
  fechaConsulta:         Date;
  motivoConsulta:        string;
  sintomasObservados?:   string;
  observaciones?:        string;
  veterinarioId:         string;
  actualizarEstadoSanitario?: EstadoSanitario;
  // Estado sanitario evaluado en esta consulta puntual
  estadoSanitario?:      EstadoSanitario;
  // Anamnesis
  tratamientosPrevios?:  string;
  cirugias?:             string;
  // Exploración física
  temperatura?:              number;
  frecuenciaCardiaca?:       number;
  frecuenciaRespiratoria?:   number;
  tiempoLlenadoCapilar?:     number;
  movimientosRuminales?:     number;
  condicionCorporal?:        number;
  // Estado del animal
  estadoReproductivo?:       EstadoReproductivo;
  litrosLechesDiarios?:      number;
  gananciaPeso?:             number;
  // Diagnóstico y plan (a nivel de consulta general)
  diagnosticoDefinitivo?:    string;
  resultadosPruebas?: string;
  // Relaciones hijas
  informacionEpidemiologica?: {
    garrapatas?:    boolean;
    mosquitos?:     boolean;
    murcielagos?:   boolean;
    moscas?:        boolean;
    otrosVectores?: string;
    descripcionEntorno?: string;
  };
  desparasitaciones?: Array<{
    medicamentoId:   string;
    tipo:             TipoDesparasitante;
    fecha:            Date;
    dosis?:           string;
    via?:             string;
    observaciones?:   string;
  }>;
  // Al igual que las desparasitaciones, las vitaminas se identifican solo
  // por el animal (no por el historial médico), así que se crean aparte.
  vitaminas?: Array<{
    medicamentoId:   string;
    fecha:            Date;
    dosis?:           string;
    via?:             string;
    observaciones?:   string;
  }>;
  pruebasComplementarias?: Array<{
    tipo:          TipoPruebaComplementaria;
    fecha?:        Date;
    resultado?:    string;
    observaciones?: string;
  }>;
  enfermedades?: Array<{
    nombreEnfermedad:    string;
    nivelGravedad?:      NivelGravedad;
    fechaInicio:         Date;
    descripcionClinica?: string;
    observaciones?:      string;
    // Diagnóstico/plan/pronóstico/síntomas de esta condición específica,
    // según el modelo lógico del tomo (DETALLE_DIAGNOSTICO)
    diagnosticoDefinitivo?: string;
    pronostico?:         string;
    planDiagnostico?:    string;
    tiempoEvolucion?:    string;
    sintomas?:           string;
    pruebasDiagnostico?: string;
  }>;
  tratamientos?: Array<{
    medicamentoId:             string;
    enfermedadDiagnosticadaId?: string;
    fechaInicio:               Date;
    dosis:                     string;
    viaAdministracion:         string;
    frecuencia:                string;
    duracionDias?:             number;
    observaciones?:            string;
    descripcion?:              string;
  }>;
}

export async function crearHistorialMedico(datos: DatosCrearHistorial) {
  const animal = await prisma.animal.findUnique({
    where: { id: datos.animalId },
    select: { id: true },
  });
  if (!animal) throw new ErrorNoEncontrado(`Animal con id '${datos.animalId}' no encontrado`);

  const {
    enfermedades, tratamientos, veterinarioId, animalId, actualizarEstadoSanitario,
    informacionEpidemiologica, desparasitaciones, vitaminas, pruebasComplementarias,
    ...restoHistorial
  } = datos;

  const historial = await prisma.historialMedico.create({
    data: {
      ...restoHistorial,
      animal:      { connect: { id: animalId } },
      veterinario: { connect: { id: veterinarioId } },
      enfermedades: enfermedades?.length
        ? {
            create: enfermedades.map((enf) => ({
              nombreEnfermedad:  enf.nombreEnfermedad,
              nivelGravedad:     enf.nivelGravedad,
              fechaInicio:       enf.fechaInicio,
              descripcionClinica: enf.descripcionClinica,
              observaciones:     enf.observaciones,
              diagnosticoDefinitivo: enf.diagnosticoDefinitivo,
              pronostico:        enf.pronostico,
              planDiagnostico:   enf.planDiagnostico,
              tiempoEvolucion:   enf.tiempoEvolucion,
              sintomas:          enf.sintomas,
              pruebasDiagnostico: enf.pruebasDiagnostico,
            })),
          }
        : undefined,
      tratamientos: tratamientos?.length
        ? {
            create: tratamientos.map((t) => ({
              dosis:             t.dosis,
              viaAdministracion: t.viaAdministracion,
              frecuencia:        t.frecuencia,
              duracionDias:      t.duracionDias,
              fechaInicio:       t.fechaInicio,
              observaciones:     t.observaciones,
              descripcion:       t.descripcion,
              medicamento: { connect: { id: t.medicamentoId } },
              ...(t.enfermedadDiagnosticadaId && {
                enfermedadDiagnosticada: { connect: { id: t.enfermedadDiagnosticadaId } },
              }),
            })),
          }
        : undefined,
      informacionEpidemiologica: informacionEpidemiologica
        ? { create: informacionEpidemiologica }
        : undefined,
      pruebasComplementarias: pruebasComplementarias?.length
        ? {
            create: pruebasComplementarias.map((p) => ({
              tipo:          p.tipo,
              fecha:         p.fecha,
              resultado:     p.resultado,
              observaciones: p.observaciones,
            })),
          }
        : undefined,
    },
    select: seleccionHistorial,
  });

  // Si la consulta diagnosticó una única enfermedad nueva y a la vez inició
  // un único tratamiento nuevo sin enfermedadDiagnosticadaId explícito, se
  // asume que ese tratamiento es para esa enfermedad (Prisma no permite
  // enlazar una relación anidada con un "hermano" creado en el mismo create,
  // así que se vinculan con un update aparte). Con más de una de cada uno la
  // relación es ambigua y se deja sin enlazar, igual que antes.
  if (
    historial.enfermedades.length === 1 &&
    historial.tratamientos.length === 1 &&
    !tratamientos?.[0]?.enfermedadDiagnosticadaId
  ) {
    const enfermedadUnica = historial.enfermedades[0]!;
    const tratamientoUnico = historial.tratamientos[0]!;
    await prisma.tratamiento.update({
      where: { id: tratamientoUnico.id },
      data: { enfermedadDiagnosticadaId: enfermedadUnica.id },
    });
    tratamientoUnico.enfermedadDiagnosticadaId = enfermedadUnica.id;
    tratamientoUnico.enfermedadDiagnosticada = { nombreEnfermedad: enfermedadUnica.nombreEnfermedad };
  }

  // Estado sanitario del animal: una elección manual del veterinario tiene
  // prioridad; si no se especificó pero esta consulta diagnosticó una
  // enfermedad o inició un tratamiento, se recalcula automáticamente a
  // partir de lo que quede activo/en curso para el animal.
  if (actualizarEstadoSanitario) {
    await prisma.animal.update({
      where: { id: animalId },
      data: { estadoSanitario: actualizarEstadoSanitario },
    });
  } else if (enfermedades?.length || tratamientos?.length) {
    await recalcularEstadoSanitarioAnimal(animalId);
  }

  // Las desparasitaciones ya no cuelgan del historial médico (se identifican
  // solo por el animal), así que se crean aparte en vez de como relación
  // anidada — el formulario de consulta las sigue enviando igual, solo
  // cambia cómo quedan guardadas.
  let desparasitacionesCreadas: Array<{
    id: string; tipo: TipoDesparasitante; fecha: Date; dosis: string | null; via: string | null;
    medicamento: { nombre: string; principioActivo: string | null };
  }> = [];

  if (desparasitaciones?.length) {
    desparasitacionesCreadas = await Promise.all(
      desparasitaciones.map((d) =>
        prisma.programaDesparasitacion.create({
          data: {
            tipo: d.tipo,
            fecha: d.fecha,
            dosis: d.dosis,
            via: d.via,
            observaciones: d.observaciones,
            animal:      { connect: { id: animalId } },
            medicamento: { connect: { id: d.medicamentoId } },
            veterinario: { connect: { id: veterinarioId } },
          },
          include: { medicamento: { select: { nombre: true, principioActivo: true } } },
        }),
      ),
    );

    // ── Sincronización automática con vacunación ───────────────────────────
    // Cada desparasitación registrada también deja un RegistroVacunacion en
    // el calendario de desparasitación que corresponda (por nombre del
    // producto), para que el motor de alertas la considere igual que
    // cualquier otra vacuna próxima a vencer.
    const calendariosDesp = await prisma.calendarioVacunacion.findMany({
      where: { nombreVacuna: { contains: 'desparasit', mode: 'insensitive' } },
      select: { id: true, intervaloDias: true },
    });

    if (calendariosDesp.length > 0) {
      const calendario = calendariosDesp[0];
      await Promise.all(
        desparasitaciones.map((d, i) => {
          const proximaFecha = new Date(
            d.fecha.getTime() + calendario.intervaloDias * 24 * 60 * 60 * 1000,
          );
          const nombreMedicamento = desparasitacionesCreadas[i]?.medicamento?.nombre;
          return prisma.registroVacunacion.create({
            data: {
              fechaAplicacion:      d.fecha,
              proximaFecha,
              dosis:                d.dosis,
              viaAdministracion:    d.via,
              observaciones:        d.observaciones ?? `Auto-registrado desde consulta${nombreMedicamento ? `: ${nombreMedicamento}` : ''}`,
              animal:               { connect: { id: animalId } },
              calendarioVacunacion: { connect: { id: calendario.id } },
              aplicadoPor:          { connect: { id: veterinarioId } },
            },
          });
        }),
      );
    }
  }

  // Las vitaminas tampoco cuelgan del historial médico, por la misma razón
  // que las desparasitaciones: se identifican solo por el animal.
  let vitaminasCreadas: Array<{
    id: string; fecha: Date; dosis: string | null; via: string | null;
    medicamento: { nombre: string };
  }> = [];

  if (vitaminas?.length) {
    vitaminasCreadas = await Promise.all(
      vitaminas.map((v) =>
        prisma.registroVitaminas.create({
          data: {
            fecha: v.fecha,
            dosis: v.dosis,
            via: v.via,
            observaciones: v.observaciones,
            animal:      { connect: { id: animalId } },
            medicamento: { connect: { id: v.medicamentoId } },
            veterinario: { connect: { id: veterinarioId } },
          },
          include: { medicamento: { select: { nombre: true } } },
        }),
      ),
    );
  }

  return { ...historial, desparasitaciones: desparasitacionesCreadas, vitaminas: vitaminasCreadas };
}

export interface DatosFinalizarTratamiento {
  mejoro: boolean;
  observaciones?: string;
}

/**
 * Cierra un tratamiento EN_CURSO cuando el veterinario/admin responde al
 * aviso que genera el motor de alertas al vencerse su duración esperada:
 * marca el tratamiento como COMPLETADO o FALLIDO según si el animal mejoró,
 * resuelve la enfermedad diagnosticada que atendía (si mejoró y estaba
 * vinculada), recalcula el estado sanitario del animal a partir de lo que
 * le quede activo/en curso, y descarta la notificación que originó la
 * pregunta para que deje de aparecer como pendiente.
 */
export async function finalizarTratamiento(tratamientoId: string, datos: DatosFinalizarTratamiento) {
  const tratamiento = await prisma.tratamiento.findUnique({
    where: { id: tratamientoId },
    select: {
      id: true,
      estado: true,
      enfermedadDiagnosticadaId: true,
      historialMedico: { select: { animalId: true } },
    },
  });
  if (!tratamiento) throw new ErrorNoEncontrado(`Tratamiento con id '${tratamientoId}' no encontrado`);
  if (tratamiento.estado !== 'EN_CURSO') {
    throw new ErrorConflicto(`Este tratamiento ya fue cerrado (estado actual: ${tratamiento.estado})`);
  }

  const { mejoro, observaciones } = datos;
  const animalId = tratamiento.historialMedico.animalId;

  await prisma.tratamiento.update({
    where: { id: tratamientoId },
    data: {
      estado: mejoro ? 'COMPLETADO' : 'FALLIDO',
      fechaFin: new Date(),
      respuestaTratamiento: observaciones ?? (mejoro ? 'El animal se recuperó' : 'El animal no mostró mejoría'),
    },
  });

  if (tratamiento.enfermedadDiagnosticadaId && mejoro) {
    await prisma.enfermedadDiagnosticada.update({
      where: { id: tratamiento.enfermedadDiagnosticadaId },
      data: { activa: false, fechaResolucion: new Date() },
    });
  }

  const nuevoEstadoSanitario = await recalcularEstadoSanitarioAnimal(animalId);

  // La notificación que preguntaba por este tratamiento ya no aplica.
  await prisma.notificacion.updateMany({
    where: { entidadTipo: 'Tratamiento', entidadId: tratamientoId, leida: false },
    data: { leida: true, estado: 'LEIDA', fechaLeida: new Date() },
  });

  return { tratamientoId, animalId, nuevoEstadoSanitario };
}

export interface DatosActualizarPruebaComplementaria {
  fecha?:         Date | null;
  resultado?:     string | null;
  observaciones?: string | null;
}

/**
 * Registra (o corrige) el resultado de una prueba complementaria después de
 * creada la consulta: los exámenes de laboratorio suelen tardar días, así
 * que la prueba se guarda primero sin resultado y se completa al llegar.
 * Solo se tocan los campos enviados; un string vacío deja el campo en null.
 */
export async function actualizarPruebaComplementaria(id: string, datos: DatosActualizarPruebaComplementaria) {
  const prueba = await prisma.pruebaComplementaria.findUnique({ where: { id }, select: { id: true } });
  if (!prueba) throw new ErrorNoEncontrado(`Prueba complementaria con id '${id}'`);

  const vacioANull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

  return prisma.pruebaComplementaria.update({
    where: { id },
    data: {
      fecha:         datos.fecha,
      resultado:     vacioANull(datos.resultado),
      observaciones: vacioANull(datos.observaciones),
    },
  });
}

export async function eliminarHistorialMedico(id: string) {
  const historial = await prisma.historialMedico.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!historial) throw new ErrorNoEncontrado(`Historial médico con id '${id}' no encontrado`);
  return prisma.historialMedico.delete({ where: { id } });
}
