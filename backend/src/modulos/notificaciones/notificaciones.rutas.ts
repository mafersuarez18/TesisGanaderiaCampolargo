import { Router } from 'express';
import { Request } from 'express';
import { verificarToken, autenticado } from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import { prisma } from '../../compartido/prisma/clientePrisma';
import {
  controladorListarNotificaciones,
  controladorContarNoLeidas,
  controladorMarcarLeida,
  controladorMarcarTodasLeidas,
  controladorEliminarNotificacion,
  controladorAbordarNotificacion,
  controladorAbordarTodasNotificaciones,
} from './notificaciones.controlador';

const enrutador = Router();

// Auditoría: qué alerta era (título, prioridad y regla que la generó), porque
// al eliminarla o al borrarse su regla ya no se puede consultar.
async function datosDeLaAlerta(req: Request) {
  const n = await prisma.notificacion.findUnique({
    where: { id: req.params['id'] as string },
    select: {
      titulo: true, mensaje: true, prioridad: true, estado: true,
      reglaUsuario: { select: { reglaAlerta: { select: { nombre: true } } } },
    },
  });
  if (!n) return null;
  const { reglaUsuario, ...datos } = n;
  return { ...datos, regla: reglaUsuario?.reglaAlerta.nombre ?? 'Alerta del sistema' };
}

enrutador.use(verificarToken);

// "abordar" (estado DESCARTADA) es distinto de "leer": una notificación
// leída sigue contando como pendiente hasta que el usuario la resuelve o
// el sistema la resuelve automáticamente (ver resolverNotificacionesDeEntidad).

// GET /api/notificaciones
enrutador.get('/', autenticado, controladorListarNotificaciones);

// GET /api/notificaciones/no-leidas/conteo
enrutador.get('/no-leidas/conteo', autenticado, controladorContarNoLeidas);

// PATCH /api/notificaciones/marcar-todas-leidas
enrutador.patch('/marcar-todas-leidas', autenticado, controladorMarcarTodasLeidas);

// PATCH /api/notificaciones/:id/leer
enrutador.patch('/:id/leer', autenticado, controladorMarcarLeida);

// PATCH /api/notificaciones/abordar-todas
enrutador.patch('/abordar-todas', autenticado, registrarAuditoria('Atender todas las alertas', 'Notificacion'), controladorAbordarTodasNotificaciones);

// PATCH /api/notificaciones/:id/abordar
enrutador.patch('/:id/abordar', autenticado, registrarAuditoria('Atender alerta', 'Notificacion', datosDeLaAlerta), controladorAbordarNotificacion);

// DELETE /api/notificaciones/:id
enrutador.delete('/:id', autenticado, registrarAuditoria('Eliminar alerta', 'Notificacion', datosDeLaAlerta), controladorEliminarNotificacion);

export default enrutador;
