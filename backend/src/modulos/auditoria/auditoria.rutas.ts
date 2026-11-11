import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TipoAccionAuditoria } from '@prisma/client';
import { verificarToken, requerirPrivilegio } from '../../compartido/middlewares/autenticacion';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { respuestaListado, respuestaExito } from '../../compartido/utilidades/respuestaHttp';
import { ErrorNoEncontrado } from '../../compartido/tipos/respuesta';
import { describirRegistro, datosLegibles, animalDeLosDatos } from './auditoria.detalle';
import { calcularPaginacion, construirMeta } from '../../compartido/utilidades/paginacion';

const enrutador = Router();

enrutador.use(verificarToken, requerirPrivilegio('auditoria.ver'));

// Listado paginado y filtrable de RegistroAuditoria, y el detalle de un
// registro (los registros en sí los crea el middleware registrarAuditoria
// desde cada módulo, no este archivo).
enrutador.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = z.object({
      usuarioId:  z.string().min(1).optional(),
      accion:     z.nativeEnum(TipoAccionAuditoria).optional(),
      modulo:     z.string().optional(),
      // Tipo de registro afectado (Animal, HistorialMedico, Reporte...)
      recurso:    z.string().min(1).optional(),
      // Texto libre: descripción, recurso o usuario
      busqueda:   z.string().trim().min(1).optional(),
      exitoso:    z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
      // Fechas de calendario (AAAA-MM-DD): el día completo, en hora local
      desde:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasta:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      pagina:     z.coerce.number().int().positive().default(1),
      porPagina:  z.coerce.number().int().positive().max(100).default(25),
    }).parse(req.query);

    const donde = {
      ...(filtros.usuarioId && { usuarioId: filtros.usuarioId }),
      ...(filtros.accion    && { accion: filtros.accion }),
      ...(filtros.modulo    && { modulo: { contains: filtros.modulo, mode: 'insensitive' as const } }),
      ...(filtros.recurso   && { entidadTipo: filtros.recurso }),
      ...(filtros.exitoso !== undefined && { exitosa: filtros.exitoso }),
      ...(filtros.busqueda  && {
        OR: [
          { descripcion: { contains: filtros.busqueda, mode: 'insensitive' as const } },
          { entidadTipo: { contains: filtros.busqueda, mode: 'insensitive' as const } },
          { usuario: { OR: [
            { nombre:   { contains: filtros.busqueda, mode: 'insensitive' as const } },
            { apellido: { contains: filtros.busqueda, mode: 'insensitive' as const } },
            { correo:   { contains: filtros.busqueda, mode: 'insensitive' as const } },
          ] } },
        ],
      }),
      ...((filtros.desde || filtros.hasta) && {
        creadoEn: {
          ...(filtros.desde && { gte: new Date(`${filtros.desde}T00:00:00`) }),
          ...(filtros.hasta && { lte: new Date(`${filtros.hasta}T23:59:59.999`) }),
        },
      }),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.registroAuditoria.findMany({
        where: donde,
        include: { usuario: { select: { nombre: true, apellido: true, correo: true } } },
        orderBy: { creadoEn: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
      prisma.registroAuditoria.count({ where: donde }),
    ]);

    const { pagina, porPagina } = calcularPaginacion(filtros.pagina, filtros.porPagina);
    // Nombres que usa la pantalla de auditoría
    const datos = registros.map((r) => ({
      ...r,
      recurso:   r.entidadTipo ?? r.modulo,
      recursoId: r.entidadId,
      ipAddress: r.direccionIP,
      userAgent: r.agenteUsuario,
      exitoso:   r.exitosa,
    }));
    return respuestaListado(res, datos, construirMeta(total, pagina, porPagina));
  } catch (error) { return next(error); }
});

// GET /api/auditoria/:id — detalle completo de una acción: qué se hizo, sobre
// qué registro (descrito en lenguaje natural), quién la hizo y qué datos envió.
enrutador.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.registroAuditoria.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        usuario: { select: { nombre: true, apellido: true, correo: true, rol: { select: { nombre: true } } } },
      },
    });
    if (!r) throw new ErrorNoEncontrado('Registro de auditoría no encontrado');

    const [registroAfectado, datosEnviados, datosPrevios, animalEnDatos] = await Promise.all([
      describirRegistro(r.entidadTipo, r.entidadId),
      datosLegibles(r.datosNuevos),
      datosLegibles(r.datosAnteriores),
      animalDeLosDatos(r.datosNuevos),
    ]);

    return respuestaExito(res, {
      id: r.id,
      accion: r.accion,
      modulo: r.modulo,
      descripcion: r.descripcion,
      recurso: r.entidadTipo ?? r.modulo,
      recursoId: r.entidadId,
      exitoso: r.exitosa,
      errorMensaje: r.errorMensaje,
      creadoEn: r.creadoEn,
      ipAddress: r.direccionIP,
      userAgent: r.agenteUsuario,
      usuario: r.usuario,
      // Si había un registro y ya no aparece, es que se eliminó después
      registroAfectado: registroAfectado ?? (r.entidadId ? { descripcion: null, eliminado: true } : null),
      // Animal involucrado, aunque el registro no lo indique directamente
      animal: registroAfectado?.animal ?? animalEnDatos,
      datosEnviados,
      datosPrevios,
    });
  } catch (error) { return next(error); }
});

export default enrutador;
