import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { EstadoSanitario, EstadoReproductivo, TipoDesparasitante, NivelGravedad, TipoPruebaComplementaria } from '@prisma/client';
import {
  listarHistorialMedico,
  obtenerHistorialPorId,
  crearHistorialMedico,
  eliminarHistorialMedico,
  obtenerPrefillConsulta,
  finalizarTratamiento,
  actualizarPruebaComplementaria,
  agregarPruebaComplementaria,
  agregarEnfermedadDiagnosticada,
  actualizarEnfermedadDiagnosticada,
  agregarTratamiento,
  agregarObservacionConsulta,
} from './historialMedico.servicio';
import {
  respuestaExito,
  respuestaCreado,
  respuestaListado,
  respuestaSinContenido,
} from '../../compartido/utilidades/respuestaHttp';
import { calcularPaginacion, construirMeta } from '../../compartido/utilidades/paginacion';

// Una consulta médica puede traer, en el mismo POST, sus enfermedades
// diagnosticadas, tratamientos y desparasitaciones asociadas — de ahí los
// varios sub-esquemas que se anidan en esquemaHistorial.

const esquemaDesparasitacion = z.object({
  medicamentoId:   z.string().min(1, 'El medicamento es requerido'),
  tipo:            z.nativeEnum(TipoDesparasitante),
  fecha:           z.coerce.date(),
  dosis:           z.string().max(100).optional(),
  via:             z.string().max(100).optional(),
  observaciones:   z.string().max(500).optional(),
});

const esquemaVitamina = z.object({
  medicamentoId:   z.string().min(1, 'El medicamento es requerido'),
  fecha:           z.coerce.date(),
  dosis:           z.string().max(100).optional(),
  via:             z.string().max(100).optional(),
  observaciones:   z.string().max(500).optional(),
});

const esquemaPruebaComplementaria = z.object({
  tipo:          z.nativeEnum(TipoPruebaComplementaria),
  fecha:         z.coerce.date().optional(),
  resultado:     z.string().max(1000).optional(),
  observaciones: z.string().max(500).optional(),
});

const esquemaInformacionEpidemiologica = z.object({
  garrapatas:    z.boolean().optional(),
  mosquitos:     z.boolean().optional(),
  murcielagos:   z.boolean().optional(),
  moscas:        z.boolean().optional(),
  otrosVectores: z.string().max(200).optional(),
  descripcionEntorno: z.string().max(500).optional(),
});

const esquemaTratamiento = z.object({
  medicamentoId:             z.string().min(1),
  enfermedadDiagnosticadaId: z.string().min(1).optional(),
  fechaInicio:               z.coerce.date(),
  dosis:                     z.string().min(1).max(200),
  viaAdministracion:         z.string().min(1).max(100),
  frecuencia:                z.string().min(1).max(100),
  duracionDias:              z.number().int().positive().optional(),
  observaciones:             z.string().max(500).optional(),
  descripcion:               z.string().max(500).optional(),
});

const esquemaEnfermedad = z.object({
  nombreEnfermedad:   z.string().min(2).max(200),
  nivelGravedad:      z.nativeEnum(NivelGravedad).optional(),
  fechaInicio:        z.coerce.date(),
  descripcionClinica: z.string().max(500).optional(),
  observaciones:      z.string().max(500).optional(),
  // Diagnóstico/plan/pronóstico/síntomas de esta condición específica
  diagnosticoDefinitivo: z.string().max(1000).optional(),
  pronostico:         z.string().max(500).optional(),
  planDiagnostico:    z.string().max(1000).optional(),
  tiempoEvolucion:    z.string().max(200).optional(),
  sintomas:           z.string().max(1000).optional(),
  pruebasDiagnostico: z.string().max(1000).optional(),
});

const esquemaHistorial = z.object({
  animalId:                    z.string().min(1),
  fechaConsulta:               z.coerce.date(),
  motivoConsulta:              z.string().min(2).max(300),
  sintomasObservados:          z.string().max(1000).optional(),
  observaciones:               z.string().max(1000).optional(),
  actualizarEstadoSanitario:   z.nativeEnum(EstadoSanitario).optional(),
  estadoSanitario:             z.nativeEnum(EstadoSanitario).optional(),
  enfermedades:                z.array(esquemaEnfermedad).optional(),
  tratamientos:                z.array(esquemaTratamiento).optional(),
  // Anamnesis
  tratamientosPrevios:         z.string().max(1000).optional(),
  cirugias:                    z.string().max(1000).optional(),
  // Exploración física
  temperatura:                 z.number().optional(),
  frecuenciaCardiaca:          z.number().int().positive().optional(),
  frecuenciaRespiratoria:      z.number().int().positive().optional(),
  tiempoLlenadoCapilar:        z.number().optional(),
  movimientosRuminales:        z.number().int().optional(),
  condicionCorporal:           z.number().optional(),
  // Estado del animal
  estadoReproductivo:          z.nativeEnum(EstadoReproductivo).optional(),
  litrosLechesDiarios:         z.number().optional(),
  gananciaPeso:                z.number().optional(),
  // Diagnóstico y plan (a nivel de consulta general)
  diagnosticoDefinitivo:       z.string().max(1000).optional(),
  // Pruebas de rutina/obligatorias no ligadas a una enfermedad diagnosticada
  resultadosPruebas: z.string().max(1000).optional(),
  // Relaciones hijas
  informacionEpidemiologica:   esquemaInformacionEpidemiologica.optional(),
  desparasitaciones:           z.array(esquemaDesparasitacion).optional(),
  vitaminas:                   z.array(esquemaVitamina).optional(),
  pruebasComplementarias:      z.array(esquemaPruebaComplementaria).optional(),
});

const esquemaFinalizarTratamiento = z.object({
  mejoro:        z.boolean(),
  observaciones: z.string().max(500).optional(),
});

const esquemaActualizarPrueba = z.object({
  fecha:         z.coerce.date().nullable().optional(),
  resultado:     z.string().max(1000).nullable().optional(),
  observaciones: z.string().max(500).nullable().optional(),
});

const esquemaObservacion = z.object({
  texto: z.string().trim().min(2, 'La observación es requerida').max(1000),
});

const esquemaFiltros = z.object({
  animalId:  z.string().min(1).optional(),
  busqueda:  z.string().trim().min(1).optional(),
  fincaId:   z.string().min(1).optional(),
  desde:     z.coerce.date().optional(),
  hasta:     z.coerce.date().optional(),
  pagina:    z.coerce.number().int().positive().default(1),
  porPagina: z.coerce.number().int().positive().max(100).default(20),
});

export async function controladorListarHistorial(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const filtros = esquemaFiltros.parse(req.query);
    const { registros, total } = await listarHistorialMedico(filtros);
    const { pagina, porPagina } = calcularPaginacion(filtros.pagina, filtros.porPagina);
    return respuestaListado(res, registros, construirMeta(total, pagina, porPagina));
  } catch (error) { return next(error); }
}

export async function controladorObtenerHistorial(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const historial = await obtenerHistorialPorId(req.params['id'] as string);
    return respuestaExito(res, historial);
  } catch (error) { return next(error); }
}

export async function controladorCrearHistorial(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaHistorial.parse(req.body);
    const historial = await crearHistorialMedico({
      ...datos,
      veterinarioId: req.usuarioActual!.id,
    });
    return respuestaCreado(res, historial);
  } catch (error) { return next(error); }
}

export async function controladorEliminarHistorial(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    await eliminarHistorialMedico(req.params['id'] as string);
    return respuestaSinContenido(res);
  } catch (error) { return next(error); }
}

export async function controladorFinalizarTratamiento(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaFinalizarTratamiento.parse(req.body);
    const resultado = await finalizarTratamiento(req.params['id'] as string, datos, req.usuarioActual!.id);
    return respuestaExito(res, resultado);
  } catch (error) { return next(error); }
}

export async function controladorAgregarPrueba(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaPruebaComplementaria.parse(req.body);
    const prueba = await agregarPruebaComplementaria(req.params['id'] as string, datos);
    return respuestaCreado(res, prueba);
  } catch (error) { return next(error); }
}

export async function controladorActualizarPrueba(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaActualizarPrueba.parse(req.body);
    const prueba = await actualizarPruebaComplementaria(req.params['id'] as string, datos);
    return respuestaExito(res, prueba);
  } catch (error) { return next(error); }
}

export async function controladorAgregarEnfermedad(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaEnfermedad.parse(req.body);
    const enfermedad = await agregarEnfermedadDiagnosticada(req.params['id'] as string, datos);
    return respuestaCreado(res, enfermedad);
  } catch (error) { return next(error); }
}

export async function controladorActualizarEnfermedad(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaEnfermedad.partial().parse(req.body);
    const enfermedad = await actualizarEnfermedadDiagnosticada(req.params['id'] as string, datos);
    return respuestaExito(res, enfermedad);
  } catch (error) { return next(error); }
}

export async function controladorAgregarTratamiento(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const datos = esquemaTratamiento.parse(req.body);
    const tratamiento = await agregarTratamiento(req.params['id'] as string, datos);
    return respuestaCreado(res, tratamiento);
  } catch (error) { return next(error); }
}

export async function controladorAgregarObservacion(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { texto } = esquemaObservacion.parse(req.body);
    const resultado = await agregarObservacionConsulta(req.params['id'] as string, texto, req.usuarioActual!);
    return respuestaExito(res, resultado);
  } catch (error) { return next(error); }
}

export async function controladorPrefillConsulta(
  req: Request, res: Response, next: NextFunction,
) {
  try {
    const { animalId } = z.object({ animalId: z.string().min(1) }).parse(req.query);
    const prefill = await obtenerPrefillConsulta(animalId);
    return respuestaExito(res, prefill);
  } catch (error) { return next(error); }
}
