import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verificarToken, requerirPrivilegio } from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { respuestaExito, respuestaCreado, respuestaSinContenido } from '../../compartido/utilidades/respuestaHttp';
import { ErrorNoEncontrado, ErrorConflicto } from '../../compartido/tipos/respuesta';

const enrutador = Router();

enrutador.use(verificarToken);

// Potreros: áreas de pasto dentro de un lote donde se alojan sus animales.
// Igual que lotes, es un módulo pequeño sin controlador/servicio separados, y
// usa los mismos privilegios que lotes.

const esquemaPotrero = z.object({
  nombre:      z.string().trim().min(1, 'El nombre es requerido').max(100),
  hectareas:   z.number().positive().max(100000).nullable().optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  loteId:      z.string().min(1, 'Seleccione el lote'),
});

const incluir = {
  lote: { select: { id: true, nombre: true, finca: { select: { id: true, nombre: true } } } },
  _count: { select: { animales: { where: { estado: 'ACTIVO' as const } } } },
};

// El nombre no se repite dentro del mismo lote (sin distinguir mayúsculas)
async function verificarNombreLibre(loteId: string, nombre: string, excluirId?: string) {
  const duplicado = await prisma.potrero.findFirst({
    where: { loteId, nombre: { equals: nombre, mode: 'insensitive' }, ...(excluirId && { id: { not: excluirId } }) },
    select: { id: true },
  });
  if (duplicado) throw new ErrorConflicto(`Ya existe un potrero llamado "${nombre}" en este lote`);
}

// GET /api/potreros?fincaId=&loteId= — listar potreros con sus animales activos
enrutador.get('/', requerirPrivilegio('lotes.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fincaId, loteId } = z.object({
      fincaId: z.string().min(1).optional(),
      loteId:  z.string().min(1).optional(),
    }).parse(req.query);

    const potreros = await prisma.potrero.findMany({
      where: {
        ...(loteId && { loteId }),
        ...(fincaId && { lote: { fincaId } }),
      },
      include: incluir,
      orderBy: [{ lote: { finca: { nombre: 'asc' } } }, { lote: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
    return respuestaExito(res, potreros);
  } catch (error) { return next(error); }
});

// GET /api/potreros/:id — potrero con los animales que aloja
enrutador.get('/:id', requerirPrivilegio('lotes.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const potrero = await prisma.potrero.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        ...incluir,
        animales: {
          where: { estado: 'ACTIVO' },
          select: { id: true, numeroIdentificacion: true, nombre: true, sexo: true },
          orderBy: { numeroIdentificacion: 'asc' },
        },
      },
    });
    if (!potrero) throw new ErrorNoEncontrado('Potrero no encontrado');
    return respuestaExito(res, potrero);
  } catch (error) { return next(error); }
});

// POST /api/potreros — crear potrero en un lote
enrutador.post(
  '/',
  requerirPrivilegio('lotes.crear'),
  registrarAuditoria('Crear potrero', 'Potrero'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const datos = esquemaPotrero.parse(req.body);
      const lote = await prisma.lote.findUnique({ where: { id: datos.loteId }, select: { id: true } });
      if (!lote) throw new ErrorNoEncontrado('Lote no encontrado');
      await verificarNombreLibre(datos.loteId, datos.nombre);

      const potrero = await prisma.potrero.create({ data: datos, include: incluir });
      return respuestaCreado(res, potrero);
    } catch (error) { return next(error); }
  },
);

// PATCH /api/potreros/:id — actualizar potrero
enrutador.patch(
  '/:id',
  requerirPrivilegio('lotes.editar'),
  registrarAuditoria('Actualizar potrero', 'Potrero'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'] as string;
      const datos = esquemaPotrero.partial().parse(req.body);
      const actual = await prisma.potrero.findUnique({
        where: { id },
        select: { loteId: true, nombre: true, _count: { select: { animales: true } } },
      });
      if (!actual) throw new ErrorNoEncontrado('Potrero no encontrado');

      // Los animales del potrero pertenecen a su lote: no se puede mover el
      // potrero a otro lote mientras aloje animales.
      if (datos.loteId && datos.loteId !== actual.loteId) {
        if (actual._count.animales > 0) {
          throw new ErrorConflicto(
            `No se puede cambiar de lote: el potrero aloja ${actual._count.animales} animal(es). Reasígnelos primero.`,
          );
        }
        const lote = await prisma.lote.findUnique({ where: { id: datos.loteId }, select: { id: true } });
        if (!lote) throw new ErrorNoEncontrado('Lote no encontrado');
      }
      if (datos.nombre || datos.loteId) {
        await verificarNombreLibre(datos.loteId ?? actual.loteId, datos.nombre ?? actual.nombre, id);
      }

      const potrero = await prisma.potrero.update({ where: { id }, data: datos, include: incluir });
      return respuestaExito(res, potrero);
    } catch (error) { return next(error); }
  },
);

// DELETE /api/potreros/:id — eliminar potrero (solo si no aloja animales)
enrutador.delete(
  '/:id',
  requerirPrivilegio('lotes.eliminar'),
  registrarAuditoria('Eliminar potrero', 'Potrero'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params['id'] as string;
      const potrero = await prisma.potrero.findUnique({
        where: { id },
        select: { _count: { select: { animales: true } } },
      });
      if (!potrero) throw new ErrorNoEncontrado('Potrero no encontrado');
      if (potrero._count.animales > 0) {
        throw new ErrorConflicto(
          `No se puede eliminar el potrero porque aloja ${potrero._count.animales} animal(es). Reasígnelos primero.`,
        );
      }
      await prisma.potrero.delete({ where: { id } });
      return respuestaSinContenido(res);
    } catch (error) { return next(error); }
  },
);

export default enrutador;
