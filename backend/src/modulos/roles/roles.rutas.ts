import { Router } from 'express';
import { verificarToken, requerirPrivilegio, invalidarPermisosTrasCambios } from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorListarRoles,
  controladorObtenerRol,
  controladorCrearRol,
  controladorActualizarRol,
  controladorAsignarPrivilegios,
  controladorEliminarRol,
  controladorListarPrivilegios,
  controladorCrearPrivilegio,
} from './roles.controlador';

const enrutador = Router();

enrutador.use(verificarToken, requerirPrivilegio('roles.gestionar'), invalidarPermisosTrasCambios);

// Las rutas de privilegios ("/privilegios/catalogo") van antes que "/:id"
// para que Express no las confunda con un id de rol.
enrutador.get('/privilegios/catalogo', controladorListarPrivilegios);
enrutador.post('/privilegios/catalogo', registrarAuditoria('Crear privilegio', 'Privilegio'), controladorCrearPrivilegio);

// ── Roles ────────────────────────────────────────────────────────────────────
enrutador.get('/', controladorListarRoles);
enrutador.get('/:id', controladorObtenerRol);

enrutador.post('/', registrarAuditoria('Crear rol', 'Rol'), controladorCrearRol);
enrutador.patch('/:id', registrarAuditoria('Actualizar rol', 'Rol'), controladorActualizarRol);
enrutador.put('/:id/privilegios', registrarAuditoria('Actualizar privilegios de rol', 'Rol'), controladorAsignarPrivilegios);
enrutador.delete('/:id', registrarAuditoria('Eliminar rol', 'Rol'), controladorEliminarRol);

export default enrutador;
