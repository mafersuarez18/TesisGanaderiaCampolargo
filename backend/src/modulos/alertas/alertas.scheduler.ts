import cron from 'node-cron';
import prisma from '../../compartido/prisma/clientePrisma';
import { logger } from '../../config/logger';
import { TipoAlertaRegla, EstadoNotificacion, PrioridadAlerta } from '@prisma/client';
import { enviarCorreoAlerta } from '../notificaciones/correo.servicio';
import { listarServiciosPorConfirmar, DIAS_REVISION_SERVICIO } from '../reproduccion/reproduccion.servicio';

// ── Motor de alertas ────────────────────────────────────────────────────────
// Evalúa periódicamente las ReglaAlerta activas (vacunas por vencer, partos
// próximos, días abiertos excedidos, etc.) y genera Notificacion para los
// usuarios interesados, evitando duplicar avisos ya emitidos recientemente.

/** Programa el cron job que dispara la evaluación de reglas cada hora. */
export function iniciarMotorAlertas(): void {
  cron.schedule('0 * * * *', async () => {
    logger.debug('Motor de alertas: evaluación periódica');
    await evaluarTodasLasReglas();
  });
}

/**
 * Ejecuta todas las reglas activas (estado === 'ACTIVA') de forma programática.
 * Respeta evaluarCadaHoras — no re-evalúa si aún no ha pasado el tiempo configurado.
 * Útil para el endpoint de disparo manual (en ese caso skipThrottle = true).
 */
export async function evaluarTodasLasReglas(
  skipThrottle = false,
): Promise<{ evaluadas: number; errores: string[] }> {
  const reglas = await prisma.reglaAlerta.findMany({
    where: { estado: 'ACTIVA' },
    include: {
      usuariosNotificados: {
        select: { id: true, usuario: { select: { id: true, correo: true, nombre: true, estado: true } } },
      },
    },
  });
  const errores: string[] = [];
  let evaluadas = 0;

  // Tratamientos que debieron terminar: a diferencia de las demás
  // evaluaciones, esto no depende de una ReglaAlerta configurable — corre
  // siempre que se ejecuta el motor, para preguntarle a veterinario/admin si
  // el animal mejoró y así poder cerrar el tratamiento.
  try {
    await evaluarTratamientosFinalizados();
  } catch (error) {
    const msg = `Error evaluando tratamientos finalizados: ${String(error)}`;
    logger.error(msg);
    errores.push(msg);
  }

  // Seguimiento del ciclo reproductivo, también siempre activo: confirmar si
  // una inseminación o monta funcionó, y registrar cómo salió un parto cuya
  // fecha esperada ya se cumplió.
  for (const [nombre, evaluar] of [
    ['servicios por confirmar', evaluarServiciosPorConfirmar],
    ['partos con fecha cumplida', evaluarPartosVencidos],
  ] as const) {
    try {
      await evaluar();
    } catch (error) {
      const msg = `Error evaluando ${nombre}: ${String(error)}`;
      logger.error(msg);
      errores.push(msg);
    }
  }

  for (const regla of reglas) {
    // ── Throttle por evaluarCadaHoras ─────────────────────────────────────
    if (!skipThrottle && regla.ultimaEvaluacion && regla.evaluarCadaHoras > 0) {
      const msDesdeUltima = Date.now() - regla.ultimaEvaluacion.getTime();
      const msUmbral      = regla.evaluarCadaHoras * 3_600_000;
      if (msDesdeUltima < msUmbral) continue; // Demasiado pronto, omitir
    }

    try {
      const umbral   = regla.umbralValor   ?? defaultUmbral(regla.tipoAlerta);
      const prioridad = regla.prioridad;

      switch (regla.tipoAlerta) {
        case TipoAlertaRegla.VACUNA_VENCIDA:
        case TipoAlertaRegla.VACUNA_PROXIMA:
          await evaluarVacunas(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.PARTO_PROXIMO:
          await evaluarPartosProximos(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.DIAS_ABIERTOS_EXCEDIDOS:
          await evaluarDiasAbiertos(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.ENFERMEDAD_ACTIVA_SIN_RESOLUCION:
          await evaluarEnfermedadesActivas(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.INVENTARIO_SEMEN_BAJO:
          await evaluarInventarioSemen(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.AUSENCIA_CONTROL_VETERINARIO:
          await evaluarAusenciaControlVeterinario(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.CONTROL_PESO_PENDIENTE:
          await evaluarControlPesoPendiente(umbral, prioridad, regla);
          break;
        case TipoAlertaRegla.INTERVALO_REPRODUCTIVO_PROLONGADO:
          await evaluarIntervaloParto(umbral, prioridad, regla);
          break;
        // PERSONALIZADA: no tiene lógica automática, solo se puede disparar manualmente
        default:
          break;
      }

      await prisma.reglaAlerta.update({
        where: { id: regla.id },
        data: { ultimaEvaluacion: new Date() },
      });

      evaluadas++;
    } catch (error) {
      const msg = `Error evaluando regla '${regla.nombre}': ${String(error)}`;
      logger.error(msg);
      errores.push(msg);
    }
  }

  return { evaluadas, errores };
}

// ── Umbrales por defecto ──────────────────────────────────────────────────────

function defaultUmbral(tipo: TipoAlertaRegla): number {
  switch (tipo) {
    case TipoAlertaRegla.VACUNA_VENCIDA:                    return 0;
    case TipoAlertaRegla.VACUNA_PROXIMA:                    return 7;
    case TipoAlertaRegla.PARTO_PROXIMO:                     return 7;
    case TipoAlertaRegla.DIAS_ABIERTOS_EXCEDIDOS:           return 90;
    case TipoAlertaRegla.ENFERMEDAD_ACTIVA_SIN_RESOLUCION:  return 14;
    case TipoAlertaRegla.INVENTARIO_SEMEN_BAJO:             return 10;
    case TipoAlertaRegla.AUSENCIA_CONTROL_VETERINARIO:      return 60;
    case TipoAlertaRegla.CONTROL_PESO_PENDIENTE:            return 30;
    case TipoAlertaRegla.INTERVALO_REPRODUCTIVO_PROLONGADO: return 365;
    default:                                                 return 7;
  }
}

// ── Tipo de regla completa (lo que llega de la BD) ────────────────────────────

type ReglaDb = {
  id: string;
  nombre: string;
  usuariosNotificados: {
    id: string;
    usuario: { id: string; correo: string; nombre: string; estado: string };
  }[];
};

// ── Evaluadores individuales ──────────────────────────────────────────────────

/** Vacunas próximas a vencer o ya vencidas */
async function evaluarVacunas(
  diasUmbral: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const hoy    = new Date();
  const limite = new Date(hoy.getTime() + diasUmbral * 86_400_000);

  const vacunasProximas = await prisma.registroVacunacion.findMany({
    where: {
      proximaFecha: { lte: limite },
      animal: { estado: 'ACTIVO' },
    },
    include: {
      animal: { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
      calendarioVacunacion: true,
    },
  });

  for (const vacuna of vacunasProximas) {
    const animal = vacuna.animal;

    const yaVencida = vacuna.proximaFecha != null && vacuna.proximaFecha < hoy;

    const titulo = interpolar(
      yaVencida
        ? 'Vacuna VENCIDA — {vacuna}'
        : 'Vacuna próxima — {vacuna}',
      {
        animal: animal.nombre ?? animal.numeroIdentificacion,
        vacuna: vacuna.calendarioVacunacion.nombreVacuna,
        fecha:  vacuna.proximaFecha?.toLocaleDateString('es-VE') ?? '',
        dias:   diasUmbral.toString(),
      },
    );

    const mensaje = `Animal: ${animal.nombre ?? animal.numeroIdentificacion} | Próxima fecha: ${vacuna.proximaFecha?.toLocaleDateString('es-VE') ?? '—'}`;

    await crearNotificacionSiNoExiste(
      titulo,
      mensaje,
      prioridad,
      'RegistroVacunacion',
      vacuna.id,
      animal.lote.fincaId,
      regla,
    );
  }
}

// No hay un evaluador de alerta específico para desparasitaciones: cada una
// ya deja un RegistroVacunacion sincronizado (ver crearHistorialMedico), así
// que evaluarVacunas() las cubre igual que a cualquier otra vacuna próxima
// a vencer, sin necesidad de una regla ni un cálculo aparte.

/** Partos esperados en los próximos N días */
async function evaluarPartosProximos(
  diasUmbral: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const hoy    = new Date();
  const limite = new Date(hoy.getTime() + diasUmbral * 86_400_000);

  const partosProximos = await prisma.gestacion.findMany({
    where: {
      estadoGestacion: 'EN_CURSO',
      fechaPartoEsperado: { gte: hoy, lte: limite },
    },
    include: {
      madre: { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
    },
  });

  for (const gestacion of partosProximos) {
    const diasRestantes = Math.ceil(
      (gestacion.fechaPartoEsperado.getTime() - hoy.getTime()) / 86_400_000,
    );

    const titulo = interpolar(
      'Parto próximo — {animal}',
      {
        animal: gestacion.madre.nombre ?? gestacion.madre.numeroIdentificacion,
        dias:   diasRestantes.toString(),
        fecha:  gestacion.fechaPartoEsperado.toLocaleDateString('es-VE'),
      },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `Parto esperado en ${diasRestantes} día(s) (${gestacion.fechaPartoEsperado.toLocaleDateString('es-VE')})`,
      prioridad,
      'Gestacion',
      gestacion.id,
      gestacion.madre.lote.fincaId,
      regla,
    );
  }
}

/** Vacas con días abiertos que superan el umbral */
async function evaluarDiasAbiertos(
  umbralDias: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const fechaLimite = new Date(Date.now() - umbralDias * 86_400_000);

  const ultimosPartos = await prisma.nacimiento.findMany({
    where: {
      fechaNacimiento: { lt: fechaLimite },
      gestacion: {
        madre: { estado: 'ACTIVO', sexo: 'HEMBRA' },
        estadoGestacion: 'FINALIZADA_PARTO',
      },
    },
    include: {
      gestacion: {
        include: {
          madre: { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
        },
      },
    },
  });

  for (const parto of ultimosPartos) {
    const madre = parto.gestacion.madre;
    const diasAbiertos = Math.floor(
      (Date.now() - parto.fechaNacimiento.getTime()) / 86_400_000,
    );

    const titulo = interpolar(
      'Días abiertos excedidos — {animal}',
      { animal: madre.nombre ?? madre.numeroIdentificacion, dias: diasAbiertos.toString() },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `La vaca lleva ${diasAbiertos} días sin nueva gestación confirmada (umbral: ${umbralDias} días)`,
      prioridad,
      'Animal',
      madre.id,
      madre.lote.fincaId,
      regla,
    );
  }
}

/** Enfermedades activas sin resolución que superan el umbral de días */
async function evaluarEnfermedadesActivas(
  umbralDias: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const fechaLimite = new Date(Date.now() - umbralDias * 86_400_000);

  const enfermedadesAntiguas = await prisma.enfermedadDiagnosticada.findMany({
    where: {
      activa: true,
      fechaInicio: { lt: fechaLimite },
      historialMedico: { animal: { estado: 'ACTIVO' } },
    },
    include: {
      historialMedico: {
        include: {
          animal: { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
        },
      },
    },
  });

  for (const enfermedad of enfermedadesAntiguas) {
    const animal = enfermedad.historialMedico.animal;
    const dias   = Math.floor((Date.now() - enfermedad.fechaInicio.getTime()) / 86_400_000);

    const titulo = interpolar(
      'Enfermedad sin resolución — {animal}',
      {
        animal:     animal.nombre ?? animal.numeroIdentificacion,
        enfermedad: enfermedad.nombreEnfermedad,
        dias:       dias.toString(),
      },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `${enfermedad.nombreEnfermedad} lleva ${dias} días activa sin resolución (umbral: ${umbralDias} días)`,
      prioridad,
      'EnfermedadDiagnosticada',
      enfermedad.id,
      animal.lote.fincaId,
      regla,
    );
  }
}

/**
 * Tratamientos EN_CURSO cuya duración esperada ya se cumplió (fechaInicio +
 * duracionDias en el pasado). No es una ReglaAlerta configurable: siempre se
 * ejecuta, y notifica a administrador y veterinario (sin `regla`) para que
 * confirmen si el animal mejoró — desde ahí se cierra el tratamiento vía
 * PATCH /historial-medico/tratamientos/:id/finalizar.
 */
async function evaluarTratamientosFinalizados(): Promise<void> {
  const tratamientosEnCurso = await prisma.tratamiento.findMany({
    where: { estado: 'EN_CURSO', duracionDias: { not: null } },
    select: {
      id: true,
      fechaInicio: true,
      duracionDias: true,
      medicamento: { select: { nombre: true } },
      historialMedico: {
        select: {
          animal: { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
        },
      },
    },
  });

  const hoy = new Date();

  for (const tratamiento of tratamientosEnCurso) {
    const fechaFinEsperada = new Date(
      tratamiento.fechaInicio.getTime() + tratamiento.duracionDias! * 86_400_000,
    );
    if (fechaFinEsperada > hoy) continue; // Todavía dentro de la duración indicada

    const animal = tratamiento.historialMedico.animal;

    const titulo = interpolar(
      'Tratamiento finalizado — {animal}',
      { animal: animal.nombre ?? animal.numeroIdentificacion },
    );

    const mensaje = `El tratamiento con ${tratamiento.medicamento.nombre} debió finalizar el ${fechaFinEsperada.toLocaleDateString('es-VE')}. ¿El animal mejoró?`;

    await crearNotificacionSiNoExiste(
      titulo,
      mensaje,
      PrioridadAlerta.MEDIA,
      'Tratamiento',
      tratamiento.id,
      animal.lote.fincaId,
      // Sin regla: notifica por defecto a ADMINISTRADOR y VETERINARIO.
    );
  }
}

/**
 * Inseminaciones y montas con DIAS_REVISION_SERVICIO días o más sin que se
 * haya registrado si la hembra quedó preñada. Se responde desde la alerta o
 * desde Reproducción → Por confirmar (PATCH /reproduccion/servicios/:id/confirmar),
 * lo que crea la gestación si fue positivo.
 */
async function evaluarServiciosPorConfirmar(): Promise<void> {
  const servicios = await listarServiciosPorConfirmar();

  for (const servicio of servicios) {
    if (!servicio.listoParaRevisar) continue;
    const animal = servicio.animal;
    const tipo = servicio.tipo === 'INSEMINACION_ARTIFICIAL' ? 'inseminación' : 'monta natural';

    await crearNotificacionSiNoExiste(
      interpolar('Revisar {tipo} — {animal}', {
        tipo: servicio.tipo === 'INSEMINACION_ARTIFICIAL' ? 'inseminación' : 'monta',
        animal: animal.nombre ?? animal.numeroIdentificacion,
      }),
      `Han pasado ${servicio.diasTranscurridos} días desde la ${tipo} del ${servicio.fecha.toLocaleDateString('es-VE')} `
        + `(revisión a los ${DIAS_REVISION_SERVICIO} días). ¿Quedó preñada?`,
      PrioridadAlerta.MEDIA,
      'EventoReproductivo',
      servicio.id,
      animal.lote.fincaId,
    );
  }
}

/**
 * Gestaciones en curso cuya fecha de parto esperada ya llegó sin que se
 * registrara el resultado. Se responde desde la alerta o desde
 * Reproducción → Partos (PATCH /reproduccion/gestaciones/:id/cerrar).
 */
async function evaluarPartosVencidos(): Promise<void> {
  const finHoy = new Date();
  finHoy.setHours(23, 59, 59, 999);

  const gestaciones = await prisma.gestacion.findMany({
    where: {
      estadoGestacion: 'EN_CURSO',
      fechaPartoEsperado: { lte: finHoy },
      madre: { estado: 'ACTIVO' },
    },
    include: {
      madre: { select: { numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
    },
  });

  for (const gestacion of gestaciones) {
    const madre = gestacion.madre;
    const fecha = gestacion.fechaPartoEsperado.toLocaleDateString('es-VE');
    await crearNotificacionSiNoExiste(
      interpolar('Fecha de parto cumplida — {animal}', { animal: madre.nombre ?? madre.numeroIdentificacion }),
      `El parto se esperaba el ${fecha}. ¿Cómo salió? Registra el resultado para cerrar la gestación.`,
      PrioridadAlerta.ALTA,
      'Gestacion',
      gestacion.id,
      madre.lote.fincaId,
    );
  }
}

/** Animales activos sin consulta veterinaria en más de N días */
async function evaluarAusenciaControlVeterinario(
  umbralDias: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const fechaLimite = new Date(Date.now() - umbralDias * 86_400_000);

  const animalesSinControl = await prisma.animal.findMany({
    where: {
      estado: 'ACTIVO',
      OR: [
        { historialesMedicos: { none: {} } },
        { historialesMedicos: { none: { fechaConsulta: { gte: fechaLimite } } } },
      ],
    },
    select: {
      id: true,
      numeroIdentificacion: true,
      nombre: true,
      lote: { select: { fincaId: true } },
      historialesMedicos: {
        orderBy: { fechaConsulta: 'desc' },
        take: 1,
        select: { fechaConsulta: true },
      },
    },
  });

  for (const animal of animalesSinControl) {
    const ultimaConsulta = animal.historialesMedicos[0]?.fechaConsulta;
    const diasSinControl = ultimaConsulta
      ? Math.floor((Date.now() - ultimaConsulta.getTime()) / 86_400_000)
      : null;

    const titulo = interpolar(
      'Sin control veterinario — {animal}',
      {
        animal: animal.nombre ?? animal.numeroIdentificacion,
        dias:   (diasSinControl ?? umbralDias).toString(),
      },
    );

    const mensaje = diasSinControl != null
      ? `Último control hace ${diasSinControl} días (umbral: ${umbralDias} días)`
      : `Sin consulta veterinaria registrada en el sistema`;

    await crearNotificacionSiNoExiste(
      titulo,
      mensaje,
      prioridad,
      'Animal',
      animal.id,
      animal.lote.fincaId,
      regla,
    );
  }
}

/** Animales sin peso registrado */
async function evaluarControlPesoPendiente(
  umbralDias: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const animalesSinPeso = await prisma.animal.findMany({
    where: { estado: 'ACTIVO', pesoActual: null },
    select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } }, fechaIngreso: true },
  });

  for (const animal of animalesSinPeso) {
    const diasDesdeIngreso = Math.floor(
      (Date.now() - animal.fechaIngreso.getTime()) / 86_400_000,
    );
    if (diasDesdeIngreso < umbralDias) continue;

    const titulo = interpolar(
      'Control de peso pendiente — {animal}',
      { animal: animal.nombre ?? animal.numeroIdentificacion, dias: diasDesdeIngreso.toString() },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `El animal no tiene peso registrado y lleva ${diasDesdeIngreso} días en el sistema`,
      prioridad,
      'Animal',
      animal.id,
      animal.lote.fincaId,
      regla,
    );
  }
}

/** Vacas cuyo intervalo entre partos supera el umbral de días */
async function evaluarIntervaloParto(
  umbralDias: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const fechaLimite = new Date(Date.now() - umbralDias * 86_400_000);

  const gestacionesAntiguas = await prisma.gestacion.findMany({
    where: {
      estadoGestacion: 'FINALIZADA_PARTO',
      nacimientos: { some: { fechaNacimiento: { lt: fechaLimite } } },
      madre: { estado: 'ACTIVO', sexo: 'HEMBRA' },
    },
    include: {
      madre:       { select: { id: true, numeroIdentificacion: true, nombre: true, lote: { select: { fincaId: true } } } },
      nacimientos: { select: { fechaNacimiento: true }, orderBy: { fechaNacimiento: 'desc' }, take: 1 },
    },
  });

  for (const gestacion of gestacionesAntiguas) {
    const primerNacimiento = gestacion.nacimientos[0];
    if (!primerNacimiento) continue;
    const dias = Math.floor(
      (Date.now() - primerNacimiento.fechaNacimiento.getTime()) / 86_400_000,
    );

    const titulo = interpolar(
      'Intervalo reproductivo prolongado — {animal}',
      { animal: gestacion.madre.nombre ?? gestacion.madre.numeroIdentificacion, dias: dias.toString() },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `Han pasado ${dias} días desde el último parto sin nueva gestación (umbral: ${umbralDias} días)`,
      prioridad,
      'Gestacion',
      gestacion.id,
      gestacion.madre.lote.fincaId,
      regla,
    );
  }
}

/** Inventario de semen por debajo del umbral */
async function evaluarInventarioSemen(
  umbralUnidades: number,
  prioridad: PrioridadAlerta,
  regla: ReglaDb,
): Promise<void> {
  const inventariosBajos = await prisma.inventarioSemen.findMany({
    where: { cantidadDosis: { gt: 0 } },
    include: { semental: true },
  });

  for (const inventario of inventariosBajos) {
    const disponibles = inventario.cantidadDosis - inventario.cantidadUsada;
    if (disponibles > umbralUnidades) continue;

    const titulo = interpolar(
      'Inventario de semen bajo — {semental}',
      {
        semental:  inventario.semental.nombre,
        cantidad:  disponibles.toString(),
        umbral:    umbralUnidades.toString(),
      },
    );

    await crearNotificacionSiNoExiste(
      titulo,
      `Quedan ${disponibles} dosis disponibles (mínimo recomendado: ${umbralUnidades})`,
      prioridad,
      'InventarioSemen',
      inventario.id,
      null,
      regla,
    );
  }
}

// ── Helper: interpolación de variables en el título de la notificación ───────

/**
 * Reemplaza variables como {animal}, {vacuna}, {dias}, {fecha}, {enfermedad},
 * {semental}, {cantidad}, {umbral} en el mensaje personalizado de la regla.
 */
function interpolar(plantilla: string, vars: Record<string, string>): string {
  return plantilla.replace(/\{(\w+)\}/g, (_, clave) => vars[clave] ?? `{${clave}}`);
}

// ── Helper: crear notificación evitando duplicados recientes ──────────────────

/**
 * Crea una notificación para los usuarios que corresponde según la configuración
 * de destinatarios de la regla, evitando duplicados en las últimas 24h.
 */
async function crearNotificacionSiNoExiste(
  titulo: string,
  mensaje: string,
  prioridad: PrioridadAlerta,
  entidadTipo: string,
  entidadId: string,
  fincaId: string | null,
  regla?: ReglaDb,
): Promise<void> {
  const hace24h = new Date(Date.now() - 24 * 3_600_000);

  const yaExiste = await prisma.notificacion.findFirst({
    where: { entidadId, entidadTipo, leida: false, creadoEn: { gte: hace24h } },
    select: { id: true },
  });
  if (yaExiste) return;

  // Notificar a los usuarios específicos configurados como destinatarios de la
  // regla, independientemente de su rol, cada uno a través de su asignación
  // regla-usuario (REGLA_USUARIO). Sin regla (disparo del sistema sin regla
  // asociada, p.ej. un correo de bienvenida), se notifica directamente al
  // usuario — administradores y veterinarios por defecto en este caso.
  const destinatarios: Array<{
    usuario: { id: string; correo: string; nombre: string; estado: string };
    reglaUsuarioId: string | null;
  }> = regla
    ? regla.usuariosNotificados
        .filter((ru) => ru.usuario.estado === 'ACTIVO')
        .map((ru) => ({ usuario: ru.usuario, reglaUsuarioId: ru.id }))
    : (
        await prisma.usuario.findMany({
          where: { estado: 'ACTIVO', rol: { nombre: { in: ['ADMINISTRADOR', 'VETERINARIO'] } } },
          select: { id: true, correo: true, nombre: true, estado: true },
        })
      ).map((usuario) => ({ usuario, reglaUsuarioId: null }));

  for (const { usuario, reglaUsuarioId } of destinatarios) {
    await prisma.notificacion.create({
      data: {
        titulo,
        mensaje,
        prioridad,
        estado: EstadoNotificacion.PENDIENTE,
        entidadTipo,
        entidadId,
        // Exactamente uno de usuarioId / reglaUsuarioId, nunca ambos ni ninguno
        // (ver CHECK "notificacion_destinatario_unico" en el esquema).
        ...(reglaUsuarioId ? { reglaUsuarioId } : { usuarioId: usuario.id }),
        ...(regla && { reglaId: regla.id }),
      },
    });

    try {
      await enviarCorreoAlerta(usuario.correo, usuario.nombre, titulo, mensaje, prioridad);
    } catch {
      logger.warn(`No se pudo enviar correo de alerta a ${usuario.correo}`);
    }
  }
}

// ── Exportaciones para uso en rutas ──────────────────────────────────────────
export {
  evaluarVacunas,
  evaluarPartosProximos,
  evaluarDiasAbiertos,
  evaluarEnfermedadesActivas,
  evaluarAusenciaControlVeterinario,
  evaluarControlPesoPendiente,
  evaluarIntervaloParto,
  evaluarInventarioSemen,
  evaluarTratamientosFinalizados,
  evaluarServiciosPorConfirmar,
  evaluarPartosVencidos,
};
