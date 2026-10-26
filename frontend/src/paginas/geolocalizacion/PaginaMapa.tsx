import 'leaflet/dist/leaflet.css';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import Icono from '../../componentes/ui/Icono';

// ── Fix icono default de Leaflet en Vite ─────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Finca {
  id: string;
  nombre: string;
  municipio: string;
  hectareas: number | null;
  latitudCentro: number | null;
  longitudCentro: number | null;
  _count: { animales: number };
}

interface Lote {
  id: string;
  nombre: string;
}

interface AnimalUbicacion {
  id: string;
  numeroIdentificacion: string;
  nombre: string | null;
  latitudActual: number | null;
  longitudActual: number | null;
  fechaUltimaSenal: string | null;
  lote: { id: string; nombre: string; finca: { id: string; nombre: string } } | null;
  raza: { nombre: string } | null;
  sexo: string;
  estadoSanitario: string | null;
}

interface DispositivoGPS {
  id: string;
  codigoDispositivo: string;
  modelo: string | null;
  fabricante: string | null;
  frecuenciaActualizacion: number;
  estado: 'ACTIVO' | 'INACTIVO' | 'SIN_SEÑAL' | 'BATERIA_BAJA';
  nivelBateria: number | null;
  ultimaConexion: string | null;
  apiKey: string;
  animalId: string | null;
  animal: {
    numeroIdentificacion: string;
    nombre: string | null;
    lote: { nombre: string; finca: { nombre: string } } | null;
  } | null;
}

interface PuntoMovilidad {
  id: string;
  latitud: number;
  longitud: number;
  velocidad: number | null;
  fechaRegistro: string;
}

interface Movilidad {
  animalId: string;
  cantidadRegistros: number;
  distanciaMetros: number;
  duracionMinutos: number;
  velocidadPromedioKmH: number;
  puntos: PuntoMovilidad[];
}

interface ResultadoImportacion {
  filasProcesadas: number;
  registrosImportados: number;
  filasOmitidas: number;
  errores: string[];
  columnasDetectadas: string[];
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
const api = {
  fincas:        () => clienteHttp.get('/fincas', { params: { porPagina: 100 } }).then((r) => r.data.datos ?? []),
  lotes:         (fincaId: string) => clienteHttp.get('/lotes', { params: { fincaId } }).then((r) => r.data.datos ?? []),
  dispositivos:  () => clienteHttp.get('/geolocalizacion/dispositivos').then((r) => r.data.datos ?? []),
  animales:      (fincaId?: string, loteId?: string) =>
    clienteHttp.get('/geolocalizacion/animales', {
      params: { ...(fincaId && { fincaId }), ...(loteId && { loteId }) },
    }).then((r) => r.data.datos ?? []),
  movilidad:     (animalId: string) =>
    clienteHttp.get(`/geolocalizacion/movilidad/${animalId}`).then((r) => r.data.datos),
  importarReporte: (dispositivoId: string, archivo: File): Promise<ResultadoImportacion> => {
    const form = new FormData();
    form.append('archivo', archivo);
    return clienteHttp
      .post(`/geolocalizacion/dispositivos/${dispositivoId}/importar`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Un FormData con archivo no se puede guardar en la cola offline
        // (IndexedDB) y el resultado de la importación hace falta de
        // inmediato: sin conexión debe fallar en vez de encolarse.
        sinCola: true,
      })
      .then((r) => r.data.datos);
  },
};

// Paleta cíclica para diferenciar fincas en el mapa (la finca real no trae color propio)
const PALETA_FINCAS = ['#0d631b', '#006419', '#79564b', '#5b7fae', '#a3672b', '#8a4b9e'];
const colorDeFinca = (idx: number) => PALETA_FINCAS[idx % PALETA_FINCAS.length];

// Radio del círculo de finca derivado de su superficie real (área de un
// círculo = π·r² ⇒ r = √(área/π)); si no hay hectáreas registradas, se usa
// un radio de referencia razonable para no dejar el mapa sin círculo.
function radioMetrosDeHectareas(hectareas: number | null): number {
  if (!hectareas) return 1500;
  return Math.round(Math.sqrt((hectareas * 10_000) / Math.PI));
}

// Un dispositivo se considera "en línea" si su última señal llegó dentro del
// doble de su intervalo de actualización configurado (con un piso de 15 min),
// para tolerar una demora razonable sin marcarlo como desconectado de inmediato.
function estaEnLinea(disp: DispositivoGPS): boolean {
  if (!disp.ultimaConexion) return false;
  const umbralMs = Math.max(disp.frecuenciaActualizacion * 2, 15 * 60) * 1000;
  return Date.now() - new Date(disp.ultimaConexion).getTime() <= umbralMs;
}

const ETIQUETA_ESTADO: Record<DispositivoGPS['estado'], string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SIN_SEÑAL: 'Sin señal',
  BATERIA_BAJA: 'Batería baja',
};

// ── Icono personalizado MD3 ───────────────────────────────────────────────────
function crearIconoAnimal(enLinea: boolean) {
  const color = enLinea ? '#0d631b' : '#707a6c';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:36px;height:36px;border-radius:50% 50% 50% 0;
        background:${color};border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
      ">
        <span class="material-symbols-outlined" style="
          font-size:16px;color:white;transform:rotate(45deg);
          font-variation-settings:'FILL' 1,'wght' 500;
        ">pets</span>
      </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Abre Google Maps en el navegador para navegar desde la ubicación actual
 * del usuario hasta las coordenadas del animal.
 * Formato: https://www.google.com/maps/dir/?api=1&destination=LAT,LNG
 */
function abrirGoogleMaps(lat: number, lng: number, nombre?: string | null): void {
  const destino = encodeURIComponent(`${lat},${lng}`);
  const etiqueta = nombre ? encodeURIComponent(nombre) : destino;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destino}&destination_place_id=${etiqueta}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function tiempoRelativo(fecha: string | null): string {
  if (!fecha) return 'Sin conexión';
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1)  return 'Ahora mismo';
  if (min < 60) return `Hace ${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

const CENTRO_YARACUY: [number, number] = [10.23, -68.48];

// ── Componente principal ──────────────────────────────────────────────────────
export default function PaginaMapa() {
  const [pestaña,      setPestaña]      = useState<'dispositivos' | 'mapa' | 'finca' | 'movilidad'>('dispositivos');
  const [modalConfig,  setModalConfig]  = useState(false);
  const [dispositivoAmp, setDispositivoAmp] = useState<string | null>(null);
  const [filtroFinca,  setFiltroFinca]  = useState<string>('');
  const [filtroLote,   setFiltroLote]   = useState<string>('');
  const [fincaVistaId, setFincaVistaId] = useState<string>('');
  const [dispositivoTrackId, setDispositivoTrackId] = useState<string>('');
  const [dispositivoParaImportar, setDispositivoParaImportar] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutacionImportar = useMutation({
    mutationFn: ({ dispositivoId, archivo }: { dispositivoId: string; archivo: File }) =>
      api.importarReporte(dispositivoId, archivo),
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['geo-dispositivos'] });
      queryClient.invalidateQueries({ queryKey: ['geo-animales'] });
      queryClient.invalidateQueries({ queryKey: ['geo-movilidad'] });
      if (resultado.registrosImportados > 0) {
        toast.success(
          `${resultado.registrosImportados} posiciones importadas` +
          (resultado.filasOmitidas ? ` (${resultado.filasOmitidas} filas omitidas)` : ''),
        );
      } else {
        toast.error('El archivo no tenía filas válidas para importar');
      }
    },
    onError: (error: any) => {
      // El detalle útil (p. ej. qué columnas se reconocieron) viaja en
      // errores[0].mensaje cuando es un error de validación; se prioriza
      // sobre el mensaje genérico "Error de validación".
      const detalle = error?.response?.data?.errores?.[0]?.mensaje;
      toast.error(detalle ?? error?.response?.data?.mensaje ?? 'No se pudo importar el archivo');
    },
    onSettled: () => setDispositivoParaImportar(null),
  });

  function abrirSelectorArchivo(dispositivoId: string) {
    setDispositivoParaImportar(dispositivoId);
    inputArchivoRef.current?.click();
  }

  function manejarArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!archivo || !dispositivoParaImportar) return;
    mutacionImportar.mutate({ dispositivoId: dispositivoParaImportar, archivo });
  }

  const { data: fincas = [] } = useQuery<Finca[]>({ queryKey: ['geo-fincas'], queryFn: api.fincas });
  const { data: lotesFiltro = [] } = useQuery<Lote[]>({
    queryKey: ['geo-lotes', filtroFinca],
    queryFn: () => api.lotes(filtroFinca),
    enabled: !!filtroFinca,
  });
  const { data: dispositivos = [], isLoading: cargandoDisp } = useQuery<DispositivoGPS[]>({
    queryKey: ['geo-dispositivos'],
    queryFn: api.dispositivos,
    refetchInterval: 60_000,
  });
  const { data: animalesUbic = [], isLoading: cargandoUbic } = useQuery<AnimalUbicacion[]>({
    queryKey: ['geo-animales', filtroFinca, filtroLote],
    queryFn: () => api.animales(filtroFinca || undefined, filtroLote || undefined),
    refetchInterval: 60_000,
  });
  const { data: movilidad, isLoading: cargandoMovilidad } = useQuery<Movilidad>({
    queryKey: ['geo-movilidad', dispositivoTrackId],
    queryFn: () => {
      const animalId = dispositivos.find((d) => d.id === dispositivoTrackId)?.animalId;
      return api.movilidad(animalId!);
    },
    enabled: pestaña === 'movilidad' && !!dispositivos.find((d) => d.id === dispositivoTrackId)?.animalId,
  });

  // Al cargar la finca al filtrar por lote, resetear el lote si cambia la finca
  useEffect(() => { setFiltroLote(''); }, [filtroFinca]);

  // Preseleccionar la primera finca en "Vista por finca" y el primer
  // dispositivo con animal asignado en "Historial de movilidad"
  useEffect(() => {
    if (!fincaVistaId && fincas.length) setFincaVistaId(fincas[0].id);
  }, [fincas, fincaVistaId]);
  useEffect(() => {
    if (!dispositivoTrackId && dispositivos.length) {
      const primero = dispositivos.find((d) => d.animalId);
      if (primero) setDispositivoTrackId(primero.id);
    }
  }, [dispositivos, dispositivoTrackId]);

  const dispositivoPorAnimalId = useMemo(() => {
    const mapa = new Map<string, DispositivoGPS>();
    for (const d of dispositivos) if (d.animalId) mapa.set(d.animalId, d);
    return mapa;
  }, [dispositivos]);

  // Posiciones con estado de conexión resuelto, listas para mostrar en mapa/listas
  const posiciones = useMemo(() => animalesUbic
    .filter((a) => a.latitudActual != null && a.longitudActual != null)
    .map((a) => {
      const disp = dispositivoPorAnimalId.get(a.id) ?? null;
      return { animal: a, dispositivo: disp, enLinea: disp ? estaEnLinea(disp) : false };
    }), [animalesUbic, dispositivoPorAnimalId]);

  const fincaFiltradaNombre = fincas.find((f) => f.id === filtroFinca)?.nombre;
  const loteFiltradoNombre  = lotesFiltro.find((l) => l.id === filtroLote)?.nombre;

  const dispositivosFiltrados = useMemo(() => dispositivos.filter((d) => {
    if (fincaFiltradaNombre && d.animal?.lote?.finca?.nombre !== fincaFiltradaNombre) return false;
    if (loteFiltradoNombre && d.animal?.lote?.nombre !== loteFiltradoNombre) return false;
    return true;
  }), [dispositivos, fincaFiltradaNombre, loteFiltradoNombre]);

  const fincaVista = fincas.find((f) => f.id === fincaVistaId) ?? null;
  const posicionesDeFinca = useMemo(() =>
    posiciones.filter((p) => p.animal.lote?.finca.id === fincaVistaId),
    [posiciones, fincaVistaId],
  );

  const enLinea    = dispositivos.filter(estaEnLinea).length;
  const activos    = dispositivos.filter((d) => d.estado !== 'INACTIVO').length;
  const sinAsignar = dispositivos.filter((d) => !d.animalId).length;

  const dispSeleccionado = dispositivos.find((d) => d.id === dispositivoTrackId) ?? null;
  const trackActivo      = movilidad?.puntos ?? [];

  return (
    <div className="space-y-5">

      {/* Input oculto compartido para "Importar reporte" — el dispositivo
          destino se fija en dispositivoParaImportar antes de abrir el diálogo */}
      <input
        ref={inputArchivoRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={manejarArchivoSeleccionado}
        hidden
      />

      {/* Encabezado */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Icono nombre="map" relleno clase="text-[22px] text-primary" />
            Mapa y Geolocalización
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Seguimiento GPS de animales — Yaracuy, Venezuela
          </p>
        </div>
        <button onClick={() => setModalConfig(true)} className="boton boton-primario gap-2 text-sm">
          <Icono nombre="add_circle" clase="text-[18px]" />
          Agregar dispositivo
        </button>
      </motion.div>

      {/* Banner: estado real de los datos */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex items-start gap-3 px-4 py-3.5 bg-tertiary/8 border border-tertiary/20 rounded-2xl">
        <Icono nombre="science" relleno clase="text-[18px] text-tertiary flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-on-surface">Módulo listo para hardware real — </span>
          <span className="text-on-surface-variant">
            Dispositivos, posiciones y reportes de movilidad se calculan aquí a partir de la base de datos,
            exactamente igual que con un collar satelital real. Las posiciones que ves ahora son datos de prueba
            generados por el sistema; en cuanto los collares queden en campo, sus reportes (CSV/XLS) se suben con
            el botón "Importar reporte" de cada dispositivo y reemplazan a los simulados sin ningún cambio adicional.
          </span>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { et: 'Dispositivos totales', val: dispositivos.length, ico: 'router',       col: 'text-on-surface', fondo: 'bg-surface-container' },
          { et: 'Activos',              val: activos,              ico: 'check_circle',  col: 'text-primary',    fondo: 'bg-primary/10' },
          { et: 'En línea',             val: enLinea,              ico: 'wifi',          col: enLinea > 0 ? 'text-primary' : 'text-outline', fondo: enLinea > 0 ? 'bg-primary/10' : 'bg-surface-container' },
          { et: 'Sin asignar',          val: sinAsignar,           ico: 'device_unknown', col: 'text-secondary', fondo: 'bg-secondary/10' },
        ].map((kpi) => (
          <div key={kpi.et} className="tarjeta-vidrio rounded-2xl p-4 flex items-center gap-3">
            <div className={`p-2.5 ${kpi.fondo} rounded-xl flex-shrink-0`}>
              <Icono nombre={kpi.ico} relleno clase={`text-[20px] ${kpi.col}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-on-surface">{cargandoDisp ? '—' : kpi.val}</p>
              <p className="text-xs text-on-surface-variant leading-tight">{kpi.et}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto max-w-full">
        {([
          { clave: 'dispositivos', et: 'Dispositivos GPS',    ico: 'router' },
          { clave: 'mapa',         et: 'Mapa en vivo',        ico: 'satellite_alt' },
          { clave: 'finca',        et: 'Vista por finca',     ico: 'home_work' },
          { clave: 'movilidad',    et: 'Historial movilidad', ico: 'route' },
        ] as const).map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestaña(p.clave)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${
              pestaña === p.clave
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icono nombre={p.ico} clase="text-[16px]" />
            {p.et}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: DISPOSITIVOS ─────────────────────────────────────────────── */}
      {pestaña === 'dispositivos' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

          {/* Filtro por finca y lote */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">Finca:</span>
              <select
                value={filtroFinca}
                onChange={(e) => setFiltroFinca(e.target.value)}
                className="campo-entrada text-xs py-1.5 w-auto"
              >
                <option value="">Todas</option>
                {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant font-medium">Lote:</span>
              <select
                value={filtroLote}
                onChange={(e) => setFiltroLote(e.target.value)}
                disabled={!filtroFinca}
                className="campo-entrada text-xs py-1.5 w-auto disabled:opacity-50"
              >
                <option value="">{filtroFinca ? 'Todos' : 'Seleccione una finca'}</option>
                {lotesFiltro.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          </div>

          {/* Lista de dispositivos */}
          {cargandoDisp ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
            ))}</div>
          ) : !dispositivosFiltrados.length ? (
            <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
              <Icono nombre="router" clase="text-[40px] text-outline mx-auto mb-3" />
              <p className="font-medium text-on-surface-variant">Sin dispositivos registrados</p>
              <p className="text-sm text-outline mt-1">Usa "Agregar dispositivo" para ver cómo configurar uno</p>
            </div>
          ) : (
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              {dispositivosFiltrados.map((disp, idx) => {
                const ampliado  = dispositivoAmp === disp.id;
                const enLineaD  = estaEnLinea(disp);
                const posicion  = disp.animalId ? posiciones.find((p) => p.animal.id === disp.animalId) : undefined;
                return (
                  <div key={disp.id}>
                    <div
                      className={`flex items-center gap-4 p-4 cursor-pointer transition-colors
                        ${idx < dispositivosFiltrados.length - 1 ? 'border-b border-outline-variant/15' : ''}
                        ${ampliado ? 'bg-primary/5' : 'hover:bg-surface-container-low'}`}
                      onClick={() => setDispositivoAmp(ampliado ? null : disp.id)}
                    >
                      <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                        disp.estado === 'INACTIVO' ? 'bg-surface-container' : enLineaD ? 'bg-primary/10' : 'bg-secondary/10'
                      }`}>
                        <Icono
                          nombre={disp.estado === 'INACTIVO' ? 'router' : enLineaD ? 'wifi' : 'wifi_off'}
                          relleno={enLineaD}
                          clase={`text-[20px] ${disp.estado === 'INACTIVO' ? 'text-outline' : enLineaD ? 'text-primary' : 'text-secondary'}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-on-surface">{disp.codigoDispositivo}</span>
                          {enLineaD
                            ? <Badge variante="verde" tamano="xs" punto>En línea</Badge>
                            : <Badge variante="gris"  tamano="xs">{ETIQUETA_ESTADO[disp.estado]}</Badge>
                          }
                        </div>
                        {disp.animal ? (
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-on-surface-variant flex-wrap">
                            <Icono nombre="pets" clase="text-[11px] text-primary" />
                            <span>#{disp.animal.numeroIdentificacion}</span>
                            {disp.animal.nombre && <span>· {disp.animal.nombre}</span>}
                            {disp.animal.lote && <span className="text-outline">· {disp.animal.lote.finca.nombre}</span>}
                          </div>
                        ) : (
                          <p className="text-xs text-outline mt-0.5 italic">Sin animal asignado</p>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-on-surface-variant flex items-center gap-1 justify-end">
                          <Icono nombre="schedule" clase="text-[11px]" />
                          {tiempoRelativo(disp.ultimaConexion)}
                        </p>
                        {posicion && (
                          <p className="text-[10px] text-outline font-mono mt-0.5">
                            {posicion.animal.latitudActual!.toFixed(4)}, {posicion.animal.longitudActual!.toFixed(4)}
                          </p>
                        )}
                      </div>

                      <Icono nombre={ampliado ? 'expand_less' : 'chevron_right'} clase="text-[18px] text-outline flex-shrink-0" />
                    </div>

                    <AnimatePresence>
                      {ampliado && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-b border-outline-variant/15"
                        >
                          <div className="px-5 pb-4 pt-2 bg-surface-container-low/40 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <InfoBloque titulo="API Key" valor={disp.apiKey} mono />
                              <InfoBloque titulo="Estado" valor={ETIQUETA_ESTADO[disp.estado]} />
                              <InfoBloque titulo="Batería" valor={disp.nivelBateria != null ? `${disp.nivelBateria}%` : '—'} />
                              <InfoBloque titulo="Última señal" valor={tiempoRelativo(disp.ultimaConexion)} />
                            </div>
                            <div className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-3 py-2 font-mono leading-relaxed">
                              <p className="text-outline text-[10px] font-sans mb-1">Endpoint de envío (HTTP POST):</p>
                              <p className="break-all">{`POST /api/geolocalizacion/dispositivos/${disp.apiKey}/ubicacion`}</p>
                              <p className="mt-1 text-outline font-sans text-[10px]">Body: {'{ "latitud": 10.1875, "longitud": -68.5234, "precision": 3.5, "velocidad": 0.8 }'}</p>
                            </div>
                            <div className="flex items-center gap-4 flex-wrap">
                              {disp.animalId && (
                                <button
                                  onClick={() => { setDispositivoTrackId(disp.id); setPestaña('movilidad'); }}
                                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                >
                                  <Icono nombre="route" clase="text-[14px]" />
                                  Ver historial de movilidad
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); abrirSelectorArchivo(disp.id); }}
                                disabled={mutacionImportar.isPending && dispositivoParaImportar === disp.id}
                                className="flex items-center gap-1.5 text-xs font-medium text-secondary hover:underline disabled:opacity-50"
                              >
                                <Icono nombre={mutacionImportar.isPending && dispositivoParaImportar === disp.id ? 'progress_activity' : 'upload_file'} clase="text-[14px]" />
                                {mutacionImportar.isPending && dispositivoParaImportar === disp.id ? 'Importando…' : 'Importar reporte (CSV/XLS)'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resumen por finca */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {fincas.map((finca, idx) => {
              const dispFinca    = dispositivos.filter((d) => d.animal?.lote?.finca?.nombre === finca.nombre);
              const enLineaFinca = dispFinca.filter(estaEnLinea).length;
              return (
                <div key={finca.id} className="tarjeta-vidrio rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorDeFinca(idx) }} />
                    <p className="text-sm font-semibold text-on-surface truncate">{finca.nombre}</p>
                  </div>
                  <div className="space-y-1.5 text-xs text-on-surface-variant">
                    {[
                      ['Animales', finca._count.animales],
                      ['Dispositivos GPS', dispFinca.length],
                      ['En línea ahora', enLineaFinca],
                      ['Cobertura GPS', finca._count.animales > 0 ? `${Math.round((dispFinca.length / finca._count.animales) * 100)}%` : '—'],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between">
                        <span>{label}</span>
                        <span className={`font-semibold ${label === 'En línea ahora' && Number(val) > 0 ? 'text-primary' : 'text-on-surface'}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── PESTAÑA: MAPA ─────────────────────────────────────────────────────── */}
      {pestaña === 'mapa' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap text-xs text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span>Dispositivo en línea</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-outline" />
              <span>Sin señal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-primary bg-transparent opacity-40" />
              <span>Área de finca (según hectáreas registradas)</span>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm" style={{ height: 480 }}>
            <MapContainer center={CENTRO_YARACUY} zoom={11} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {fincas.filter((f) => f.latitudCentro != null && f.longitudCentro != null).map((finca, idx) => (
                <Circle key={finca.id} center={[finca.latitudCentro!, finca.longitudCentro!]} radius={radioMetrosDeHectareas(finca.hectareas)}
                  pathOptions={{ color: colorDeFinca(idx), fillColor: colorDeFinca(idx), fillOpacity: 0.08, weight: 2, dashArray: '6 4' }}>
                  <Tooltip permanent direction="top">
                    <span style={{ fontSize: 11, fontWeight: 600, color: colorDeFinca(idx) }}>{finca.nombre}</span>
                  </Tooltip>
                </Circle>
              ))}
              {posiciones.map((p) => (
                <Marker key={p.animal.id} position={[p.animal.latitudActual!, p.animal.longitudActual!]} icon={crearIconoAnimal(p.enLinea)}>
                  <Popup>
                    <div style={{ minWidth: 200, fontFamily: 'Inter, sans-serif' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1c1c', marginBottom: 4 }}>
                        {p.dispositivo?.codigoDispositivo ?? `#${p.animal.numeroIdentificacion}`}
                      </div>
                      <div style={{ fontSize: 12, color: '#40493d' }}>
                        <strong>Animal:</strong> #{p.animal.numeroIdentificacion}
                        {p.animal.nombre && ` — ${p.animal.nombre}`}
                      </div>
                      {p.animal.lote && (
                        <div style={{ fontSize: 12, color: '#707a6c' }}><strong>Finca:</strong> {p.animal.lote.finca.nombre}</div>
                      )}
                      <div style={{ fontSize: 11, color: '#707a6c', marginTop: 4 }}>
                        {p.enLinea
                          ? <span style={{ color: '#0d631b', fontWeight: 600 }}>● En línea</span>
                          : <span style={{ color: '#707a6c' }}>○ Desconectado</span>}
                        {' · '}{tiempoRelativo(p.animal.fechaUltimaSenal)}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                        {p.animal.latitudActual?.toFixed(6)}, {p.animal.longitudActual?.toFixed(6)}
                      </div>
                      <button
                        onClick={() => abrirGoogleMaps(p.animal.latitudActual!, p.animal.longitudActual!, p.animal.nombre ?? p.animal.numeroIdentificacion)}
                        style={{
                          marginTop: 10, width: '100%', padding: '6px 10px',
                          background: '#1a73e8', color: 'white', border: 'none',
                          borderRadius: 8, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 5,
                        }}
                      >
                        <span style={{ fontSize: 13 }}>🧭</span> Cómo llegar
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Últimas posiciones</p>
              <Badge variante="verde" tamano="xs" punto>{cargandoUbic ? '—' : posiciones.length} activos</Badge>
            </div>
            {!cargandoUbic && !posiciones.length ? (
              <p className="px-5 py-6 text-sm text-on-surface-variant text-center">Sin posiciones registradas todavía</p>
            ) : (
            <div className="overflow-x-auto">
            <div className="min-w-[560px]">
            {posiciones.map((p, idx, arr) => (
              <div key={p.animal.id}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-5 py-3 text-xs hover:bg-surface-container-low transition-colors
                  ${idx < arr.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
              >
                <div>
                  <p className="font-semibold text-on-surface">
                    #{p.animal.numeroIdentificacion}
                    {p.animal.nombre && <span className="text-on-surface-variant font-normal ml-1">· {p.animal.nombre}</span>}
                  </p>
                  <p className="text-outline text-[10px]">{p.animal.lote?.finca.nombre ?? 'Sin asignar'}</p>
                </div>
                <span className="font-mono text-on-surface-variant">{p.animal.latitudActual?.toFixed(6)}</span>
                <span className="font-mono text-on-surface-variant">{p.animal.longitudActual?.toFixed(6)}</span>
                <div className="text-right">
                  <span className="text-outline">{tiempoRelativo(p.animal.fechaUltimaSenal)}</span>
                  <div className="mt-0.5">
                    {p.enLinea
                      ? <Badge variante="verde" tamano="xs" punto>En línea</Badge>
                      : <Badge variante="gris"  tamano="xs">Offline</Badge>}
                  </div>
                </div>
                <button
                  onClick={() => abrirGoogleMaps(p.animal.latitudActual!, p.animal.longitudActual!, p.animal.nombre ?? p.animal.numeroIdentificacion)}
                  title="Cómo llegar — abre Google Maps"
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-lg text-[10px] font-semibold transition-colors flex-shrink-0"
                >
                  <Icono nombre="directions" clase="text-[13px]" />
                  Cómo llegar
                </button>
              </div>
            ))}
            </div>
            </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── PESTAÑA: VISTA POR FINCA ─────────────────────────────────────────── */}
      {pestaña === 'finca' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

          {/* Selector de finca */}
          <div className="flex gap-2 flex-wrap">
            {fincas.map((f, idx) => (
              <button
                key={f.id}
                onClick={() => setFincaVistaId(f.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                  fincaVistaId === f.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorDeFinca(idx) }} />
                {f.nombre}
              </button>
            ))}
          </div>

          {!fincaVista ? (
            <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
              <Icono nombre="home_work" clase="text-[40px] text-outline mx-auto mb-3" />
              <p className="text-on-surface-variant">Selecciona una finca</p>
            </div>
          ) : (
            <>
              {/* Cabecera de la finca seleccionada */}
              <div className="tarjeta-vidrio rounded-2xl p-5">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-xl" style={{ background: colorDeFinca(fincas.indexOf(fincaVista)) + '18' }}>
                      <span
                        className="material-symbols-outlined text-[24px]"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24", color: colorDeFinca(fincas.indexOf(fincaVista)) }}
                        aria-hidden="true"
                      >home_work</span>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-on-surface">{fincaVista.nombre}</h2>
                      <p className="text-sm text-on-surface-variant flex items-center gap-1">
                        <Icono nombre="location_on" clase="text-[13px] text-outline" />
                        {fincaVista.municipio}, Yaracuy
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {[
                      { et: 'Animales',         val: fincaVista._count.animales, ico: 'pets', col: 'text-primary', fondo: 'bg-primary/10' },
                      { et: 'Dispositivos GPS', val: posicionesDeFinca.length,   ico: 'router', col: 'text-secondary', fondo: 'bg-secondary/10' },
                      { et: 'En línea ahora',   val: posicionesDeFinca.filter((p) => p.enLinea).length, ico: 'wifi', col: 'text-tertiary', fondo: 'bg-tertiary/10' },
                      { et: 'Hectáreas',        val: fincaVista.hectareas ?? '—', ico: 'straighten', col: 'text-on-surface', fondo: 'bg-surface-container' },
                    ].map((kpi) => (
                      <div key={kpi.et} className={`${kpi.fondo} rounded-xl px-3 py-2 text-center min-w-[70px]`}>
                        <Icono nombre={kpi.ico} clase={`text-[16px] ${kpi.col} mx-auto mb-0.5`} />
                        <p className={`text-lg font-bold ${kpi.col}`}>{kpi.val}</p>
                        <p className="text-[10px] text-on-surface-variant leading-tight">{kpi.et}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-outline-variant/20 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-outline text-[10px] uppercase tracking-wide mb-0.5">Cobertura GPS</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-surface-container rounded-full h-2">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((posicionesDeFinca.length / Math.max(1, fincaVista._count.animales)) * 100))}%`,
                            background: colorDeFinca(fincas.indexOf(fincaVista)),
                          }}
                        />
                      </div>
                      <span className="font-semibold text-on-surface">
                        {Math.round((posicionesDeFinca.length / Math.max(1, fincaVista._count.animales)) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-outline text-[10px] uppercase tracking-wide mb-0.5">Superficie</p>
                    <p className="font-semibold text-on-surface">{fincaVista.hectareas ? `${fincaVista.hectareas.toLocaleString('es-VE')} ha` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-outline text-[10px] uppercase tracking-wide mb-0.5">Radio aprox.</p>
                    <p className="font-semibold text-on-surface">{(radioMetrosDeHectareas(fincaVista.hectareas) / 1000).toFixed(1)} km</p>
                  </div>
                </div>
              </div>

              {/* Mapa centrado en la finca */}
              {fincaVista.latitudCentro != null && fincaVista.longitudCentro != null && (
                <div className="rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm" style={{ height: 420 }}>
                  <MapContainer
                    center={[fincaVista.latitudCentro, fincaVista.longitudCentro]}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                    key={fincaVista.id}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Circle
                      center={[fincaVista.latitudCentro, fincaVista.longitudCentro]}
                      radius={radioMetrosDeHectareas(fincaVista.hectareas)}
                      pathOptions={{ color: colorDeFinca(fincas.indexOf(fincaVista)), fillColor: colorDeFinca(fincas.indexOf(fincaVista)), fillOpacity: 0.08, weight: 2, dashArray: '6 4' }}
                    >
                      <Tooltip permanent direction="top">
                        <span style={{ fontSize: 11, fontWeight: 600, color: colorDeFinca(fincas.indexOf(fincaVista)) }}>{fincaVista.nombre}</span>
                      </Tooltip>
                    </Circle>
                    {posicionesDeFinca.map((p) => (
                      <Marker key={p.animal.id} position={[p.animal.latitudActual!, p.animal.longitudActual!]} icon={crearIconoAnimal(p.enLinea)}>
                        <Popup>
                          <div style={{ minWidth: 190, fontFamily: 'Inter, sans-serif' }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1c1c', marginBottom: 4 }}>
                              {p.dispositivo?.codigoDispositivo ?? `#${p.animal.numeroIdentificacion}`}
                            </div>
                            <div style={{ fontSize: 12, color: '#40493d' }}>
                              <strong>Animal:</strong> #{p.animal.numeroIdentificacion}
                              {p.animal.nombre && ` — ${p.animal.nombre}`}
                            </div>
                            <div style={{ fontSize: 11, color: '#707a6c', marginTop: 4 }}>
                              {p.enLinea
                                ? <span style={{ color: colorDeFinca(fincas.indexOf(fincaVista)), fontWeight: 600 }}>● En línea</span>
                                : <span style={{ color: '#707a6c' }}>○ Sin señal</span>}
                              {' · '}{tiempoRelativo(p.animal.fechaUltimaSenal)}
                            </div>
                            <button
                              onClick={() => abrirGoogleMaps(p.animal.latitudActual!, p.animal.longitudActual!, p.animal.nombre ?? p.animal.numeroIdentificacion)}
                              style={{
                                marginTop: 10, width: '100%', padding: '6px 10px',
                                background: '#1a73e8', color: 'white', border: 'none',
                                borderRadius: 8, fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 5,
                              }}
                            >
                              <span style={{ fontSize: 13 }}>🧭</span> Cómo llegar
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              )}

              {/* Lista de dispositivos de la finca */}
              {posicionesDeFinca.length > 0 ? (
                <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                      Dispositivos en {fincaVista.nombre}
                    </p>
                    <Badge variante={posicionesDeFinca.some((p) => p.enLinea) ? 'verde' : 'gris'} tamano="xs" punto>
                      {posicionesDeFinca.filter((p) => p.enLinea).length} en línea
                    </Badge>
                  </div>
                  {posicionesDeFinca.map((p, idx) => (
                    <div
                      key={p.animal.id}
                      className={`flex items-center gap-4 p-4 hover:bg-surface-container-low transition-colors
                        ${idx < posicionesDeFinca.length - 1 ? 'border-b border-outline-variant/15' : ''}`}
                    >
                      <div className={`p-2 rounded-xl flex-shrink-0 ${p.enLinea ? 'bg-primary/10' : 'bg-surface-container'}`}>
                        <Icono nombre={p.enLinea ? 'wifi' : 'wifi_off'} relleno={p.enLinea} clase={`text-[18px] ${p.enLinea ? 'text-primary' : 'text-outline'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-on-surface">{p.dispositivo?.codigoDispositivo ?? `#${p.animal.numeroIdentificacion}`}</span>
                          {p.enLinea
                            ? <Badge variante="verde" tamano="xs" punto>En línea</Badge>
                            : <Badge variante="gris"  tamano="xs">Sin señal</Badge>}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          #{p.animal.numeroIdentificacion}{p.animal.nombre ? ` · ${p.animal.nombre}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-mono text-on-surface-variant">{p.animal.latitudActual!.toFixed(4)}</p>
                        <p className="text-[10px] font-mono text-on-surface-variant">{p.animal.longitudActual!.toFixed(4)}</p>
                      </div>
                      <p className="text-xs text-outline flex-shrink-0">{tiempoRelativo(p.animal.fechaUltimaSenal)}</p>
                      <button
                        onClick={() => abrirGoogleMaps(p.animal.latitudActual!, p.animal.longitudActual!, p.animal.nombre ?? p.animal.numeroIdentificacion)}
                        title="Cómo llegar — abre Google Maps"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1a73e8] hover:bg-[#1557b0] text-white rounded-lg text-[10px] font-semibold transition-colors flex-shrink-0"
                      >
                        <Icono nombre="directions" clase="text-[13px]" />
                        Cómo llegar
                      </button>
                      {p.dispositivo && (
                        <button
                          onClick={() => { setDispositivoTrackId(p.dispositivo!.id); setPestaña('movilidad'); }}
                          title="Ver historial de movilidad"
                          className="p-1.5 hover:bg-surface-container rounded-lg transition-colors"
                        >
                          <Icono nombre="route" clase="text-[16px] text-primary" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tarjeta-vidrio rounded-2xl p-10 text-center">
                  <Icono nombre="router" clase="text-[40px] text-outline mx-auto mb-3" />
                  <p className="text-on-surface-variant">No hay posiciones GPS registradas en esta finca</p>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}

      {/* ── PESTAÑA: HISTORIAL DE MOVILIDAD ────────────────────────────────────── */}
      {pestaña === 'movilidad' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

          {/* Selector de animal/dispositivo */}
          <div className="tarjeta-vidrio rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Icono nombre="route" relleno clase="text-[18px] text-primary" />
              <h2 className="text-sm font-semibold text-on-surface">Seleccionar animal</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {dispositivos.filter((d) => d.animalId).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDispositivoTrackId(d.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                    dispositivoTrackId === d.id
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-primary/30'
                  }`}
                >
                  <Icono nombre={estaEnLinea(d) ? 'wifi' : 'wifi_off'} clase="text-[14px]" />
                  <span>{d.codigoDispositivo}</span>
                  {d.animal && <span className="opacity-75">· #{d.animal.numeroIdentificacion}</span>}
                </button>
              ))}
              {!cargandoDisp && !dispositivos.some((d) => d.animalId) && (
                <p className="text-xs text-on-surface-variant italic">Ningún dispositivo tiene un animal asignado todavía</p>
              )}
            </div>
          </div>

          {cargandoMovilidad ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-surface-container animate-pulse" />
              ))}
            </div>
          ) : dispSeleccionado && movilidad && trackActivo.length > 0 ? (
            <>
              {/* KPIs del track */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    et: 'Distancia recorrida',
                    val: movilidad.distanciaMetros >= 1000
                      ? `${(movilidad.distanciaMetros / 1000).toFixed(2)} km`
                      : `${movilidad.distanciaMetros} m`,
                    ico: 'straighten', col: 'text-primary', fondo: 'bg-primary/10',
                  },
                  {
                    et: 'Tiempo de actividad',
                    val: movilidad.duracionMinutos >= 60
                      ? `${Math.floor(movilidad.duracionMinutos / 60)}h ${movilidad.duracionMinutos % 60}m`
                      : `${movilidad.duracionMinutos} min`,
                    ico: 'timer', col: 'text-secondary', fondo: 'bg-secondary/10',
                  },
                  {
                    et: 'Velocidad promedio',
                    val: `${movilidad.velocidadPromedioKmH} km/h`,
                    ico: 'speed', col: 'text-tertiary', fondo: 'bg-tertiary/10',
                  },
                ].map((kpi) => (
                  <div key={kpi.et} className="tarjeta-vidrio rounded-2xl p-4 flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 ${kpi.fondo} rounded-xl flex-shrink-0`}>
                      <Icono nombre={kpi.ico} relleno clase={`text-[20px] ${kpi.col}`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xl font-bold ${kpi.col} truncate`}>{kpi.val}</p>
                      <p className="text-xs text-on-surface-variant leading-tight truncate">{kpi.et}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mapa con trayectoria */}
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icono nombre="route" clase="text-[16px] text-primary" />
                    <p className="text-xs font-semibold text-on-surface">
                      Trayectoria — {dispSeleccionado.animal?.nombre ?? `#${dispSeleccionado.animal?.numeroIdentificacion}`}
                      {dispSeleccionado.animal?.lote && <span className="text-on-surface-variant font-normal ml-1">· {dispSeleccionado.animal.lote.finca.nombre}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-outline inline-block" />Inicio
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-primary inline-block" />Actual
                    </span>
                  </div>
                </div>
                <div style={{ height: 400 }}>
                  <MapContainer
                    center={[trackActivo[Math.floor(trackActivo.length / 2)]!.latitud, trackActivo[Math.floor(trackActivo.length / 2)]!.longitud]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <Polyline
                      positions={trackActivo.map((p) => [p.latitud, p.longitud] as [number, number])}
                      pathOptions={{ color: '#0d631b', weight: 4, opacity: 0.8 }}
                    />

                    {trackActivo.map((punto, i) => {
                      const esPrimero = i === 0;
                      const esUltimo  = i === trackActivo.length - 1;
                      return (
                        <CircleMarker
                          key={punto.id}
                          center={[punto.latitud, punto.longitud]}
                          radius={esUltimo ? 8 : esPrimero ? 6 : 4}
                          pathOptions={{
                            color:       esUltimo ? '#0d631b' : esPrimero ? '#707a6c' : '#0d631b',
                            fillColor:   esUltimo ? '#0d631b' : esPrimero ? '#707a6c' : '#a3f69c',
                            fillOpacity: 1,
                            weight:      2,
                          }}
                        >
                          <Popup>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                              <div style={{ fontWeight: 700, color: '#1a1c1c', marginBottom: 4 }}>
                                {esPrimero ? '⬤ Inicio del recorrido' : esUltimo ? '⬤ Posición actual' : `Punto ${i + 1}`}
                              </div>
                              <div style={{ color: '#707a6c' }}>
                                {new Date(punto.fechaRegistro).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                              </div>
                              <div style={{ color: '#0d631b', fontWeight: 600, marginTop: 4 }}>
                                {punto.velocidad != null ? `${punto.velocidad} km/h` : 'Sin dato'}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                {punto.latitud.toFixed(6)}, {punto.longitud.toFixed(6)}
                              </div>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </div>
              </div>

              {/* Tabla de puntos del historial */}
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                    Registro de ubicaciones — últimas {trackActivo.length} entradas
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-container/50">
                        <th className="px-4 py-2.5 text-left font-semibold text-on-surface-variant">#</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-on-surface-variant">Fecha / Hora</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-on-surface-variant">Latitud</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-on-surface-variant">Longitud</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-on-surface-variant">Velocidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...trackActivo].reverse().map((punto, i) => (
                        <tr key={punto.id} className="border-t border-outline-variant/10 hover:bg-surface-container-low/50">
                          <td className="px-4 py-2.5 text-outline">{trackActivo.length - i}</td>
                          <td className="px-4 py-2.5 text-on-surface-variant">
                            {new Date(punto.fechaRegistro).toLocaleString('es-VE', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-on-surface">{punto.latitud.toFixed(6)}</td>
                          <td className="px-4 py-2.5 font-mono text-on-surface">{punto.longitud.toFixed(6)}</td>
                          <td className="px-4 py-2.5">
                            {punto.velocidad != null ? (
                              <span className={`font-semibold ${punto.velocidad > 0 ? 'text-primary' : 'text-outline'}`}>
                                {punto.velocidad > 0 ? `${punto.velocidad} km/h` : 'Detenido'}
                              </span>
                            ) : (
                              <span className="text-outline">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
              <Icono nombre="route" clase="text-[40px] text-outline mx-auto mb-3" />
              <p className="font-medium text-on-surface-variant">Sin historial disponible</p>
              <p className="text-sm text-outline mt-1">Seleccione un dispositivo con animal asignado para ver su trayectoria</p>
            </div>
          )}

        </motion.div>
      )}

      {/* ── MODAL: Agregar dispositivo ───────────────────────────────────────── */}
      <AnimatePresence>
        {modalConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm"
              onClick={() => setModalConfig(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg bg-surface-container-lowest rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-outline-variant/20">
                <div>
                  <h2 className="text-base font-semibold text-on-surface">Configurar collar GPS satelital</h2>
                  <p className="text-sm text-on-surface-variant mt-0.5">Puesta en marcha de un dispositivo de localización</p>
                </div>
                <button onClick={() => setModalConfig(false)} className="p-2 hover:bg-surface-container rounded-xl transition-colors -mt-1 -mr-2">
                  <Icono nombre="close" clase="text-[18px] text-on-surface-variant" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                <Paso numero={1} titulo="Colocar el collar y asignarlo en el sistema">
                  <p className="text-sm text-on-surface-variant">
                    El collar se coloca en el animal siguiendo las indicaciones del fabricante (ajuste regulable,
                    panel solar hacia arriba). Luego, en <strong className="text-on-surface">Seguridad → Dispositivos GPS</strong>,
                    se crea el registro asociándolo a ese animal — con esto queda listo para recibir posiciones.
                  </p>
                </Paso>
                <Paso numero={2} titulo="El collar reporta directamente por satélite">
                  <p className="text-sm text-on-surface-variant">
                    Es un dispositivo autónomo: no se programa ni se apunta a ningún servidor propio. Envía su
                    posición por comunicación satelital según el modo de temporización configurado en fábrica
                    (los modelos con esta tecnología ofrecen hasta 13 modos, de mayor frecuencia a mayor ahorro
                    de batería), y se recarga solo mediante su panel solar integrado.
                  </p>
                </Paso>
                <Paso numero={3} titulo="Traer el reporte a Campolargo">
                  <p className="text-sm text-on-surface-variant mb-2">
                    Los datos del collar se descargan desde la interfaz web del fabricante en formato
                    <strong className="text-on-surface"> CSV o Excel</strong>. Ese archivo se sube en la ficha del
                    dispositivo (botón <strong className="text-on-surface">"Importar reporte"</strong>, en la pestaña
                    Dispositivos GPS): el sistema reconoce automáticamente las columnas de fecha, latitud, longitud
                    y velocidad, sin importar el idioma del encabezado.
                  </p>
                </Paso>
                <Paso numero={4} titulo="Verificar la importación">
                  <p className="text-sm text-on-surface-variant">
                    Al terminar de importar, el dispositivo pasa a
                    <Badge variante="verde" tamano="xs" punto className="mx-1">En línea</Badge>
                    y sus posiciones aparecen de inmediato en el mapa y en el historial de movilidad, igual que si
                    hubieran llegado en tiempo real.
                  </p>
                </Paso>
                <div className="flex items-start gap-2 text-xs text-on-surface-variant bg-surface-container/60 rounded-xl p-3">
                  <Icono nombre="info" clase="text-[14px] text-primary flex-shrink-0 mt-0.5" />
                  <p>
                    Si el proveedor del collar habilita en el futuro un envío automático (webhook/API) hacia
                    terceros, el sistema también acepta esa vía sin cambios: cada dispositivo tiene su propia
                    clave para recibir posiciones en tiempo real en
                    <code className="mx-1 px-1 py-0.5 bg-surface-container rounded text-[10px]">
                      /geolocalizacion/dispositivos/{'{apiKey}'}/ubicacion
                    </code>.
                  </p>
                </div>
              </div>

              <div className="flex justify-end px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low">
                <button onClick={() => setModalConfig(false)} className="boton boton-primario">Entendido</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function InfoBloque({ titulo, valor, mono }: { titulo: string; valor: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-outline uppercase tracking-wide mb-0.5">{titulo}</p>
      <p className={`text-xs text-on-surface break-all ${mono ? 'font-mono' : ''}`}>{valor}</p>
    </div>
  );
}

function Paso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-on-primary text-xs font-bold">{numero}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-on-surface mb-1">{titulo}</p>
        {children}
      </div>
    </div>
  );
}
