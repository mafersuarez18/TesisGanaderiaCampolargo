import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import BuscadorAnimal from '../../componentes/ui/BuscadorAnimal';
import CampoFecha from '../../componentes/ui/CampoFecha';
import Icono from '../../componentes/ui/Icono';
import FiltroAnimal from '../../componentes/ui/FiltroAnimal';
import Modal, { ModalConfirmacion } from '../../componentes/ui/Modal';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { fechaLocalISO, isoMediodia } from '../../servicios/fechas';

// Calendarios de vacunación/desparasitación (qué se aplica y cada cuánto)
// y el registro de cada aplicación concreta sobre un animal.
interface CalendarioVacunacion {
  id: string;
  nombreVacuna: string;
  descripcion?: string;
  intervaloDias: number;
  edadMinimasDias?: number | null;
  edadMaximaDias?: number | null;
  aplicaASexo?: 'MACHO' | 'HEMBRA' | null;
  aplicaAPropositos?: Proposito[];
  aplicaACondicion?: Condicion | null;
  medicamento?: { id: string; nombre: string; principioActivo?: string; laboratorio?: string | null };
  _count: { registrosVacunacion: number };
}

type Proposito = 'CARNE' | 'LECHE' | 'CARNE_LECHE' | 'REPRODUCCION' | 'TAUROMAQUIA';
type Condicion = 'GESTANTES' | 'VACIAS' | 'EN_LACTANCIA' | 'SECAS';

const ETIQUETA_PROPOSITO: Record<Proposito, string> = {
  CARNE: 'Carne', LECHE: 'Leche', CARNE_LECHE: 'Doble propósito',
  REPRODUCCION: 'Reproducción', TAUROMAQUIA: 'Tauromaquia',
};
const ETIQUETA_CONDICION: Record<Condicion, string> = {
  GESTANTES: 'Hembras gestantes',
  VACIAS: 'Hembras vacías (no gestantes)',
  EN_LACTANCIA: 'Hembras en lactancia',
  SECAS: 'Animales secos (no en lactancia)',
};

/** Edad en días expresada en la unidad más natural: "45 días", "6 meses", "2 años". */
function formatearEdad(dias: number): string {
  if (dias < 60) return `${dias} día${dias === 1 ? '' : 's'}`;
  if (dias % 365 === 0) return `${dias / 365} año${dias === 365 ? '' : 's'}`;
  const meses = Math.round(dias / 30);
  return `${meses} meses`;
}

/** Categorías de animales a las que aplica un calendario, en texto. Vacío = todos. */
function describirCategorias(cal: CalendarioVacunacion): { icono: string; texto: string }[] {
  const lista: { icono: string; texto: string }[] = [];
  if (cal.aplicaASexo) lista.push({ icono: 'wc', texto: cal.aplicaASexo === 'MACHO' ? 'Solo machos' : 'Solo hembras' });
  const min = cal.edadMinimasDias || null; // 0 equivale a "sin mínimo"
  const max = cal.edadMaximaDias ?? null;
  if (min != null && max != null) lista.push({ icono: 'cake', texto: `De ${formatearEdad(min)} a ${formatearEdad(max)}` });
  else if (min != null) lista.push({ icono: 'cake', texto: `Desde ${formatearEdad(min)}` });
  else if (max != null) lista.push({ icono: 'cake', texto: `Hasta ${formatearEdad(max)}` });
  if (cal.aplicaAPropositos?.length) {
    lista.push({ icono: 'category', texto: cal.aplicaAPropositos.map((p) => ETIQUETA_PROPOSITO[p]).join(' o ') });
  }
  if (cal.aplicaACondicion) {
    const icono = { GESTANTES: 'vaca_prenada', VACIAS: 'female', EN_LACTANCIA: 'water_drop', SECAS: 'format_color_reset' }[cal.aplicaACondicion];
    lista.push({ icono, texto: ETIQUETA_CONDICION[cal.aplicaACondicion] });
  }
  return lista;
}

interface RegistroVacunacion {
  id: string;
  fechaAplicacion: string;
  dosis?: string;
  viaAdministracion?: string;
  lote?: string;
  proximaFecha?: string;
  observaciones?: string;
  animal: { id: string; numeroIdentificacion: string; nombre?: string | null };
  calendarioVacunacion: { id: string; nombreVacuna: string; intervaloDias: number };
  medicamento?: { id: string; nombre: string };
  aplicadoPor: { id: string; nombre: string; apellido: string };
}

interface CumplimientoLote {
  loteId: string;
  loteNombre: string;
  fincaId: string;
  fincaNombre: string;
  totalAnimales: number;
  paresEsperados: number;
  paresAlDia: number;
  cumplimiento: number;
}

interface FormCalendario {
  nombreVacuna: string;
  descripcion: string;
  intervaloDias: number;
  edadMinimasDias?: number;
  edadMaximaDias?: number;
  aplicaASexo: '' | 'MACHO' | 'HEMBRA';
  aplicaAPropositos: Proposito[];
  aplicaACondicion: '' | Condicion;
}

interface FormRegistro {
  calendarioVacunacionId: string;
  animalId: string;
  fechaAplicacion: string;
  dosis: string;
  viaAdministracion: string;
  lote: string;
  observaciones: string;
}

const formatearIntervalo = (dias: number) => {
  if (dias === 365) return 'Anual';
  if (dias === 180) return 'Semestral';
  if (dias === 90)  return 'Trimestral';
  if (dias === 30)  return 'Mensual';
  return `Cada ${dias} días`;
};

const fmtFecha = (s?: string) =>
  s ? new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function PaginaVacunacion() {
  const queryClient = useQueryClient();
  const { esAdministrador, esVeterinario } = useAutenticacion();
  const puedeEditar = esAdministrador || esVeterinario;
  // ?animalId=… (al venir desde la ficha de un animal): abre directamente el
  // historial de aplicaciones filtrado por ese animal.
  const [parametrosUrl, setParametrosUrl] = useSearchParams();
  const animalIdFiltro = parametrosUrl.get('animalId') ?? undefined;
  const quitarFiltroAnimal = () => {
    const p = new URLSearchParams(parametrosUrl); p.delete('animalId'); setParametrosUrl(p);
  };

  const [pestanaActiva, setPestanaActiva]               = useState<'calendarios' | 'registros' | 'planes' | 'cumplimiento'>(
    animalIdFiltro ? 'registros' : 'calendarios',
  );
  const [calendarioActivo, setCalendarioActivo]         = useState<CalendarioVacunacion | null>(null);
  const [calendarioDetalle, setCalendarioDetalle]       = useState<CalendarioVacunacion | null>(null);
  const [calendarioEditar, setCalendarioEditar]         = useState<CalendarioVacunacion | null>(null);
  const [mostrarFormCalendario, setMostrarFormCalendario] = useState(false);
  const [mostrarFormRegistro, setMostrarFormRegistro]   = useState(false);
  const [registroSeleccionado, setRegistroSeleccionado] = useState<RegistroVacunacion | null>(null);
  const [registroEditar, setRegistroEditar]             = useState<RegistroVacunacion | null>(null);
  const [registroEliminar, setRegistroEliminar]         = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: calendarios, isLoading: cargandoCalendarios } = useQuery<CalendarioVacunacion[]>({
    queryKey: ['calendarios-vacunacion'],
    queryFn: () =>
      clienteHttp
        .get('/vacunacion/calendarios')
        .then((r) => r.data.datos ?? r.data),
    staleTime: 2 * 60 * 1000,   // 2 min — reduce peticiones repetidas
  });

  const { data: respuestaRegistros, isLoading: cargandoRegistros } = useQuery({
    queryKey: ['registros-vacunacion', calendarioActivo?.id, animalIdFiltro],
    queryFn: () =>
      clienteHttp
        .get('/vacunacion', {
          params: {
            porPagina: 50,
            ...(calendarioActivo && { calendarioVacunacionId: calendarioActivo.id }),
            ...(animalIdFiltro && { animalId: animalIdFiltro }),
          },
        })
        .then((r) => r.data),
    enabled: pestanaActiva === 'registros',
    staleTime: 60 * 1000,        // 1 min
  });

  const registros: RegistroVacunacion[] = respuestaRegistros?.datos ?? [];

  const { data: cumplimientoPorLote = [], isLoading: cargandoCumplimiento } = useQuery<CumplimientoLote[]>({
    queryKey: ['cumplimiento-vacunacion-lote'],
    queryFn: () =>
      clienteHttp.get('/vacunacion/cumplimiento-por-lote').then((r) => r.data.datos ?? r.data),
    enabled: pestanaActiva === 'cumplimiento',
  });

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const mutacionEliminar = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/vacunacion/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registros-vacunacion'] });
      queryClient.invalidateQueries({ queryKey: ['calendarios-vacunacion'] });
      setRegistroEliminar(null);
      setRegistroSeleccionado(null);
    },
  });

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const totalCalendarios   = calendarios?.length ?? 0;
  const totalAplicaciones  = calendarios?.reduce((s, c) => s + c._count.registrosVacunacion, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-error-container rounded-xl">
              <Icono nombre="pending_actions" clase="text-[22px] text-on-error-container" />
            </div>
          </div>
          <p className="text-3xl font-bold text-on-surface">{cargandoCalendarios ? '—' : totalCalendarios}</p>
          <p className="text-sm text-on-surface-variant mt-1">Calendarios de vacunación</p>
        </div>

        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Icono nombre="task_alt" clase="text-[22px] text-primary" />
            </div>
            <span className="text-xs text-primary font-semibold">Total acumulado</span>
          </div>
          <p className="text-3xl font-bold text-on-surface">{cargandoCalendarios ? '—' : totalAplicaciones}</p>
          <p className="text-sm text-on-surface-variant mt-1">Aplicaciones registradas</p>
          <div className="mt-3 h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
            <div className="bg-primary h-full w-4/5" />
          </div>
        </div>

        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary/10 rounded-xl">
              <Icono nombre="vaccines" relleno clase="text-[22px] text-tertiary" />
            </div>
          </div>
          <p className="text-3xl font-bold text-on-surface">
            {cargandoCalendarios ? '—' : (calendarios?.filter((c) => c.medicamento).length ?? 0)}
          </p>
          <p className="text-sm text-on-surface-variant mt-1">Con medicamento asignado</p>
        </div>
      </motion.div>

      {/* Cabecera + pestañas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto max-w-full">
          {[
            { clave: 'calendarios', et: 'Calendarios',              ico: 'event_note' },
            { clave: 'registros',   et: 'Historial de Aplicaciones', ico: 'history' },
            { clave: 'planes',      et: 'Planes',                    ico: 'description' },
            { clave: 'cumplimiento', et: 'Cumplimiento por Lote',    ico: 'checklist' },
          ].map((p) => (
            <button
              key={p.clave}
              onClick={() => setPestanaActiva(p.clave as 'calendarios' | 'registros' | 'planes' | 'cumplimiento')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${
                pestanaActiva === p.clave
                  ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icono nombre={p.ico} clase="text-[16px]" />
              {p.et}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {pestanaActiva === 'calendarios' ? (
            <>
              {puedeEditar && (
                <button
                  onClick={() => setMostrarFormCalendario(true)}
                  className="boton boton-primario gap-2 text-sm"
                >
                  <Icono nombre="add" clase="text-[18px]" />
                  Nuevo calendario
                </button>
              )}
            </>
          ) : pestanaActiva === 'registros' ? (
            <>
              {calendarioActivo && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20
                               rounded-full text-sm text-primary">
                  <Icono nombre="vaccines" clase="text-[16px]" />
                  <span className="max-w-32 truncate">{calendarioActivo.nombreVacuna}</span>
                  <button onClick={() => setCalendarioActivo(null)} className="hover:text-error transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                </div>
              )}
              {puedeEditar && (
                <button
                  onClick={() => setMostrarFormRegistro(true)}
                  className="boton boton-primario gap-2 text-sm"
                >
                  <Icono nombre="add_task" clase="text-[18px]" />
                  Registrar aplicación
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {pestanaActiva === 'registros' && animalIdFiltro && (
        <FiltroAnimal animalId={animalIdFiltro} alQuitar={quitarFiltroAnimal} />
      )}

      {/* Contenido por pestaña */}
      <AnimatePresence mode="wait">
        {pestanaActiva === 'calendarios' ? (
          <motion.div
            key="calendarios"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {cargandoCalendarios ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-44 rounded-2xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !calendarios?.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
                  <Icono nombre="vaccines" clase="text-[32px] text-outline" />
                </div>
                <p className="font-medium text-on-surface-variant">Sin calendarios de vacunación</p>
                <p className="text-xs text-outline mt-1">Cree el primer protocolo</p>
                {puedeEditar && (
                  <button onClick={() => setMostrarFormCalendario(true)} className="boton boton-primario mt-4 text-sm gap-2">
                    <Icono nombre="add" clase="text-[18px]" />
                    Nuevo calendario
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {calendarios.map((cal) => (
                  <motion.div
                    key={cal.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setCalendarioDetalle(cal)}
                    className="tarjeta-vidrio rounded-2xl p-5 flex flex-col gap-3 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-primary/10">
                          <Icono nombre="vaccines" relleno clase="text-[20px] text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-on-surface text-sm leading-tight">{cal.nombreVacuna}</h3>
                          {cal.medicamento?.laboratorio && <p className="text-xs text-on-surface-variant">{cal.medicamento.laboratorio}</p>}
                        </div>
                      </div>
                    </div>

                    {cal.descripcion && (
                      <p className="text-xs text-on-surface-variant line-clamp-2">{cal.descripcion}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <Icono nombre="schedule" clase="text-[14px] text-primary" />
                        <span>{formatearIntervalo(cal.intervaloDias)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icono nombre="check_circle" relleno clase="text-[14px] text-primary" />
                        <span>{cal._count.registrosVacunacion} aplicaciones</span>
                      </div>
                    </div>

                    {/* A qué animales aplica */}
                    <div className="flex flex-wrap gap-1.5">
                      {(describirCategorias(cal).length ? describirCategorias(cal) : [{ icono: 'pets', texto: 'Todos los animales' }])
                        .map((c) => (
                          <span key={c.texto} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 text-[11px] text-on-surface-variant">
                            <Icono nombre={c.icono} clase="text-[12px] text-secondary" />
                            {c.texto}
                          </span>
                        ))}
                    </div>

                    <div className="mt-auto pt-3 border-t border-outline-variant/20 flex items-center justify-end gap-2">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCalendarioDetalle(cal); }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                        >
                          Ver detalle
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setCalendarioActivo(cal); setPestanaActiva('registros'); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                        >
                          <Icono nombre="history" clase="text-[14px]" />
                          Historial
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : pestanaActiva === 'registros' ? (
          <motion.div
            key="registros"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {cargandoRegistros ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />
                ))}
              </div>
            ) : !registros.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="task_alt" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="font-medium text-on-surface-variant">Sin registros de vacunación</p>
                {puedeEditar && (
                  <button onClick={() => setMostrarFormRegistro(true)} className="boton boton-primario mt-4 text-sm gap-2">
                    <Icono nombre="add_task" clase="text-[18px]" />
                    Registrar aplicación
                  </button>
                )}
              </div>
            ) : (
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                {registros.map((reg, idx) => (
                  <div
                    key={reg.id}
                    onClick={() => setRegistroSeleccionado(reg)}
                    className={`p-4 hover:bg-surface-container-low transition-colors cursor-pointer
                      ${idx < registros.length - 1 ? 'border-b border-outline-variant/20' : ''}
                      ${registroSeleccionado?.id === reg.id ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
                          <Icono nombre="task_alt" relleno clase="text-[18px] text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-on-surface">
                              {reg.calendarioVacunacion.nombreVacuna}
                            </span>
                            {reg.animal && (
                              <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                #{reg.animal.numeroIdentificacion}
                                {reg.animal.nombre && ` · ${reg.animal.nombre}`}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-on-surface-variant">
                            <span>{fmtFecha(reg.fechaAplicacion)}</span>
                            {reg.dosis            && <span>Dosis: {reg.dosis}</span>}
                            {reg.viaAdministracion && <span>Vía: {reg.viaAdministracion}</span>}
                            {reg.lote             && <span className="font-mono">Lote: {reg.lote}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-on-surface-variant">
                          {reg.aplicadoPor.nombre} {reg.aplicadoPor.apellido}
                        </p>
                        {reg.proximaFecha && (
                          <p className="text-xs text-tertiary flex items-center gap-1 justify-end mt-1">
                            <Icono nombre="event_upcoming" clase="text-[12px]" />
                            Próx: {new Date(reg.proximaFecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>
                    {reg.observaciones && (
                      <p className="mt-2 text-xs text-on-surface-variant pl-11 line-clamp-1">{reg.observaciones}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : pestanaActiva === 'planes' ? (
          <motion.div
            key="planes"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-8"
          >
            {/* ── PLAN DE DESPARASITACIÓN ── */}
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              <div className="px-6 py-4 bg-tertiary/10 border-b border-tertiary/20 flex items-center gap-3">
                <div className="p-2 bg-tertiary/20 rounded-xl">
                  <Icono nombre="pest_control" relleno clase="text-[20px] text-tertiary" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface">Plan de Desparasitación</h2>
                  <p className="text-xs text-on-surface-variant">Protocolos antiparasitarios por grupo de animales</p>
                </div>
              </div>

              {/* Terneros hasta 6 meses */}
              <div className="p-6 space-y-4">
                <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
                  <div className="px-4 py-3 bg-surface-container flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-on-surface text-sm">Terneros hasta seis meses de edad</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Fenbendazol la primera vez y al mes siguiente cambiar por Levamisol, luego Fenbendazol de nuevo
                        y seguir la misma secuencia hasta los 6 meses.
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                      Cada 30 días
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-t border-outline-variant/20">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-error uppercase tracking-wide">Parásitos</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-error uppercase tracking-wide">Producto</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-error uppercase tracking-wide">Dosis</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-error uppercase tracking-wide">Vía</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Gastrointestinales y pulmonares</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Fenbendazol 25%</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 50 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Oral</span></td>
                      </tr>
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Gastrointestinales y pulmonares</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Levamisol 15%</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 30 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-medium">Intramuscular</span></td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>

                {/* Animales > 6 meses */}
                <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
                  <div className="px-4 py-3 bg-surface-container flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-on-surface text-sm">Animales mayores de seis meses</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        Se les aplica producto cada 4 meses dependiendo si están en producción láctea o no.
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-tertiary bg-tertiary/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                      Cada 4 meses
                    </span>
                  </div>

                  {/* En producción láctea */}
                  <div className="px-4 py-2 bg-primary/5 border-t border-primary/15">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Animales en producción láctea</p>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-t border-outline-variant/20">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Parásitos</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Producto</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Dosis</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Vía</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Gastrointestinales y pulmonares</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Fenbendazol 25%</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 50 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Oral</span></td>
                      </tr>
                    </tbody>
                  </table>
                  </div>

                  {/* Animales secos */}
                  <div className="px-4 py-2 bg-tertiary/5 border-t border-tertiary/15">
                    <p className="text-xs font-semibold text-tertiary uppercase tracking-wide">Animales secos (no en producción láctea)</p>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-t border-outline-variant/20">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Parásitos</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Producto</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Dosis</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-error uppercase tracking-wide">Vía</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Gastrointestinales, pulmonares y ectoparásitos</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Ivermectina 3,15%</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 50 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full font-medium">Subcutánea</span></td>
                      </tr>
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Gastrointestinales y hepáticos</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Lombifarm (Fenbendazol + Triclabendazol)</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 10 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Oral</span></td>
                      </tr>
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Pulmonares y ectoparásitos</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Doramectina 1%</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">1 ml / 50 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-tertiary/10 text-tertiary px-2 py-0.5 rounded-full font-medium">Subcutánea</span></td>
                      </tr>
                      <tr className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-4 py-3 text-on-surface font-medium">Coccidiosis intestinal</td>
                        <td className="px-4 py-3"><span className="font-semibold text-on-surface">Tratoril (Toltrazuril 5%)</span></td>
                        <td className="px-4 py-3 text-on-surface-variant">3 ml / 10 kg PV</td>
                        <td className="px-4 py-3"><span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Oral</span></td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>

            {/* ── PLAN DE VACUNACIÓN EN BOVINOS ── */}
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              <div className="px-6 py-4 bg-primary/10 border-b border-primary/20 flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-xl">
                  <Icono nombre="vaccines" relleno clase="text-[20px] text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface">Plan de Vacunación en Bovinos</h2>
                  <p className="text-xs text-on-surface-variant">Protocolo oficial — Sucesión Joao Campolargo</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container border-b border-outline-variant/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Vacuna</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Edad de vacunación</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Revacunación</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Dosis y vía</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {[
                      {
                        vacuna: 'Fiebre Aftosa',
                        edad: 'Todas las edades',
                        revacunacion: 'Cada seis meses',
                        dosis: '2 ml subcutánea en la paleta o tabla del cuello',
                        obs: 'Según calendario oficial',
                        color: 'primary',
                      },
                      {
                        vacuna: 'Brucelosis',
                        edad: 'Terneras entre 3 y 8 meses',
                        revacunacion: 'Dosis única a terneras',
                        dosis: '2 ml subcutánea',
                        obs: 'De acuerdo al programa oficial',
                        color: 'secondary',
                      },
                      {
                        vacuna: 'Triple (Carbón Sintomático, Septicemia, Otras Clostridiosis)',
                        edad: 'Machos y hembras desde los 3 meses',
                        revacunacion: '15 días después de la primera dosis; luego anualmente',
                        dosis: '2 a 5 ml subcutánea según marca comercial',
                        obs: 'La revacunación a los 15 días de la primera dosis es indispensable para la efectividad del biológico',
                        color: 'tertiary',
                      },
                      {
                        vacuna: 'Carbón Bacteridiano',
                        edad: 'De 3 meses en adelante',
                        revacunacion: '21–30 días después de la primera; luego anual',
                        dosis: '2 ml subcutánea',
                        obs: 'En áreas de presentación',
                        color: 'primary',
                      },
                      {
                        vacuna: 'Rabia Bovina',
                        edad: 'De 4 meses en adelante',
                        revacunacion: 'Anual',
                        dosis: '2 ml intramuscular',
                        obs: 'Según presentación de la enfermedad en la zona',
                        color: 'error',
                      },
                      {
                        vacuna: 'IBR – DVB – Leptospirosis (algunas incluyen PI3, Campylobacter)',
                        edad: 'Desde 3 meses en hembras y machos para reproducción / Hembras desde 6 meses antes del servicio',
                        revacunacion: 'Un mes después de la primera dosis; luego anualmente / Al mes y un mes posparto; luego anual',
                        dosis: '5 ml intramuscular',
                        obs: 'Aplicación con asesoría del médico veterinario, previo diagnóstico de la enfermedad en el predio',
                        color: 'secondary',
                      },
                      {
                        vacuna: 'Anaplasmosis y Babesiosis',
                        edad: '3 y 12 meses de edad',
                        revacunacion: '3 y 12 meses de edad',
                        dosis: '2 ml intramuscular (cada vial independiente)',
                        obs: 'Su aplicación requiere asesoría de un médico veterinario',
                        color: 'tertiary',
                      },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-surface-container-low/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                              row.color === 'primary'   ? 'bg-primary' :
                              row.color === 'secondary' ? 'bg-secondary' :
                              row.color === 'tertiary'  ? 'bg-tertiary' : 'bg-error'
                            }`} />
                            <span className="font-semibold text-on-surface">{row.vacuna}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-on-surface-variant text-xs">{row.edad}</td>
                        <td className="px-4 py-3.5 text-on-surface-variant text-xs">{row.revacunacion}</td>
                        <td className="px-4 py-3.5 text-on-surface text-xs font-medium">{row.dosis}</td>
                        <td className="px-4 py-3.5 text-on-surface-variant text-xs italic">{row.obs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : pestanaActiva === 'cumplimiento' ? (
          <motion.div
            key="cumplimiento"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {cargandoCumplimiento ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
              ))}</div>
            ) : !cumplimientoPorLote.length ? (
              <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
                <Icono nombre="checklist" clase="text-[40px] text-outline mx-auto mb-3" />
                <p className="font-medium text-on-surface-variant">Sin lotes con animales activos</p>
              </div>
            ) : (
              <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                <div className="min-w-[620px]">
                <div className="grid grid-cols-[1fr_1fr_90px_90px_110px] gap-3 px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">
                  {['Lote', 'Finca', 'Animales', 'Al día', 'Cumplimiento'].map((h) => (
                    <span key={h} className={h === 'Lote' || h === 'Finca' ? '' : 'text-center'}>{h}</span>
                  ))}
                </div>
                {cumplimientoPorLote.map((l, idx) => (
                  <div
                    key={l.loteId}
                    className={`grid grid-cols-[1fr_1fr_90px_90px_110px] gap-3 items-center px-5 py-3.5 text-sm
                      hover:bg-surface-container-low transition-colors
                      ${idx < cumplimientoPorLote.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                  >
                    <span className="font-semibold text-on-surface">{l.loteNombre}</span>
                    <span className="text-on-surface-variant flex items-center gap-1.5">
                      <Icono nombre="agriculture" clase="text-[15px] text-outline" />
                      {l.fincaNombre}
                    </span>
                    <span className="text-center text-on-surface-variant">{l.totalAnimales}</span>
                    <span className="text-center text-on-surface-variant">{l.paresAlDia}/{l.paresEsperados}</span>
                    <span className="text-center">
                      <Badge variante={l.cumplimiento >= 80 ? 'verde' : l.cumplimiento >= 50 ? 'amarillo' : 'rojo'} tamano="xs">
                        {l.cumplimiento}%
                      </Badge>
                    </span>
                  </div>
                ))}
                </div>
                </div>
              </div>
            )}
            <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 mt-3">
              <Icono nombre="info" clase="text-[13px]" />
              Cumplimiento = pares animal-calendario al día (sin vacuna vencida) sobre el total de pares aplicables en el lote.
              Cada animal solo cuenta para los calendarios que le corresponden según su sexo, edad, propósito y condición reproductiva.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="registros-placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* FAB — solo en pestañas de edición */}
      {pestanaActiva !== 'planes' && pestanaActiva !== 'cumplimiento' && (
        <button
          onClick={() => pestanaActiva === 'calendarios' ? setMostrarFormCalendario(true) : setMostrarFormRegistro(true)}
          className="md:hidden fixed bottom-20 right-5 w-14 h-14 bg-primary text-on-primary rounded-full
                     shadow-[var(--shadow-primary)] flex items-center justify-center
                     hover:scale-110 active:scale-95 transition-transform z-20"
        >
          <Icono nombre={pestanaActiva === 'calendarios' ? 'add' : 'add_task'} clase="text-[28px]" />
        </button>
      )}

      {/* ── Panel lateral: detalle de registro ── */}
      <AnimatePresence>
        {registroSeleccionado && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-inverse-surface/30 z-40"
              onClick={() => setRegistroSeleccionado(null)}
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[420px] max-w-[95vw] bg-surface-container-lowest shadow-2xl z-50 overflow-y-auto"
            >
              {/* Header */}
              <div className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant/20 px-5 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-on-surface">Detalle del Registro</h2>
                  <p className="text-xs text-on-surface-variant">{fmtFecha(registroSeleccionado.fechaAplicacion)}</p>
                </div>
                <button
                  onClick={() => setRegistroSeleccionado(null)}
                  className="p-2 hover:bg-surface-container rounded-xl transition-colors"
                >
                  <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* Animal */}
                <section>
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2">Animal vacunado</p>
                  {registroSeleccionado.animal ? (
                    <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icono nombre="pets" relleno clase="text-[18px] text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          #{registroSeleccionado.animal.numeroIdentificacion}
                          {registroSeleccionado.animal.nombre &&
                            ` · ${registroSeleccionado.animal.nombre}`}
                        </p>
                        <p className="text-xs text-on-surface-variant">Animal identificado</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-on-surface-variant italic">Sin animal asociado</p>
                  )}
                </section>

                {/* Vacuna/Calendario */}
                <section>
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Protocolo aplicado</p>
                  <p className="text-sm font-semibold text-on-surface">
                    {registroSeleccionado.calendarioVacunacion.nombreVacuna}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {formatearIntervalo(registroSeleccionado.calendarioVacunacion.intervaloDias)}
                  </p>
                </section>

                {/* Datos de la aplicación */}
                <section>
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2">Datos de la aplicación</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-surface-container rounded-xl p-2.5">
                      <p className="text-[10px] text-on-surface-variant">Fecha</p>
                      <p className="text-sm font-semibold text-on-surface">{fmtFecha(registroSeleccionado.fechaAplicacion)}</p>
                    </div>
                    {registroSeleccionado.proximaFecha && (
                      <div className="bg-tertiary/10 rounded-xl p-2.5">
                        <p className="text-[10px] text-tertiary">Próxima aplicación</p>
                        <p className="text-sm font-semibold text-on-surface">{fmtFecha(registroSeleccionado.proximaFecha)}</p>
                      </div>
                    )}
                    {registroSeleccionado.dosis && (
                      <div className="bg-surface-container rounded-xl p-2.5">
                        <p className="text-[10px] text-on-surface-variant">Dosis</p>
                        <p className="text-sm font-semibold text-on-surface">{registroSeleccionado.dosis}</p>
                      </div>
                    )}
                    {registroSeleccionado.viaAdministracion && (
                      <div className="bg-surface-container rounded-xl p-2.5">
                        <p className="text-[10px] text-on-surface-variant">Vía</p>
                        <p className="text-sm font-semibold text-on-surface">{registroSeleccionado.viaAdministracion}</p>
                      </div>
                    )}
                    {registroSeleccionado.lote && (
                      <div className="bg-surface-container rounded-xl p-2.5 col-span-2">
                        <p className="text-[10px] text-on-surface-variant">Número de lote</p>
                        <p className="text-sm font-mono font-semibold text-on-surface">{registroSeleccionado.lote}</p>
                      </div>
                    )}
                  </div>
                </section>

                {registroSeleccionado.medicamento && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Medicamento</p>
                    <p className="text-sm text-on-surface">{registroSeleccionado.medicamento.nombre}</p>
                  </section>
                )}

                {registroSeleccionado.observaciones && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Observaciones</p>
                    <p className="text-sm text-on-surface-variant bg-surface-container p-3 rounded-xl">
                      {registroSeleccionado.observaciones}
                    </p>
                  </section>
                )}

                <section className="pt-4 border-t border-outline-variant/20">
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Registrado por</p>
                  <p className="text-sm text-on-surface-variant">
                    {registroSeleccionado.aplicadoPor.nombre} {registroSeleccionado.aplicadoPor.apellido}
                  </p>
                </section>

                {/* Acciones */}
                {puedeEditar && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setRegistroEditar(registroSeleccionado); setRegistroSeleccionado(null); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                 border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
                    >
                      <Icono nombre="edit" clase="text-[16px]" />
                      Editar
                    </button>
                    <button
                      onClick={() => { setRegistroEliminar(registroSeleccionado.id); setRegistroSeleccionado(null); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                 border border-error/30 text-error hover:bg-error-container/30 transition-colors text-sm font-medium"
                    >
                      <Icono nombre="delete" clase="text-[16px]" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Modal: Detalle del calendario */}
      <DetalleCalendario
        calendario={calendarioDetalle}
        puedeEditar={puedeEditar}
        alCerrar={() => setCalendarioDetalle(null)}
        alVerHistorial={(cal) => {
          setCalendarioDetalle(null);
          setCalendarioActivo(cal);
          setPestanaActiva('registros');
        }}
        alEditar={(cal) => { setCalendarioDetalle(null); setCalendarioEditar(cal); }}
      />

      {/* Modal: Nuevo / editar calendario */}
      <AnimatePresence>
        {(mostrarFormCalendario || calendarioEditar) && (
          <FormularioCalendario
            calendario={calendarioEditar ?? undefined}
            onCerrar={() => { setMostrarFormCalendario(false); setCalendarioEditar(null); }}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['calendarios-vacunacion'] });
              queryClient.invalidateQueries({ queryKey: ['cumplimiento-vacunacion-lote'] });
              setMostrarFormCalendario(false);
              setCalendarioEditar(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: Registrar Vacunación */}
      <AnimatePresence>
        {mostrarFormRegistro && (
          <FormularioRegistro
            calendarioPredeterminado={calendarioActivo ?? undefined}
            animalPredeterminado={animalIdFiltro}
            todosCalendarios={calendarios ?? []}
            onCerrar={() => setMostrarFormRegistro(false)}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['registros-vacunacion'] });
              queryClient.invalidateQueries({ queryKey: ['calendarios-vacunacion'] });
              setMostrarFormRegistro(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: Editar registro */}
      <AnimatePresence>
        {registroEditar && (
          <FormularioEditarRegistro
            registro={registroEditar}
            onCerrar={() => setRegistroEditar(null)}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['registros-vacunacion'] });
              setRegistroEditar(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: Confirmar eliminación */}
      <ModalConfirmacion
        abierto={!!registroEliminar}
        titulo="Eliminar registro de vacunación"
        descripcion="¿Está seguro de eliminar este registro? Esta acción no se puede deshacer."
        textoConfirmar="Eliminar"
        variante="peligro"
        cargando={mutacionEliminar.isPending}
        alConfirmar={() => registroEliminar && mutacionEliminar.mutate(registroEliminar)}
        alCerrar={() => setRegistroEliminar(null)}
      />
    </div>
  );
}

// ── Detalle de un calendario ──────────────────────────────────────────────────

function DetalleCalendario({ calendario, puedeEditar, alCerrar, alVerHistorial, alEditar }: {
  calendario: CalendarioVacunacion | null;
  puedeEditar: boolean;
  alCerrar: () => void;
  alVerHistorial: (cal: CalendarioVacunacion) => void;
  alEditar: (cal: CalendarioVacunacion) => void;
}) {
  const categorias = calendario ? describirCategorias(calendario) : [];
  return (
    <Modal
      abierto={!!calendario}
      alCerrar={alCerrar}
      titulo={calendario?.nombreVacuna}
      descripcion={calendario?.medicamento?.laboratorio ?? undefined}
      tamano="lg"
      pie={calendario && (
        <>
          {puedeEditar && (
            <button type="button" onClick={() => alEditar(calendario)} className="boton boton-secundario gap-2 text-sm">
              <Icono nombre="edit" clase="text-[16px]" />
              Editar
            </button>
          )}
          <button type="button" onClick={() => alVerHistorial(calendario)} className="boton boton-primario gap-2 text-sm">
            <Icono nombre="history" clase="text-[16px]" />
            Ver historial de aplicaciones
          </button>
        </>
      )}
    >
      {calendario && (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { et: 'Frecuencia', val: formatearIntervalo(calendario.intervaloDias), ico: 'schedule' },
              { et: 'Medicamento', val: calendario.medicamento?.nombre ?? 'Sin asignar', ico: 'medication' },
              { et: 'Aplicaciones', val: String(calendario._count.registrosVacunacion), ico: 'check_circle' },
            ].map((d) => (
              <div key={d.et} className="p-3 rounded-xl bg-surface-container">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-on-surface-variant flex items-center gap-1">
                  <Icono nombre={d.ico} clase="text-[13px]" /> {d.et}
                </p>
                <p className="font-semibold text-on-surface mt-0.5">{d.val}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">A qué animales aplica</p>
            {categorias.length ? (
              <ul className="space-y-1.5">
                {categorias.map((c) => (
                  <li key={c.texto} className="flex items-center gap-2 text-on-surface">
                    <Icono nombre={c.icono} clase="text-[16px] text-secondary" />
                    {c.texto}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-on-surface flex items-center gap-2">
                <Icono nombre="pets" clase="text-[16px] text-secondary" />
                Todos los animales
              </p>
            )}
            {(calendario.aplicaACondicion === 'EN_LACTANCIA' || calendario.aplicaACondicion === 'SECAS') && (
              <p className="text-[11px] text-on-surface-variant mt-2">
                "En lactancia" se estima como parto en los últimos 300 días, porque el sistema no registra el secado.
              </p>
            )}
          </div>

          {calendario.descripcion && (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Indicaciones</p>
              <p className="text-on-surface-variant leading-relaxed whitespace-pre-line">{calendario.descripcion}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Formulario: Nuevo / editar calendario ─────────────────────────────────────

const PROPOSITOS: Proposito[] = ['CARNE', 'LECHE', 'CARNE_LECHE', 'REPRODUCCION', 'TAUROMAQUIA'];

function FormularioCalendario({ calendario, onCerrar, onExito }: {
  calendario?: CalendarioVacunacion;
  onCerrar: () => void;
  onExito: () => void;
}) {
  const esEdicion = !!calendario;
  const [form, setForm] = useState<FormCalendario>({
    nombreVacuna:      calendario?.nombreVacuna ?? '',
    descripcion:       calendario?.descripcion ?? '',
    intervaloDias:     calendario?.intervaloDias ?? 365,
    edadMinimasDias:   calendario?.edadMinimasDias ?? undefined,
    edadMaximaDias:    calendario?.edadMaximaDias ?? undefined,
    aplicaASexo:       calendario?.aplicaASexo ?? '',
    aplicaAPropositos: calendario?.aplicaAPropositos ?? [],
    aplicaACondicion:  calendario?.aplicaACondicion ?? '',
  });
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: (datos: FormCalendario) => {
      // En la edición los campos vacíos se envían como null para poder
      // quitar una restricción que antes estaba puesta.
      const cuerpo = {
        nombreVacuna:      datos.nombreVacuna,
        intervaloDias:     datos.intervaloDias,
        descripcion:       datos.descripcion || undefined,
        edadMinimasDias:   datos.edadMinimasDias ?? null,
        edadMaximaDias:    datos.edadMaximaDias ?? null,
        aplicaASexo:       datos.aplicaASexo || null,
        aplicaAPropositos: datos.aplicaAPropositos,
        aplicaACondicion:  datos.aplicaACondicion || null,
      };
      return esEdicion
        ? clienteHttp.patch(`/vacunacion/calendarios/${calendario!.id}`, cuerpo)
        : clienteHttp.post('/vacunacion/calendarios', cuerpo);
    },
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al guardar el calendario'),
  });

  const alternarProposito = (p: Proposito) => setForm((f) => ({
    ...f,
    aplicaAPropositos: f.aplicaAPropositos.includes(p)
      ? f.aplicaAPropositos.filter((x) => x !== p)
      : [...f.aplicaAPropositos, p],
  }));

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
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="vaccines" relleno clase="text-[20px] text-primary" />
              {esEdicion ? 'Editar Calendario de Vacunación' : 'Nuevo Calendario de Vacunación'}
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.nombreVacuna.trim()) { setError('El nombre de la vacuna es requerido'); return; }
              if (form.edadMinimasDias != null && form.edadMaximaDias != null && form.edadMaximaDias < form.edadMinimasDias) {
                setError('La edad máxima no puede ser menor que la mínima'); return;
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

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Nombre de la Vacuna <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={form.nombreVacuna}
                onChange={(e) => setForm((f) => ({ ...f, nombreVacuna: e.target.value }))}
                placeholder="Ej: Brucelosis, Aftosa, Rabia..."
                className="campo-entrada"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Intervalo (días) <span className="text-error">*</span>
                </label>
                <input
                  type="number" min={1}
                  value={form.intervaloDias}
                  onChange={(e) => setForm((f) => ({ ...f, intervaloDias: Number(e.target.value) }))}
                  className="campo-entrada"
                />
              </div>
              {form.intervaloDias > 0 && (
                <p className="self-end pb-3 text-xs text-on-surface-variant">
                  Se repite: <strong className="text-on-surface">{formatearIntervalo(form.intervaloDias)}</strong>
                </p>
              )}
            </div>

            {/* ── A qué animales aplica ── */}
            <div className="p-4 rounded-xl bg-surface-container space-y-3">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                A qué animales aplica <span className="normal-case font-normal">(en blanco = todos)</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { campo: 'edadMinimasDias', et: 'Edad mínima (días)', ph: 'Sin mínimo' },
                  { campo: 'edadMaximaDias',  et: 'Edad máxima (días)', ph: 'Sin máximo' },
                ] as const).map(({ campo, et, ph }) => (
                  <div key={campo}>
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{et}</label>
                    <input
                      type="number" min={0}
                      value={form[campo] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder={ph}
                      className="campo-entrada"
                    />
                    {!!form[campo] && (
                      <p className="text-[11px] text-on-surface-variant mt-1">≈ {formatearEdad(form[campo]!)}</p>
                    )}
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Sexo</label>
                  <select
                    value={form.aplicaASexo}
                    onChange={(e) => setForm((f) => ({ ...f, aplicaASexo: e.target.value as '' | 'MACHO' | 'HEMBRA' }))}
                    className="campo-entrada"
                  >
                    <option value="">Ambos sexos</option>
                    <option value="MACHO">Solo machos</option>
                    <option value="HEMBRA">Solo hembras</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Condición reproductiva</label>
                  <select
                    value={form.aplicaACondicion}
                    onChange={(e) => setForm((f) => ({ ...f, aplicaACondicion: e.target.value as '' | Condicion }))}
                    className="campo-entrada"
                  >
                    <option value="">Cualquiera</option>
                    <option value="GESTANTES">Solo hembras gestantes</option>
                    <option value="VACIAS">Solo hembras vacías</option>
                    <option value="EN_LACTANCIA">Solo hembras en lactancia</option>
                    <option value="SECAS">Solo animales secos (no en lactancia)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Propósito</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROPOSITOS.map((p) => {
                    const activo = form.aplicaAPropositos.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => alternarProposito(p)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          activo
                            ? 'bg-primary text-on-primary border-primary'
                            : 'border-outline-variant/50 text-on-surface-variant hover:bg-surface-container-lowest'
                        }`}
                      >
                        {ETIQUETA_PROPOSITO[p]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  {form.aplicaAPropositos.length ? 'Solo los propósitos marcados.' : 'Sin marcar = todos los propósitos.'}
                </p>
              </div>
              {(form.aplicaACondicion === 'EN_LACTANCIA' || form.aplicaACondicion === 'SECAS') && (
                <p className="text-[11px] text-on-surface-variant">
                  "En lactancia" se estima como parto en los últimos 300 días, porque el sistema no registra el secado.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Descripción</label>
              <textarea
                rows={2}
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Indicaciones, notas..."
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear calendario'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ── Formulario: Registrar Vacunación ──────────────────────────────────────────

function FormularioRegistro({
  calendarioPredeterminado, animalPredeterminado, todosCalendarios, onCerrar, onExito,
}: {
  calendarioPredeterminado?: CalendarioVacunacion;
  animalPredeterminado?: string;
  todosCalendarios: CalendarioVacunacion[];
  onCerrar: () => void;
  onExito: () => void;
}) {
  const [form, setForm] = useState<FormRegistro>({
    calendarioVacunacionId: calendarioPredeterminado?.id ?? '',
    animalId:        animalPredeterminado ?? '',
    fechaAplicacion: fechaLocalISO(),
    dosis: '', viaAdministracion: '', lote: '', observaciones: '',
  });
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: (datos: FormRegistro) =>
      clienteHttp.post('/vacunacion', {
        calendarioVacunacionId: datos.calendarioVacunacionId,
        animalId: datos.animalId,
        fechaAplicacion:   isoMediodia(datos.fechaAplicacion),
        ...(datos.dosis             && { dosis: datos.dosis }),
        ...(datos.viaAdministracion && { viaAdministracion: datos.viaAdministracion }),
        ...(datos.lote              && { lote: datos.lote }),
        ...(datos.observaciones     && { observaciones: datos.observaciones }),
      }, { descripcionOffline: 'Registro de vacunación' }),
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al registrar la vacunación'),
  });

  // Advertencia (no bloquea) si el protocolo no le corresponde al animal
  // según sus categorías: sexo, edad, propósito o condición reproductiva.
  const { data: aplicabilidad } = useQuery<{ aplica: boolean; motivos: string[] }>({
    queryKey: ['vacuna-aplica', form.calendarioVacunacionId, form.animalId],
    queryFn: () => clienteHttp
      .get(`/vacunacion/calendarios/${form.calendarioVacunacionId}/aplica`, { params: { animalId: form.animalId }, silencioso: true })
      .then((r) => r.data.datos),
    enabled: !!form.calendarioVacunacionId && !!form.animalId,
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
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="add_task" clase="text-[20px] text-primary" />
              Registrar Vacunación
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.calendarioVacunacionId) { setError('Seleccione el protocolo de vacunación'); return; }
              if (!form.animalId) { setError('Seleccione el animal vacunado'); return; }
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
                Protocolo de vacunación <span className="text-error">*</span>
              </label>
              <select
                value={form.calendarioVacunacionId}
                onChange={(e) => setForm((f) => ({ ...f, calendarioVacunacionId: e.target.value }))}
                className="campo-entrada"
              >
                <option value="">Seleccionar protocolo...</option>
                {todosCalendarios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreVacuna}{c.medicamento?.laboratorio ? ` — ${c.medicamento.laboratorio}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <BuscadorAnimal
              etiqueta="Animal vacunado"
              requerido
              valor={form.animalId}
              alSeleccionar={(id) => setForm((f) => ({ ...f, animalId: id }))}
              placeholder="Buscar por identificación o nombre..."
            />

            {aplicabilidad && !aplicabilidad.aplica && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <Icono nombre="warning" clase="text-[18px] flex-shrink-0" />
                <div>
                  <p className="font-semibold">Este protocolo no le corresponde a este animal:</p>
                  <ul className="list-disc ml-4 mt-0.5">
                    {aplicabilidad.motivos.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  <p className="mt-1">Puede registrarlo igualmente si es lo indicado.</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Fecha de Aplicación <span className="text-error">*</span>
              </label>
              <CampoFecha
                value={form.fechaAplicacion}
                onChange={(valor) => setForm((f) => ({ ...f, fechaAplicacion: valor }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { campo: 'dosis',             et: 'Dosis',  ph: '2 ml' },
                { campo: 'viaAdministracion', et: 'Vía',    ph: 'IM, SC...' },
                { campo: 'lote',              et: 'Lote',   ph: 'N° lote' },
              ].map(({ campo, et, ph }) => (
                <div key={campo}>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{et}</label>
                  <input
                    type="text"
                    value={(form as any)[campo]}
                    onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                    placeholder={ph}
                    className="campo-entrada"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
              <textarea
                rows={2}
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Reacciones, notas..."
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ── Formulario: Editar Registro ───────────────────────────────────────────────

function FormularioEditarRegistro({
  registro, onCerrar, onExito,
}: {
  registro: RegistroVacunacion;
  onCerrar: () => void;
  onExito: () => void;
}) {
  const [form, setForm] = useState({
    fechaAplicacion:  fechaLocalISO(new Date(registro.fechaAplicacion)),
    dosis:            registro.dosis            ?? '',
    viaAdministracion: registro.viaAdministracion ?? '',
    lote:             registro.lote             ?? '',
    observaciones:    registro.observaciones    ?? '',
  });
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: () =>
      clienteHttp.patch(`/vacunacion/${registro.id}`, {
        fechaAplicacion:   isoMediodia(form.fechaAplicacion),
        dosis:             form.dosis             || undefined,
        viaAdministracion: form.viaAdministracion || undefined,
        lote:              form.lote              || undefined,
        observaciones:     form.observaciones     || undefined,
      }),
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al actualizar el registro'),
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
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="edit" clase="text-[20px] text-primary" />
              Editar Registro
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          {/* Info no editable */}
          <div className="px-6 pt-4 pb-2">
            <div className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
              <Icono nombre="vaccines" clase="text-[18px] text-primary" />
              <div>
                <p className="text-sm font-semibold text-on-surface">{registro.calendarioVacunacion.nombreVacuna}</p>
                {registro.animal && (
                  <p className="text-xs text-on-surface-variant">
                    Animal #{registro.animal.numeroIdentificacion}
                    {registro.animal.nombre && ` · ${registro.animal.nombre}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              mutacion.mutate();
            }}
            className="px-6 pb-6 space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Fecha de Aplicación <span className="text-error">*</span>
              </label>
              <CampoFecha
                value={form.fechaAplicacion}
                onChange={(valor) => setForm((f) => ({ ...f, fechaAplicacion: valor }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { campo: 'dosis',             et: 'Dosis',  ph: '2 ml' },
                { campo: 'viaAdministracion', et: 'Vía',    ph: 'IM, SC...' },
                { campo: 'lote',              et: 'Lote',   ph: 'N° lote' },
              ].map(({ campo, et, ph }) => (
                <div key={campo}>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{et}</label>
                  <input
                    type="text"
                    value={(form as any)[campo]}
                    onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                    placeholder={ph}
                    className="campo-entrada"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
              <textarea
                rows={2}
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
