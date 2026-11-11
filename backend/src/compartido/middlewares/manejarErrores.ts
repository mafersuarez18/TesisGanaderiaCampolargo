import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../../config/logger';
import { ErrorAplicacion, ErrorValidacionDatos, ErrorNoEncontrado, ErrorConflicto } from '../tipos/respuesta';

// Middleware de error de Express: se ejecuta cuando cualquier ruta o
// middleware anterior llama a next(error) o lanza una excepción. Traduce
// cada tipo de error conocido al código HTTP y formato de respuesta que
// espera el frontend; lo que no se reconoce se trata como error 500.
export function manejarErrores(
  error: Error,
  req: Request,
  res: Response,
  _siguiente: NextFunction
): void {
  // Body inválido según el esquema Zod del endpoint
  if (error instanceof ZodError) {
    const erroresFormateados = error.errors.map((e) => ({
      campo: e.path.join('.'),
      mensaje: e.message,
    }));
    res.status(422).json({
      exito: false,
      mensaje: 'Datos de entrada inválidos',
      errores: erroresFormateados,
    });
    return;
  }

  // Errores de validación propios del dominio (no relacionados con la
  // forma del body, sino con reglas de negocio)
  if (error instanceof ErrorValidacionDatos) {
    // Con un único motivo general (lo habitual en reglas de negocio), ese
    // motivo es el mensaje: es lo que muestran los formularios.
    const unico = error.errores.length === 1 && error.errores[0]!.campo === 'general';
    res.status(422).json({
      exito: false,
      mensaje: unico ? error.errores[0]!.mensaje : error.message,
      errores: error.errores,
    });
    return;
  }

  // Errores de aplicación "esperados" (no encontrado, no autorizado, etc.)
  // Los de 5xx sí se registran en el log porque indican un fallo real.
  if (error instanceof ErrorAplicacion) {
    if (error.codigoHttp >= 500) {
      logger.error('Error de aplicación', { mensaje: error.message, ruta: req.path });
    }
    res.status(error.codigoHttp).json({
      exito: false,
      mensaje: error.message,
      ...(error instanceof ErrorConflicto && error.detalle && { detalle: error.detalle }),
    });
    return;
  }

  // Errores que Prisma lanza directamente contra la base de datos, antes de
  // que la capa de servicio tenga oportunidad de convertirlos en un error
  // de aplicación con mensaje amigable
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const campo = (error.meta?.target as string[])?.join(', ') ?? 'campo';
      res.status(409).json({
        exito: false,
        mensaje: `Ya existe un registro con ese ${campo}`,
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        exito: false,
        mensaje: 'Registro no encontrado',
      });
      return;
    }

    if (error.code === 'P2003') {
      res.status(409).json({
        exito: false,
        mensaje: 'No se puede realizar la operación: existe una referencia a este registro',
      });
      return;
    }
  }

  // Cualquier otro error: no es algo que el código previó, así que se
  // registra completo (con stack trace) y se responde con un mensaje
  // genérico para no filtrar detalles internos al cliente.
  logger.error('Error no controlado', {
    mensaje: error.message,
    pila: error.stack,
    ruta: req.path,
    metodo: req.method,
  });

  res.status(500).json({
    exito: false,
    mensaje: 'Ocurrió un error interno. Por favor, contacte al administrador del sistema.',
  });
}

// Se registra como último middleware, después de todas las rutas: si una
// petición llega hasta aquí es porque ninguna ruta coincidió.
export function rutaNoEncontrada(req: Request, res: Response): void {
  res.status(404).json({
    exito: false,
    mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}
