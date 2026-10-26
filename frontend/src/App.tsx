import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAutenticacion } from './hooks/useAutenticacion';
import LayoutPrincipal from './componentes/layout/LayoutPrincipal';
import CargandoPagina from './componentes/ui/CargandoPagina';
import RutaProtegida from './componentes/layout/RutaProtegida';

// Carga diferida de páginas para mejor rendimiento (code splitting)
const PaginaLogin         = lazy(() => import('./paginas/autenticacion/PaginaLogin'));
const PaginaDashboard     = lazy(() => import('./paginas/dashboard/PaginaDashboard'));
const PaginaAnimales      = lazy(() => import('./paginas/animales/PaginaAnimales'));
const PaginaDetalleAnimal = lazy(() => import('./paginas/animales/PaginaDetalleAnimal'));
const PaginaFormAnimal    = lazy(() => import('./paginas/animales/PaginaFormAnimal'));
const PaginaFincas        = lazy(() => import('./paginas/fincas/PaginaFincas'));
const PaginaLotes         = lazy(() => import('./paginas/lotes/PaginaLotes'));
const PaginaHistorialMedico = lazy(() => import('./paginas/historialMedico/PaginaHistorialMedico'));
const PaginaVacunacion    = lazy(() => import('./paginas/vacunacion/PaginaVacunacion'));
const PaginaReproduccion  = lazy(() => import('./paginas/reproduccion/PaginaReproduccion'));
const PaginaInseminacion  = lazy(() => import('./paginas/inseminacion/PaginaInseminacion'));
const PaginaMapa          = lazy(() => import('./paginas/geolocalizacion/PaginaMapa'));
const PaginaAlertas       = lazy(() => import('./paginas/alertas/PaginaAlertas'));
const PaginaReportes      = lazy(() => import('./paginas/reportes/PaginaReportes'));
const PaginaSeguridad     = lazy(() => import('./paginas/seguridad/PaginaSeguridad'));
const PaginaAuditoria     = lazy(() => import('./paginas/auditoria/PaginaAuditoria'));

// Árbol de rutas de la aplicación: una ruta pública (login) y todo el
// resto protegido detrás de RutaProtegida + LayoutPrincipal (barra
// lateral, barra superior).
export default function App() {
  const { estaAutenticado, cargando } = useAutenticacion();

  if (cargando) return <CargandoPagina mensaje="Verificando sesión..." />;

  return (
    <Suspense fallback={<CargandoPagina />}>
      <Routes>
        {/* Ruta pública */}
        <Route
          path="/iniciar-sesion"
          element={estaAutenticado ? <Navigate to="/" replace /> : <PaginaLogin />}
        />

        {/* Rutas protegidas */}
        <Route
          element={
            <RutaProtegida redirigirA="/iniciar-sesion">
              <LayoutPrincipal />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<PaginaDashboard />} />

          {/* Módulo de fincas */}
          <Route path="/fincas" element={<PaginaFincas />} />
          <Route path="/lotes" element={<PaginaLotes />} />

          {/* Módulo de animales */}
          <Route path="/animales" element={<PaginaAnimales />} />
          <Route path="/animales/nuevo" element={<PaginaFormAnimal />} />
          <Route path="/animales/:id" element={<PaginaDetalleAnimal />} />
          <Route path="/animales/:id/editar" element={<PaginaFormAnimal />} />

          {/* Módulo médico */}
          <Route path="/historial-medico" element={<PaginaHistorialMedico />} />
          <Route path="/vacunacion" element={<PaginaVacunacion />} />

          {/* Módulo reproductivo */}
          <Route path="/reproduccion" element={<PaginaReproduccion />} />
          <Route path="/inseminacion" element={<PaginaInseminacion />} />

          {/* Módulo de geolocalización */}
          <Route path="/mapa" element={<PaginaMapa />} />

          {/* Motor de alertas */}
          <Route path="/alertas" element={<PaginaAlertas />} />

          {/* Reportes */}
          <Route path="/reportes" element={<PaginaReportes />} />

          {/* Seguridad (solo administrador) */}
          <Route path="/seguridad" element={<PaginaSeguridad />} />
          <Route path="/auditoria" element={<PaginaAuditoria />} />
        </Route>

        {/* Cualquier ruta no encontrada redirige al dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
