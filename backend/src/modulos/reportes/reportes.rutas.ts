import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EstadoAnimal, TipoAccionAuditoria } from '@prisma/client';
import { verificarToken, requerirPrivilegio } from '../../compartido/middlewares/autenticacion';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { respuestaExito } from '../../compartido/utilidades/respuestaHttp';
import { logger } from '../../config/logger';
import {
  generarInventario,
  generarSanitario,
  generarVacunacion,
  generarReproductivo,
  generarHistorialAnimal,
  generarConsulta,
} from './reportes.servicio';

// Cada descarga de reporte queda registrada en la auditoría (a diferencia
// del resto de la API, aquí se hace a mano porque son GET, y el middleware
// registrarAuditoria genérico solo audita mutaciones).
export function auditarExportacion(req: Request, descripcion: string) {
  prisma.registroAuditoria.create({
    data: {
      accion:       TipoAccionAuditoria.EXPORTAR,
      modulo:       'reportes',
      descripcion,
      entidadTipo:  'Reporte',
      direccionIP:  req.ip ?? req.socket.remoteAddress,
      agenteUsuario: req.headers['user-agent'],
      exitosa:      true,
      usuarioId:    req.usuarioActual?.id ?? null,
    },
  }).catch((err: Error) => logger.warn('Error al registrar auditoría de exportación', { error: err.message }));
}

const enrutador = Router();

enrutador.use(verificarToken, requerirPrivilegio('reportes.generar'));

const esquemaFiltros = z.object({
  formato:  z.enum(['pdf', 'excel']).default('pdf'),
  anio:     z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),
  fincaId:  z.string().min(1).optional(),
  estado:   z.nativeEnum(EstadoAnimal).optional(),
});

// ── Endpoints de archivo (PDF / Excel) ────────────────────────────────────────

// GET /api/reportes/inventario?formato=pdf&anio=2025&fincaId=...&estado=...
enrutador.get('/inventario', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    auditarExportacion(req, `Exportación reporte inventario (${filtros.formato.toUpperCase()}, año ${filtros.anio})`);
    await generarInventario(res, filtros.formato, filtros);
  } catch (error) { return next(error); }
});

// GET /api/reportes/sanitario?formato=pdf&anio=2025&fincaId=...
enrutador.get('/sanitario', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    auditarExportacion(req, `Exportación reporte sanitario (${filtros.formato.toUpperCase()}, año ${filtros.anio})`);
    await generarSanitario(res, filtros.formato, filtros);
  } catch (error) { return next(error); }
});

// GET /api/reportes/vacunacion?formato=pdf&anio=2025&fincaId=...
enrutador.get('/vacunacion', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    auditarExportacion(req, `Exportación reporte vacunación (${filtros.formato.toUpperCase()}, año ${filtros.anio})`);
    await generarVacunacion(res, filtros.formato, filtros);
  } catch (error) { return next(error); }
});

// GET /api/reportes/reproductivo?formato=pdf&anio=2025&fincaId=...
enrutador.get('/reproductivo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    auditarExportacion(req, `Exportación reporte reproductivo (${filtros.formato.toUpperCase()}, año ${filtros.anio})`);
    await generarReproductivo(res, filtros.formato, filtros);
  } catch (error) { return next(error); }
});

// GET /api/reportes/historial-animal/:animalId?formato=pdf
enrutador.get('/historial-animal/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    auditarExportacion(req, `Exportación historial animal ID: ${req.params['animalId']}`);
    await generarHistorialAnimal(res, req.params['animalId'] as string);
  } catch (error) { return next(error); }
});

// GET /api/reportes/consulta/:consultaId?formato=pdf
enrutador.get('/consulta/:consultaId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    auditarExportacion(req, `Exportación consulta médica ID: ${req.params['consultaId']}`);
    await generarConsulta(res, req.params['consultaId'] as string);
  } catch (error) { return next(error); }
});

// ── Endpoints JSON de resumen (usados por el dashboard) ───────────────────────

// GET /api/reportes/inventario-animales
enrutador.get('/inventario-animales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fincaId } = z.object({ fincaId: z.string().min(1).optional() }).parse(req.query);

    const [porEstado, porRaza, lotesConAnimales, porSexo] = await Promise.all([
      prisma.animal.groupBy({
        by: ['estado'],
        _count: { id: true },
        where: fincaId ? { lote: { fincaId } } : {},
      }),
      prisma.animal.groupBy({
        by: ['razaId'],
        _count: { id: true },
        where: { estado: EstadoAnimal.ACTIVO, ...(fincaId ? { lote: { fincaId } } : {}) },
      }),
      prisma.lote.findMany({
        where: fincaId ? { fincaId } : {},
        select: {
          finca: { select: { nombre: true } },
          _count: { select: { animales: { where: { estado: EstadoAnimal.ACTIVO } } } },
        },
      }),
      prisma.animal.groupBy({
        by: ['sexo'],
        _count: { id: true },
        where: { estado: EstadoAnimal.ACTIVO, ...(fincaId ? { lote: { fincaId } } : {}) },
      }),
    ]);

    // El conteo por finca ya no es una relación directa de Finca (se alcanza vía
    // Lote), así que se suma por finca a partir de sus lotes.
    const porFincaMapa = new Map<string, number>();
    for (const lote of lotesConAnimales) {
      porFincaMapa.set(lote.finca.nombre, (porFincaMapa.get(lote.finca.nombre) ?? 0) + lote._count.animales);
    }
    const porFinca = Array.from(porFincaMapa, ([nombre, animales]) => ({ nombre, _count: { animales } }));

    return respuestaExito(res, { porEstado, porRaza, porFinca, porSexo });
  } catch (error) { return next(error); }
});

export default enrutador;
