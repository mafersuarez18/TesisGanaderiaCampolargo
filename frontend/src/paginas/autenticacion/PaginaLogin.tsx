import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Icono from '../../componentes/ui/Icono';

// Única ruta pública de la app; al iniciar sesión con éxito, useAutenticacion
// se encarga de guardar los tokens y redirigir al dashboard.
const esquemaLogin = z.object({
  correo:    z.string().email('Ingrese un correo electrónico válido'),
  contrasena:z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type DatosLogin = z.infer<typeof esquemaLogin>;

export default function PaginaLogin() {
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const { iniciarSesion, cargando } = useAutenticacion();

  const { register, handleSubmit, formState: { errors } } = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { correo: '', contrasena: '' },
  });

  const alEnviar = (datos: DatosLogin) => iniciarSesion(datos);

  return (
    <div className="min-h-screen flex font-sans">
      {/* Panel izquierdo — branding verde */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="hidden lg:flex lg:w-[62%] xl:w-[68%] relative overflow-hidden flex-col justify-between p-12"
        style={{ backgroundColor: '#052e16' }}
      >
        {/* Foto del toro — centrada verticalmente, ancho completo */}
        <img
          src="/toro-tech.jpg"
          alt=""
          aria-hidden="true"
          className="absolute w-full"
          style={{
            opacity: 0.72,
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            objectFit: 'cover',
            height: '100%',
            objectPosition: 'center center',
          }}
        />

        {/* Gradiente: oscuro a la izquierda para el texto, transparente a la derecha para el toro */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(5,46,22,0.85) 0%, rgba(5,46,22,0.45) 40%, rgba(5,46,22,0.10) 100%)' }}
        />

        {/* Círculos decorativos */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full border border-white/8"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 120, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full border border-white/8"
        />

        {/* Texto central */}
        <div className="relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-5"
          >
            Gestión veterinaria
            <br />
            <span style={{ color: 'var(--color-primary-fixed)' }}>para el campo moderno</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-white/65 text-base leading-relaxed max-w-md"
          >
            Control sanitario, reproductivo y geolocalización del ganado bovino
            en las tres fincas del estado Yaracuy, desde cualquier dispositivo.
          </motion.p>
        </div>

        {/* Estadísticas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.6 }}
          className="relative z-10 grid grid-cols-3 gap-6"
        >
          {[
            { valor: '~550', etiqueta: 'Animales' },
            { valor: '3',    etiqueta: 'Fincas' },
            { valor: '2,000+', etiqueta: 'Hectáreas' },
          ].map(({ valor, etiqueta }) => (
            <div key={etiqueta} className="text-center p-4 rounded-2xl bg-white/8 backdrop-blur border border-white/10">
              <p className="text-3xl font-bold text-white mb-1">{valor}</p>
              <p className="text-white/55 text-sm">{etiqueta}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Panel derecho — formulario */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-surface"
      >
        <div className="w-full max-w-sm">
          {/* Logo — siempre visible encima del formulario */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center overflow-hidden border border-outline-variant/40 flex-shrink-0">
              <img src="/logo-ganaderia-campolargo.png" alt="Logo Ganadería Campolargo" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <p className="font-bold text-on-surface text-base leading-tight">LinajeApp</p>
              <p className="text-on-surface-variant text-xs">— Gestión Inteligente del Ganado —</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-on-surface">Iniciar sesión</h2>
            <p className="text-on-surface-variant text-sm mt-1">
              Ingrese sus credenciales para acceder al sistema
            </p>
          </div>

          <form onSubmit={handleSubmit(alEnviar)} className="space-y-5">
            {/* Correo */}
            <div>
              <label htmlFor="correo" className="block text-sm font-medium text-on-surface mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Icono
                  nombre="mail"
                  clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]"
                />
                <input
                  id="correo"
                  type="email"
                  placeholder="correo@campolargo.com"
                  autoComplete="email"
                  {...register('correo')}
                  className="campo-entrada pl-10"
                />
              </div>
              {errors.correo && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-error text-xs mt-1"
                >
                  {errors.correo.message}
                </motion.p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label htmlFor="contrasena" className="block text-sm font-medium text-on-surface mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Icono
                  nombre="lock"
                  clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]"
                />
                <input
                  id="contrasena"
                  type={mostrarContrasena ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('contrasena')}
                  className="campo-entrada pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setMostrarContrasena(!mostrarContrasena)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                  tabIndex={-1}
                >
                  <Icono nombre={mostrarContrasena ? 'visibility_off' : 'visibility'} clase="text-[18px]" />
                </button>
              </div>
              {errors.contrasena && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-error text-xs mt-1"
                >
                  {errors.contrasena.message}
                </motion.p>
              )}
            </div>

            {/* Botón ingresar */}
            <motion.button
              type="submit"
              disabled={cargando}
              whileTap={{ scale: 0.99 }}
              className="w-full py-3 px-6 bg-primary text-on-primary rounded-xl font-semibold text-sm
                         shadow-[var(--shadow-primary)] hover:opacity-90 active:scale-[0.99]
                         transition-all disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {cargando ? (
                <>
                  <Icono nombre="progress_activity" clase="text-[18px] animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar al sistema'
              )}
            </motion.button>
          </form>

          {/* Credenciales de demo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 p-4 bg-surface-container rounded-2xl border border-outline-variant"
          >
            <p className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
              <Icono nombre="info" clase="text-[14px]" />
              Credenciales de demostración
            </p>
            <div className="space-y-1 text-xs text-on-surface-variant font-mono">
              <p><span className="font-sans font-medium text-on-surface">Admin:</span> admin@campolargo.com</p>
              <p><span className="font-sans font-medium text-on-surface">Veterinario:</span> veterinario@campolargo.com</p>
              <p><span className="font-sans font-medium text-on-surface">Técnico:</span> tecnico@campolargo.com</p>
              <p className="font-sans text-outline mt-1">Contraseña: <strong className="text-on-surface-variant">Campolargo2026!</strong></p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
