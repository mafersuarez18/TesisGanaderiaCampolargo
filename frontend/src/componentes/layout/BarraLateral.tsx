import { NavLink } from 'react-router-dom';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Icono from '../ui/Icono';

// Menú de navegación principal (escritorio y versión deslizable en móvil).
// Algunos ítems se ocultan según el rol del usuario — la lista completa
// existe siempre, el filtro ocurre al renderizar.
interface ElementoNav {
  etiqueta: string;
  ruta: string;
  icono: string;
  soloAdmin?: boolean;
  soloVetOAdmin?: boolean;
}

const elementosNav: ElementoNav[] = [
  { etiqueta: 'Dashboard',       ruta: '/dashboard',       icono: 'dashboard' },
  { etiqueta: 'Fincas',          ruta: '/fincas',          icono: 'home_work' },
  { etiqueta: 'Lotes',           ruta: '/lotes',           icono: 'grid_view' },
  { etiqueta: 'Animales',        ruta: '/animales',        icono: 'pets' },
  { etiqueta: 'Historial Médico',ruta: '/historial-medico',icono: 'medical_services', soloVetOAdmin: true },
  { etiqueta: 'Vacunación y Desparasitación', ruta: '/vacunacion', icono: 'vaccines', soloVetOAdmin: true },
  { etiqueta: 'Reproducción',    ruta: '/reproduccion',    icono: 'pregnant_woman',    soloVetOAdmin: true },
  { etiqueta: 'Inseminación',    ruta: '/inseminacion',    icono: 'science',           soloVetOAdmin: true },
  { etiqueta: 'Geolocalización', ruta: '/mapa',            icono: 'map' },
  { etiqueta: 'Alertas',         ruta: '/alertas',         icono: 'notifications_active' },
  { etiqueta: 'Reportes',        ruta: '/reportes',        icono: 'analytics',         soloVetOAdmin: true },
  { etiqueta: 'Seguridad',       ruta: '/seguridad',       icono: 'security',          soloAdmin: true },
  { etiqueta: 'Auditoría',       ruta: '/auditoria',       icono: 'fact_check',        soloAdmin: true },
];

interface PropiedadesBarraLateral {
  alCerrar?: () => void;
  esMobil?: boolean;
}

export default function BarraLateral({ alCerrar, esMobil = false }: PropiedadesBarraLateral) {
  const { esAdministrador, esVeterinario, usuario } = useAutenticacion();

  const elementosVisibles = elementosNav.filter((el) => {
    if (el.soloAdmin && !esAdministrador) return false;
    if (el.soloVetOAdmin && !esAdministrador && !esVeterinario) return false;
    return true;
  });

  const iniciales = `${usuario?.nombre?.charAt(0) ?? ''}${usuario?.apellido?.charAt(0) ?? ''}`;
  const rolEtiqueta =
    usuario?.rol.nombre === 'ADMINISTRADOR' ? 'Administrador' :
    usuario?.rol.nombre === 'VETERINARIO'   ? 'Veterinario'   :
    usuario?.rol.nombre === 'TECNICO'       ? 'Técnico de Campo' :
    usuario?.rol.descripcion || usuario?.rol.nombre || '';

  return (
    <aside
      className={`h-screen w-72 flex-shrink-0 bg-surface-container-low/95 backdrop-blur-lg
                  border-r border-outline-variant/20 flex flex-col gap-2 p-6 z-50
                  ${esMobil ? 'flex' : 'hidden md:flex sticky left-0 top-0'}`}
    >
      {/* Logo */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo-campolargo.png"
            alt="Logo LinajeApp"
            className="w-12 h-12 object-contain flex-shrink-0"
          />
          <div>
            <h1 className="font-bold text-base text-primary leading-tight">Sucesión Joao Campolargo</h1>
            <p className="text-on-surface-variant text-xs leading-tight">Sistema Veterinario</p>
          </div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 -mx-2">
        {elementosVisibles.map((el) => (
          <NavLink
            key={el.ruta + el.etiqueta}
            to={el.ruta}
            onClick={esMobil ? alCerrar : undefined}
            end={el.ruta === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
               ${isActive
                 ? 'bg-primary-container text-on-primary-container font-semibold'
                 : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant/60'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <Icono nombre={el.icono} relleno={isActive} clase="text-[20px] flex-shrink-0" />
                <span className="truncate">{el.etiqueta}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Perfil de usuario */}
      <div className="pt-4 mt-2 border-t border-outline-variant/20 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center
                        text-on-primary-container font-bold text-sm flex-shrink-0">
          {iniciales}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-on-surface truncate leading-tight">
            {usuario?.nombre} {usuario?.apellido}
          </p>
          <p className="text-xs text-on-surface-variant truncate leading-tight">{rolEtiqueta}</p>
        </div>
      </div>
    </aside>
  );
}
