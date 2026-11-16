import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { ModalConfirmacion } from '../../componentes/ui/Modal';
import Badge, { BadgeEstadoAnimal } from '../../componentes/ui/Badge';
import Icono from '../../componentes/ui/Icono';
import toast from 'react-hot-toast';

// ── Tipos ───────────────────────────────────────────────────────────────────

// CRUD de fincas, con sus lotes visibles en la ficha de cada una.
interface Finca {
  id: string;
  nombre: string;
  municipio: string;
  estado: string;
  hectareas?: number;
  descripcion?: string;
  direccion?: string;
  latitudCentro?: number;
  longitudCentro?: number;
  _count: { lotes: number; potreros?: number; animales: number };
  lotes?: { id: string; nombre: string; _count: { animales: number } }[];
}

interface Animal {
  id: string;
  numeroIdentificacion: string;
  nombre?: string;
  sexo: 'MACHO' | 'HEMBRA';
  estado: string;
  estadoSanitario: string;
  fechaNacimiento?: string;
  pesoActual?: number;
  proposito: string;
  raza?: { id: string; nombre: string };
  lote?: { id: string; nombre: string };
}

interface RespuestaAnimales {
  datos: Animal[];
  meta: { total: number; pagina: number; porPagina: number; totalPaginas: number };
}

interface FormFinca {
  nombre: string;
  municipio: string;
  estado: string;
  hectareas: string;
  latitudCentro: string;
  longitudCentro: string;
}

const ESTADOS_VENEZUELA = [
  'Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo',
  'Cojedes','Delta Amacuro','Falcón','Guárico','Lara','Mérida','Miranda',
  'Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo',
  'Vargas','Yaracuy','Zulia','Distrito Capital',
];

const ETIQUETA_PROPOSITO: Record<string, string> = {
  CARNE:        'Carne',
  LECHE:        'Leche',
  CARNE_LECHE:  'Doble propósito',
  REPRODUCCION: 'Reproducción',
  TAUROMAQUIA:  'Tauromaquia',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ACTIVO:      'Activo',
  VENDIDO:     'Vendido',
  MUERTO:      'Muerto',
  ROBADO:      'Robado',
  TRANSFERIDO: 'Transferido',
};

// ── Funciones de datos ───────────────────────────────────────────────────────

async function obtenerFincas(): Promise<{ datos: Finca[] }> {
  const { data } = await clienteHttp.get('/fincas?porPagina=100');
  return data;
}

async function obtenerFinca(id: string): Promise<Finca> {
  const { data } = await clienteHttp.get(`/fincas/${id}`);
  return data.datos;
}

async function obtenerAnimalesFinca(
  fincaId: string,
  params: Record<string, string>,
): Promise<RespuestaAnimales> {
  const qs = new URLSearchParams(params).toString();
  const { data } = await clienteHttp.get(`/fincas/${fincaId}/animales?${qs}`);
  return data;
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function PaginaFincas() {
  const { tienePrivilegio } = useAutenticacion();
  const puedeCrear = tienePrivilegio('fincas.crear');
  const puedeModificar = tienePrivilegio('fincas.editar', 'fincas.eliminar');
  const cliente = useQueryClient();
  const [fincaEliminar, setFincaEliminar] = useState<Finca | null>(null);
  const [fincaEditar,   setFincaEditar]   = useState<Finca | null>(null);
  const [modalCrear,    setModalCrear]    = useState(false);
  const [fincaSeleccionada, setFincaSeleccionada] = useState<Finca | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fincas'],
    queryFn: obtenerFincas,
    staleTime: 30_000,
  });
  const fincas = data?.datos ?? [];

  const totalAnimales = fincas.reduce((s, f) => s + f._count.animales, 0);
  const totalHa       = fincas.reduce((s, f) => s + (f.hectareas ?? 0), 0);

  const mutacionEliminar = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/fincas/${id}`),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['fincas'] });
      toast.success('Finca eliminada correctamente');
      setFincaEliminar(null);
      setFincaSeleccionada(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo eliminar la finca');
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="p-3 bg-primary/10 rounded-xl w-fit mb-4">
            <Icono nombre="home_work" relleno clase="text-[22px] text-primary" />
          </div>
          <p className="text-3xl font-bold text-on-surface">{isLoading ? '—' : fincas.length}</p>
          <p className="text-sm text-on-surface-variant mt-1">Fincas registradas</p>
        </div>
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="p-3 bg-tertiary/10 rounded-xl w-fit mb-4">
            <Icono nombre="pets" relleno clase="text-[22px] text-tertiary" />
          </div>
          <p className="text-3xl font-bold text-on-surface">{isLoading ? '—' : totalAnimales.toLocaleString('es-VE')}</p>
          <p className="text-sm text-on-surface-variant mt-1">Total de animales</p>
        </div>
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="p-3 bg-secondary/10 rounded-xl w-fit mb-4">
            <Icono nombre="landscape" relleno clase="text-[22px] text-secondary" />
          </div>
          <p className="text-3xl font-bold text-on-surface">
            {isLoading ? '—' : totalHa ? totalHa.toLocaleString('es-VE') : '—'}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">Hectáreas totales</p>
        </div>
      </div>

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          Todas las fincas
        </p>
        {puedeCrear && (
          <button
            onClick={() => setModalCrear(true)}
            className="boton boton-primario gap-2 text-sm"
          >
            <Icono nombre="add" clase="text-[18px]" />
            Nueva finca
          </button>
        )}
      </div>

      {/* Layout: lista + panel de detalle */}
      <div className="flex gap-5 items-start">

        {/* Grid de fincas */}
        <div className={`${fincaSeleccionada ? 'w-full lg:w-[45%]' : 'w-full'} transition-all duration-300`}>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-52 rounded-2xl bg-surface-container animate-pulse" />
              ))}
            </div>
          ) : !fincas.length ? (
            <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
                <Icono nombre="home_work" clase="text-[32px] text-outline" />
              </div>
              <p className="font-medium text-on-surface-variant">Sin fincas registradas</p>
              {puedeCrear && (
                <button
                  onClick={() => setModalCrear(true)}
                  className="boton boton-primario mt-4 text-sm gap-2"
                >
                  <Icono nombre="add" clase="text-[18px]" />
                  Nueva finca
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 ${fincaSeleccionada ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {fincas.map((finca, idx) => (
                <motion.div
                  key={finca.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07 }}
                >
                  <TarjetaFinca
                    finca={finca}
                    seleccionada={fincaSeleccionada?.id === finca.id}
                    puedeEditar={puedeModificar}
                    alSeleccionar={() =>
                      setFincaSeleccionada((prev) => (prev?.id === finca.id ? null : finca))
                    }
                    alEditar={(e) => { e.stopPropagation(); setFincaEditar(finca); }}
                    alEliminar={(e) => { e.stopPropagation(); setFincaEliminar(finca); }}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Panel de detalle */}
        <AnimatePresence>
          {fincaSeleccionada && (
            <motion.div
              key="panel-finca"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25 }}
              className="hidden lg:block w-full lg:w-[55%] sticky top-4"
            >
              <PanelDetalleFinca
                finca={fincaSeleccionada}
                onCerrar={() => setFincaSeleccionada(null)}
                onEditar={() => setFincaEditar(fincaSeleccionada)}
                onEliminar={() => setFincaEliminar(fincaSeleccionada)}
                puedeEditar={puedeModificar}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Panel de detalle en móvil (modal) */}
      <AnimatePresence>
        {fincaSeleccionada && (
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-inverse-surface/40 z-40"
              onClick={() => setFincaSeleccionada(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl"
            >
              <PanelDetalleFinca
                finca={fincaSeleccionada}
                onCerrar={() => setFincaSeleccionada(null)}
                onEditar={() => { setFincaSeleccionada(null); setFincaEditar(fincaSeleccionada); }}
                onEliminar={() => { setFincaSeleccionada(null); setFincaEliminar(fincaSeleccionada); }}
                puedeEditar={puedeModificar}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Crear finca */}
      <AnimatePresence>
        {modalCrear && (
          <ModalFinca
            modo="crear"
            onCerrar={() => setModalCrear(false)}
            onExito={() => {
              cliente.invalidateQueries({ queryKey: ['fincas'] });
              setModalCrear(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: Editar finca */}
      <AnimatePresence>
        {fincaEditar && (
          <ModalFinca
            modo="editar"
            finca={fincaEditar}
            onCerrar={() => setFincaEditar(null)}
            onExito={() => {
              cliente.invalidateQueries({ queryKey: ['fincas'] });
              setFincaEditar(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: Confirmación eliminar */}
      <ModalConfirmacion
        abierto={!!fincaEliminar}
        alCerrar={() => setFincaEliminar(null)}
        alConfirmar={() => fincaEliminar && mutacionEliminar.mutate(fincaEliminar.id)}
        titulo={`¿Eliminar finca "${fincaEliminar?.nombre}"?`}
        descripcion="Esta acción es irreversible y eliminará todos los lotes y potreros asociados."
        textoConfirmar="Sí, eliminar"
        variante="peligro"
        cargando={mutacionEliminar.isPending}
      />
    </motion.div>
  );
}

// ── Tarjeta de finca ──────────────────────────────────────────────────────────

function TarjetaFinca({
  finca,
  seleccionada,
  puedeEditar,
  alSeleccionar,
  alEditar,
  alEliminar,
}: {
  finca: Finca;
  seleccionada: boolean;
  puedeEditar: boolean;
  alSeleccionar: () => void;
  alEditar: (e: React.MouseEvent) => void;
  alEliminar: (e: React.MouseEvent) => void;
}) {
  const { tienePrivilegio } = useAutenticacion();
  return (
    <div
      onClick={alSeleccionar}
      className={`tarjeta-vidrio rounded-2xl p-5 flex flex-col gap-4 group cursor-pointer transition-all
        ${seleccionada
          ? 'ring-2 ring-primary shadow-lg bg-primary/5'
          : 'hover:shadow-lg hover:ring-1 hover:ring-outline-variant/50'
        }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${seleccionada ? 'bg-primary/20' : 'bg-primary/10'}`}>
            <Icono nombre="home_work" relleno clase="text-[20px] text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface">{finca.nombre}</h3>
            <div className="flex items-center gap-1 mt-1 text-xs text-on-surface-variant">
              <Icono nombre="location_on" clase="text-[14px] text-outline" />
              {finca.municipio}, {finca.estado}
            </div>
          </div>
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {tienePrivilegio('fincas.editar') && (
              <button
                onClick={alEditar}
                className="p-1.5 hover:bg-surface-container rounded-lg transition-colors"
                title="Editar"
              >
                <Icono nombre="edit" clase="text-[16px] text-on-surface-variant hover:text-primary" />
              </button>
            )}
            {tienePrivilegio('fincas.eliminar') && (
              <button
                onClick={alEliminar}
                className="p-1.5 hover:bg-error-container rounded-lg transition-colors"
                title="Eliminar"
              >
                <Icono nombre="delete" clase="text-[16px] text-on-surface-variant hover:text-error" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { ico: 'pets',     val: finca._count.animales,       et: 'Animales', col: 'text-primary',   bg: 'bg-primary/8' },
          { ico: 'grid_view',val: finca._count.lotes,          et: 'Lotes',    col: 'text-secondary', bg: 'bg-secondary/8' },
          { ico: 'map',      val: finca._count.potreros ?? 0,  et: 'Potreros', col: 'text-tertiary',  bg: 'bg-tertiary/8' },
        ].map(({ ico, val, et, col, bg }) => (
          <div key={et} className={`${bg} rounded-xl p-2.5 text-center`}>
            <Icono nombre={ico} clase={`text-[16px] ${col} mx-auto mb-1`} />
            <p className="text-base font-bold text-on-surface">{val}</p>
            <p className="text-[10px] text-on-surface-variant">{et}</p>
          </div>
        ))}
      </div>

      {finca.hectareas && (
        <div className="pt-3 border-t border-outline-variant/20 flex items-center gap-2">
          <Icono nombre="straighten" clase="text-[14px] text-outline" />
          <p className="text-xs text-on-surface-variant">
            <strong className="text-on-surface font-semibold">
              {finca.hectareas.toLocaleString('es-VE')}
            </strong>{' '}
            hectáreas
          </p>
          {finca.latitudCentro && (
            <span className="ml-auto text-[10px] text-primary flex items-center gap-0.5">
              <Icono nombre="my_location" clase="text-[12px]" />
              GPS
            </span>
          )}
        </div>
      )}

      {seleccionada && (
        <div className="pt-1 flex items-center gap-1 text-[11px] text-primary font-medium">
          <Icono nombre="chevron_right" clase="text-[14px]" />
          Ver detalle y animales
        </div>
      )}
    </div>
  );
}

// ── Panel de detalle de finca ────────────────────────────────────────────────

function PanelDetalleFinca({
  finca,
  onCerrar,
  onEditar,
  onEliminar,
  puedeEditar,
}: {
  finca: Finca;
  onCerrar: () => void;
  onEditar: () => void;
  onEliminar: () => void;
  puedeEditar: boolean;
}) {
  const navegar = useNavigate();
  const { tienePrivilegio } = useAutenticacion();
  const [busqueda, setBusqueda] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO');
  const [pagina, setPagina] = useState(1);

  // Datos completos de la finca (incluye lotes)
  const { data: fincaDetalle } = useQuery({
    queryKey: ['finca-detalle', finca.id],
    queryFn: () => obtenerFinca(finca.id),
    staleTime: 30_000,
  });

  const parametros: Record<string, string> = {
    pagina: String(pagina),
    porPagina: '30',
    ...(busqueda    && { busqueda }),
    ...(filtroLote  && { loteId: filtroLote }),
    ...(filtroEstado && { estado: filtroEstado }),
  };

  const { data: respAnimales, isLoading: cargandoAnimales } = useQuery({
    queryKey: ['finca-animales', finca.id, parametros],
    queryFn: () => obtenerAnimalesFinca(finca.id, parametros),
    staleTime: 20_000,
    placeholderData: (prev) => prev,
  });

  const animales = respAnimales?.datos ?? [];
  const meta     = respAnimales?.meta;
  const lotes    = fincaDetalle?.lotes ?? finca.lotes ?? [];

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-outline-variant/20">

      {/* Cabecera del panel */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Icono nombre="home_work" relleno clase="text-[20px] text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-on-surface text-base">{finca.nombre}</h2>
            <p className="text-xs text-on-surface-variant flex items-center gap-1">
              <Icono nombre="location_on" clase="text-[12px] text-outline" />
              {finca.municipio}, {finca.estado}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {puedeEditar && (
            <>
              {tienePrivilegio('fincas.editar') && (
                <button
                  onClick={onEditar}
                  className="p-2 hover:bg-surface-container rounded-xl transition-colors"
                  title="Editar finca"
                >
                  <Icono nombre="edit" clase="text-[18px] text-on-surface-variant" />
                </button>
              )}
              {tienePrivilegio('fincas.eliminar') && (
                <button
                  onClick={onEliminar}
                  className="p-2 hover:bg-error-container rounded-xl transition-colors"
                  title="Eliminar finca"
                >
                  <Icono nombre="delete" clase="text-[18px] text-on-surface-variant hover:text-error" />
                </button>
              )}
            </>
          )}
          <button
            onClick={onCerrar}
            className="p-2 hover:bg-surface-container rounded-xl transition-colors ml-1"
          >
            <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Información general */}
        <div className="p-5 border-b border-outline-variant/20">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            Información general
          </p>

          {/* Stats chips */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { ico: 'pets',      val: finca._count.animales,      et: 'Animales',  col: 'text-primary',   bg: 'bg-primary/8' },
              { ico: 'grid_view', val: finca._count.lotes,         et: 'Lotes',     col: 'text-secondary', bg: 'bg-secondary/8' },
              { ico: 'map',       val: finca._count.potreros ?? 0, et: 'Potreros',  col: 'text-tertiary',  bg: 'bg-tertiary/8' },
            ].map(({ ico, val, et, col, bg }) => (
              <div key={et} className={`${bg} rounded-xl p-3 text-center`}>
                <Icono nombre={ico} clase={`text-[16px] ${col} mx-auto mb-1`} />
                <p className="text-lg font-bold text-on-surface">{val}</p>
                <p className="text-[10px] text-on-surface-variant">{et}</p>
              </div>
            ))}
          </div>

          {/* Detalles en lista */}
          <div className="space-y-2">
            {finca.hectareas != null && (
              <DetalleItem icono="straighten" etiqueta="Superficie">
                {finca.hectareas.toLocaleString('es-VE')} hectáreas
              </DetalleItem>
            )}
            {finca.direccion && (
              <DetalleItem icono="pin_drop" etiqueta="Dirección">
                {finca.direccion}
              </DetalleItem>
            )}
            {finca.latitudCentro != null && finca.longitudCentro != null && (
              <DetalleItem icono="my_location" etiqueta="Coordenadas GPS">
                {finca.latitudCentro.toFixed(6)}, {finca.longitudCentro.toFixed(6)}
              </DetalleItem>
            )}
            {finca.descripcion && (
              <div className="mt-2 p-3 bg-surface-container rounded-xl">
                <p className="text-xs text-on-surface-variant mb-1 font-medium">Descripción</p>
                <p className="text-sm text-on-surface">{finca.descripcion}</p>
              </div>
            )}
          </div>

          {/* Lotes */}
          {lotes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Lotes de esta finca
              </p>
              <div className="flex flex-wrap gap-2">
                {lotes.map((lote) => (
                  <button
                    key={lote.id}
                    onClick={() => setFiltroLote((prev) => (prev === lote.id ? '' : lote.id))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                      ${filtroLote === lote.id
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                      }`}
                  >
                    <Icono nombre="grid_view" clase="text-[12px]" />
                    {lote.nombre}
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                      ${filtroLote === lote.id ? 'bg-white/20' : 'bg-secondary/20'}`}>
                      {lote._count.animales}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sección de animales */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              Animales en esta finca
              {meta && (
                <span className="ml-2 normal-case font-normal text-outline">
                  ({meta.total.toLocaleString('es-VE')} en total)
                </span>
              )}
            </p>
            {filtroLote && (
              <button
                onClick={() => setFiltroLote('')}
                className="text-[10px] text-primary underline"
              >
                Ver todos los lotes
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Icono nombre="search" clase="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-outline" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
                placeholder="Buscar por identificación o nombre..."
                className="campo-entrada pl-8 text-xs h-9"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => { setFiltroEstado(e.target.value); setPagina(1); }}
              className="campo-entrada text-xs h-9 w-32"
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="VENDIDO">Vendido</option>
              <option value="MUERTO">Muerto</option>
              <option value="TRANSFERIDO">Transferido</option>
            </select>
          </div>

          {/* Tabla de animales */}
          {cargandoAnimales ? (
            <div className="space-y-2">
              {[0,1,2,4,5].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
              ))}
            </div>
          ) : !animales.length ? (
            <div className="text-center py-10">
              <Icono nombre="pets" clase="text-[36px] text-outline mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                {busqueda || filtroLote
                  ? 'No hay animales con esos filtros'
                  : 'No hay animales registrados en esta finca'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {animales.map((animal) => (
                <FilaAnimal
                  key={animal.id}
                  animal={animal}
                  onClick={() => navegar(`/animales/${animal.id}`)}
                />
              ))}
            </div>
          )}

          {/* Paginación inline */}
          {meta && meta.totalPaginas > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/20">
              <span className="text-xs text-on-surface-variant">
                Página {meta.pagina} de {meta.totalPaginas}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={pagina <= 1}
                  className="p-1.5 rounded-lg hover:bg-surface-container disabled:opacity-40 transition-colors"
                >
                  <Icono nombre="chevron_left" clase="text-[18px] text-on-surface-variant" />
                </button>
                <button
                  onClick={() => setPagina((p) => Math.min(meta.totalPaginas, p + 1))}
                  disabled={pagina >= meta.totalPaginas}
                  className="p-1.5 rounded-lg hover:bg-surface-container disabled:opacity-40 transition-colors"
                >
                  <Icono nombre="chevron_right" clase="text-[18px] text-on-surface-variant" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fila de animal en panel ───────────────────────────────────────────────────

function FilaAnimal({ animal, onClick }: { animal: Animal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-container transition-colors text-left group"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${animal.sexo === 'MACHO' ? 'bg-blue-50' : 'bg-purple-50'}`}>
        <Icono
          nombre="pets"
          clase={`text-[16px] ${animal.sexo === 'MACHO' ? 'text-blue-500' : 'text-purple-500'}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-on-surface">#{animal.numeroIdentificacion}</span>
          {animal.nombre && (
            <span className="text-xs text-on-surface-variant truncate">{animal.nombre}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-outline">{animal.raza?.nombre ?? '—'}</span>
          {animal.lote && (
            <>
              <span className="text-outline text-[8px]">•</span>
              <span className="text-[10px] text-outline">{animal.lote.nombre}</span>
            </>
          )}
          {animal.pesoActual != null && (
            <>
              <span className="text-outline text-[8px]">•</span>
              <span className="text-[10px] text-outline">{animal.pesoActual} kg</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <BadgeEstadoAnimal estado={animal.estado} />
        <span className="text-[9px] text-outline">{ETIQUETA_PROPOSITO[animal.proposito] ?? animal.proposito}</span>
      </div>

      <Icono nombre="chevron_right" clase="text-[16px] text-outline opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
}

// ── Componente auxiliar ───────────────────────────────────────────────────────

function DetalleItem({ icono, etiqueta, children }: {
  icono: string;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icono nombre={icono} clase="text-[14px] text-outline mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] text-on-surface-variant block">{etiqueta}</span>
        <span className="text-sm text-on-surface">{children}</span>
      </div>
    </div>
  );
}

// ── Modal crear / editar finca ────────────────────────────────────────────────

function ModalFinca({
  modo, finca, onCerrar, onExito,
}: {
  modo: 'crear' | 'editar';
  finca?: Finca;
  onCerrar: () => void;
  onExito: () => void;
}) {
  const [form, setForm] = useState<FormFinca>({
    nombre:         finca?.nombre         ?? '',
    municipio:      finca?.municipio      ?? '',
    estado:         finca?.estado         ?? 'Yaracuy',
    hectareas:      finca?.hectareas != null ? String(finca.hectareas) : '',
    latitudCentro:  finca?.latitudCentro  != null ? String(finca.latitudCentro)  : '',
    longitudCentro: finca?.longitudCentro != null ? String(finca.longitudCentro) : '',
  });
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: (datos: FormFinca) => {
      const payload: Record<string, unknown> = {
        nombre:    datos.nombre.trim(),
        municipio: datos.municipio.trim(),
        estado:    datos.estado,
        ...(datos.hectareas      && { hectareas:      Number(datos.hectareas) }),
        ...(datos.latitudCentro  && { latitudCentro:  Number(datos.latitudCentro) }),
        ...(datos.longitudCentro && { longitudCentro: Number(datos.longitudCentro) }),
      };
      if (modo === 'crear') {
        return clienteHttp.post('/fincas', payload);
      }
      return clienteHttp.patch(`/fincas/${finca!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(modo === 'crear' ? 'Finca creada correctamente' : 'Finca actualizada correctamente');
      onExito();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.mensaje ?? 'Error al guardar la finca');
    },
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-inverse-surface/40 z-40"
        onClick={onCerrar}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="home_work" relleno clase="text-[20px] text-primary" />
              {modo === 'crear' ? 'Registrar nueva finca' : `Editar: ${finca?.nombre}`}
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.nombre.trim())    { setError('El nombre es requerido'); return; }
              if (!form.municipio.trim()) { setError('El municipio es requerido'); return; }
              if (!form.estado)           { setError('El estado es requerido'); return; }
              setError('');
              mutacion.mutate(form);
            }}
            className="p-6 space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Nombre de la finca <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Finca La Esperanza"
                className="campo-entrada"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Municipio <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={form.municipio}
                  onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))}
                  placeholder="Ej: Bruzual"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Estado <span className="text-error">*</span>
                </label>
                <select
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                  className="campo-entrada"
                >
                  <option value="">Seleccionar...</option>
                  {ESTADOS_VENEZUELA.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Superficie (hectáreas)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.hectareas}
                onChange={(e) => setForm((f) => ({ ...f, hectareas: e.target.value }))}
                placeholder="Ej: 1500"
                className="campo-entrada"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Latitud (GPS)
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.latitudCentro}
                  onChange={(e) => setForm((f) => ({ ...f, latitudCentro: e.target.value }))}
                  placeholder="Ej: 9.4167"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Longitud (GPS)
                </label>
                <input
                  type="number"
                  step="any"
                  value={form.longitudCentro}
                  onChange={(e) => setForm((f) => ({ ...f, longitudCentro: e.target.value }))}
                  placeholder="Ej: -68.5833"
                  className="campo-entrada"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutacion.isPending}
                className="flex-1 boton boton-primario gap-2"
              >
                {mutacion.isPending ? (
                  <>
                    <Icono nombre="progress_activity" clase="text-[16px] animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Icono nombre="save" clase="text-[16px]" />
                    {modo === 'crear' ? 'Registrar finca' : 'Guardar cambios'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
