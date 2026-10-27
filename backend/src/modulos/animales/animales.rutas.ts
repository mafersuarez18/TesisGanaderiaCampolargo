import { Router } from 'express';
import {
  verificarToken,
  requerirPrivilegio,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorListarAnimales,
  controladorObtenerAnimal,
  controladorBuscarPorArete,
  controladorCrearAnimal,
  controladorActualizarAnimal,
  controladorEliminarAnimal,
  controladorListarRazas,
  controladorCrearRaza,
  controladorCriasPorRegistrar,
} from './animales.controlador';

const enrutador = Router();

enrutador.use(verificarToken);

// Las mutaciones (crear/actualizar/eliminar) quedan registradas en la
// auditoría; las lecturas no, para no saturarla.

// GET /api/animales/razas — debe ir antes que /:id para no confundirse con el param
enrutador.get('/razas', requerirPrivilegio('animales.ver'), controladorListarRazas);

// POST /api/animales/razas — registrar una raza nueva (usado desde el
// formulario de animal cuando la raza escrita no existe en el catálogo)
enrutador.post(
  '/razas',
  requerirPrivilegio('animales.crear'),
  registrarAuditoria('Registrar raza', 'Raza'),
  controladorCrearRaza,
);

// GET /api/animales/crias-por-registrar — crías vivas nacidas en un parto
// registrado que todavía no se dieron de alta como animales
enrutador.get('/crias-por-registrar', requerirPrivilegio('animales.ver'), controladorCriasPorRegistrar);

// GET /api/animales/arete/:arete
enrutador.get('/arete/:arete', requerirPrivilegio('animales.ver'), controladorBuscarPorArete);

// GET /api/animales
enrutador.get('/', requerirPrivilegio('animales.ver'), controladorListarAnimales);

// GET /api/animales/:id
enrutador.get('/:id', requerirPrivilegio('animales.ver'), controladorObtenerAnimal);

// POST /api/animales
enrutador.post(
  '/',
  requerirPrivilegio('animales.crear'),
  registrarAuditoria('Registrar animal', 'Animal'),
  controladorCrearAnimal,
);

// PATCH /api/animales/:id
enrutador.patch(
  '/:id',
  requerirPrivilegio('animales.editar'),
  registrarAuditoria('Actualizar animal', 'Animal'),
  controladorActualizarAnimal,
);

// DELETE /api/animales/:id
enrutador.delete(
  '/:id',
  requerirPrivilegio('animales.eliminar'),
  registrarAuditoria('Eliminar animal', 'Animal'),
  controladorEliminarAnimal,
);

export default enrutador;
