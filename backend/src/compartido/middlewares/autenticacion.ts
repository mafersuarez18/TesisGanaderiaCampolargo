import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { entorno } from '../../config/entorno';
import { ErrorNoAutorizado, ErrorForbidden } from '../tipos/respuesta';
import prisma from '../prisma/clientePrisma';

// Se amplía el Request de Express para poder colgar del objeto `req` los
// datos del usuario autenticado, una vez verificado el token.
declare global {
  namespace Express {
    interface Request {
      usuarioActual?: UsuarioToken;
    }
  }
}

export interface UsuarioToken {
  id: string;
  correo: string;
  rolId: string;
  rolNombre: string;
  privilegios: string[];
  nombre: string;
  apellido: string;
}

interface PayloadJWT {
  sub: string;
  correo: string;
  rolId: string;
  rolNombre: string;
  privilegios: string[];
  nombre: string;
  apellido: string;
  iat: number;
  exp: number;
}

// ── Permisos vigentes ────────────────────────────────────────────────────────
// El token guarda los privilegios que tenía el usuario al iniciar sesión,
// pero un administrador puede cambiar el rol de un usuario, los privilegios
// de un rol o desactivar la cuenta en cualquier momento. Para que esos
// cambios apliquen de inmediato (sin volver a iniciar sesión), en cada
// petición se usan los permisos vigentes en la base de datos, con un caché
// corto que se vacía cada vez que se modifican roles o usuarios.

interface PermisosVigentes {
  activo: boolean;
  rolId: string;
  rolNombre: string;
  privilegios: string[];
}

const DURACION_CACHE_MS = 15_000;
const cachePermisos = new Map<string, { expira: number; permisos: PermisosVigentes | null }>();

export function invalidarCachePermisos(): void {
  cachePermisos.clear();
}

export async function obtenerPermisosVigentes(usuarioId: string): Promise<PermisosVigentes | null> {
  const enCache = cachePermisos.get(usuarioId);
  if (enCache && enCache.expira > Date.now()) return enCache.permisos;

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      estado: true,
      rolId: true,
      rol: { select: { nombre: true, privilegios: { select: { privilegio: { select: { descripcion: true } } } } } },
    },
  });
  const permisos = usuario
    ? {
        activo: usuario.estado === 'ACTIVO',
        rolId: usuario.rolId,
        rolNombre: usuario.rol.nombre,
        privilegios: usuario.rol.privilegios.map((rp) => rp.privilegio.descripcion),
      }
    : null;
  cachePermisos.set(usuarioId, { expira: Date.now() + DURACION_CACHE_MS, permisos });
  return permisos;
}

/**
 * Exige un token JWT válido en el header Authorization (Bearer) y, si lo es,
 * deja los datos del usuario disponibles en `req.usuarioActual` para el
 * resto de la cadena de middlewares/controladores, con su rol y privilegios
 * vigentes.
 */
export async function verificarToken(req: Request, _res: Response, siguiente: NextFunction): Promise<void> {
  const encabezadoAutorizacion = req.headers.authorization;

  if (!encabezadoAutorizacion?.startsWith('Bearer ')) {
    throw new ErrorNoAutorizado('Token de acceso no proporcionado');
  }

  const token = encabezadoAutorizacion.slice(7);

  let payload: PayloadJWT;
  try {
    payload = jwt.verify(token, entorno.JWT_SECRETO) as PayloadJWT;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new ErrorNoAutorizado('El token de acceso ha expirado');
    }
    throw new ErrorNoAutorizado('Token de acceso inválido');
  }

  const permisos = await obtenerPermisosVigentes(payload.sub);
  if (!permisos || !permisos.activo) {
    throw new ErrorNoAutorizado('Su cuenta fue desactivada o bloqueada. Contacte al administrador.');
  }

  req.usuarioActual = {
    id: payload.sub,
    correo: payload.correo,
    rolId: permisos.rolId,
    rolNombre: permisos.rolNombre,
    privilegios: permisos.privilegios,
    nombre: payload.nombre,
    apellido: payload.apellido,
  };

  siguiente();
}

// Para montar en los módulos que cambian roles o usuarios: tras cualquier
// modificación exitosa, los permisos se vuelven a leer de la base de datos.
export function invalidarPermisosTrasCambios(req: Request, res: Response, siguiente: NextFunction): void {
  if (req.method !== 'GET') res.on('finish', invalidarCachePermisos);
  siguiente();
}

// Solo exige que exista una sesión válida, sin pedir un privilegio en
// concreto — para recursos de autoservicio (por ejemplo, el propio perfil)
// donde basta con estar identificado.
export function autenticado(req: Request, _res: Response, siguiente: NextFunction): void {
  if (!req.usuarioActual) {
    throw new ErrorNoAutorizado();
  }
  siguiente();
}

/**
 * Exige que el usuario tenga al menos uno de los privilegios indicados.
 * Los privilegios del usuario ya vienen embebidos en el token de acceso
 * (se resolvieron a partir de su rol al iniciar sesión), así que esta
 * verificación no necesita consultar la base de datos.
 */
export function requerirPrivilegio(...codigosPermitidos: string[]) {
  return (req: Request, _res: Response, siguiente: NextFunction): void => {
    if (!req.usuarioActual) {
      throw new ErrorNoAutorizado();
    }

    const tienePrivilegio = codigosPermitidos.some((codigo) =>
      req.usuarioActual!.privilegios.includes(codigo)
    );

    if (!tienePrivilegio) {
      throw new ErrorForbidden(
        `Acceso denegado. Se requiere el privilegio: ${codigosPermitidos.join(' o ')}`
      );
    }

    siguiente();
  };
}
