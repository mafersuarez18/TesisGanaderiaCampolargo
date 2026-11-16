import { Request, Response } from 'express';
import { z } from 'zod';
import * as servicioAuth from './autenticacion.servicio';
import { respuestaExito } from '../../compartido/utilidades/respuestaHttp';
import { TipoAccionAuditoria } from '@prisma/client';
import prisma from '../../compartido/prisma/clientePrisma';
import { logger } from '../../config/logger';

// La autenticación se audita aparte del middleware genérico registrarAuditoria
// porque, a diferencia del resto de los módulos, también interesa dejar
// constancia de los intentos fallidos (no solo de las mutaciones exitosas).
function registrarEnAuditoria(
  accion: TipoAccionAuditoria,
  descripcion: string,
  usuarioId: string | null,
  req: Request,
  exitosa = true,
  errorMensaje?: string,
) {
  prisma.registroAuditoria.create({
    data: {
      accion,
      modulo:       'autenticacion',
      descripcion,
      entidadTipo:  'Autenticacion',
      direccionIP:  req.ip ?? req.socket.remoteAddress,
      agenteUsuario: req.headers['user-agent'],
      exitosa,
      errorMensaje,
      usuarioId,
    },
  }).catch((err: Error) => logger.warn('Error al registrar auditoría de auth', { error: err.message }));
}

const esquemaInicioSesion = z.object({
  correo: z.string().email('Correo electrónico inválido'),
  contrasena: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

const esquemaRenovarToken = z.object({
  tokenRefresh: z.string().min(1, 'Token de renovación requerido'),
});

export async function iniciarSesion(req: Request, res: Response): Promise<void> {
  const datos = esquemaInicioSesion.parse(req.body);
  try {
    const resultado = await servicioAuth.iniciarSesion(datos);
    registrarEnAuditoria(
      TipoAccionAuditoria.INICIAR_SESION,
      `Inicio de sesión: ${datos.correo}`,
      resultado.usuario.id,
      req,
    );
    respuestaExito(res, resultado, 'Sesión iniciada correctamente');
  } catch (error) {
    registrarEnAuditoria(
      TipoAccionAuditoria.INTENTO_ACCESO_FALLIDO,
      `Intento fallido de inicio de sesión: ${datos.correo}`,
      null,
      req,
      false,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

export async function renovarToken(req: Request, res: Response): Promise<void> {
  const { tokenRefresh } = esquemaRenovarToken.parse(req.body);
  const resultado = await servicioAuth.renovarToken(tokenRefresh);
  respuestaExito(res, resultado, 'Token renovado correctamente');
}

export async function cerrarSesion(req: Request, res: Response): Promise<void> {
  const usuario = req.usuarioActual!;
  await servicioAuth.cerrarSesion(usuario.id);
  registrarEnAuditoria(
    TipoAccionAuditoria.CERRAR_SESION,
    `Cierre de sesión: ${usuario.correo}`,
    usuario.id,
    req,
  );
  respuestaExito(res, null, 'Sesión cerrada correctamente');
}

// Datos de la sesión con el rol y los privilegios vigentes: el frontend lo
// consulta periódicamente para reflejar cambios hechos por un administrador
// (mismo formato que el usuario devuelto al iniciar sesión).
export async function obtenerPerfil(req: Request, res: Response): Promise<void> {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: req.usuarioActual!.id },
    select: {
      id: true, nombre: true, apellido: true, correo: true, cargo: true,
      rol: { select: { id: true, nombre: true, descripcion: true } },
    },
  });
  respuestaExito(res, { ...usuario, privilegios: req.usuarioActual!.privilegios }, 'Perfil obtenido correctamente');
}
