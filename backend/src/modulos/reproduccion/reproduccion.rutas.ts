import { Router, Request, Response, NextFunction } from 'express';
import { evaluarEdadReproductiva } from './reproduccion.servicio';
import { respuestaExito } from '../../compartido/utilidades/respuestaHttp';
import {
  verificarToken,
  requerirPrivilegio,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorPartosProximos,
  controladorListarEventos,
  controladorObtenerEvento,
  controladorCrearEvento,
  controladorGestacionesActivas,
  controladorCrearGestacion,
  controladorCerrarGestacion,
  controladorIndicadores,
  controladorEfectividadInseminacion,
  controladorServiciosPorConfirmar,
  controladorObtenerGestacion,
  controladorConfirmarServicio,
} from './reproduccion.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// GET /api/reproduccion/aptitud/:animalId?fecha= — ¿la hembra tiene la edad
// mínima recomendable para un servicio? (se usa también desde Inseminación)
enrutador.get('/aptitud/:animalId', requerirPrivilegio('reproduccion.ver', 'inseminacion.ver'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fecha = typeof req.query['fecha'] === 'string' && req.query['fecha'] ? new Date(req.query['fecha']) : new Date();
    return respuestaExito(res, await evaluarEdadReproductiva(req.params['animalId'] as string, isNaN(fecha.getTime()) ? new Date() : fecha));
  } catch (error) { return next(error); }
});

// El orden importa: las rutas con segmento fijo (/partos-proximos,
// /gestaciones, /indicadores...) deben declararse antes de "/:id" para que
// Express no las confunda con un id de evento.

// GET /api/reproduccion/partos-proximos
enrutador.get('/partos-proximos', requerirPrivilegio('reproduccion.ver'), controladorPartosProximos);

// GET /api/reproduccion/gestaciones
enrutador.get('/gestaciones', requerirPrivilegio('reproduccion.ver'), controladorGestacionesActivas);

// GET /api/reproduccion/gestaciones/:id — detalle de una gestación
enrutador.get('/gestaciones/:id', requerirPrivilegio('reproduccion.ver'), controladorObtenerGestacion);

// POST /api/reproduccion/gestaciones
enrutador.post(
  '/gestaciones',
  requerirPrivilegio('reproduccion.crear'),
  registrarAuditoria('Registrar gestación', 'Gestacion'),
  controladorCrearGestacion,
);

// PATCH /api/reproduccion/gestaciones/:id/cerrar
enrutador.patch(
  '/gestaciones/:id/cerrar',
  requerirPrivilegio('reproduccion.crear'),
  registrarAuditoria('Cerrar gestación', 'Gestacion'),
  controladorCerrarGestacion,
);

// GET /api/reproduccion/servicios-por-confirmar — inseminaciones y montas
// a las que todavía no se les registró si la hembra quedó preñada
enrutador.get('/servicios-por-confirmar', requerirPrivilegio('reproduccion.ver'), controladorServiciosPorConfirmar);

// PATCH /api/reproduccion/servicios/:id/confirmar — preñada o vacía
enrutador.patch(
  '/servicios/:id/confirmar',
  requerirPrivilegio('reproduccion.crear', 'inseminacion.crear'),
  registrarAuditoria('Confirmar resultado de servicio reproductivo', 'EventoReproductivo'),
  controladorConfirmarServicio,
);

// GET /api/reproduccion/indicadores
enrutador.get('/indicadores', requerirPrivilegio('reproduccion.ver'), controladorIndicadores);

// GET /api/reproduccion/efectividad-inseminacion
enrutador.get('/efectividad-inseminacion', requerirPrivilegio('reproduccion.ver'), controladorEfectividadInseminacion);

// GET /api/reproduccion
enrutador.get('/', requerirPrivilegio('reproduccion.ver'), controladorListarEventos);

// GET /api/reproduccion/:id
enrutador.get('/:id', requerirPrivilegio('reproduccion.ver'), controladorObtenerEvento);

// POST /api/reproduccion
enrutador.post(
  '/',
  requerirPrivilegio('reproduccion.crear'),
  registrarAuditoria('Registrar evento reproductivo', 'EventoReproductivo'),
  controladorCrearEvento,
);

export default enrutador;
