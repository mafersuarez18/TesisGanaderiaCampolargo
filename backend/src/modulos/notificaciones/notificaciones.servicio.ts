import { Prisma, PrioridadAlerta } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { ErrorNoEncontrado } from '../../compartido/tipos/respuesta';

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

export async function marcarLeida(id: string, usuarioId: string) {
  const notificacion = await prisma.notificacion.findFirst({
    where: { id, ...perteneceAUsuario(usuarioId) },
    select: { id: true },
  });
  if (!notificacion) throw new ErrorNoEncontrado('Notificación no encontrada');

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
  if (!notificacion) throw new ErrorNoEncontrado('Notificación no encontrada');
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
  if (!notificacion) throw new ErrorNoEncontrado('Notificación no encontrada');
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
