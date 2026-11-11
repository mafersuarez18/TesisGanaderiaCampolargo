import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma/clientePrisma';
import { TipoAccionAuditoria } from '@prisma/client';
import { logger } from '../../config/logger';

// Traduce el verbo HTTP de la petición al tipo de acción que se guarda en
// el registro de auditoría.
function obtenerTipoAccion(metodo: string): TipoAccionAuditoria {
  switch (metodo.toUpperCase()) {
    case 'POST':   return TipoAccionAuditoria.CREAR;
    case 'GET':    return TipoAccionAuditoria.LEER;
    case 'PUT':
    case 'PATCH':  return TipoAccionAuditoria.ACTUALIZAR;
    case 'DELETE': return TipoAccionAuditoria.ELIMINAR;
    default:       return TipoAccionAuditoria.LEER;
  }
}

// El primer segmento de la ruta (después de "/api/") identifica el módulo
// sobre el que se actuó, p. ej. "/api/animales/123" → "animales".
function extraerModulo(url: string): string {
  const segmentos = url.replace('/api/', '').split('/');
  return segmentos[0] ?? 'desconocido';
}

/**
 * Middleware que deja constancia en RegistroAuditoria de las peticiones que
 * modifican datos. Las lecturas (GET/HEAD/OPTIONS) se dejan pasar sin
 * registrar para no llenar la auditoría de ruido.
 */
export function registrarAuditoria(
  descripcion: string,
  entidadTipo?: string
) {
  return async (req: Request, res: Response, siguiente: NextFunction): Promise<void> => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      siguiente();
      return;
    }

    const accion = obtenerTipoAccion(req.method);
    // req.path es relativo al enrutador del módulo ("/:id"); el prefijo
    // "/api/animales" está en baseUrl.
    const modulo = extraerModulo(`${req.baseUrl}${req.path}`);
    const usuarioId = req.usuarioActual?.id;

    // Se copia el body de entrada para dejar constancia de qué se envió,
    // ocultando credenciales antes de persistirlo.
    const datosEntrada = req.body ? { ...req.body } : undefined;
    if (datosEntrada?.contrasena) datosEntrada.contrasena = '[OCULTO]';
    if (datosEntrada?.tokenRefresh) datosEntrada.tokenRefresh = '[OCULTO]';

    // Se envuelve res.json para poder saber, una vez respondida la petición,
    // si terminó en éxito o en error (y con qué mensaje).
    const respuestaOriginal = res.json.bind(res);
    let exitosa = true;
    let errorMensaje: string | undefined;
    let idCreado: string | undefined;

    res.json = function (cuerpo: unknown) {
      // Al crear, el id del registro nuevo viene en la respuesta ({ datos: { id } })
      const datos = cuerpo && typeof cuerpo === 'object' ? (cuerpo as { datos?: { id?: unknown } }).datos : undefined;
      if (datos && typeof datos.id === 'string') idCreado = datos.id;
      if (res.statusCode >= 400) {
        exitosa = false;
        if (cuerpo && typeof cuerpo === 'object' && 'mensaje' in cuerpo) {
          errorMensaje = (cuerpo as { mensaje: string }).mensaje;
        }
      }
      return respuestaOriginal(cuerpo);
    };

    siguiente();

    // El registro se guarda cuando la respuesta ya salió, para no retrasar
    // al cliente ni bloquear la petición si la escritura de auditoría falla.
    res.on('finish', () => {
      prisma.registroAuditoria.create({
        data: {
          accion,
          modulo,
          descripcion,
          entidadTipo,
          entidadId: (req.params['id'] as string | undefined) ?? (exitosa ? idCreado : undefined),
          datosNuevos: datosEntrada as object,
          direccionIP: req.ip ?? req.socket.remoteAddress,
          agenteUsuario: req.headers['user-agent'],
          exitosa,
          errorMensaje,
          usuarioId: usuarioId ?? null,
        },
      }).catch((err: Error) => {
        logger.warn('Error al registrar auditoría', { error: err.message });
      });
    });
  };
}
