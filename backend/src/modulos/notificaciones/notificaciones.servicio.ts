import { Prisma, PrioridadAlerta } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorNoEncontrado } from '../../compartido/tipos/respuesta';
import { describirRegistro } from '../auditoria/auditoria.detalle';

// Las notificaciones las genera el motor de alertas (alertas.scheduler.ts);
// este módulo solo se encarga de listarlas, marcarlas como leídas/abordadas
// y de resolverlas automáticamente cuando la situación que las originó deja
// de aplicar.

// Una notificación pertenece a un usuario de dos formas posibles y mutuamente
// excluyentes: de forma directa (usuarioId) o a través de la asignación
// regla-usuario que la originó (reglaUsuario.usuarioId). Todas las consultas
// "mías" deben cubrir ambos casos.
function perteneceAUsuario(usuarioId: string): Prisma.NotificacionWhereInput {
  return { OR: [{ usuarioId }, { reglaUsuario: { usuarioId } }] };
}

export interface FiltrosNotificacion {
  noLeidas?: boolean;
  // Solo las ya atendidas (historial), con quién y cuándo
  atendidas?: boolean;
  prioridad?: PrioridadAlerta;
  pagina?: number;
  porPagina?: number;
  limite?: number;
  usuarioId?: string;
}

export async function listarNotificaciones(filtros: FiltrosNotificacion, usuarioIdActual: string) {
  const { noLeidas, atendidas, prioridad, pagina = 1, porPagina = 20, limite } = filtros;

  const donde: Prisma.NotificacionWhereInput = {
    ...perteneceAUsuario(usuarioIdActual),
    // Por defecto excluir atendidas (DESCARTADA); si se pide "no leídas" también excluye leídas
    ...(atendidas ? { estado: 'DESCARTADA' } : noLeidas === true
      ? { estado: { not: 'DESCARTADA' }, leida: false }
      : noLeidas === false
        ? { /* incluir todas, sin filtro extra */ }
        : { estado: { not: 'DESCARTADA' } }),
    ...(prioridad && { prioridad }),
  };

  const tomar = limite ? Math.min(limite, 50) : porPagina;

  const [registros, total] = await prisma.$transaction([
    prisma.notificacion.findMany({
      where: donde,
      include: { atendidaPor: { select: { nombre: true, apellido: true } } },
      orderBy: atendidas ? [{ fechaLeida: 'desc' }] : [{ leida: 'asc' }, { creadoEn: 'desc' }],
      skip: limite ? 0 : (pagina - 1) * porPagina,
      take: tomar,
    }),
    prisma.notificacion.count({ where: donde }),
  ]);

  return { registros, total };
}

export async function contarNoLeidas(usuarioId: string): Promise<number> {
  // Cuenta todas las notificaciones no abordadas (excluye DESCARTADA = abordada manualmente)
  return prisma.notificacion.count({
    where: { ...perteneceAUsuario(usuarioId), estado: { not: 'DESCARTADA' } },
  });
}

// Si la notificación ya no existe (se borró la regla que la generó, o la
// eliminó otro destinatario) la acción no tiene nada que hacer: se responde
// con éxito para que la pantalla simplemente la quite. Si existe pero es de
// otro usuario, sí es un error.
async function asegurarQueNoExiste(id: string): Promise<void> {
  const existe = await prisma.notificacion.findUnique({ where: { id }, select: { id: true } });
  if (existe) throw new ErrorNoEncontrado('Notificación no encontrada');
}

export async function marcarLeida(id: string, usuarioId: string) {
  const notificacion = await prisma.notificacion.findFirst({
    where: { id, ...perteneceAUsuario(usuarioId) },
    select: { id: true },
  });
  if (!notificacion) { await asegurarQueNoExiste(id); return { id, yaNoExiste: true }; }

  return prisma.notificacion.update({
    where: { id },
    data: { leida: true, fechaLeida: new Date() },
  });
}

export async function marcarTodasLeidas(usuarioId: string) {
  const resultado = await prisma.notificacion.updateMany({
    where: { ...perteneceAUsuario(usuarioId), leida: false },
    data: { leida: true, fechaLeida: new Date() },
  });
  return { actualizadas: resultado.count };
}

export async function eliminarNotificacion(id: string, usuarioId: string) {
  const notificacion = await prisma.notificacion.findFirst({
    where: { id, ...perteneceAUsuario(usuarioId) },
    select: { id: true },
  });
  if (!notificacion) { await asegurarQueNoExiste(id); return { id, yaNoExiste: true }; }
  return prisma.notificacion.delete({ where: { id } });
}

// Una misma alerta llega a cada destinatario como una notificación propia.
// Son "la misma" las que hablan de la misma entidad con el mismo título; sin
// entidad, solo la propia notificación.
function mismaAlerta(n: { id: string; entidadTipo: string | null; entidadId: string | null; titulo: string }): Prisma.NotificacionWhereInput {
  return n.entidadId ? { entidadTipo: n.entidadTipo, entidadId: n.entidadId, titulo: n.titulo } : { id: n.id };
}

/**
 * Atiende una alerta (estado DESCARTADA): se cierra para todos los que la
 * recibieron, quedando registrado quién la atendió y cuándo (fechaLeida).
 * Las atendidas dejan de contar en el badge y el dashboard.
 */
export async function abordarNotificacion(id: string, usuarioId: string) {
  const notificacion = await prisma.notificacion.findFirst({
    where: { id, ...perteneceAUsuario(usuarioId) },
    select: { id: true, entidadTipo: true, entidadId: true, titulo: true },
  });
  if (!notificacion) { await asegurarQueNoExiste(id); return { id, atendidas: 0, yaNoExiste: true }; }
  const resultado = await prisma.notificacion.updateMany({
    where: { ...mismaAlerta(notificacion), estado: { not: 'DESCARTADA' } },
    data: { estado: 'DESCARTADA', leida: true, fechaLeida: new Date(), atendidaPorId: usuarioId },
  });
  return { id, atendidas: resultado.count };
}

/**
 * Atiende todas las alertas pendientes del usuario (y, con cada una, las
 * copias que recibieron los demás destinatarios).
 */
export async function abordarTodasNotificaciones(usuarioId: string) {
  const pendientes = await prisma.notificacion.findMany({
    where: { ...perteneceAUsuario(usuarioId), estado: { not: 'DESCARTADA' } },
    select: { id: true, entidadTipo: true, entidadId: true, titulo: true },
  });
  if (!pendientes.length) return { actualizadas: 0 };
  const resultado = await prisma.notificacion.updateMany({
    where: { OR: pendientes.map(mismaAlerta), estado: { not: 'DESCARTADA' } },
    data: { estado: 'DESCARTADA', leida: true, fechaLeida: new Date(), atendidaPorId: usuarioId },
  });
  return { actualizadas: resultado.count };
}

/**
 * Resuelve automáticamente notificaciones activas relacionadas con una entidad.
 * Llamado cuando se registra una acción que soluciona la alerta (vacuna aplicada, parto registrado, etc.).
 */
export async function resolverNotificacionesDeEntidad(
  entidadTipo: string,
  entidadId: string | string[],
  atendidaPorId?: string,
): Promise<void> {
  await prisma.notificacion.updateMany({
    where: {
      entidadTipo,
      entidadId: Array.isArray(entidadId) ? { in: entidadId } : entidadId,
      estado: { not: 'DESCARTADA' },
    },
    // Quien hizo la acción que resolvió la alerta queda como quien la atendió
    data: { estado: 'DESCARTADA', leida: true, fechaLeida: new Date(), atendidaPorId },
  });
}

/**
 * Detalle de una alerta para explicarla: la regla que la generó (con su
 * umbral), a quiénes les llegó, quién la atendió y el registro al que se
 * refiere (descrito en lenguaje natural, con su animal).
 */
export async function obtenerDetalleNotificacion(id: string, usuarioId: string) {
  const notificacion = await prisma.notificacion.findFirst({
    where: { id, ...perteneceAUsuario(usuarioId) },
    include: {
      atendidaPor: { select: { nombre: true, apellido: true } },
      reglaUsuario: {
        select: {
          reglaAlerta: {
            select: { nombre: true, descripcion: true, tipoAlerta: true, umbralValor: true, umbralUnidad: true },
          },
        },
      },
    },
  });
  if (!notificacion) throw new ErrorNoEncontrado('Notificación no encontrada');

  const copias = await prisma.notificacion.findMany({
    where: mismaAlerta(notificacion),
    select: {
      usuario: { select: { nombre: true, apellido: true } },
      reglaUsuario: { select: { usuario: { select: { nombre: true, apellido: true } } } },
    },
  });
  const destinatarios = [...new Set(copias
    .map((c) => c.usuario ?? c.reglaUsuario?.usuario)
    .filter((u): u is { nombre: string; apellido: string } => !!u)
    .map((u) => `${u.nombre} ${u.apellido}`))];

  const { reglaUsuario, ...datos } = notificacion;
  return {
    ...datos,
    regla: reglaUsuario?.reglaAlerta ?? null,
    destinatarios,
    registro: await describirRegistro(notificacion.entidadTipo, notificacion.entidadId),
  };
}
