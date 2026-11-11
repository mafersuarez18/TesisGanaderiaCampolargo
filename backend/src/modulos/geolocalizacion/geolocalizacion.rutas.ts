import { Router } from 'express';
import multer from 'multer';
import { verificarToken, requerirPrivilegio } from '../../compartido/middlewares/autenticacion';
import {
  controladorListarAnimales,
  controladorHistorial,
  controladorMovilidad,
  controladorRegistrarUbicacion,
  controladorListarDispositivos,
  controladorImportarUbicaciones,
  controladorCrearDispositivo,
  controladorReporteMovilidad,
} from './geolocalizacion.controlador';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import { auditarExportacion } from '../reportes/reportes.rutas';

const enrutador = Router();

// Archivos en memoria (no se guardan en disco): se parsean y descartan al
// vuelo. 10 MB cubre de sobra un reporte de varios meses de un collar.
const subidaArchivo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/geolocalizacion/animales?fincaId=&loteId= — posiciones actuales
enrutador.get('/animales', verificarToken, requerirPrivilegio('geolocalizacion.ver'), controladorListarAnimales);

// GET /api/geolocalizacion/historial/:animalId — historial crudo de ubicaciones
enrutador.get('/historial/:animalId', verificarToken, requerirPrivilegio('geolocalizacion.ver'), controladorHistorial);

// GET /api/geolocalizacion/movilidad/:animalId — distancia, tiempo de
// actividad y velocidad promedio calculados a partir del historial
enrutador.get('/movilidad/:animalId', verificarToken, requerirPrivilegio('geolocalizacion.ver'), controladorMovilidad);

// GET /api/geolocalizacion/movilidad/:animalId/pdf?desde=&hasta= — reporte
// de movilidad imprimible (queda en auditoría como exportación)
enrutador.get(
  '/movilidad/:animalId/pdf',
  verificarToken,
  requerirPrivilegio('geolocalizacion.ver'),
  (req, _res, next) => { auditarExportacion(req, `Exportación reporte de movilidad animal ID: ${req.params['animalId']}`); next(); },
  controladorReporteMovilidad,
);

// POST /api/geolocalizacion/dispositivos/:apiKey/ubicacion — endpoint para
// dispositivos GPS (autenticado por apiKey, no por sesión de usuario)
enrutador.post('/dispositivos/:apiKey/ubicacion', controladorRegistrarUbicacion);

// GET /api/geolocalizacion/dispositivos — listar dispositivos
enrutador.get('/dispositivos', verificarToken, requerirPrivilegio('geolocalizacion.gestionar_dispositivos'), controladorListarDispositivos);

// POST /api/geolocalizacion/dispositivos — registrar un collar y asignarlo
enrutador.post(
  '/dispositivos',
  verificarToken,
  requerirPrivilegio('geolocalizacion.gestionar_dispositivos'),
  registrarAuditoria('Registrar dispositivo GPS', 'DispositivoGPS'),
  controladorCrearDispositivo,
);

// POST /api/geolocalizacion/dispositivos/:id/importar — carga un reporte
// CSV/XLS exportado desde la plataforma del fabricante (p. ej. Digitanimal)
// y lo convierte en registros de ubicación del dispositivo indicado.
enrutador.post(
  '/dispositivos/:id/importar',
  verificarToken,
  requerirPrivilegio('geolocalizacion.gestionar_dispositivos'),
  subidaArchivo.single('archivo'),
  controladorImportarUbicaciones,
);

export default enrutador;
