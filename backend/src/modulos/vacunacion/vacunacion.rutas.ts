import { Router } from 'express';
import {
  verificarToken,
  requerirPrivilegio,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorListarCalendarios,
  controladorObtenerCalendario,
  controladorCrearCalendario,
  controladorActualizarCalendario,
  controladorListarRegistros,
  controladorRegistrarVacunacion,
  controladorActualizarRegistro,
  controladorEliminarRegistro,
  controladorListarMedicamentos,
  controladorCrearMedicamento,
  controladorCumplimientoPorLote,
  controladorVerificarAplicabilidad,
} from './vacunacion.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// El módulo cubre tres cosas relacionadas pero distintas: el catálogo de
// medicamentos, los calendarios de vacunación (qué se aplica y cada
// cuánto) y los registros de cada aplicación concreta.

// Medicamentos (catálogo)
enrutador.get('/medicamentos', requerirPrivilegio('vacunacion.ver'), controladorListarMedicamentos);
// Registrar un medicamento nuevo al vuelo (usado desde el formulario de
// desparasitación cuando el producto escrito no existe en el catálogo)
enrutador.post('/medicamentos', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Registrar medicamento', 'Medicamento'), controladorCrearMedicamento);

// Calendarios de vacunación
enrutador.get('/calendarios', requerirPrivilegio('vacunacion.ver'), controladorListarCalendarios);
enrutador.get('/calendarios/:id', requerirPrivilegio('vacunacion.ver'), controladorObtenerCalendario);
// GET /api/vacunacion/calendarios/:id/aplica?animalId= — si el calendario le
// corresponde al animal (sexo, edad, propósito, condición reproductiva)
enrutador.get('/calendarios/:id/aplica', requerirPrivilegio('vacunacion.ver'), controladorVerificarAplicabilidad);
enrutador.post('/calendarios', requerirPrivilegio('vacunacion.gestionar_calendario'), registrarAuditoria('Crear calendario vacunación', 'CalendarioVacunacion'), controladorCrearCalendario);
enrutador.patch('/calendarios/:id', requerirPrivilegio('vacunacion.gestionar_calendario'), registrarAuditoria('Actualizar calendario vacunación', 'CalendarioVacunacion'), controladorActualizarCalendario);

// GET /api/vacunacion/cumplimiento-por-lote
enrutador.get('/cumplimiento-por-lote', requerirPrivilegio('vacunacion.ver'), controladorCumplimientoPorLote);

// Registros de vacunación aplicada
enrutador.get('/', requerirPrivilegio('vacunacion.ver'), controladorListarRegistros);
enrutador.post('/', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Registrar vacunación', 'RegistroVacunacion'), controladorRegistrarVacunacion);
enrutador.patch('/:id', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Actualizar registro vacunación', 'RegistroVacunacion'), controladorActualizarRegistro);
enrutador.delete('/:id', requerirPrivilegio('vacunacion.registrar'), registrarAuditoria('Eliminar registro vacunación', 'RegistroVacunacion'), controladorEliminarRegistro);

export default enrutador;
