import nodemailer from 'nodemailer';
import { entorno } from '../../config/entorno';
import { logger } from '../../config/logger';
import { PrioridadAlerta } from '@prisma/client';

// El envío de correo es opcional: si no hay credenciales SMTP configuradas
// (EMAIL_USUARIO), las funciones de este archivo simplemente no envían nada
// en vez de fallar, para que el sistema funcione igual sin correo en dev.
const transportador = nodemailer.createTransport({
  host: entorno.EMAIL_SERVIDOR,
  port: parseInt(entorno.EMAIL_PUERTO, 10),
  secure: false,
  auth: entorno.EMAIL_USUARIO
    ? { user: entorno.EMAIL_USUARIO, pass: entorno.EMAIL_CLAVE }
    : undefined,
});

// Gmail rechaza (o reescribe) un remitente que no sea la propia cuenta
// autenticada, así que a falta de EMAIL_REMITENTE explícito se usa
// EMAIL_USUARIO — son, en la práctica, casi siempre la misma dirección.
const remitente = entorno.EMAIL_REMITENTE ?? entorno.EMAIL_USUARIO;

function obtenerColorPrioridad(prioridad: PrioridadAlerta): string {
  const colores: Record<PrioridadAlerta, string> = {
    BAJA: '#22c55e',
    MEDIA: '#f59e0b',
    ALTA: '#f97316',
    CRITICA: '#ef4444',
  };
  return colores[prioridad];
}

function obtenerEtiquetaPrioridad(prioridad: PrioridadAlerta): string {
  const etiquetas: Record<PrioridadAlerta, string> = {
    BAJA: 'Baja',
    MEDIA: 'Media',
    ALTA: 'Alta',
    CRITICA: 'Crítica',
  };
  return etiquetas[prioridad];
}

export async function enviarCorreoAlerta(
  destinatario: string,
  nombreUsuario: string,
  titulo: string,
  mensaje: string,
  prioridad: PrioridadAlerta
): Promise<boolean> {
  // Devuelve si el correo se envió (false si no hay SMTP configurado).
  if (!entorno.EMAIL_USUARIO) {
    logger.debug('Envío de correo omitido: EMAIL_USUARIO no configurado');
    return false;
  }

  const color = obtenerColorPrioridad(prioridad);
  const etiqueta = obtenerEtiquetaPrioridad(prioridad);
  const fecha = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });

  const htmlCorreo = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',sans-serif;">
      <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Encabezado -->
        <div style="background:linear-gradient(135deg,#166534,#15803d);padding:32px 40px;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🐄 Sistema Campolargo</h1>
          <p style="margin:4px 0 0;color:#bbf7d0;font-size:14px;">Gestión Veterinaria — Sucesión Joao Campolargo</p>
        </div>
        <!-- Contenido -->
        <div style="padding:32px 40px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;">Hola, <strong>${nombreUsuario}</strong>.</p>
          <div style="border-left:4px solid ${color};padding:16px 20px;background:#f9fafb;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:999px;text-transform:uppercase;">
                Prioridad ${etiqueta}
              </span>
            </div>
            <h2 style="margin:0 0 8px;color:#111827;font-size:18px;">${titulo}</h2>
            <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6;">${mensaje}</p>
          </div>
          <p style="margin:0;color:#9ca3af;font-size:13px;">Generado el ${fecha}</p>
        </div>
        <!-- Pie -->
        <div style="background:#f3f4f6;padding:16px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            Este correo fue enviado automáticamente por el Sistema de Gestión Veterinaria Campolargo.<br>
            Por favor no responda a este mensaje.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transportador.sendMail({
    from: `"Sucesión Campolargo" <${remitente}>`,
    to: destinatario,
    subject: `[${etiqueta.toUpperCase()}] ${titulo} — Campolargo`,
    html: htmlCorreo,
  });
  return true;
}

export async function enviarCorreoBienvenida(
  destinatario: string,
  nombreUsuario: string,
  contrasenaInicial: string
): Promise<void> {
  if (!entorno.EMAIL_USUARIO) return;

  await transportador.sendMail({
    from: `"Sucesión Campolargo" <${remitente}>`,
    to: destinatario,
    subject: 'Bienvenido al Sistema de Gestión Veterinaria — Campolargo',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;">
        <h2 style="color:#166534;">Bienvenido, ${nombreUsuario}</h2>
        <p>Su cuenta ha sido creada exitosamente en el Sistema de Gestión Veterinaria de la Sucesión Joao Campolargo.</p>
        <p><strong>Correo:</strong> ${destinatario}</p>
        <p><strong>Contraseña inicial:</strong> <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;">${contrasenaInicial}</code></p>
        <p style="color:#ef4444;">Por favor cambie su contraseña después de iniciar sesión.</p>
      </div>
    `,
  });
}

// Verificar que la configuración de correo es funcional
export async function verificarConexionCorreo(): Promise<boolean> {
  try {
    await transportador.verify();
    logger.info('Servidor de correo: conexión verificada');
    return true;
  } catch {
    logger.warn('Servidor de correo: no se pudo verificar la conexión (el sistema funciona sin correo)');
    return false;
  }
}
