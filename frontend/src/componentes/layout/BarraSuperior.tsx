import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { useOnline } from '../../hooks/useOnline';
import { useLocation, useNavigate } from 'react-router-dom';
import { clienteHttp, sincronizarPendientes } from '../../servicios/clienteAxios';
import { contarPendientes, suscribirseACola } from '../../servicios/colaSincronizacion';
import Icono from '../ui/Icono';
import ModalPerfil from './ModalPerfil';

const titulosPorRuta: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/fincas':           'Fincas',
  '/lotes':            'Lotes',
  '/animales':         'Animales',
  '/historial-medico': 'Historial Médico',
  '/vacunacion':       'Vacunación y Desparasitación',
  '/reproduccion':     'Reproducción',
  '/inseminacion':     'Inseminación',
  '/mapa':             'Geolocalización',
  '/alertas':          'Alertas',
  '/reportes':         'Reportes',
  '/seguridad':        'Seguridad',
  '/auditoria':        'Auditoría',
};

interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  leida: boolean;
  estado: 'PENDIENTE' | 'ENVIADA' | 'LEIDA' | 'DESCARTADA';
  creadoEn: string;
}

// Encabezado fijo con el título de la página actual, búsqueda global de
// animales, campanita de notificaciones (con conteo en vivo) y menú de
// perfil.

async function obtenerNoLeidas(): Promise<{ total: number }> {
  const { data } = await clienteHttp.get('/notificaciones/no-leidas/conteo');
  return data.datos;
}

async function obtenerNotificacionesRecientes(): Promise<{ datos: Notificacion[] }> {
  // noLeidas=true trae las no-abordadas y no-leídas; el backend ya filtra DESCARTADA
  const { data } = await clienteHttp.get('/notificaciones?porPagina=8');
  return data;
}

interface PropiedadesBarraSuperior {
  alAbrirMenu: () => void;
  barraLateralAbierta?: boolean;
}

export default function BarraSuperior({ alAbrirMenu }: PropiedadesBarraSuperior) {
  const { usuario, cerrarSesion } = useAutenticacion();
  const estaEnLinea = useOnline();
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const [menuPerfilAbierto, setMenuPerfilAbierto] = useState(false);
  const [busquedaActiva, setBusquedaActiva] = useState(false);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [panelNotifsAbierto, setPanelNotifsAbierto] = useState(false);
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
  const [pendientesOffline, setPendientesOffline] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  // Cuenta de registros guardados sin conexión, pendientes de subir —
  // colaSincronizacion notifica cada vez que se agrega/quita uno.
  useEffect(() => {
    contarPendientes().then(setPendientesOffline);
    return suscribirseACola(() => { contarPendientes().then(setPendientesOffline); });
  }, []);

  const sincronizarAhora = async () => {
    if (sincronizando || !estaEnLinea) return;
    setSincronizando(true);
    try {
      await sincronizarPendientes();
    } finally {
      setSincronizando(false);
    }
  };

  const iniciales = `${usuario?.nombre?.charAt(0) ?? ''}${usuario?.apellido?.charAt(0) ?? ''}`;
  const tituloActual = Object.entries(titulosPorRuta).find(
    ([ruta]) => ubicacion.pathname === ruta || (ruta !== '/dashboard' && ubicacion.pathname.startsWith(ruta))
  )?.[1] ?? 'Sucesión Joao Campolargo';

  const { data: conteoData } = useQuery({
    queryKey: ['notificaciones-conteo'],
    queryFn: obtenerNoLeidas,
    refetchInterval: 30_000,
  });

  const { data: notifsData } = useQuery({
    queryKey: ['notificaciones-recientes'],
    queryFn: obtenerNotificacionesRecientes,
    enabled: panelNotifsAbierto,
  });

  const totalNoLeidas = conteoData?.total ?? 0;
  const notificaciones = notifsData?.datos ?? [];

  const { data: resultadosBusqueda = [] } = useQuery({
    queryKey: ['busqueda-global', terminoBusqueda],
    queryFn: () =>
      clienteHttp
        .get('/animales', { params: { busqueda: terminoBusqueda, porPagina: 6 } })
        .then((r) => r.data.datos ?? []),
    enabled: terminoBusqueda.length >= 2,
    staleTime: 0,
  });

  const mutacionMarcarTodas = useMutation({
    mutationFn: () => clienteHttp.patch('/notificaciones/marcar-todas-leidas'),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['notificaciones-conteo'] });
      cliente.invalidateQueries({ queryKey: ['notificaciones-recientes'] });
    },
  });

  const mutacionMarcarLeida = useMutation({
    mutationFn: (id: string) => clienteHttp.patch(`/notificaciones/${id}/leer`),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['notificaciones-conteo'] });
      cliente.invalidateQueries({ queryKey: ['notificaciones-recientes'] });
    },
  });

  const mutacionAbordar = useMutation({
    mutationFn: (id: string) => clienteHttp.patch(`/notificaciones/${id}/abordar`),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['notificaciones-conteo'] });
      cliente.invalidateQueries({ queryKey: ['notificaciones-recientes'] });
    },
  });

  const mutacionAbordarTodas = useMutation({
    mutationFn: () => clienteHttp.patch('/notificaciones/abordar-todas'),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['notificaciones-conteo'] });
      cliente.invalidateQueries({ queryKey: ['notificaciones-recientes'] });
    },
  });

  const colorPrioridad: Record<string, string> = {
    CRITICA: 'text-error bg-error-container',
    ALTA:    'text-orange-600 bg-orange-50',
    MEDIA:   'text-tertiary bg-tertiary-container/20',
    BAJA:    'text-on-surface-variant bg-surface-container',
  };

  return (
    <>
      <header className="w-full sticky top-0 z-40 bg-surface/80 backdrop-blur-xl
                         border-b border-outline-variant/30 shadow-[var(--shadow-glass)]
                         flex items-center justify-between px-6 md:px-8 py-4 flex-shrink-0">
        {/* Izquierda: ícono menú + título */}
        <div className="flex items-center gap-4">
          <button
            onClick={alAbrirMenu}
            className="md:hidden p-2 hover:bg-primary/10 transition-colors rounded-full text-on-surface-variant"
            aria-label="Abrir menú"
          >
            <Icono nombre="menu" />
          </button>
          <h2 className="font-bold text-lg text-primary">{tituloActual}</h2>
        </div>

        {/* Derecha */}
        <div className="flex items-center gap-2">
          {/* Búsqueda global */}
          <div className="hidden sm:block relative">
            <AnimatePresence>
              {busquedaActiva ? (
                <motion.div
                  key="abierta"
                  initial={{ width: 160, opacity: 0 }}
                  animate={{ width: 272, opacity: 1 }}
                  exit={{ width: 160, opacity: 0 }}
                  className="relative"
                >
                  <Icono
                    nombre="search"
                    clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none"
                  />
                  <input
                    autoFocus
                    type="text"
                    value={terminoBusqueda}
                    placeholder="Buscar animal por identificación o nombre..."
                    onChange={(e) => setTerminoBusqueda(e.target.value)}
                    onBlur={() => { setTimeout(() => { setBusquedaActiva(false); setTerminoBusqueda(''); }, 200); }}
                    className="w-full pl-9 pr-4 py-2 bg-surface-container-low rounded-full border-none
                               focus:outline-none focus:ring-2 focus:ring-primary text-sm text-on-surface"
                  />
                  {terminoBusqueda.length >= 2 && resultadosBusqueda.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest rounded-2xl
                                    shadow-xl border border-outline-variant/30 z-50 overflow-hidden">
                      {resultadosBusqueda.map((a: any) => (
                        <button
                          key={a.id}
                          onMouseDown={() => { navegar(`/animales/${a.id}`); setBusquedaActiva(false); setTerminoBusqueda(''); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low transition-colors
                                     border-b border-outline-variant/10 last:border-0 flex items-center gap-2"
                        >
                          <Icono nombre="pets" clase="text-[14px] text-outline flex-shrink-0" />
                          <span className="text-sm font-medium text-on-surface">#{a.numeroIdentificacion}</span>
                          {a.nombre && <span className="text-xs text-on-surface-variant truncate">— {a.nombre}</span>}
                          {a.lote?.finca && <span className="text-[10px] text-outline ml-auto">{a.lote.finca.nombre}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {terminoBusqueda.length >= 2 && resultadosBusqueda.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest rounded-2xl
                                    shadow-xl border border-outline-variant/30 z-50 px-4 py-3 text-xs text-on-surface-variant">
                      Sin resultados para "{terminoBusqueda}"
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.button
                  key="cerrada"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setBusquedaActiva(true)}
                  className="p-2 hover:bg-primary/10 transition-colors rounded-full text-on-surface-variant"
                  title="Buscar animal"
                  aria-label="Buscar animal"
                >
                  <Icono nombre="search" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Indicador de conectividad */}
          {!estaEnLinea && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                            bg-error-container text-on-error-container">
              <Icono nombre="wifi_off" clase="text-[14px]" />
              <span className="hidden sm:inline">Sin conexión</span>
            </div>
          )}

          {/* Registros guardados sin conexión, pendientes de subir */}
          {pendientesOffline > 0 && (
            <button
              onClick={sincronizarAhora}
              disabled={!estaEnLinea || sincronizando}
              title={estaEnLinea
                ? 'Sincronizar los registros guardados sin conexión'
                : 'Se subirán solos cuando vuelva la señal'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        bg-tertiary/15 text-tertiary disabled:opacity-70 transition-opacity"
            >
              <Icono
                nombre={sincronizando ? 'progress_activity' : 'cloud_upload'}
                clase={`text-[14px] ${sincronizando ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">
                {sincronizando ? 'Sincronizando...' : `${pendientesOffline} pendiente${pendientesOffline === 1 ? '' : 's'}`}
              </span>
            </button>
          )}

          {/* Notificaciones */}
          <div className="relative">
            <button
              onClick={() => setPanelNotifsAbierto(!panelNotifsAbierto)}
              className="relative p-2 hover:bg-primary/10 transition-colors rounded-full text-on-surface-variant"
              aria-label="Notificaciones"
            >
              <Icono nombre="notifications" />
              {totalNoLeidas > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-error rounded-full ring-2 ring-surface
                                 flex items-center justify-center text-[10px] font-bold text-white px-0.5">
                  {totalNoLeidas > 99 ? '99+' : totalNoLeidas}
                </span>
              )}
            </button>

            <AnimatePresence>
              {panelNotifsAbierto && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPanelNotifsAbierto(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 bg-surface-container-lowest rounded-2xl
                               shadow-[var(--shadow-lg)] border border-outline-variant/30 z-20 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
                      <p className="font-semibold text-sm text-on-surface">
                        Notificaciones
                        {totalNoLeidas > 0 && (
                          <span className="ml-2 text-xs bg-error text-white rounded-full px-1.5 py-0.5">
                            {totalNoLeidas}
                          </span>
                        )}
                      </p>
                      {totalNoLeidas > 0 && (
                        <button
                          onClick={() => mutacionAbordarTodas.mutate()}
                          className="text-xs text-primary hover:underline"
                          title="Atiende todas tus alertas: se cierran también para los demás destinatarios"
                        >
                          Atender todas
                        </button>
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                      {notificaciones.length === 0 ? (
                        <div className="py-8 text-center">
                          <Icono nombre="notifications_none" clase="text-[32px] text-outline mx-auto mb-2" />
                          <p className="text-xs text-on-surface-variant">Sin notificaciones pendientes</p>
                        </div>
                      ) : (
                        notificaciones.map((notif) => (
                          <div
                            key={notif.id}
                            className={`px-4 py-3 border-b border-outline-variant/10 last:border-0
                                        ${!notif.leida ? 'bg-primary/5' : ''}`}
                          >
                            <button
                              onClick={() => {
                                mutacionMarcarLeida.mutate(notif.id);
                                setPanelNotifsAbierto(false);
                                navegar('/alertas');
                              }}
                              className="w-full text-left"
                            >
                              <div className="flex items-start gap-2">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${colorPrioridad[notif.prioridad] ?? ''}`}>
                                  {notif.prioridad}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-on-surface truncate">{notif.titulo}</p>
                                  <p className="text-[11px] text-on-surface-variant line-clamp-2 mt-0.5">{notif.mensaje}</p>
                                </div>
                                {!notif.leida && (
                                  <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                                )}
                              </div>
                            </button>
                            {/* Botón abordar — resuelve y desaparece del panel */}
                            <button
                              onClick={(e) => { e.stopPropagation(); mutacionAbordar.mutate(notif.id); }}
                              disabled={mutacionAbordar.isPending}
                              className="mt-1.5 flex items-center gap-1 text-[10px] text-on-surface-variant hover:text-primary transition-colors ml-7"
                              title="Atender — se cierra para todos los que la recibieron"
                            >
                              <Icono nombre="check_circle" clase="text-[12px]" />
                              Atender
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="px-4 py-2 border-t border-outline-variant/20">
                      <button
                        onClick={() => { setPanelNotifsAbierto(false); navegar('/alertas'); }}
                        className="w-full text-xs text-primary text-center hover:underline py-1"
                      >
                        Ver todas las alertas
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Menú de perfil */}
          <div className="relative">
            <button
              onClick={() => setMenuPerfilAbierto(!menuPerfilAbierto)}
              className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center
                         text-on-primary-container font-bold text-sm hover:opacity-90 transition-opacity"
              aria-label="Menú de perfil"
            >
              {iniciales}
            </button>

            <AnimatePresence>
              {menuPerfilAbierto && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuPerfilAbierto(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 bg-surface-container-lowest rounded-2xl
                               shadow-[var(--shadow-lg)] border border-outline-variant/30 z-20 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-outline-variant/20">
                      <p className="font-semibold text-sm text-on-surface">
                        {usuario?.nombre} {usuario?.apellido}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{usuario?.correo}</p>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => { setMenuPerfilAbierto(false); setModalPerfilAbierto(true); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant
                                   hover:bg-surface-container-low transition-colors"
                      >
                        <Icono nombre="person" clase="text-[18px]" />
                        Mi perfil
                      </button>
                    </div>

                    <div className="border-t border-outline-variant/20 py-1">
                      <button
                        onClick={cerrarSesion}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error
                                   hover:bg-error-container/30 transition-colors"
                      >
                        <Icono nombre="logout" clase="text-[18px]" />
                        Cerrar sesión
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <ModalPerfil abierto={modalPerfilAbierto} alCerrar={() => setModalPerfilAbierto(false)} />
    </>
  );
}
