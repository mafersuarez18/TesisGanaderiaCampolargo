import { EstadoUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../../compartido/prisma/clientePrisma';
import {
  ErrorNoEncontrado,
  ErrorConflicto,
  ErrorValidacionDatos,
} from '../../compartido/tipos/respuesta';
import { enviarCorreoBienvenida } from '../notificaciones/correo.servicio';
import { logger } from '../../config/logger';

// El campo `contrasena` nunca se incluye en las selects de lectura
// (seleccionUsuario) — solo se toca al crear la cuenta o al cambiarla,
// siempre como hash de bcrypt.

const seleccionUsuario = {
  id: true,
  nombre: true,
  apellido: true,
  correo: true,
  rol: { select: { id: true, nombre: true, descripcion: true } },
  estado: true,
  cargo: true,
  telefono: true,
  bloqueadoHasta: true,
  ultimoAcceso: true,
  intentosFallidos: true,
} as const;

export async function listarUsuarios(busqueda?: string, rolId?: string) {
  return prisma.usuario.findMany({
    where: {
      ...(rolId && { rolId }),
      ...(busqueda && {
        OR: [
          { nombre:   { contains: busqueda, mode: 'insensitive' } },
          { apellido: { contains: busqueda, mode: 'insensitive' } },
          { correo:   { contains: busqueda, mode: 'insensitive' } },
        ],
      }),
    },
    select: seleccionUsuario,
    orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
  });
}

// Ficha completa: datos de la cuenta, rol con sus privilegios y un resumen
// de su actividad en el sistema.
export async function obtenerUsuarioPorId(id: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: {
      ...seleccionUsuario,
      cedulaIdentidad: true,
      ultimoAcceso: true,
      creadoPor: { select: { nombre: true, apellido: true } },
      rol: {
        select: {
          id: true, nombre: true, descripcion: true,
          privilegios: { select: { privilegio: { select: { id: true, descripcion: true } } } },
        },
      },
      _count: {
        select: {
          historialesMedicosCreados: true,
          eventosReproductivosRegistrados: true,
          vacunasAplicadas: true,
          desparasitacionesAplicadas: true,
          vitaminasAplicadas: true,
          registrosAuditoria: true,
        },
      },
    },
  });
  if (!usuario) throw new ErrorNoEncontrado(`Usuario con id '${id}' no encontrado`);
  const { rol, ...resto } = usuario;
  return {
    ...resto,
    rol: { id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion },
    privilegios: rol.privilegios.map((rp) => rp.privilegio.descripcion).sort(),
  };
}

export interface DatosCrearUsuario {
  nombre:     string;
  apellido:   string;
  correo:     string;
  contrasena: string;
  rolId:      string;
}

export async function crearUsuario(datos: DatosCrearUsuario) {
  const existente = await prisma.usuario.findUnique({
    where: { correo: datos.correo },
    select: { id: true },
  });
  if (existente) throw new ErrorConflicto(`Ya existe un usuario con el correo '${datos.correo}'`);

  const rol = await prisma.rol.findUnique({ where: { id: datos.rolId }, select: { id: true } });
  if (!rol) throw new ErrorNoEncontrado(`Rol con id '${datos.rolId}'`);

  if (datos.contrasena.length < 8) {
    throw new ErrorValidacionDatos('La contraseña debe tener al menos 8 caracteres');
  }

  const hashContrasena = await bcrypt.hash(datos.contrasena, 12);
  const usuario = await prisma.usuario.create({
    data: {
      nombre:     datos.nombre,
      apellido:   datos.apellido,
      correo:     datos.correo,
      contrasena: hashContrasena,
      rolId:      datos.rolId,
    },
    select: seleccionUsuario,
  });

  // La cuenta ya quedó creada; si el correo de bienvenida falla (SMTP no
  // configurado, credenciales inválidas, etc.) no debe revertir la creación.
  try {
    await enviarCorreoBienvenida(datos.correo, datos.nombre, datos.contrasena);
  } catch (error) {
    logger.warn('No se pudo enviar el correo de bienvenida', {
      correo: datos.correo,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return usuario;
}

export interface DatosActualizarUsuario {
  nombre?:   string;
  apellido?: string;
  rolId?:    string;
  estado?:   EstadoUsuario;
  cargo?:    string;
  telefono?: string;
}

export async function actualizarUsuario(id: string, datos: DatosActualizarUsuario) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  if (!usuario) throw new ErrorNoEncontrado(`Usuario con id '${id}' no encontrado`);

  if (datos.rolId) {
    const rol = await prisma.rol.findUnique({ where: { id: datos.rolId }, select: { id: true } });
    if (!rol) throw new ErrorNoEncontrado(`Rol con id '${datos.rolId}'`);
  }

  return prisma.usuario.update({ where: { id }, data: datos, select: seleccionUsuario });
}

export async function cambiarContrasena(
  id: string,
  contrasenaActual: string,
  nuevaContrasena: string,
) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { contrasena: true },
  });
  if (!usuario) throw new ErrorNoEncontrado('Usuario no encontrado');

  const esValida = await bcrypt.compare(contrasenaActual, usuario.contrasena);
  if (!esValida) throw new ErrorValidacionDatos('La contraseña actual es incorrecta');

  if (nuevaContrasena.length < 8) {
    throw new ErrorValidacionDatos('La nueva contraseña debe tener al menos 8 caracteres');
  }

  const hashNuevo = await bcrypt.hash(nuevaContrasena, 12);
  await prisma.usuario.update({ where: { id }, data: { contrasena: hashNuevo } });
}

export async function desbloquearUsuario(id: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  if (!usuario) throw new ErrorNoEncontrado('Usuario no encontrado');

  return prisma.usuario.update({
    where: { id },
    data: { intentosFallidos: 0, bloqueadoHasta: null },
    select: seleccionUsuario,
  });
}

export async function eliminarUsuario(id: string, idSolicitante: string) {
  if (id === idSolicitante) {
    throw new ErrorValidacionDatos('No puede eliminar su propia cuenta');
  }
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
  if (!usuario) throw new ErrorNoEncontrado('Usuario no encontrado');
  return prisma.usuario.delete({ where: { id } });
}
