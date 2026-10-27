import { Router } from 'express';
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
  controladorConfirmarServicio,
} from './reproduccion.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// El orden importa: las rutas con segmento fijo (/partos-proximos,
// /gestaciones, /indicadores...) deben declararse antes de "/:id" para que
// Express no las confunda con un id de evento.

// GET /api/reproduccion/partos-proximos
enrutador.get('/partos-proximos', requerirPrivilegio('reproduccion.ver'), controladorPartosProximos);

// GET /api/reproduccion/gestaciones
enrutador.get('/gestaciones', requerirPrivilegio('reproduccion.ver'), controladorGestacionesActivas);

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
  requerirPrivilegio('reproduccion.crear'),
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
