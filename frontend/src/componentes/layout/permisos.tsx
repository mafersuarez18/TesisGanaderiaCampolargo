import { ReactNode, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import { useAutenticacionStore, type UsuarioSesion } from '../../stores/autenticacionStore';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Icono from '../ui/Icono';

// Qué privilegio (al menos uno) hace falta para ver cada módulo. El menú,
// las rutas y el backend usan los mismos códigos, así que asignarle o
// quitarle un privilegio a un rol se refleja en todas partes.
export const PRIVILEGIOS_MODULO: Record<string, string[]> = {
  '/fincas':           ['fincas.ver'],
  '/lotes':            ['lotes.ver'],
  '/animales':         ['animales.ver'],
  '/historial-medico': ['historial_medico.ver'],
  '/vacunacion':       ['vacunacion.ver'],
  '/inseminacion':     ['inseminacion.ver'],
  '/reproduccion':     ['reproduccion.ver'],
  '/mapa':             ['geolocalizacion.ver'],
  '/alertas':          ['alertas.ver'],
  '/reportes':         ['reportes.generar'],
  '/seguridad':        ['usuarios.ver', 'roles.gestionar'],
  '/auditoria':        ['auditoria.ver'],
};

export const QUERY_PERFIL_SESION = ['perfil-sesion'];

const mismosPrivilegios = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Mantiene al día el rol y los privilegios de la sesión: los consulta al
 * entrar, al volver a la ventana y cada minuto, para que los cambios que
 * haga un administrador se vean sin cerrar sesión.
 */
export function useSincronizarPermisos() {
  const actualizarUsuario = useAutenticacionStore((e) => e.actualizarUsuario);
  const usuario = useAutenticacionStore((e) => e.usuario);
  const primeraVez = useRef(true);

  const { data } = useQuery<UsuarioSesion>({
    queryKey: QUERY_PERFIL_SESION,
    queryFn: () => clienteHttp.get('/auth/perfil', { silencioso: true }).then((r) => r.data.datos),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    enabled: !!usuario,
  });

  useEffect(() => {
    if (!data || !usuario || !Array.isArray(data.privilegios)) return;
    const cambiaron = !mismosPrivilegios(data.privilegios, usuario.privilegios) || data.rol?.id !== usuario.rol.id;
    if (cambiaron || data.nombre !== usuario.nombre || data.apellido !== usuario.apellido || data.cargo !== usuario.cargo) {
      actualizarUsuario({
        nombre: data.nombre, apellido: data.apellido, cargo: data.cargo,
        rol: data.rol, privilegios: data.privilegios,
      });
      if (cambiaron && !primeraVez.current) {
        toast('Tus permisos en el sistema fueron actualizados.', { icon: '🔐' });
      }
    }
    primeraVez.current = false;
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Muestra la página solo si el usuario tiene alguno de los privilegios. */
export function RequierePrivilegio({ privilegios, children }: { privilegios: string[]; children: ReactNode }) {
  const { tienePrivilegio } = useAutenticacion();
  if (tienePrivilegio(...privilegios)) return <>{children}</>;
  return (
    <div className="tarjeta-vidrio rounded-2xl p-10 sm:p-12 text-center max-w-xl mx-auto mt-8">
      <div className="w-16 h-16 rounded-full bg-error-container/60 mx-auto mb-4 flex items-center justify-center">
        <Icono nombre="lock" clase="text-[30px] text-on-error-container" />
      </div>
      <p className="font-semibold text-on-surface">No tienes acceso a este módulo</p>
      <p className="text-sm text-on-surface-variant mt-1">
        Tu rol no tiene el privilegio necesario. Si lo necesitas, pídeselo al administrador del sistema.
      </p>
      <Link to="/dashboard" className="boton boton-primario mt-5 text-sm gap-2 inline-flex">
        <Icono nombre="dashboard" clase="text-[18px]" />
        Ir al dashboard
      </Link>
    </div>
  );
}
