import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import Paginacion from '../../componentes/ui/Paginacion';
import Icono from '../../componentes/ui/Icono';
import BuscadorAnimal from '../../componentes/ui/BuscadorAnimal';
import CampoFecha from '../../componentes/ui/CampoFecha';
import FiltroAnimal from '../../componentes/ui/FiltroAnimal';
import ModalConfirmarServicio, { type ServicioAConfirmar } from '../../componentes/reproduccion/ModalConfirmarServicio';
import ModalResultadoParto, { type GestacionACerrar } from '../../componentes/reproduccion/ModalResultadoParto';
import ModalDetalleEvento from '../../componentes/reproduccion/ModalDetalleEvento';
import { invalidarSeguimientoReproductivo } from '../../componentes/reproduccion/seguimientoReproductivo';
import { fechaLocalISO, isoMediodia } from '../../servicios/fechas';

// Ciclo reproductivo: servicios (inseminación/monta) por confirmar, partos
// próximos, eventos (celo, monta, diagnóstico de gestación, parto...) e
// indicadores. El seguimiento va así: servicio → a los 21 días se confirma
// si quedó preñada (abre la gestación) → al llegar la fecha de parto se
// registra cómo salió (cierra la gestación).

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EventoReproductivo {
  id: string;
  tipo: string;
  fecha: string;
  descripcion?: string;
  observaciones?: string;
  animal: { id: string; numeroIdentificacion: string; nombre?: string; lote?: { finca?: { nombre: string } } };
  registradoPor: { nombre: string; apellido: string };
}

// Descripciones que indican una pérdida (cría muerta, aborto, pérdida de la
// gestación), para resaltarlas en el historial.
const esDescripcionDePerdida = (d?: string) => !!d && /muert|murió|pérdida|aborto/i.test(d);

interface PartoProximo {
  id: string;
  madreId: string;
  madreNumeroIdentificacion: string;
  madreNombre?: string;
  finca: string;
  fechaInicio: string;
  fechaPartoEsperado: string;
  diasRestantes: number;
  clasificacion: 'vencido' | 'urgente' | 'proximo' | 'futuro';
  diasGestacion: number;
  /** Toro o semental, si se sabe. */
  padre: string | null;
}

interface ServicioPorConfirmar {
  id: string;
  tipo: 'INSEMINACION_ARTIFICIAL' | 'MONTA_NATURAL';
  fecha: string;
  observaciones?: string;
  animal: { id: string; numeroIdentificacion: string; nombre?: string; lote?: { finca?: { nombre: string } } };
  semental: string | null;
  toro: string | null;
  numeroIntento: number | null;
  diasTranscurridos: number;
  fechaRevision: string;
  listoParaRevisar: boolean;
}

function nombreAnimal(numero: string, nombre?: string | null) {
  return `#${numero}${nombre ? ` · ${nombre}` : ''}`;
}

interface RespuestaEventos {
  datos: EventoReproductivo[];
  meta: { total: number; pagina: number; porPagina: number; totalPaginas: number };
}

interface Indicadores {
  anio: number;
  totalHembras: number;
  gestacionesEnCurso: number;
  gestacionesAnio: number;
  gestacionesParto: number;
  abortos: number;
  nacimientosAnio: number;
  criasFallecidas: number;
  tasaPreniez: number;
  tasaNatalidad: number;
  tasaGestacionesATermino: number;
  tasaAborto: number;
  tasaMortalidadCrias: number;
  totalCelos: number;
  totalInseminaciones: number;
  animalesConRepeticion: number;
  tasaRepeticionCelo: number;
  intervaloPartosPromedioDias: number | null;
  diasAbiertosPromedio: number | null;
  hembrasConDiasAbiertos: number;
}

// ── Mapeo de tipos — usa los valores del enum TipoEventoReproductivo ──────────

const TIPO_EVENTO: Record<string, { etiqueta: string; icono: string; colorVariante: any }> = {
  DETECCION_CELO:          { etiqueta: 'Detección de Celo',   icono: 'favorite',       colorVariante: 'tierra' },
  INSEMINACION_ARTIFICIAL: { etiqueta: 'Inseminación IA',     icono: 'science',        colorVariante: 'azul' },
  MONTA_NATURAL:           { etiqueta: 'Monta Natural',       icono: 'pets',           colorVariante: 'verde' },
  DIAGNOSTICO_GESTACION:   { etiqueta: 'Diagnóstico Gest.',   icono: 'fact_check',     colorVariante: 'morado' },
  PARTO:                   { etiqueta: 'Parto',               icono: 'child_care',     colorVariante: 'verde' },
  ABORTO:                  { etiqueta: 'Aborto',              icono: 'warning',        colorVariante: 'rojo' },
  DESTETE:                 { etiqueta: 'Destete',             icono: 'water_drop',     colorVariante: 'amarillo' },
  DESCARTE_REPRODUCTIVO:   { etiqueta: 'Descarte Reprod.',    icono: 'remove_circle',  colorVariante: 'rojo' },
  // Alias para gestación (usa endpoint separado)
  GESTACION:               { etiqueta: 'Gestación',           icono: 'vaca_prenada', colorVariante: 'morado' },
};

const TIPOS_PARA_FILTRO = [
  '', 'DETECCION_CELO', 'INSEMINACION_ARTIFICIAL', 'MONTA_NATURAL',
  'DIAGNOSTICO_GESTACION', 'PARTO', 'ABORTO',
];

// ── Componente principal ───────────────────────────────────────────────────────

export default function PaginaReproduccion() {
  const navegar = useNavigate();
  const queryClient = useQueryClient();
  // ?animalId=… (al venir desde la ficha de un animal): abre el historial de
  // eventos reproductivos filtrado por ese animal.
  const [parametrosUrl, setParametrosUrl] = useSearchParams();
  const animalIdFiltro = parametrosUrl.get('animalId') ?? undefined;
  const quitarFiltroAnimal = () => {
    const p = new URLSearchParams(parametrosUrl); p.delete('animalId'); setParametrosUrl(p); setPaginaActual(1);
  };
  const [pestana, setPestana]         = useState<'servicios' | 'partos' | 'eventos' | 'indicadores'>(
    animalIdFiltro ? 'eventos' : 'partos',
  );
  const [tipoFiltro, setTipoFiltro]   = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [anioIndicadores, setAnioIndicadores] = useState(new Date().getFullYear());
  const [fincaIndicadores, setFincaIndicadores] = useState('');
  const [loteIndicadores, setLoteIndicadores] = useState('');
  const [razaIndicadores, setRazaIndicadores] = useState('');
  const [servicioAConfirmar, setServicioAConfirmar] = useState<ServicioAConfirmar | null>(null);
  // Servicio por confirmar cuyo detalle se está viendo
  const [servicioDetalle, setServicioDetalle] = useState<ServicioPorConfirmar | null>(null);
  // Evento del historial cuyo detalle se está viendo
  const [eventoDetalleId, setEventoDetalleId] = useState<string | null>(null);
  const [prenadaInicial, setPrenadaInicial] = useState(true);
  const [gestacionACerrar, setGestacionACerrar] = useState<GestacionACerrar | null>(null);

  const { data: partosData, isLoading: cargandoPartos } = useQuery<PartoProximo[]>({
    queryKey: ['partos-proximos'],
    queryFn: () =>
      clienteHttp.get('/reproduccion/partos-proximos', { params: { dias: 300, limite: 50, incluirVencidos: true } })
        .then((r) => r.data.datos ?? r.data),
    refetchInterval: 5 * 60_000,
  });

  const { data: servicios = [], isLoading: cargandoServicios } = useQuery<ServicioPorConfirmar[]>({
    queryKey: ['servicios-por-confirmar'],
    queryFn: () => clienteHttp.get('/reproduccion/servicios-por-confirmar').then((r) => r.data.datos ?? []),
    refetchInterval: 5 * 60_000,
  });

  const { data: gestacionesActivas = [] } = useQuery<{ id: string }[]>({
    queryKey: ['gestaciones-activas'],
    queryFn: () => clienteHttp.get('/reproduccion/gestaciones').then((r) => r.data.datos ?? []),
  });

  const { data: eventosData, isLoading: cargandoEventos } = useQuery<RespuestaEventos>({
    queryKey: ['eventos-reproductivos', paginaActual, tipoFiltro, animalIdFiltro],
    queryFn: () =>
      clienteHttp.get('/reproduccion', {
        params: {
          pagina: paginaActual,
          porPagina: 25,
          ...(tipoFiltro && { tipoEvento: tipoFiltro }),
          ...(animalIdFiltro && { animalId: animalIdFiltro }),
        },
      }).then((r) => r.data),
    enabled: pestana === 'eventos',
  });

  const { data: fincasIndicadores } = useQuery<{ datos: { id: string; nombre: string }[] }>({
    queryKey: ['fincas-lista'],
    queryFn: () => clienteHttp.get('/fincas?porPagina=100').then((r) => r.data),
    enabled: pestana === 'indicadores',
  });

  const { data: lotesIndicadores = [] } = useQuery<{ id: string; nombre: string; fincaId: string }[]>({
    queryKey: ['lotes-select'],
    queryFn: () => clienteHttp.get('/lotes').then((r) => r.data.datos ?? []),
    enabled: pestana === 'indicadores',
  });
  const { data: razasIndicadores = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['razas-select'],
    queryFn: () => clienteHttp.get('/animales/razas').then((r) => r.data.datos ?? []),
    enabled: pestana === 'indicadores',
  });

  const { data: indicadoresData, isLoading: cargandoIndicadores } = useQuery<Indicadores>({
    queryKey: ['indicadores-reproductivos', anioIndicadores, fincaIndicadores, loteIndicadores, razaIndicadores],
    queryFn: () =>
      clienteHttp.get('/reproduccion/indicadores', {
        params: {
          anio: anioIndicadores,
          ...(fincaIndicadores && { fincaId: fincaIndicadores }),
          ...(loteIndicadores && { loteId: loteIndicadores }),
          ...(razaIndicadores && { razaId: razaIndicadores }),
        },
      }).then((r) => r.data.datos),
    enabled: pestana === 'indicadores',
  });

  const partos   = partosData ?? [];
  const eventos  = eventosData?.datos ?? [];
  const meta     = eventosData?.meta;
  const vencidos = partos.filter((p) => p.diasRestantes < 0);
  const urgentes = partos.filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 7);
  const serviciosListos = servicios.filter((s) => s.listoParaRevisar);

  const abrirConfirmacion = (s: ServicioPorConfirmar, prenada: boolean) => {
    setPrenadaInicial(prenada);
    setServicioAConfirmar({
      id: s.id, descripcion: nombreAnimal(s.animal.numeroIdentificacion, s.animal.nombre), fecha: s.fecha, tipo: s.tipo, toro: s.toro,
    });
  };
  const avisosPestana: Record<string, number> = {
    servicios: serviciosListos.length,
    partos: urgentes.length + vencidos.length,
  };
  const abrirCierre = (p: PartoProximo) =>
    setGestacionACerrar({ id: p.id, descripcion: nombreAnimal(p.madreNumeroIdentificacion, p.madreNombre) });
  const proximos = partos.filter((p) => p.diasRestantes > 7 && p.diasRestantes <= 30);
  const futuros  = partos.filter((p) => p.diasRestantes > 30 && p.diasRestantes <= 90);
  const enCurso  = partos.filter((p) => p.diasRestantes > 90);

  return (
    <div className="space-y-5">
      {/* KPIs superiores */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {[
          { et: 'Gestaciones activas',     val: gestacionesActivas.length, ico: 'vaca_prenada', col: 'text-primary',   fondo: 'bg-primary/10' },
          { et: 'Servicios por confirmar', val: servicios.length,          ico: 'science',        col: 'text-secondary', fondo: 'bg-secondary/10', borde: !!serviciosListos.length },
          { et: 'Partos en 7 días',        val: urgentes.length,           ico: 'event_upcoming', col: 'text-tertiary',  fondo: 'bg-tertiary/10' },
          { et: 'Partos sin registrar',    val: vencidos.length,           ico: 'warning',        col: 'text-error',     fondo: 'bg-error-container', borde: !!vencidos.length },
        ].map((kpi) => (
          <div key={kpi.et}
            className={`tarjeta-vidrio rounded-2xl p-4 ${kpi.borde ? 'border-l-4 border-l-error' : ''}`}
          >
            <div className={`p-2.5 ${kpi.fondo} rounded-xl w-fit mb-3`}>
              <Icono nombre={kpi.ico} relleno clase={`text-[20px] ${kpi.col}`} />
            </div>
            <p className={`text-3xl font-bold ${kpi.col}`}>{kpi.val}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{kpi.et}</p>
          </div>
        ))}
      </motion.div>

      {/* Cabecera con pestañas y botón */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto max-w-full">
          {([
            { clave: 'servicios',   et: 'Por confirmar',    ico: 'science' },
            { clave: 'partos',      et: 'Gestaciones',      ico: 'child_care' },
            { clave: 'eventos',     et: 'Historial',         ico: 'history' },
            { clave: 'indicadores', et: 'Indicadores',       ico: 'bar_chart' },
          ] as const).map((p) => (
            <button
              key={p.clave}
              onClick={() => setPestana(p.clave)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all relative flex-shrink-0 whitespace-nowrap ${
                pestana === p.clave
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icono nombre={p.ico} clase="text-[16px]" />
              {p.et}
              {avisosPestana[p.clave] > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-error text-on-primary text-[9px] font-bold flex items-center justify-center">
                  {avisosPestana[p.clave]}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setMostrarForm(true)}
          className="boton boton-primario gap-2 text-sm"
        >
          <Icono nombre="add" clase="text-[18px]" />
          Nuevo evento
        </button>
      </div>

      <AnimatePresence mode="wait">

        {/* ── PESTAÑA: SERVICIOS POR CONFIRMAR ─────────────────────────────── */}
        {pestana === 'servicios' && (
          <motion.div key="servicios" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-3">
            <div className="flex items-start gap-3 px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant/20">
              <Icono nombre="info" clase="text-[18px] text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Inseminaciones y montas a las que falta registrar si la hembra quedó preñada. A los 21 días del servicio
                llega una alerta para revisarla; al confirmar la preñez se abre la gestación con su fecha de parto estimada.
              </p>
            </div>
            {cargandoServicios ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !servicios.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="task_alt" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="font-medium text-on-surface-variant">Nada pendiente por confirmar</p>
                <p className="text-sm text-outline mt-1">Las inseminaciones y montas nuevas aparecerán aquí</p>
              </div>
            ) : (
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                {servicios.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3
                               ${idx < servicios.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setServicioDetalle(s)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="p-2 bg-surface-container rounded-xl flex-shrink-0">
                        <Icono nombre={TIPO_EVENTO[s.tipo]?.icono ?? 'science'} clase="text-[16px] text-on-surface-variant" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">
                          {nombreAnimal(s.animal.numeroIdentificacion, s.animal.nombre)}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {TIPO_EVENTO[s.tipo]?.etiqueta} del{' '}
                          {new Date(s.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {s.semental && ` · ${s.semental}`}{s.toro && ` · Toro ${s.toro}`}
                          {' · '}hace {s.diasTranscurridos} día(s)
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {!s.listoParaRevisar && (
                        <Badge variante="gris" tamano="xs">
                          Revisar el {new Date(s.fechaRevision).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => abrirConfirmacion(s, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        Preñada
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirConfirmacion(s, false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-error-container text-on-error-container hover:opacity-80 transition-colors"
                      >
                        Vacía
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── PESTAÑA: PARTOS PRÓXIMOS ──────────────────────────────────────── */}
        {pestana === 'partos' && (
          <motion.div key="partos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {cargandoPartos ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !partos.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="event_available" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="font-medium text-on-surface-variant">Sin gestaciones en curso</p>
                <p className="text-sm text-outline mt-1">Aparecen aquí al confirmar una preñez (diagnóstico positivo)</p>
              </div>
            ) : (
              <div className="space-y-4">
                {vencidos.length > 0 && (
                  <GrupoPartos titulo="Fecha cumplida — registrar resultado" urgencia="alta" partos={vencidos}
                    onVerAnimal={(id) => navegar(`/animales/${id}`)} onRegistrar={abrirCierre} />
                )}
                {urgentes.length > 0 && (
                  <GrupoPartos titulo="Urgentes (≤ 7 días)" urgencia="alta" partos={urgentes}
                    onVerAnimal={(id) => navegar(`/animales/${id}`)} onRegistrar={abrirCierre} />
                )}
                {proximos.length > 0 && (
                  <GrupoPartos titulo="Próximos (8–30 días)" urgencia="media" partos={proximos}
                    onVerAnimal={(id) => navegar(`/animales/${id}`)} onRegistrar={abrirCierre} />
                )}
                {futuros.length > 0 && (
                  <GrupoPartos titulo="Próximos meses (31–90 días)" urgencia="baja" partos={futuros}
                    onVerAnimal={(id) => navegar(`/animales/${id}`)} onRegistrar={abrirCierre} />
                )}
                {enCurso.length > 0 && (
                  <GrupoPartos titulo="Gestaciones en curso (más de 90 días para el parto)" urgencia="baja" partos={enCurso}
                    onVerAnimal={(id) => navegar(`/animales/${id}`)} onRegistrar={abrirCierre} />
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── PESTAÑA: EVENTOS ─────────────────────────────────────────────── */}
        {pestana === 'eventos' && (
          <motion.div key="eventos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {animalIdFiltro && (
              <div className="mb-4">
                <FiltroAnimal animalId={animalIdFiltro} alQuitar={quitarFiltroAnimal} />
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-4">
              {TIPOS_PARA_FILTRO.map((tipo) => {
                const cfg = TIPO_EVENTO[tipo];
                return (
                  <button
                    key={tipo}
                    onClick={() => { setTipoFiltro(tipo); setPaginaActual(1); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      tipoFiltro === tipo
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {cfg && <Icono nombre={cfg.icono} clase="text-[13px]" />}
                    {tipo === '' ? 'Todos' : cfg?.etiqueta ?? tipo}
                  </button>
                );
              })}
            </div>

            {cargandoEventos ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !eventos.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="child_care" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="font-medium text-on-surface-variant">Sin eventos reproductivos</p>
              </div>
            ) : (
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                {eventos.map((ev, idx) => {
                  const cfg = TIPO_EVENTO[ev.tipo] ?? { etiqueta: ev.tipo, icono: 'event', colorVariante: 'gris' };
                  return (
                    <div
                      key={ev.id}
                      className={`p-4 hover:bg-surface-container-low cursor-pointer transition-colors
                                 ${idx < eventos.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
                      onClick={() => setEventoDetalleId(ev.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-surface-container mt-0.5 flex-shrink-0">
                          <Icono nombre={cfg.icono} clase="text-[16px] text-on-surface-variant" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variante={cfg.colorVariante} tamano="xs">{cfg.etiqueta}</Badge>
                              <span className="text-sm font-semibold text-on-surface">
                                #{ev.animal.numeroIdentificacion}
                                {ev.animal.nombre && ` · ${ev.animal.nombre}`}
                              </span>
                              <span className="text-xs text-on-surface-variant">{ev.animal.lote?.finca?.nombre}</span>
                            </div>
                            <span className="text-xs text-outline whitespace-nowrap flex-shrink-0">
                              {new Date(ev.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          {ev.descripcion && ev.descripcion !== cfg.etiqueta && (
                            <p className={`text-xs mt-1 font-medium ${
                              esDescripcionDePerdida(ev.descripcion) ? 'text-error' : 'text-on-surface'
                            }`}>
                              {ev.descripcion}
                            </p>
                          )}
                          {ev.observaciones && (
                            <p className="text-xs text-on-surface-variant mt-1 line-clamp-1">{ev.observaciones}</p>
                          )}
                        </div>
                        <Icono nombre="chevron_right" clase="text-[18px] text-outline flex-shrink-0" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {meta && meta.totalPaginas > 1 && (
              <div className="mt-4">
                <Paginacion
                  paginaActual={paginaActual}
                  totalPaginas={meta.totalPaginas}
                  totalRegistros={meta.total}
                  porPagina={meta.porPagina}
                  alCambiarPagina={setPaginaActual}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ── PESTAÑA: INDICADORES ─────────────────────────────────────────── */}
        {pestana === 'indicadores' && (
          <motion.div key="indicadores" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="space-y-5">

            {/* Filtros: año, finca, lote y raza */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-on-surface-variant">Año:</label>
                <select
                  value={anioIndicadores}
                  onChange={(e) => setAnioIndicadores(Number(e.target.value))}
                  className="campo-entrada w-28 text-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              {(fincasIndicadores?.datos?.length ?? 0) > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-on-surface-variant">Finca:</label>
                  <select
                    value={fincaIndicadores}
                    onChange={(e) => { setFincaIndicadores(e.target.value); setLoteIndicadores(''); }}
                    className="campo-entrada text-sm"
                  >
                    <option value="">Todas las fincas</option>
                    {fincasIndicadores?.datos?.map((f) => (
                      <option key={f.id} value={f.id}>{f.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-on-surface-variant">Lote:</label>
                <select
                  value={loteIndicadores}
                  onChange={(e) => setLoteIndicadores(e.target.value)}
                  className="campo-entrada text-sm"
                >
                  <option value="">Todos los lotes</option>
                  {lotesIndicadores
                    .filter((l) => !fincaIndicadores || l.fincaId === fincaIndicadores)
                    .map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-on-surface-variant">Raza:</label>
                <select
                  value={razaIndicadores}
                  onChange={(e) => setRazaIndicadores(e.target.value)}
                  className="campo-entrada text-sm"
                >
                  <option value="">Todas las razas</option>
                  {razasIndicadores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </select>
              </div>
            </div>

            {cargandoIndicadores ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-28 rounded-2xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !indicadoresData ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="bar_chart" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="text-on-surface-variant">Sin datos para el año seleccionado</p>
              </div>
            ) : (
              <>
                {/* Tasas principales */}
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
                    Tasas reproductivas — {indicadoresData.anio}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {
                        et: 'Tasa de Preñez',
                        val: `${indicadoresData.tasaPreniez}%`,
                        sub: `${indicadoresData.gestacionesEnCurso} de ${indicadoresData.totalHembras} hembras`,
                        ico: 'vaca_prenada', col: 'text-primary', fondo: 'bg-primary/10',
                        bueno: indicadoresData.tasaPreniez >= 60,
                      },
                      {
                        et: 'Tasa de Natalidad',
                        val: `${indicadoresData.tasaNatalidad}%`,
                        sub: `${indicadoresData.nacimientosAnio} crías de ${indicadoresData.totalHembras} hembras`,
                        ico: 'child_care', col: 'text-tertiary', fondo: 'bg-tertiary/10',
                        bueno: indicadoresData.tasaNatalidad >= 70,
                      },
                      {
                        et: 'Gestaciones a término',
                        val: `${indicadoresData.tasaGestacionesATermino}%`,
                        sub: `${indicadoresData.gestacionesParto} partos de ${indicadoresData.gestacionesAnio} gest. del año`,
                        ico: 'task_alt', col: 'text-primary', fondo: 'bg-primary/10',
                        bueno: indicadoresData.tasaGestacionesATermino >= 80,
                      },
                      {
                        et: 'Tasa de Aborto',
                        val: `${indicadoresData.tasaAborto}%`,
                        sub: `${indicadoresData.abortos} abortos registrados`,
                        ico: 'warning', col: 'text-error', fondo: 'bg-error-container',
                        bueno: indicadoresData.tasaAborto <= 5,
                      },
                      {
                        et: 'Repetición de Celo',
                        val: `${indicadoresData.tasaRepeticionCelo}%`,
                        sub: `${indicadoresData.animalesConRepeticion} animales con 2+ celos`,
                        ico: 'refresh', col: 'text-secondary', fondo: 'bg-secondary/10',
                        bueno: indicadoresData.tasaRepeticionCelo <= 15,
                      },
                      {
                        et: 'Mortalidad de Crías',
                        val: `${indicadoresData.tasaMortalidadCrias}%`,
                        sub: `${indicadoresData.criasFallecidas} de ${indicadoresData.nacimientosAnio} nacimientos`,
                        ico: 'heart_broken', col: 'text-error', fondo: 'bg-error-container',
                        bueno: indicadoresData.tasaMortalidadCrias <= 10,
                      },
                    ].map((kpi) => (
                      <div key={kpi.et} className="tarjeta-vidrio rounded-2xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className={`p-2.5 ${kpi.fondo} rounded-xl`}>
                            <Icono nombre={kpi.ico} relleno clase={`text-[20px] ${kpi.col}`} />
                          </div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            kpi.bueno
                              ? 'bg-primary/10 text-primary'
                              : 'bg-error-container text-on-error-container'
                          }`}>
                            {kpi.bueno ? 'ÓPTIMO' : 'REVISAR'}
                          </span>
                        </div>
                        <p className={`text-3xl font-bold ${kpi.col}`}>{kpi.val}</p>
                        <p className="text-xs font-semibold text-on-surface mt-0.5">{kpi.et}</p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Conteos de actividad */}
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
                    Actividad reproductiva — {indicadoresData.anio}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { et: 'Hembras activas',      val: indicadoresData.totalHembras,       ico: 'group',      col: 'text-on-surface' },
                      { et: 'Detecciones de celo',   val: indicadoresData.totalCelos,          ico: 'favorite',   col: 'text-tierra-700' },
                      { et: 'Inseminaciones / Montas', val: indicadoresData.totalInseminaciones, ico: 'science',   col: 'text-primary' },
                      { et: 'Gestaciones en el año', val: indicadoresData.gestacionesAnio,     ico: 'vaca_prenada', col: 'text-secondary' },
                      { et: 'Partos registrados',    val: indicadoresData.gestacionesParto,    ico: 'child_care', col: 'text-tertiary' },
                      { et: 'Gestaciones en curso',  val: indicadoresData.gestacionesEnCurso,  ico: 'hourglass_top', col: 'text-primary' },
                      {
                        et: 'Días abiertos (promedio)',
                        val: indicadoresData.diasAbiertosPromedio != null
                          ? `${indicadoresData.diasAbiertosPromedio}d`
                          : '—',
                        ico: 'event_busy', col: 'text-tertiary',
                      },
                      {
                        et: 'Intervalo entre partos',
                        val: indicadoresData.intervaloPartosPromedioDias != null
                          ? `${indicadoresData.intervaloPartosPromedioDias}d`
                          : '—',
                        ico: 'calendar_month', col: 'text-secondary',
                      },
                    ].map((item) => (
                      <div key={item.et} className="tarjeta-vidrio rounded-2xl p-4 flex items-center gap-3">
                        <div className="p-2.5 bg-surface-container rounded-xl flex-shrink-0">
                          <Icono nombre={item.ico} relleno clase={`text-[20px] ${item.col}`} />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-on-surface">{item.val}</p>
                          <p className="text-xs text-on-surface-variant leading-tight">{item.et}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nota metodológica */}
                <div className="flex items-start gap-3 px-4 py-3.5 bg-surface-container rounded-2xl border border-outline-variant/20">
                  <Icono nombre="info" clase="text-[18px] text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    <span className="font-semibold text-on-surface">Tasa de preñez</span> = gestaciones activas / hembras activas.
                    {' '}<span className="font-semibold text-on-surface">Días abiertos</span> = días entre el último parto de cada hembra
                    y su nueva concepción (o hasta hoy, si aún no ha vuelto a preñarse).
                    {' '}<span className="font-semibold text-on-surface">Repetición de celo</span> = animales con ≥2 detecciones
                    de celo sin gestación exitosa entre ellas, sobre el total de inseminaciones.
                    {' '}<span className="font-semibold text-on-surface">Natalidad</span> = crías nacidas en el año / hembras activas.
                    {' '}<span className="font-semibold text-on-surface">Gestaciones a término</span> = gestaciones del año que terminaron en parto.
                    Referencia: preñez ≥ 60 %, natalidad ≥ 70 %, gestaciones a término ≥ 80 %, aborto ≤ 5 %, repetición ≤ 15 %.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* FAB móvil */}
      <button
        onClick={() => setMostrarForm(true)}
        className="md:hidden fixed bottom-20 right-5 w-14 h-14 bg-primary text-on-primary rounded-full
                   shadow-[var(--shadow-primary)] flex items-center justify-center
                   hover:scale-110 active:scale-95 transition-transform z-20"
      >
        <Icono nombre="add" clase="text-[28px]" />
      </button>

      <AnimatePresence>
        {mostrarForm && (
          <FormularioEvento
            servicios={servicios}
            onCerrar={() => setMostrarForm(false)}
            onExito={() => {
              invalidarSeguimientoReproductivo(queryClient);
              setMostrarForm(false);
            }}
          />
        )}
      </AnimatePresence>

      <ModalConfirmarServicio
        servicio={servicioAConfirmar}
        prenadaInicial={prenadaInicial}
        alCerrar={() => setServicioAConfirmar(null)}
      />
      <ModalResultadoParto gestacion={gestacionACerrar} alCerrar={() => setGestacionACerrar(null)} />
      <ModalDetalleEvento
        eventoId={servicioDetalle?.id ?? null}
        alCerrar={() => setServicioDetalle(null)}
        alVerAnimal={(animalId) => navegar(`/animales/${animalId}`)}
        alConfirmar={(prenada) => {
          if (!servicioDetalle) return;
          setServicioDetalle(null);
          abrirConfirmacion(servicioDetalle, prenada);
        }}
      />
      <ModalDetalleEvento
        eventoId={eventoDetalleId}
        alCerrar={() => setEventoDetalleId(null)}
        alVerAnimal={(animalId) => navegar(`/animales/${animalId}`)}
      />
    </div>
  );
}

// ── Grupo de partos ───────────────────────────────────────────────────────────

function GrupoPartos({ titulo, urgencia, partos, onVerAnimal, onRegistrar }: {
  titulo: string;
  urgencia: 'alta' | 'media' | 'baja';
  partos: PartoProximo[];
  onVerAnimal: (id: string) => void;
  onRegistrar: (parto: PartoProximo) => void;
}) {
  const cfg = {
    alta:  { dot: 'bg-error',     tit: 'text-error',     badge: 'rojo' as const,   card: 'border-error/20 bg-error-container/20' },
    media: { dot: 'bg-secondary', tit: 'text-secondary',  badge: 'tierra' as const, card: 'border-secondary/20 bg-secondary/5' },
    baja:  { dot: 'bg-primary',   tit: 'text-primary',   badge: 'verde' as const,  card: 'border-primary/15 bg-primary/5' },
  }[urgencia];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.tit}`}>{titulo}</span>
        <span className="text-xs text-outline">({partos.length})</span>
      </div>
      <div className={`rounded-2xl border overflow-hidden ${cfg.card}`}>
        {partos.map((p, idx) => (
          <div
            key={p.id}
            className={`flex items-center justify-between px-4 py-3 hover:bg-white/60 cursor-pointer transition-colors
                       ${idx < partos.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
            onClick={() => onVerAnimal(p.madreId)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/80 rounded-xl">
                <Icono nombre="vaca_prenada" relleno clase="text-[16px] text-secondary" />
              </div>
              <div>
                <span className="text-sm font-semibold text-on-surface">
                  #{p.madreNumeroIdentificacion}
                  {p.madreNombre && <span className="font-normal text-on-surface-variant"> · {p.madreNombre}</span>}
                </span>
                <p className="text-xs text-on-surface-variant">
                  {p.finca} · Día {p.diasGestacion} de gestación (semana {Math.floor(p.diasGestacion / 7)})
                  {p.padre && ` · Padre: ${p.padre}`}
                </p>
                <div className="mt-1.5 h-1 w-40 max-w-full rounded-full bg-white/80 overflow-hidden">
                  <div className="h-full bg-secondary rounded-full"
                    style={{ width: `${Math.min(100, Math.round((p.diasGestacion / DIAS_GESTACION_BOVINA) * 100))}%` }} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold text-on-surface">
                  {new Date(p.fechaPartoEsperado).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                </p>
                <Badge variante={cfg.badge} tamano="xs">
                  {p.diasRestantes < 0 ? `Hace ${-p.diasRestantes} día(s)`
                    : p.diasRestantes === 0 ? 'Hoy' : p.diasRestantes === 1 ? 'Mañana' : `Faltan ${p.diasRestantes} días`}
                </Badge>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRegistrar(p); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  p.diasRestantes <= 0
                    ? 'bg-primary text-on-primary hover:opacity-90'
                    : 'bg-white/80 text-on-surface-variant hover:text-primary'
                }`}
              >
                Registrar resultado
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Formulario: Nuevo Evento ──────────────────────────────────────────────────
// Solo los eventos que nacen aquí. La inseminación se registra en el módulo
// de Inseminación (descuenta la dosis de semen) y el parto o aborto al
// registrar el resultado de la gestación (pestaña Gestaciones), que es donde
// se anota la cría.

const TIPOS_FORM = [
  { valor: 'DETECCION_CELO',          etiqueta: 'Detección de Celo' },
  { valor: 'MONTA_NATURAL',           etiqueta: 'Monta Natural' },
  { valor: 'DIAGNOSTICO_GESTACION',   etiqueta: 'Diagnóstico de Gestación' },
  { valor: 'DESTETE',                 etiqueta: 'Destete' },
  { valor: 'DESCARTE_REPRODUCTIVO',   etiqueta: 'Descarte Reproductivo' },
];

const DIAS_GESTACION_BOVINA = 283;
// Días de gestación que se asumen en un diagnóstico positivo si no se sabe
// cuándo fue la monta (edad típica de la preñez al diagnosticarla).
const DIAS_DIAGNOSTICO_TIPICO = 35;
// Destete y descarte aplican a ambos sexos; el resto solo a hembras (el
// backend también lo valida).
const TIPOS_AMBOS_SEXOS = new Set(['DESTETE', 'DESCARTE_REPRODUCTIVO']);

function sumarDias(fechaStr: string, dias: number): string {
  if (!fechaStr) return '';
  const d = new Date(fechaStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}

function FormularioEvento({ servicios, onCerrar, onExito }: {
  servicios: ServicioPorConfirmar[];
  onCerrar: () => void;
  onExito: () => void;
}) {
  const hoy = fechaLocalISO();
  const [form, setForm] = useState({
    animalId: '',
    tipo: 'DETECCION_CELO',
    fecha: hoy,
    observaciones: '',
    toroId: '',
    resultadoDiagnostico: '',
    metodoDiagnostico: 'Ecografía',
    fechaInicioGestacion: sumarDias(hoy, -DIAS_DIAGNOSTICO_TIPICO),
    fechaPartoEsperado: sumarDias(hoy, DIAS_GESTACION_BOVINA - DIAS_DIAGNOSTICO_TIPICO),
  });
  const [error, setError] = useState('');
  const [sexoAnimal, setSexoAnimal] = useState<'MACHO' | 'HEMBRA' | null>(null);

  const soloHembras  = !TIPOS_AMBOS_SEXOS.has(form.tipo);
  const esMonta      = form.tipo === 'MONTA_NATURAL';
  const esDiagnostico = form.tipo === 'DIAGNOSTICO_GESTACION';
  const positivo     = esDiagnostico && form.resultadoDiagnostico === 'POSITIVO';
  // Si la hembra tiene un servicio por confirmar, el diagnóstico lo confirma:
  // la concepción es la fecha de ese servicio.
  const pendiente    = servicios.find((s) => s.animal.id === form.animalId);
  // En una inseminación el padre es el semental; en una monta, el toro de la
  // monta (si se registró). Solo se pregunta cuando no se sabe por el servicio.
  const preguntarPadre = positivo && pendiente?.tipo !== 'INSEMINACION_ARTIFICIAL';

  const cambiarConcepcion = (valor: string) =>
    setForm((f) => ({ ...f, fechaInicioGestacion: valor, fechaPartoEsperado: sumarDias(valor, DIAS_GESTACION_BOVINA) }));

  const mutacion = useMutation({
    mutationFn: async (datos: typeof form) => {
      const payload: Record<string, unknown> = {
        animalId:      datos.animalId,
        tipo:          datos.tipo,
        fecha:         isoMediodia(datos.fecha),
        observaciones: datos.observaciones || undefined,
      };
      if (esMonta && datos.toroId) payload.toroId = datos.toroId;
      if (esDiagnostico && datos.resultadoDiagnostico) {
        payload.resultadoDiagnostico = datos.resultadoDiagnostico;
        payload.metodoDiagnostico = datos.metodoDiagnostico || undefined;
      }
      if (positivo) {
        if (!pendiente) payload.fechaInicioGestacion = isoMediodia(datos.fechaInicioGestacion);
        if (datos.fechaPartoEsperado) payload.fechaPartoEsperado = isoMediodia(datos.fechaPartoEsperado);
        if (preguntarPadre && datos.toroId) payload.padreId = datos.toroId;
      }
      return clienteHttp.post('/reproduccion', payload);
    },
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al registrar el evento'),
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-inverse-surface/40 z-40" onClick={onCerrar}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="child_care" clase="text-[20px] text-primary" />
              Nuevo Evento Reproductivo
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.animalId) { setError('Debe seleccionar un animal'); return; }
              if (positivo && !pendiente && !form.fechaInicioGestacion) {
                setError('Indique la fecha estimada de concepción'); return;
              }
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

            <p className="flex items-start gap-2 text-[11px] text-on-surface-variant px-3 py-2 bg-surface-container rounded-xl">
              <Icono nombre="info" clase="text-[14px] flex-shrink-0 mt-px" />
              <span>
                Las inseminaciones se registran en el módulo <strong>Inseminación</strong>. El parto o aborto se registra
                desde la pestaña <strong>Gestaciones</strong> con "Registrar resultado", donde se anota la cría.
              </span>
            </p>

            <div>
              <BuscadorAnimal
                etiqueta="Animal"
                requerido
                valor={form.animalId}
                alSeleccionar={(id, animal) => {
                  setSexoAnimal(animal?.sexo ?? null);
                  setForm((f) => ({ ...f, animalId: id }));
                }}
                sexo={soloHembras ? 'HEMBRA' : undefined}
                placeholder={soloHembras ? 'Buscar hembra por identificación o nombre...' : 'Buscar por identificación o nombre...'}
              />
              {sexoAnimal === 'MACHO' && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Es un macho: solo se le pueden registrar destete o descarte reproductivo.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Tipo <span className="text-error">*</span>
                </label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, toroId: '' }))}
                  className="campo-entrada"
                >
                  {TIPOS_FORM.map((t) => (
                    <option key={t.valor} value={t.valor}
                      disabled={sexoAnimal === 'MACHO' && !TIPOS_AMBOS_SEXOS.has(t.valor)}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Fecha <span className="text-error">*</span>
                </label>
                <CampoFecha value={form.fecha} onChange={(valor) => setForm((f) => ({ ...f, fecha: valor }))} />
              </div>
            </div>

            {/* ── Monta natural: toro y aviso de "por confirmar" ── */}
            {esMonta && (
              <div className="space-y-2">
                <BuscadorAnimal
                  etiqueta="Toro (si se sabe)"
                  valor={form.toroId}
                  alSeleccionar={(id) => setForm((f) => ({ ...f, toroId: id }))}
                  sexo="MACHO"
                  placeholder="Buscar toro por identificación o nombre..."
                />
                <p className="text-xs text-on-surface-variant px-3.5 py-2.5 bg-surface-container rounded-xl">
                  Quedará en <strong className="text-on-surface">Por confirmar</strong>. A los 21 días llegará una alerta
                  para registrar si quedó preñada; al confirmarlo se abre la gestación con este toro como padre.
                </p>
              </div>
            )}

            {/* ── Diagnóstico: resultado y, si es positivo, la gestación ── */}
            {esDiagnostico && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Resultado</label>
                    <select
                      value={form.resultadoDiagnostico}
                      onChange={(e) => setForm((f) => ({ ...f, resultadoDiagnostico: e.target.value }))}
                      className="campo-entrada"
                    >
                      <option value="">Sin especificar</option>
                      <option value="POSITIVO">Positivo (preñada)</option>
                      <option value="NEGATIVO">Negativo (vacía)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Método</label>
                    <select
                      value={form.metodoDiagnostico}
                      onChange={(e) => setForm((f) => ({ ...f, metodoDiagnostico: e.target.value }))}
                      className="campo-entrada"
                    >
                      <option value="Ecografía">Ecografía</option>
                      <option value="Palpación rectal">Palpación rectal</option>
                    </select>
                  </div>
                </div>

                {pendiente && form.resultadoDiagnostico && (
                  <p className="text-xs text-on-surface-variant px-3.5 py-2.5 bg-surface-container rounded-xl">
                    Confirma la {pendiente.tipo === 'MONTA_NATURAL' ? 'monta' : 'inseminación'} del{' '}
                    <strong className="text-on-surface">
                      {new Date(pendiente.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </strong>
                    {pendiente.semental && ` (${pendiente.semental})`}
                    {positivo ? ': la gestación se cuenta desde esa fecha.' : '.'}
                  </p>
                )}

                {positivo && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="overflow-hidden space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/20">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                      <Icono nombre="vaca_prenada" clase="text-[16px]" /> Se abrirá la gestación
                    </p>
                    {!pendiente && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                            Concepción estimada <span className="text-error">*</span>
                          </label>
                          <CampoFecha value={form.fechaInicioGestacion} onChange={cambiarConcepcion} />
                          <p className="text-[11px] text-on-surface-variant mt-1">Fecha probable de la monta.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Parto esperado</label>
                          <CampoFecha value={form.fechaPartoEsperado}
                            onChange={(valor) => setForm((f) => ({ ...f, fechaPartoEsperado: valor }))} />
                          <p className="text-[11px] text-on-surface-variant mt-1">A {DIAS_GESTACION_BOVINA} días; puede ajustarla.</p>
                        </div>
                      </div>
                    )}
                    {preguntarPadre && (
                      <BuscadorAnimal
                        etiqueta="Toro que la preñó (si se sabe)"
                        valor={form.toroId}
                        alSeleccionar={(id) => setForm((f) => ({ ...f, toroId: id }))}
                        sexo="MACHO"
                        placeholder="Buscar toro por identificación o nombre..."
                      />
                    )}
                    <p className="text-[11px] text-on-surface-variant">
                      La gestación aparecerá en la pestaña <strong>Gestaciones</strong> con la cuenta regresiva hasta el parto.
                    </p>
                  </motion.div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                rows={3}
                placeholder="Notas adicionales del evento..."
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : 'Registrar evento'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
