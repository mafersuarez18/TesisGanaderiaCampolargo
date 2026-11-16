import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BarraLateral from './BarraLateral';
import BarraSuperior from './BarraSuperior';
import Icono from '../ui/Icono';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { PRIVILEGIOS_MODULO, useSincronizarPermisos } from './permisos';

const navMovil = [
  { etiqueta: 'Dashboard', ruta: '/dashboard', icono: 'dashboard' },
  { etiqueta: 'Historial', ruta: '/historial-medico', icono: 'medical_services' },
  { etiqueta: 'Animales',  ruta: '/animales',         icono: 'pets' },
  { etiqueta: 'Alertas',   ruta: '/alertas',          icono: 'notifications_active' },
];

// Armazón visual de toda página protegida: barra lateral (o menú móvil
// deslizable), barra superior y el contenido de la ruta actual vía
// <Outlet />, con una transición sutil al cambiar de página.
export default function LayoutPrincipal() {
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const ubicacion = useLocation();
  const { tienePrivilegio } = useAutenticacion();
  // Rol y privilegios siempre al día con lo que configure el administrador
  useSincronizarPermisos();
  const navMovilVisible = navMovil.filter((item) => {
    const requeridos = PRIVILEGIOS_MODULO[item.ruta];
    return !requeridos || tienePrivilegio(...requeridos);
  });

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Barra lateral — escritorio siempre visible */}
      <BarraLateral />

      {/* Overlay móvil */}
      <AnimatePresence>
        {menuMovilAbierto && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuMovilAbierto(false)}
            className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Barra lateral móvil — slide-in */}
      <AnimatePresence>
        {menuMovilAbierto && (
          <motion.div
            key="sidebar-movil"
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 md:hidden"
          >
            <BarraLateral esMobil alCerrar={() => setMenuMovilAbierto(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Área de contenido principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <BarraSuperior alAbrirMenu={() => setMenuMovilAbierto(true)} />

        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <motion.div
            key={ubicacion.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      {/* Barra de navegación inferior — solo móvil */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface-container-low/95 backdrop-blur-xl
                      border-t border-outline-variant/20 px-2 py-2 flex justify-around items-center z-30">
        {navMovilVisible.map((item) => {
          const estaActivo = ubicacion.pathname === item.ruta ||
            (item.ruta !== '/dashboard' && ubicacion.pathname.startsWith(item.ruta));
          return (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              className="flex flex-col items-center gap-0.5 px-3 py-1"
            >
              <Icono
                nombre={item.icono}
                relleno={estaActivo}
                clase={`text-[22px] ${estaActivo ? 'text-primary' : 'text-on-surface-variant'}`}
              />
              <span className={`text-[10px] font-medium ${estaActivo ? 'text-primary' : 'text-on-surface-variant'}`}>
                {item.etiqueta}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
