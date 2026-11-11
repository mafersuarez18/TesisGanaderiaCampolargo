import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  listarAnimalesConUbicacion,
  obtenerHistorialUbicacion,
  registrarUbicacionDispositivo,
  listarDispositivos,
  obtenerMovilidadAnimal,
  importarUbicacionesDesdeArchivo,
  crearDispositivo,
} from './geolocalizacion.servicio';
import { generarMovilidad } from '../reportes/reportes.servicio';
import { respuestaExito, respuestaCreado } from '../../compartido/utilidades/respuestaHttp';
import { ErrorValidacionDatos } from '../../compartido/tipos/respuesta';

export async function controladorListarAnimales(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { fincaId, loteId } = z.object({
      fincaId: z.string().min(1).optional(),
      loteId:  z.string().min(1).optional(),
    }).parse(req.query);
    const animales = await listarAnimalesConUbicacion({ fincaId, loteId });
    return respuestaExito(res, animales);
  } catch (error) { return next(error); }
}

export async function controladorHistorial(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { limite } = z.object({
      limite: z.coerce.number().int().positive().max(500).default(100),
    }).parse(req.query);
    const registros = await obtenerHistorialUbicacion(req.params['animalId'] as string, limite);
    return respuestaExito(res, registros);
  } catch (error) { return next(error); }
}

export async function controladorMovilidad(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { desde, hasta, limite } = z.object({
      desde:  z.coerce.date().optional(),
      hasta:  z.coerce.date().optional(),
      limite: z.coerce.number().int().positive().max(1000).default(200),
    }).parse(req.query);
    const movilidad = await obtenerMovilidadAnimal(req.params['animalId'] as string, { desde, hasta, limite });
    return respuestaExito(res, movilidad);
  } catch (error) { return next(error); }
}

export async function controladorRegistrarUbicacion(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = z.object({
      latitud:   z.number().min(-90).max(90),
      longitud:  z.number().min(-180).max(180),
      precision: z.number().optional(),
      velocidad: z.number().optional(),
    }).parse(req.body);
    const registro = await registrarUbicacionDispositivo(req.params['apiKey'] as string, datos);
    return respuestaCreado(res, registro);
  } catch (error) { return next(error); }
}

export async function controladorListarDispositivos(
  _req: Request, res: Response, next: NextFunction,
) {
  try {
    const dispositivos = await listarDispositivos();
    return respuestaExito(res, dispositivos);
  } catch (error) { return next(error); }
}

export async function controladorCrearDispositivo(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = z.object({
      codigoDispositivo: z.string().trim().min(2, 'El código del collar es requerido').max(60),
      animalId:          z.string().min(1, 'Seleccione el animal'),
      modelo:            z.string().trim().max(100).optional(),
      fabricante:        z.string().trim().max(100).optional(),
      // El formulario la pide en minutos; se guarda en segundos
      frecuenciaMinutos: z.number().int().min(1).max(1440).default(60),
    }).parse(req.body);
    const { frecuenciaMinutos, ...resto } = datos;
    const dispositivo = await crearDispositivo({ ...resto, frecuenciaActualizacion: frecuenciaMinutos * 60 });
    return respuestaCreado(res, dispositivo);
  } catch (error) { return next(error); }
}

// PDF imprimible del reporte de movilidad de un animal (rango opcional)
export async function controladorReporteMovilidad(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { desde, hasta } = z.object({
      desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.query);
    await generarMovilidad(res, req.params['animalId'] as string, {
      desde: desde ? new Date(`${desde}T00:00:00`) : undefined,
      hasta: hasta ? new Date(`${hasta}T23:59:59.999`) : undefined,
    });
  } catch (error) { return next(error); }
}

// Importación de reportes exportados desde la plataforma del fabricante del
// dispositivo (CSV/XLS) — vía de ingesta para collares satelitales cerrados
// que no llaman directamente a nuestro endpoint de ubicación.
export async function controladorImportarUbicaciones(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const archivo = req.file;
    if (!archivo) throw new ErrorValidacionDatos('Debe adjuntar un archivo CSV o Excel (campo "archivo")');
    const resultado = await importarUbicacionesDesdeArchivo(
      req.params['id'] as string, archivo.buffer, archivo.originalname,
    );
    return respuestaCreado(res, resultado);
  } catch (error) { return next(error); }
}
