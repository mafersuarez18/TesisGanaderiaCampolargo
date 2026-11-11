import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ClasificacionIA, TecnicaDeposicionSemen, NivelEstres } from '@prisma/client';
import { verificarToken, requerirPrivilegio } from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { respuestaExito, respuestaCreado, respuestaListado, respuestaSinContenido } from '../../compartido/utilidades/respuestaHttp';
import { calcularPaginacion, construirMeta } from '../../compartido/utilidades/paginacion';
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacionDatos } from '../../compartido/tipos/respuesta';

import { verificarSituacionReproductiva } from '../reproduccion/reproduccion.servicio';

const enrutador = Router();

enrutador.use(verificarToken);

// Este módulo es pequeño y no tiene controlador/servicio separados: toda
// la lógica de sementales, inventario de semen e inseminación artificial
// vive directamente en las rutas.

// GET /api/inseminacion/sementales — listado de sementales
enrutador.get('/sementales', requerirPrivilegio('inseminacion.ver'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sementales = await prisma.semental.findMany({
      include: {
        raza: { select: { id: true, nombre: true } },
        _count: { select: { inventariosSemen: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return respuestaExito(res, sementales);
  } catch (error) { return next(error); }
});

const esquemaSemental = z.object({
  nombre:        z.string().trim().min(1, 'El nombre es requerido').max(200),
  registro:      z.string().trim().max(100).nullable().optional(),
  origen:        z.string().trim().max(200).nullable().optional(),
  razaId:        z.string().min(1, 'Seleccione la raza'),
  observaciones: z.string().trim().max(500).nullable().optional(),
});

const incluirSemental = {
  raza: { select: { id: true, nombre: true } },
  _count: { select: { inventariosSemen: true } },
};

// El número de registro oficial es único (si se indica)
async function verificarRegistroLibre(registro: string | null | undefined, excluirId?: string) {
  if (!registro) return;
  const otro = await prisma.semental.findFirst({
    where: { registro, ...(excluirId && { id: { not: excluirId } }) },
    select: { nombre: true },
  });
  if (otro) throw new ErrorConflicto(`El registro ${registro} ya pertenece al semental ${otro.nombre}`);
}

// GET /api/inseminacion/sementales/:id — detalle: datos, lotes de semen y
// resultados de sus inseminaciones
enrutador.get('/sementales/:id', requerirPrivilegio('inseminacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const semental = await prisma.semental.findUnique({
      where: { id },
      include: {
        ...incluirSemental,
        inventariosSemen: {
          select: {
            id: true, codigoDosis: true, cantidadDosis: true, cantidadUsada: true,
            fechaColeccion: true, fechaVencimiento: true, motivilidad: true,
          },
          orderBy: { codigoDosis: 'asc' },
        },
      },
    });
    if (!semental) throw new ErrorNoEncontrado('Semental');

    // Inseminaciones hechas con su semen y cuántas terminaron en gestación
    const inseminaciones = await prisma.inseminacionArtificial.findMany({
      where: { inventarioSemen: { sementalId: id } },
      select: {
        fechaInseminacion: true,
        eventoReproductivo: {
          select: {
            id: true,
            animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
            gestacion: { select: { estadoGestacion: true } },
          },
        },
      },
      orderBy: { fechaInseminacion: 'desc' },
    });
    const conGestacion = inseminaciones.filter((i) => i.eventoReproductivo.gestacion).length;

    return respuestaExito(res, {
      ...semental,
      totalInseminaciones: inseminaciones.length,
      inseminacionesConGestacion: conGestacion,
      dosisDisponibles: semental.inventariosSemen.reduce((s, l) => s + Math.max(0, l.cantidadDosis - l.cantidadUsada), 0),
      ultimasInseminaciones: inseminaciones.slice(0, 10).map((i) => ({
        eventoId: i.eventoReproductivo.id,
        fecha: i.fechaInseminacion,
        animal: i.eventoReproductivo.animal,
        estadoGestacion: i.eventoReproductivo.gestacion?.estadoGestacion ?? null,
      })),
    });
  } catch (error) { return next(error); }
});

// POST /api/inseminacion/sementales — registrar semental
enrutador.post('/sementales', requerirPrivilegio('inseminacion.crear'), registrarAuditoria('Registrar semental', 'Semental'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const datos = esquemaSemental.parse(req.body);
    await verificarRegistroLibre(datos.registro);
    const semental = await prisma.semental.create({ data: datos, include: incluirSemental });
    return respuestaCreado(res, semental);
  } catch (error) { return next(error); }
});

// PATCH /api/inseminacion/sementales/:id — editar semental
enrutador.patch('/sementales/:id', requerirPrivilegio('inseminacion.crear'), registrarAuditoria('Actualizar semental', 'Semental'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const datos = esquemaSemental.partial().parse(req.body);
    const existe = await prisma.semental.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new ErrorNoEncontrado('Semental');
    await verificarRegistroLibre(datos.registro, id);
    const semental = await prisma.semental.update({ where: { id }, data: datos, include: incluirSemental });
    return respuestaExito(res, semental);
  } catch (error) { return next(error); }
});

// DELETE /api/inseminacion/sementales/:id — eliminar semental. Solo si no
// tiene lotes de semen: esos lotes sostienen el historial de inseminaciones.
enrutador.delete('/sementales/:id', requerirPrivilegio('inseminacion.crear'), registrarAuditoria('Eliminar semental', 'Semental'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const semental = await prisma.semental.findUnique({ where: { id }, select: incluirSemental });
    if (!semental) throw new ErrorNoEncontrado('Semental');
    if (semental._count.inventariosSemen > 0) {
      throw new ErrorConflicto(
        `No se puede eliminar: tiene ${semental._count.inventariosSemen} lote(s) de semen registrados, `
          + 'que forman parte del historial de inseminaciones.',
      );
    }
    await prisma.semental.delete({ where: { id } });
    return respuestaSinContenido(res);
  } catch (error) { return next(error); }
});

// GET /api/inseminacion/inventario — inventario de semen
enrutador.get('/inventario', requerirPrivilegio('inseminacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pagina, porPagina } = z.object({
      pagina: z.coerce.number().int().positive().default(1),
      porPagina: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const [registros, total] = await prisma.$transaction([
      prisma.inventarioSemen.findMany({
        include: { semental: { select: { nombre: true } } },
        orderBy: { fechaColeccion: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      prisma.inventarioSemen.count(),
    ]);

    const { pagina: p, porPagina: pp } = calcularPaginacion(pagina, porPagina);
    return respuestaListado(res, registros, construirMeta(total, p, pp));
  } catch (error) { return next(error); }
});

// POST /api/inseminacion/inventario — registrar lote de semen
enrutador.post('/inventario', requerirPrivilegio('inseminacion.crear'), registrarAuditoria('Registrar lote de semen', 'InventarioSemen'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const datos = z.object({
      sementalId:       z.string().min(1),
      codigoDosis:      z.string().min(1).max(100),
      cantidadDosis:    z.number().int().positive(),
      motivilidad:      z.number().min(0).max(100).optional(),
      concentracion:    z.number().positive().optional(),
      volumen:          z.number().positive().optional(),
      coloracion:       z.string().max(100).optional(),
      temperatura:      z.number().optional(),
      fechaColeccion:   z.coerce.date().optional(),
      fechaVencimiento: z.coerce.date().optional(),
      observaciones:    z.string().max(500).optional(),
    }).parse(req.body);

    // Verificar que el semental existe
    const semental = await prisma.semental.findUnique({
      where: { id: datos.sementalId },
      select: { id: true, nombre: true },
    });
    if (!semental) throw new ErrorNoEncontrado('Semental');

    const lote = await prisma.inventarioSemen.create({
      data: datos,
      include: { semental: { select: { nombre: true } } },
    });
    return respuestaCreado(res, lote);
  } catch (error) { return next(error); }
});

// GET /api/inseminacion — listado de inseminaciones (via eventos reproductivos)
enrutador.get('/', requerirPrivilegio('inseminacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filtros = z.object({
      animalId:  z.string().min(1).optional(),
      fincaId:   z.string().min(1).optional(),
      pagina:    z.coerce.number().int().positive().default(1),
      porPagina: z.coerce.number().int().positive().max(100).default(20),
    }).parse(req.query);

    const donde = {
      tipo: 'INSEMINACION_ARTIFICIAL' as const,
      ...(filtros.animalId && { animalId: filtros.animalId }),
      ...(filtros.fincaId  && { animal: { lote: { fincaId: filtros.fincaId } } }),
    };

    const [registros, total] = await prisma.$transaction([
      prisma.eventoReproductivo.findMany({
        where: donde,
        select: {
          id: true, tipo: true, fecha: true, observaciones: true,
          animal: { select: { id: true, numeroIdentificacion: true, nombre: true } },
          registradoPor: { select: { nombre: true, apellido: true } },
          inseminacion: {
            select: {
              id: true,
              fechaInseminacion: true,
              numeroIntento: true,
              clasificacionIA: true,
              tecnicaDeposicion: true,
              patologiasVaca: true,
              tasaMetabolicaBasal: true,
              balanceEnergetico: true,
              temperaturaUterina: true,
              manejoHato: true,
              observaciones: true,
              inventarioSemen: {
                select: {
                  id: true,
                  codigoDosis: true,
                  temperatura: true,
                  semental: { select: { nombre: true } },
                },
              },
            },
          },
        },
        orderBy: { fecha: 'desc' },
        skip: (filtros.pagina - 1) * filtros.porPagina,
        take: filtros.porPagina,
      }),
      prisma.eventoReproductivo.count({ where: donde }),
    ]);

    const { pagina, porPagina } = calcularPaginacion(filtros.pagina, filtros.porPagina);
    return respuestaListado(res, registros, construirMeta(total, pagina, porPagina));
  } catch (error) { return next(error); }
});

// POST /api/inseminacion — registrar inseminación
enrutador.post('/', requerirPrivilegio('inseminacion.crear'), registrarAuditoria('Registrar inseminación', 'InseminacionArtificial'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const datos = z.object({
      receptoraId:         z.string().min(1),
      inventarioSemenId:   z.string().min(1),
      fecha:               z.coerce.date(),
      numeroIntento:       z.number().int().positive().default(1),
      observaciones:       z.string().max(500).optional(),
      // Clasificación
      clasificacionIA:     z.nativeEnum(ClasificacionIA).optional(),
      tecnicaDeposicion:   z.nativeEnum(TecnicaDeposicionSemen).optional(),
      // Factores biológicos
      patologiasVaca:      z.string().max(1000).optional(),
      tasaMetabolicaBasal: z.number().int().min(1).max(5).optional(),
      balanceEnergetico:   z.string().max(200).optional(),
      // Estrés térmico
      temperaturaUterina:  z.number().optional(),
      // Manejo del hato
      manejoHato:          z.nativeEnum(NivelEstres).optional(),
      // La pantalla ya preguntó y la hembra está vacía
      resolucionPrevia:    z.literal('VACIA').optional(),
    }).parse(req.body);

    // Solo una hembra puede ser receptora
    const receptora = await prisma.animal.findUnique({
      where: { id: datos.receptoraId },
      select: { sexo: true, numeroIdentificacion: true },
    });
    if (!receptora) throw new ErrorNoEncontrado('Animal receptor');
    if (receptora.sexo !== 'HEMBRA') {
      throw new ErrorValidacionDatos(`La receptora debe ser una hembra. El animal ${receptora.numeroIdentificacion} es macho.`);
    }

    // Validar inventario disponible
    const inventario = await prisma.inventarioSemen.findUnique({
      where: { id: datos.inventarioSemenId },
      select: { cantidadDosis: true, cantidadUsada: true, codigoDosis: true },
    });
    if (!inventario) throw new ErrorNoEncontrado('Lote de semen');
    if (inventario.cantidadDosis - inventario.cantidadUsada < 1) {
      throw new ErrorConflicto(`No hay dosis disponibles del lote ${inventario.codigoDosis}`);
    }

    // No se insemina una hembra preñada ni con su último servicio sin
    // confirmar: se le pregunta a la pantalla si quedó preñada (ver servicio)
    await verificarSituacionReproductiva(
      datos.receptoraId, 'INSEMINACION_ARTIFICIAL', datos.fecha, req.usuarioActual!.id, datos.resolucionPrevia,
    );

    const {
      receptoraId, inventarioSemenId, fecha, numeroIntento, observaciones,
      clasificacionIA, tecnicaDeposicion, patologiasVaca,
      tasaMetabolicaBasal, balanceEnergetico, temperaturaUterina, manejoHato,
    } = datos;

    const [evento] = await prisma.$transaction([
      prisma.eventoReproductivo.create({
        data: {
          tipo:          'INSEMINACION_ARTIFICIAL',
          fecha,
          observaciones,
          animal:        { connect: { id: receptoraId } },
          registradoPor: { connect: { id: req.usuarioActual!.id } },
          inseminacion: {
            create: {
              fechaInseminacion:  fecha,
              numeroIntento,
              observaciones,
              inventarioSemen:    { connect: { id: inventarioSemenId } },
              clasificacionIA,
              tecnicaDeposicion,
              patologiasVaca,
              tasaMetabolicaBasal,
              balanceEnergetico,
              temperaturaUterina,
              manejoHato,
            },
          },
        },
      }),
      prisma.inventarioSemen.update({
        where: { id: inventarioSemenId },
        data: { cantidadUsada: { increment: 1 } },
      }),
    ]);

    return respuestaCreado(res, evento);
  } catch (error) { return next(error); }
});

export default enrutador;
