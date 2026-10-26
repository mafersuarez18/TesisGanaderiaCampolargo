import { Router } from 'express';
import {
  verificarToken,
  requerirPrivilegio,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorListarHistorial,
  controladorObtenerHistorial,
  controladorCrearHistorial,
  controladorEliminarHistorial,
  controladorPrefillConsulta,
  controladorFinalizarTratamiento,
  controladorActualizarPrueba,
} from './historialMedico.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// Datos para pre-rellenar el formulario de nueva consulta (última
// desparasitación, calendarios disponibles, enfermedades activas del
// animal) — se consulta antes de mostrar el formulario al veterinario.
enrutador.get('/prefill', requerirPrivilegio('historial_medico.ver'), controladorPrefillConsulta);

enrutador.get('/', requerirPrivilegio('historial_medico.ver'), controladorListarHistorial);
enrutador.get('/:id', requerirPrivilegio('historial_medico.ver'), controladorObtenerHistorial);

enrutador.post(
  '/',
  requerirPrivilegio('historial_medico.crear'),
  registrarAuditoria('Crear historial médico', 'HistorialMedico'),
  controladorCrearHistorial,
);

// Responde al aviso "¿mejoró?" que genera el motor de alertas cuando un
// tratamiento debería haber terminado: cierra el tratamiento, resuelve la
// enfermedad si corresponde y recalcula el estado sanitario del animal.
enrutador.patch(
  '/tratamientos/:id/finalizar',
  requerirPrivilegio('historial_medico.crear'),
  registrarAuditoria('Finalizar tratamiento', 'Tratamiento'),
  controladorFinalizarTratamiento,
);

// Completa el resultado de una prueba complementaria que se registró sin él
// (el laboratorio todavía no lo había entregado al momento de la consulta).
enrutador.patch(
  '/pruebas-complementarias/:id',
  requerirPrivilegio('historial_medico.crear'),
  registrarAuditoria('Actualizar resultado de prueba complementaria', 'PruebaComplementaria'),
  controladorActualizarPrueba,
);

enrutador.delete(
  '/:id',
  requerirPrivilegio('historial_medico.eliminar'),
  registrarAuditoria('Eliminar historial médico', 'HistorialMedico'),
  controladorEliminarHistorial,
);

export default enrutador;
