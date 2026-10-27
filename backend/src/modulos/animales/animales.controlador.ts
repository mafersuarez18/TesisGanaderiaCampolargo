import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Sexo, EstadoAnimal, TipoPropositoAnimal, EstadoSanitario, TipoIdentificacion } from '@prisma/client';
import {
  servicioListarAnimales,
  servicioObtenerAnimal,
  servicioObtenerAnimalPorArete,
  servicioCrearAnimal,
  servicioActualizarAnimal,
  servicioEliminarAnimal,
  servicioListarRazas,
  servicioCrearRaza,
  servicioListarCriasPorRegistrar,
} from './animales.servicio';
import {
  respuestaExito,
  respuestaCreado,
  respuestaListado,
  respuestaSinContenido,
} from '../../compartido/utilidades/respuestaHttp';
import { construirMeta } from '../../compartido/utilidades/paginacion';

// Valida la entrada HTTP con Zod y delega en el servicio; no contiene
// lógica de negocio propia.

const esquemaCrearAnimal = z.object({
  numeroIdentificacion:     z.string().min(1, 'La identificación es requerida').max(50),
  tipoIdentificacion: z.nativeEnum(TipoIdentificacion).default('ARETE'),
  nombre:          z.string().max(100).optional(),
  sexo:            z.nativeEnum(Sexo),
  proposito:       z.nativeEnum(TipoPropositoAnimal),
  estado:          z.nativeEnum(EstadoAnimal).default('ACTIVO'),
  estadoSanitario: z.nativeEnum(EstadoSanitario).default('SANO'),
  fechaNacimiento: z.coerce.date().optional(),
  pesoActual:      z.number().positive().optional(),
  color:           z.string().max(100).optional(),
  marcas:          z.string().max(300).optional(),
  observaciones:   z.string().max(1000).optional(),
  procedencia:     z.string().max(300).optional(),
  loteId:          z.string().min(1),
  razaId:          z.string().min(1),
  padreId:         z.string().min(1).optional(),
  madreId:         z.string().min(1).optional(),
});

const esquemaFiltros = z.object({
  busqueda:       z.string().optional(),
  fincaId:        z.string().min(1).optional(),
  loteId:         z.string().min(1).optional(),
  razaId:         z.string().min(1).optional(),
  sexo:           z.nativeEnum(Sexo).optional(),
  estado:         z.nativeEnum(EstadoAnimal).optional(),
  pagina:         z.coerce.number().int().positive().default(1),
  porPagina:      z.coerce.number().int().positive().max(500).default(20),
  ordenPor:       z.enum(['numeroIdentificacion', 'nombre', 'fechaNacimiento', 'fechaIngreso']).default('fechaIngreso'),
  direccionOrden: z.enum(['asc', 'desc']).default('desc'),
});

export async function controladorListarAnimales(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    const { registros, total } = await servicioListarAnimales(filtros);
    return respuestaListado(res, registros, construirMeta(total, filtros));
  } catch (error) { return next(error); }
}

export async function controladorObtenerAnimal(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const animal = await servicioObtenerAnimal(req.params['id'] as string);
    return respuestaExito(res, animal);
  } catch (error) { return next(error); }
}

export async function controladorBuscarPorArete(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const animal = await servicioObtenerAnimalPorArete(req.params['arete'] as string);
    return respuestaExito(res, animal);
  } catch (error) { return next(error); }
}

export async function controladorCrearAnimal(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    // nacimientoId solo se acepta al crear (no en la edición, que usa
    // esquemaCrearAnimal.partial()): enlaza la cría con su nacimiento.
    const datos = esquemaCrearAnimal.extend({ nacimientoId: z.string().min(1).optional() }).parse(req.body);
    const animal = await servicioCrearAnimal(datos);
    return respuestaCreado(res, animal);
  } catch (error) { return next(error); }
}

export async function controladorCriasPorRegistrar(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { fincaId } = z.object({ fincaId: z.string().min(1).optional() }).parse(req.query);
    const crias = await servicioListarCriasPorRegistrar(fincaId);
    return respuestaExito(res, crias);
  } catch (error) { return next(error); }
}

export async function controladorActualizarAnimal(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaCrearAnimal.partial().parse(req.body);
    const animal = await servicioActualizarAnimal(req.params['id'] as string, datos);
    return respuestaExito(res, animal);
  } catch (error) { return next(error); }
}

export async function controladorEliminarAnimal(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    await servicioEliminarAnimal(req.params['id'] as string);
    return respuestaSinContenido(res);
  } catch (error) { return next(error); }
}

export async function controladorListarRazas(
  _req: Request, res: Response, next: NextFunction,
) {
  try {
    const razas = await servicioListarRazas();
    return respuestaExito(res, razas);
  } catch (error) { return next(error); }
}

const esquemaCrearRaza = z.object({
  nombre:    z.string().min(1, 'El nombre es requerido').max(100),
  tipoCruce: z.string().min(1, 'El tipo de cruce es requerido').max(100),
  origen:    z.string().max(200).optional(),
});

export async function controladorCrearRaza(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaCrearRaza.parse(req.body);
    const raza = await servicioCrearRaza(datos);
    return respuestaCreado(res, raza);
  } catch (error) { return next(error); }
}
