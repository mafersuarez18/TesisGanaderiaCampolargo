import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TipoEventoReproductivo, ClasificacionIA, TecnicaDeposicionSemen, NivelEstres, TipoParto, Sexo, EstadoCria } from '@prisma/client';
import {
  listarPartosProximos,
  listarEventosReproductivos,
  obtenerEventoReproductivo,
  crearEventoReproductivo,
  listarGestacionesActivas,
  crearGestacion,
  cerrarGestacion,
  obtenerIndicadoresReproductivos,
  obtenerEfectividadInseminacion,
  listarServiciosPorConfirmar,
  confirmarServicio,
} from './reproduccion.servicio';
import {
  respuestaExito,
  respuestaCreado,
  respuestaListado,
} from '../../compartido/utilidades/respuestaHttp';
import { calcularPaginacion, construirMeta } from '../../compartido/utilidades/paginacion';

// La inseminación artificial se registra como un EventoReproductivo más
// (tipo INSEMINACION_ARTIFICIAL), con sus propios campos adicionales; de
// ahí que esquemaEvento incluya campos que solo aplican a ese tipo.

const esquemaFiltros = z.object({
  animalId:   z.string().min(1).optional(),
  fincaId:    z.string().min(1).optional(),
  tipoEvento: z.nativeEnum(TipoEventoReproductivo).optional(),
  desde:      z.coerce.date().optional(),
  hasta:      z.coerce.date().optional(),
  pagina:     z.coerce.number().int().positive().default(1),
  porPagina:  z.coerce.number().int().positive().max(100).default(20),
});

const esquemaEvento = z.object({
  animalId:     z.string().min(1),
  tipo:         z.nativeEnum(TipoEventoReproductivo),
  fecha:        z.coerce.date(),
  descripcion:  z.string().max(500).optional(),
  observaciones: z.string().max(1000).optional(),
  // Campos específicos de Inseminación Artificial
  clasificacionIA:     z.nativeEnum(ClasificacionIA).optional(),
  tecnicaDeposicion:   z.nativeEnum(TecnicaDeposicionSemen).optional(),
  patologiasVaca:      z.string().max(1000).optional(),
  tasaMetabolicaBasal: z.number().int().min(1).max(5).optional(),
  balanceEnergetico:   z.string().max(200).optional(),
  temperaturaUterina:  z.number().optional(),
  manejoHato:          z.nativeEnum(NivelEstres).optional(),
  // Solo para DIAGNOSTICO_GESTACION
  resultadoDiagnostico: z.enum(['POSITIVO', 'NEGATIVO']).optional(),
});

const esquemaGestacion = z.object({
  madreId:              z.string().min(1),
  fechaInicio:          z.coerce.date(),
  fechaPartoEsperado:   z.coerce.date(),
  observaciones:        z.string().max(500).optional(),
  eventoReproductivoId: z.string().min(1).optional(),
});

export async function controladorPartosProximos(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { dias, limite, incluirVencidos } = z.object({
      dias:   z.coerce.number().int().positive().max(180).default(30),
      limite: z.coerce.number().int().positive().max(50).default(20),
      incluirVencidos: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    }).parse(req.query);
    const partos = await listarPartosProximos(dias, limite, incluirVencidos);
    return respuestaExito(res, partos);
  } catch (error) { return next(error); }
}

export async function controladorListarEventos(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    const { registros, total } = await listarEventosReproductivos(filtros);
    const { pagina, porPagina } = calcularPaginacion(filtros.pagina, filtros.porPagina);
    return respuestaListado(res, registros, construirMeta(total, pagina, porPagina));
  } catch (error) { return next(error); }
}

export async function controladorObtenerEvento(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const evento = await obtenerEventoReproductivo(req.params['id'] as string);
    return respuestaExito(res, evento);
  } catch (error) { return next(error); }
}

export async function controladorCrearEvento(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaEvento.parse(req.body);
    const evento = await crearEventoReproductivo({
      ...datos,
      registradoPorId: req.usuarioActual!.id,
    });
    return respuestaCreado(res, evento);
  } catch (error) { return next(error); }
}

export async function controladorGestacionesActivas(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { fincaId } = z.object({ fincaId: z.string().min(1).optional() }).parse(req.query);
    const gestaciones = await listarGestacionesActivas(fincaId);
    return respuestaExito(res, gestaciones);
  } catch (error) { return next(error); }
}

export async function controladorCrearGestacion(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaGestacion.parse(req.body);
    const gestacion = await crearGestacion(datos);
    return respuestaCreado(res, gestacion);
  } catch (error) { return next(error); }
}

export async function controladorIndicadores(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { anio, fincaId } = z.object({
      anio:    z.coerce.number().int().min(2000).max(2100).default(() => new Date().getFullYear()),
      fincaId: z.string().min(1).optional(),
    }).parse(req.query);
    const indicadores = await obtenerIndicadoresReproductivos(anio, fincaId);
    return respuestaExito(res, indicadores);
  } catch (error) { return next(error); }
}

export async function controladorEfectividadInseminacion(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { fincaId } = z.object({ fincaId: z.string().min(1).optional() }).parse(req.query);
    const efectividad = await obtenerEfectividadInseminacion(fincaId);
    return respuestaExito(res, efectividad);
  } catch (error) { return next(error); }
}

export async function controladorCerrarGestacion(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { resultado, fechaPartoReal, nacimiento } = z.object({
      resultado:     z.enum(['PARTO', 'ABORTO', 'PERDIDA']),
      fechaPartoReal: z.coerce.date().optional(),
      // Solo tiene sentido cuando resultado === 'PARTO'; se ignora en aborto/pérdida.
      nacimiento: z.object({
        tipoParto:      z.nativeEnum(TipoParto).optional(),
        pesoAlNacer:    z.number().positive().optional(),
        sexoCria:       z.nativeEnum(Sexo).optional(),
        estadoCria:     z.nativeEnum(EstadoCria).optional(),
        observaciones:  z.string().max(500).optional(),
        complicaciones: z.string().max(500).optional(),
      }).optional(),
    }).parse(req.body);
    const { gestacion } = await cerrarGestacion(
      req.params['id'] as string, resultado, fechaPartoReal, nacimiento, req.usuarioActual!.id,
    );
    return respuestaExito(res, gestacion);
  } catch (error) { return next(error); }
}

export async function controladorServiciosPorConfirmar(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { fincaId } = z.object({ fincaId: z.string().min(1).optional() }).parse(req.query);
    const servicios = await listarServiciosPorConfirmar(fincaId);
    return respuestaExito(res, servicios);
  } catch (error) { return next(error); }
}

export async function controladorConfirmarServicio(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = z.object({
      prenada:            z.boolean(),
      fechaDiagnostico:   z.coerce.date().optional(),
      metodoDiagnostico:  z.string().max(100).optional(),
      fechaPartoEsperado: z.coerce.date().optional(),
      observaciones:      z.string().max(500).optional(),
    }).parse(req.body);
    const resultado = await confirmarServicio(req.params['id'] as string, datos, req.usuarioActual!.id);
    return respuestaExito(res, resultado);
  } catch (error) { return next(error); }
}
