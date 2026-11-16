import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  verificarToken,
  requerirPrivilegio,
  autenticado,
  invalidarPermisosTrasCambios,
} from '../../compartido/middlewares/autenticacion';
import { registrarAuditoria } from '../../compartido/middlewares/auditoria';
import {
  controladorListarUsuarios,
  controladorObtenerUsuario,
  controladorCrearUsuario,
  controladorActualizarUsuario,
  controladorCambiarContrasena,
  controladorDesbloquearUsuario,
  controladorEliminarUsuario,
} from './usuarios.controlador';
import { actualizarUsuario } from './usuarios.servicio';
import { respuestaExito } from '../../compartido/utilidades/respuestaHttp';

const enrutador = Router();

enrutador.use(verificarToken, invalidarPermisosTrasCambios);

// Las rutas de auto-servicio ("/mi-perfil", "/cambiar-contrasena") solo
// exigen sesión iniciada — cualquier usuario puede ver/editar su propio
// perfil sin necesitar el privilegio administrativo 'usuarios.*'. Deben
// declararse antes de "/:id" para que Express no las confunda con un id.

// GET /api/usuarios/mi-perfil — perfil del usuario autenticado
enrutador.get('/mi-perfil', autenticado, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prisma } = await import('../../compartido/prisma/clientePrisma');
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuarioActual!.id },
      select: {
        id: true, nombre: true, apellido: true, correo: true, cargo: true, telefono: true,
        rol: { select: { id: true, nombre: true, descripcion: true } },
      },
    });
    return respuestaExito(res, usuario);
  } catch (error) { return next(error); }
});

// PATCH /api/usuarios/mi-perfil — actualizar propio perfil
enrutador.patch('/mi-perfil', autenticado, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const datos = z.object({
      nombre:   z.string().min(2).max(100).optional(),
      apellido: z.string().min(2).max(100).optional(),
      cargo:    z.string().max(100).optional(),
      telefono: z.string().max(20).optional(),
    }).parse(req.body);

    const usuario = await actualizarUsuario(req.usuarioActual!.id, datos);
    return respuestaExito(res, usuario);
  } catch (error) { return next(error); }
});

// PATCH /api/usuarios/cambiar-contrasena — cambiar propia contraseña
enrutador.patch('/cambiar-contrasena', autenticado, controladorCambiarContrasena);

// ── Rutas de administrador ──────────────────────────────────────────────────

enrutador.get('/', requerirPrivilegio('usuarios.ver'), controladorListarUsuarios);
enrutador.get('/:id', requerirPrivilegio('usuarios.ver'), controladorObtenerUsuario);

enrutador.post(
  '/',
  requerirPrivilegio('usuarios.crear'),
  registrarAuditoria('Crear usuario', 'Usuario'),
  controladorCrearUsuario,
);

enrutador.patch(
  '/:id',
  requerirPrivilegio('usuarios.editar'),
  registrarAuditoria('Actualizar usuario', 'Usuario'),
  controladorActualizarUsuario,
);

enrutador.patch(
  '/:id/desbloquear',
  requerirPrivilegio('usuarios.desbloquear'),
  registrarAuditoria('Desbloquear usuario', 'Usuario'),
  controladorDesbloquearUsuario,
);

enrutador.delete(
  '/:id',
  requerirPrivilegio('usuarios.eliminar'),
  registrarAuditoria('Eliminar usuario', 'Usuario'),
  controladorEliminarUsuario,
);

export default enrutador;
