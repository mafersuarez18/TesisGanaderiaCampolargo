import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Paginacion from '../../componentes/ui/Paginacion';
import Badge from '../../componentes/ui/Badge';
import { ModalConfirmacion } from '../../componentes/ui/Modal';
import useDebounce from '../../hooks/useDebounce';
import Icono from '../../componentes/ui/Icono';
import BuscadorAnimal from '../../componentes/ui/BuscadorAnimal';
import CampoFecha from '../../componentes/ui/CampoFecha';
import { useAutenticacion } from '../../hooks/useAutenticacion';

// Consultas médicas: listado, formulario de nueva consulta (con
// enfermedades/tratamientos/desparasitaciones anidados) y su selector de
// medicamento con el mismo patrón "buscar o crear" que el de raza.
interface HistorialMedico {
  id: string;
  fechaConsulta: string;
  motivoConsulta: string;
  sintomasObservados?: string;
  observaciones?: string;
  tratamientosPrevios?: string;
  cirugias?: string;
  temperatura?: number;
  frecuenciaCardiaca?: number;
  frecuenciaRespiratoria?: number;
  tiempoLlenadoCapilar?: number;
  movimientosRuminales?: number;
  condicionCorporal?: number;
  estadoReproductivo?: string;
  litrosLechesDiarios?: number;
  gananciaPeso?: number;
  diagnosticoDefinitivo?: string;
  resultadosPruebas?: string;
  animal: {
    id: string;
    numeroIdentificacion: string;
    nombre?: string;
    lote?: { finca?: { nombre: string } };
  };
  veterinario: { id: string; nombre: string; apellido: string };
  enfermedades: Array<{
    id: string;
    nombreEnfermedad: string;
    nivelGravedad?: string;
    fechaInicio: string;
    activa: boolean;
    descripcionClinica?: string;
    diagnosticoDefinitivo?: string;
    pronostico?: string;
    planDiagnostico?: string;
    tiempoEvolucion?: string;
    sintomas?: string;
    pruebasDiagnostico?: string;
  }>;
  tratamientos: Array<{
    id: string;
    dosis: string;
    viaAdministracion: string;
    frecuencia: string;
    duracionDias?: number;
    estado: string;
    enfermedadDiagnosticadaId?: string;
    medicamento: { nombre: string };
    enfermedadDiagnosticada?: { nombreEnfermedad: string };
  }>;
  informacionEpidemiologica?: {
    garrapatas: boolean;
    mosquitos: boolean;
    murcielagos: boolean;
    moscas: boolean;
    otrosVectores?: string;
    descripcion?: string;
  };
  pruebasComplementarias: PruebaComplementaria[];
}

interface PruebaComplementaria {
  id: string;
  tipo: string;
  fecha?: string | null;
  resultado?: string | null;
  observaciones?: string | null;
}

interface RespuestaHistorial {
  datos: HistorialMedico[];
  meta: { total: number; pagina: number; porPagina: number; totalPaginas: number };
}

interface DesparasitacionForm {
  medicamentoId: string;
  medicamentoNombreNuevo: string;
  medicamentoPrincipioActivoNuevo: string;
  tipo: string;
  fecha: string;
  dosis: string;
  via: string;
}

interface VitaminaForm {
  medicamentoId: string;
  medicamentoNombreNuevo: string;
  fecha: string;
  dosis: string;
  via: string;
}

interface PruebaComplementariaForm {
  tipo: string;
  fecha: string;
  resultado: string;
  observaciones: string;
}

interface EnfermedadForm {
  nombreEnfermedad: string;
  nivelGravedad: string;
  fechaInicio: string;
  descripcionClinica: string;
  diagnosticoDefinitivo: string;
  pronostico: string;
  planDiagnostico: string;
  tiempoEvolucion: string;
  sintomas: string;
  pruebasDiagnostico: string;
}

interface TratamientoForm {
  medicamentoId: string;
  medicamentoNombreNuevo: string;
  enfermedadDiagnosticadaId: string;
  fechaInicio: string;
  dosis: string;
  viaAdministracion: string;
  frecuencia: string;
  duracionDias: string;
  observaciones: string;
}

interface MedicamentoOpcion {
  id: string;
  nombre: string;
  principioActivo?: string;
}

interface EnfermedadActivaOpcion {
  id: string;
  nombreEnfermedad: string;
  fechaInicio: string;
}

interface FormHistorial {
  animalId: string;
  fechaConsulta: string;
  motivoConsulta: string;
  sintomasObservados: string;
  observaciones: string;
  tratamientosPrevios: string;
  cirugias: string;
  temperatura: string;
  frecuenciaCardiaca: string;
  frecuenciaRespiratoria: string;
  tiempoLlenadoCapilar: string;
  movimientosRuminales: string;
  condicionCorporal: string;
  estadoReproductivo: string;
  litrosLechesDiarios: string;
  gananciaPeso: string;
  diagnosticoDefinitivo: string;
  resultadosPruebas: string;
  epidGarrapatas: boolean;
  epidMosquitos: boolean;
  epidMurcielagos: boolean;
  epidMoscas: boolean;
  epidOtros: string;
  epidDescripcion: string;
  desparasitaciones: DesparasitacionForm[];
  vitaminas: VitaminaForm[];
  pruebasComplementarias: PruebaComplementariaForm[];
  enfermedades: EnfermedadForm[];
  tratamientos: TratamientoForm[];
}

export default function PaginaHistorialMedico() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { tienePrivilegio } = useAutenticacion();

  const [busqueda, setBusqueda]                            = useState(searchParams.get('animal') ?? '');
  const [paginaActual, setPaginaActual]                     = useState(1);
  const [mostrarFiltros, setMostrarFiltros]                 = useState(false);
  const [historialSeleccionado, setHistorialSeleccionado]   = useState<HistorialMedico | null>(null);
  const [mostrarEliminar, setMostrarEliminar]               = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario]           = useState(false);

  const animalIdFiltro = searchParams.get('animalId') ?? undefined;
  const desdeFiltro    = searchParams.get('desde')    ?? undefined;
  const hastaFiltro    = searchParams.get('hasta')    ?? undefined;

  useDebounce(busqueda, 400);

  const { data, isLoading } = useQuery<RespuestaHistorial>({
    queryKey: ['historialMedico', paginaActual, animalIdFiltro, desdeFiltro, hastaFiltro],
    queryFn: () =>
      clienteHttp
        .get('/historial-medico', {
          params: {
            pagina: paginaActual,
            porPagina: 20,
            ...(animalIdFiltro && { animalId: animalIdFiltro }),
            ...(desdeFiltro    && { desde: desdeFiltro }),
            ...(hastaFiltro    && { hasta: hastaFiltro }),
          },
        })
        .then((r) => r.data),
  });

  const eliminarMutacion = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/historial-medico/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historialMedico'] });
      setMostrarEliminar(null);
      setHistorialSeleccionado(null);
    },
  });

  const registros = data?.datos ?? [];
  const meta = data?.meta;

  const contarActivos   = registros.filter((r) => r.tratamientos.some((t) => t.estado === 'EN_CURSO')).length;
  const contarEnfermedades = registros.filter((r) => r.enfermedades.some((e) => e.activa)).length;

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
            <div className="p-3 bg-primary/10 rounded-xl">
              <Icono nombre="prescriptions" relleno clase="text-[22px] text-primary" />
            </div>
            <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-full">Activo</span>
          </div>
          <p className="text-3xl font-bold text-primary">{isLoading ? '—' : contarActivos}</p>
          <p className="text-sm text-on-surface-variant mt-1">Tratamientos en curso</p>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-primary">
            <Icono nombre="trending_up" clase="text-[14px]" />
            <span>En el período mostrado</span>
          </div>
        </div>

        <div className="tarjeta-vidrio rounded-2xl p-5 border-l-4 border-l-error">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-error-container rounded-xl">
              <Icono nombre="warning" relleno clase="text-[22px] text-error" />
            </div>
            <span className="text-xs text-error font-bold">Activas</span>
          </div>
          <p className="text-3xl font-bold text-error">{isLoading ? '—' : String(contarEnfermedades).padStart(2, '0')}</p>
          <p className="text-sm text-on-surface-variant mt-1">Enfermedades activas</p>
          {contarEnfermedades > 0 && (
            <p className="mt-3 text-xs text-error">Requiere seguimiento</p>
          )}
        </div>

        <div className="tarjeta-vidrio rounded-2xl p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-tertiary/10 rounded-xl">
              <Icono nombre="monitoring" clase="text-[22px] text-tertiary" />
            </div>
          </div>
          <p className="text-3xl font-bold text-tertiary">{isLoading ? '—' : meta?.total ?? 0}</p>
          <p className="text-sm text-on-surface-variant mt-1">Consultas registradas</p>
          <div className="mt-3 w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
            <div className="bg-tertiary h-full" style={{ width: '70%' }} />
          </div>
        </div>
      </motion.div>

      {/* Cabecera con acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-bold text-xl text-on-surface">Línea de Tiempo Médica</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className={`boton boton-secundario gap-2 text-sm ${mostrarFiltros ? 'ring-2 ring-primary/40' : ''}`}
          >
            <Icono nombre="filter_list" clase="text-[18px]" />
            Filtros
          </button>
          <button
            onClick={() => setMostrarFormulario(true)}
            className="boton boton-primario gap-2 text-sm"
          >
            <Icono nombre="add" clase="text-[18px]" />
            Nueva consulta
          </button>
        </div>
      </div>

      {/* Panel filtros */}
      <AnimatePresence>
        {mostrarFiltros && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="tarjeta-vidrio rounded-2xl p-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Icono nombre="search" clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
                  <input
                    type="text"
                    placeholder="Buscar por animal (identificación o nombre)..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="campo-entrada pl-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Desde</label>
                  <CampoFecha
                    value={desdeFiltro ?? ''}
                    onChange={(valor) => {
                      const p = new URLSearchParams(searchParams);
                      if (valor) p.set('desde', valor); else p.delete('desde');
                      setSearchParams(p); setPaginaActual(1);
                    }}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">Hasta</label>
                  <CampoFecha
                    value={hastaFiltro ?? ''}
                    onChange={(valor) => {
                      const p = new URLSearchParams(searchParams);
                      if (valor) p.set('hasta', valor); else p.delete('hasta');
                      setSearchParams(p); setPaginaActual(1);
                    }}
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline de registros */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : registros.length === 0 ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
            <Icono nombre="medical_services" clase="text-[32px] text-outline" />
          </div>
          <p className="font-medium text-on-surface-variant">Sin registros médicos</p>
          <p className="text-xs text-outline mt-1">Registre la primera consulta clínica</p>
          <button
            onClick={() => setMostrarFormulario(true)}
            className="boton boton-primario mt-4 text-sm gap-2"
          >
            <Icono nombre="add" clase="text-[18px]" />
            Nueva consulta
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {registros.map((reg) => {
            const tieneEnfermedadActiva = reg.enfermedades.some((e) => e.activa);
            const tieneTratamientoEnCurso = reg.tratamientos.some((t) => t.estado === 'EN_CURSO');
            const pruebasPendientes = reg.pruebasComplementarias.filter((p) => !p.resultado).length;

            return (
              <motion.div
                key={reg.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="tarjeta-vidrio rounded-2xl p-5 flex gap-4 items-start
                           cursor-pointer hover:border-primary/30 transition-all group"
                onClick={() => setHistorialSeleccionado(reg)}
              >
                {/* Ícono de tipo + línea vertical */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform duration-300
                    ${tieneEnfermedadActiva
                      ? 'bg-error-container text-error'
                      : tieneTratamientoEnCurso
                      ? 'bg-surface-container-high text-primary'
                      : 'bg-tertiary/15 text-tertiary'
                    } group-hover:scale-110`}
                  >
                    <Icono
                      nombre={tieneEnfermedadActiva ? 'warning' : tieneTratamientoEnCurso ? 'medication' : 'task_alt'}
                      relleno={tieneEnfermedadActiva}
                      clase="text-[20px]"
                    />
                  </div>
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-2">
                    <div>
                      <h4 className="font-bold text-base text-on-surface line-clamp-1">
                        {reg.motivoConsulta}
                      </h4>
                      <p className="text-xs text-on-surface-variant">
                        #{reg.animal.numeroIdentificacion}
                        {reg.animal.nombre && ` · ${reg.animal.nombre}`}
                        {` · ${reg.animal.lote?.finca?.nombre ?? ''}`}
                      </p>
                    </div>
                    <span className="text-xs text-on-surface-variant whitespace-nowrap flex-shrink-0">
                      {new Date(reg.fechaConsulta).toLocaleDateString('es-VE', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>

                  {reg.enfermedades.length > 0 && (
                    <p className="text-sm text-on-surface-variant line-clamp-2 mb-3">
                      {reg.enfermedades[0].diagnosticoDefinitivo || reg.enfermedades[0].nombreEnfermedad}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {/* Veterinario */}
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-container flex items-center justify-center
                                      text-on-primary-container text-[10px] font-bold flex-shrink-0">
                        {reg.veterinario.nombre.charAt(0)}{reg.veterinario.apellido.charAt(0)}
                      </div>
                      <span className="text-xs font-medium text-on-surface-variant">
                        {reg.veterinario.nombre} {reg.veterinario.apellido}
                      </span>
                    </div>

                    {/* Badges de estado */}
                    <div className="flex items-center gap-1.5">
                      {pruebasPendientes > 0 && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs rounded-full font-semibold border border-amber-200">
                          {pruebasPendientes === 1 ? '1 resultado pendiente' : `${pruebasPendientes} resultados pendientes`}
                        </span>
                      )}
                      {tieneEnfermedadActiva && (
                        <span className="px-2.5 py-1 bg-error-container/30 text-error text-xs rounded-full font-semibold border border-error/10">
                          Urgente
                        </span>
                      )}
                      {tieneTratamientoEnCurso && (
                        <span className="px-2.5 py-1 bg-surface-container-high text-on-surface-variant text-xs rounded-full">
                          En Curso
                        </span>
                      )}
                      {!tieneEnfermedadActiva && !tieneTratamientoEnCurso && (
                        <span className="px-2.5 py-1 bg-tertiary/10 text-tertiary text-xs rounded-full font-semibold">
                          Completado
                        </span>
                      )}
                      {/* Acciones */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setMostrarEliminar(reg.id); }}
                        className="p-1.5 text-outline hover:text-error hover:bg-error-container/30 rounded-lg transition-colors"
                      >
                        <Icono nombre="delete" clase="text-[16px]" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      {meta && meta.totalPaginas > 1 && (
        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={meta.totalPaginas}
          totalRegistros={meta.total}
          porPagina={meta.porPagina}
          alCambiarPagina={setPaginaActual}
        />
      )}

      {/* FAB */}
      <button
        onClick={() => setMostrarFormulario(true)}
        className="fixed bottom-20 md:bottom-8 right-5 md:right-8 w-14 h-14 bg-primary text-on-primary rounded-full
                   shadow-[var(--shadow-primary)] flex items-center justify-center
                   hover:scale-110 active:scale-95 transition-transform z-20"
        aria-label="Nueva consulta"
      >
        <Icono nombre="add" clase="text-[28px]" />
      </button>

      {/* Panel de detalle lateral */}
      <AnimatePresence>
        {historialSeleccionado && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-inverse-surface/30 z-40"
              onClick={() => setHistorialSeleccionado(null)}
            />
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[480px] max-w-[95vw] bg-surface-container-lowest shadow-2xl z-50 overflow-y-auto"
            >
              <div className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-on-surface">Detalle de Consulta</h2>
                  <p className="text-xs text-on-surface-variant">
                    {new Date(historialSeleccionado.fechaConsulta).toLocaleDateString('es-VE', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setHistorialSeleccionado(null)}
                  className="p-2 hover:bg-surface-container rounded-xl transition-colors"
                >
                  <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
                </button>
              </div>

              <div className="p-6 space-y-5">

                {/* ── Acciones rápidas ── */}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const r = await clienteHttp.get(`/reportes/consulta/${historialSeleccionado.id}`, {
                          params: { formato: 'pdf' }, responseType: 'blob',
                        });
                        const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
                        const a = document.createElement('a'); a.href = url;
                        a.download = `consulta_${historialSeleccionado.id}.pdf`; a.click();
                        URL.revokeObjectURL(url);
                      } catch { /* silencioso */ }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                               bg-error/10 text-error hover:bg-error/20 transition-colors text-xs font-medium"
                  >
                    <Icono nombre="picture_as_pdf" clase="text-[15px]" />
                    PDF esta consulta
                  </button>
                  <button
                    onClick={() => navigate(`/animales/${historialSeleccionado.animal.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                               bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
                  >
                    <Icono nombre="open_in_new" clase="text-[15px]" />
                    Ver animal
                  </button>
                </div>

                {/* ── Animal ── */}
                <section>
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Animal</p>
                  <p className="text-sm font-semibold text-on-surface">
                    #{historialSeleccionado.animal.numeroIdentificacion}
                    {historialSeleccionado.animal.nombre && ` · ${historialSeleccionado.animal.nombre}`}
                  </p>
                  <p className="text-xs text-on-surface-variant">{historialSeleccionado.animal.lote?.finca?.nombre}</p>
                </section>

                {/* ── Motivo y síntomas ── */}
                <section>
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Motivo de consulta</p>
                  <p className="text-sm text-on-surface bg-surface-container p-3 rounded-xl">{historialSeleccionado.motivoConsulta}</p>
                </section>

                {historialSeleccionado.sintomasObservados && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Signos clínicos</p>
                    <p className="text-sm text-on-surface-variant bg-surface-container p-3 rounded-xl">{historialSeleccionado.sintomasObservados}</p>
                  </section>
                )}

                {/* ── Anamnesis ── */}
                {(historialSeleccionado.tratamientosPrevios || historialSeleccionado.cirugias) && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2 flex items-center gap-1.5">
                      <Icono nombre="history" clase="text-[13px]" /> Anamnesis
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {historialSeleccionado.tratamientosPrevios && (
                        <p className="text-on-surface-variant">Tratamientos previos: <span className="text-on-surface font-medium">{historialSeleccionado.tratamientosPrevios}</span></p>
                      )}
                      {historialSeleccionado.cirugias && (
                        <p className="text-on-surface-variant">Cirugías y enfermedades previas: <span className="text-on-surface font-medium">{historialSeleccionado.cirugias}</span></p>
                      )}
                    </div>
                  </section>
                )}

                {/* ── Exploración física ── */}
                {(historialSeleccionado.temperatura || historialSeleccionado.frecuenciaCardiaca ||
                  historialSeleccionado.frecuenciaRespiratoria || historialSeleccionado.tiempoLlenadoCapilar ||
                  historialSeleccionado.movimientosRuminales || historialSeleccionado.condicionCorporal) && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2 flex items-center gap-1.5">
                      <Icono nombre="monitor_heart" clase="text-[13px]" /> Exploración física
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {historialSeleccionado.temperatura != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">Temperatura</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.temperatura} °C</p>
                        </div>
                      )}
                      {historialSeleccionado.frecuenciaCardiaca != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">Frec. cardíaca</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.frecuenciaCardiaca} lpm</p>
                        </div>
                      )}
                      {historialSeleccionado.frecuenciaRespiratoria != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">Frec. respiratoria</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.frecuenciaRespiratoria} rpm</p>
                        </div>
                      )}
                      {historialSeleccionado.tiempoLlenadoCapilar != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">TLC</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.tiempoLlenadoCapilar} seg</p>
                        </div>
                      )}
                      {historialSeleccionado.movimientosRuminales != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">Mov. ruminales</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.movimientosRuminales}/min</p>
                        </div>
                      )}
                      {historialSeleccionado.condicionCorporal != null && (
                        <div className="bg-surface-container rounded-xl p-2.5">
                          <p className="text-[10px] text-on-surface-variant">Cond. corporal</p>
                          <p className="text-sm font-semibold text-on-surface">{historialSeleccionado.condicionCorporal} / 5</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ── Estado del animal ── */}
                {(historialSeleccionado.estadoReproductivo || historialSeleccionado.litrosLechesDiarios != null || historialSeleccionado.gananciaPeso != null) && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2 flex items-center gap-1.5">
                      <Icono nombre="info" clase="text-[13px]" /> Estado del animal
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {historialSeleccionado.estadoReproductivo && (
                        <p className="text-on-surface-variant">Est. reproductivo: <span className="text-on-surface font-medium">{historialSeleccionado.estadoReproductivo.replace(/_/g, ' ')}</span></p>
                      )}
                      {historialSeleccionado.litrosLechesDiarios != null && (
                        <p className="text-on-surface-variant">Producción leche: <span className="text-on-surface font-medium">{historialSeleccionado.litrosLechesDiarios} L/día</span></p>
                      )}
                      {historialSeleccionado.gananciaPeso != null && (
                        <p className="text-on-surface-variant">Ganancia de peso: <span className="text-on-surface font-medium">{historialSeleccionado.gananciaPeso} kg</span></p>
                      )}
                    </div>
                  </section>
                )}

                {/* ── Diagnóstico ── */}
                {historialSeleccionado.diagnosticoDefinitivo && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Diagnóstico definitivo</p>
                    <p className="text-sm font-medium text-on-surface bg-primary/5 border border-primary/20 p-3 rounded-xl">{historialSeleccionado.diagnosticoDefinitivo}</p>
                  </section>
                )}

                {historialSeleccionado.resultadosPruebas && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Resultados de pruebas</p>
                    <p className="text-sm text-on-surface-variant bg-surface-container p-3 rounded-xl">{historialSeleccionado.resultadosPruebas}</p>
                  </section>
                )}

                {/* ── Pruebas complementarias ── */}
                {historialSeleccionado.pruebasComplementarias.length > 0 && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-3 flex items-center gap-1.5">
                      <Icono nombre="biotech" clase="text-[14px]" /> Pruebas complementarias
                    </p>
                    <div className="space-y-2">
                      {historialSeleccionado.pruebasComplementarias.map((p) => (
                        <TarjetaPruebaComplementaria
                          key={p.id}
                          prueba={p}
                          puedeEditar={tienePrivilegio('historial_medico.crear')}
                          onActualizada={(actualizada) => {
                            setHistorialSeleccionado((h) => h && {
                              ...h,
                              pruebasComplementarias: h.pruebasComplementarias.map((x) => (x.id === actualizada.id ? actualizada : x)),
                            });
                            queryClient.invalidateQueries({ queryKey: ['historialMedico'] });
                          }}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Información epidemiológica ── */}
                {historialSeleccionado.informacionEpidemiologica && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-2 flex items-center gap-1.5">
                      <Icono nombre="coronavirus" clase="text-[13px]" /> Información epidemiológica
                    </p>
                    <div className="bg-surface-container rounded-xl p-3 space-y-1.5 text-sm">
                      {(() => {
                        const ep = historialSeleccionado.informacionEpidemiologica as any;
                        const vectores = [
                          ep.garrapatas && 'Garrapatas',
                          ep.mosquitos && 'Mosquitos',
                          ep.murcielagos && 'Murciélagos',
                          ep.moscas && 'Moscas',
                          ep.otrosVectores,
                        ].filter(Boolean).join(', ');
                        return (
                          <>
                            {vectores && <p className="text-on-surface-variant">Vectores: <span className="text-on-surface font-medium">{vectores}</span></p>}
                            {ep.descripcionEntorno && <p className="text-on-surface-variant">{ep.descripcionEntorno}</p>}
                          </>
                        );
                      })()}
                    </div>
                  </section>
                )}

                {/* ── Enfermedades ── */}
                {historialSeleccionado.enfermedades.length > 0 && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-3 flex items-center gap-1.5">
                      <Icono nombre="bug_report" clase="text-[14px]" /> Enfermedades
                    </p>
                    <div className="space-y-2">
                      {historialSeleccionado.enfermedades.map((e) => (
                        <div key={e.id} className="p-3 rounded-xl bg-surface-container border border-outline-variant/20">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-on-surface">{e.nombreEnfermedad}</span>
                            <div className="flex items-center gap-1.5">
                              {e.nivelGravedad && (
                                <Badge
                                  variante={e.nivelGravedad === 'GRAVE' ? 'rojo' : e.nivelGravedad === 'MODERADA' ? 'amarillo' : 'gris'}
                                  tamano="xs"
                                >
                                  {e.nivelGravedad === 'GRAVE' ? 'Grave' : e.nivelGravedad === 'MODERADA' ? 'Moderada' : 'Leve'}
                                </Badge>
                              )}
                              <Badge variante={e.activa ? 'rojo' : 'gris'} tamano="xs" punto={e.activa}>
                                {e.activa ? 'Activa' : 'Resuelta'}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-on-surface-variant">
                            Inicio: {new Date(e.fechaInicio).toLocaleDateString('es-VE')}
                          </p>
                          {e.descripcionClinica && (
                            <p className="text-xs text-on-surface-variant mt-1">{e.descripcionClinica}</p>
                          )}
                          {(e as any).observaciones && (
                            <p className="text-xs text-on-surface-variant mt-1">{(e as any).observaciones}</p>
                          )}
                          {e.sintomas && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Signos clínicos:</span> {e.sintomas}</p>
                          )}
                          {e.diagnosticoDefinitivo && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Diagnóstico:</span> {e.diagnosticoDefinitivo}</p>
                          )}
                          {e.tiempoEvolucion && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Tiempo de evolución:</span> {e.tiempoEvolucion}</p>
                          )}
                          {e.planDiagnostico && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Plan:</span> {e.planDiagnostico}</p>
                          )}
                          {e.pronostico && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Pronóstico:</span> {e.pronostico}</p>
                          )}
                          {e.pruebasDiagnostico && (
                            <p className="text-xs text-on-surface-variant mt-1"><span className="font-medium text-on-surface">Pruebas:</span> {e.pruebasDiagnostico}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── Tratamientos ── */}
                {historialSeleccionado.tratamientos.length > 0 && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-3 flex items-center gap-1.5">
                      <Icono nombre="medication" clase="text-[14px]" /> Tratamientos
                    </p>
                    <div className="space-y-2">
                      {historialSeleccionado.tratamientos.map((t) => (
                        <div key={t.id} className="p-3 rounded-xl bg-surface-container border border-outline-variant/20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-on-surface">{t.medicamento.nombre}</span>
                            <Badge
                              variante={t.estado === 'COMPLETADO' ? 'verde' : t.estado === 'EN_CURSO' ? 'azul' : 'gris'}
                              tamano="xs"
                            >
                              {t.estado === 'EN_CURSO' ? 'En curso' : t.estado === 'COMPLETADO' ? 'Completado' : t.estado}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 text-xs text-on-surface-variant">
                            <span>Dosis: <strong className="text-on-surface">{t.dosis}</strong></span>
                            <span>Vía: <strong className="text-on-surface">{t.viaAdministracion}</strong></span>
                            <span>Frecuencia: <strong className="text-on-surface">{t.frecuencia}</strong></span>
                            {t.duracionDias && <span>Duración: <strong className="text-on-surface">{t.duracionDias}d</strong></span>}
                          </div>
                          {t.enfermedadDiagnosticada && (
                            <p className="text-xs text-on-surface-variant mt-2 flex items-center gap-1">
                              <Icono nombre="link" clase="text-[12px]" />
                              Para: <strong className="text-on-surface">{t.enfermedadDiagnosticada.nombreEnfermedad}</strong>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Las desparasitaciones ya no se muestran aquí: se identifican
                    directamente por el animal (no por esta consulta puntual),
                    así que se consultan desde el historial completo del animal
                    (PDF "Historial Médico por Animal") en vez de por consulta. */}

                {historialSeleccionado.observaciones && (
                  <section>
                    <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Observaciones generales</p>
                    <p className="text-sm text-on-surface-variant bg-surface-container p-3 rounded-xl">
                      {historialSeleccionado.observaciones}
                    </p>
                  </section>
                )}

                <section className="pt-4 border-t border-outline-variant/20">
                  <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1">Registrado por</p>
                  <p className="text-sm text-on-surface-variant">
                    {historialSeleccionado.veterinario.nombre} {historialSeleccionado.veterinario.apellido}
                  </p>
                </section>

                <button
                  onClick={() => setMostrarEliminar(historialSeleccionado.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                             border border-error/30 text-error hover:bg-error-container/30 transition-colors text-sm font-medium"
                >
                  <Icono nombre="delete" clase="text-[18px]" />
                  Eliminar registro
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Modal nueva consulta */}
      <AnimatePresence>
        {mostrarFormulario && (
          <FormularioConsulta
            onCerrar={() => setMostrarFormulario(false)}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['historialMedico'] });
              setMostrarFormulario(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal eliminar */}
      <ModalConfirmacion
        abierto={!!mostrarEliminar}
        titulo="Eliminar registro médico"
        descripcion="¿Está seguro de eliminar este registro? Esta acción no se puede deshacer."
        textoConfirmar="Eliminar"
        variante="peligro"
        cargando={eliminarMutacion.isPending}
        alConfirmar={() => mostrarEliminar && eliminarMutacion.mutate(mostrarEliminar)}
        alCerrar={() => setMostrarEliminar(null)}
      />
    </div>
  );
}

// ── Formulario nueva consulta ─────────────────────────────────────────────────

const FORM_VACIO: FormHistorial = {
  animalId: '', fechaConsulta: new Date().toISOString().split('T')[0],
  motivoConsulta: '', sintomasObservados: '', observaciones: '',
  tratamientosPrevios: '', cirugias: '',
  temperatura: '', frecuenciaCardiaca: '', frecuenciaRespiratoria: '',
  tiempoLlenadoCapilar: '', movimientosRuminales: '', condicionCorporal: '',
  estadoReproductivo: '', litrosLechesDiarios: '', gananciaPeso: '',
  diagnosticoDefinitivo: '', resultadosPruebas: '',
  epidGarrapatas: false, epidMosquitos: false, epidMurcielagos: false, epidMoscas: false,
  epidOtros: '', epidDescripcion: '',
  desparasitaciones: [],
  vitaminas: [],
  pruebasComplementarias: [],
  enfermedades: [], tratamientos: [],
};

const ETIQUETAS_GRAVEDAD: Record<string, string> = {
  LEVE: 'Leve', MODERADA: 'Moderada', GRAVE: 'Grave',
};

const ETIQUETAS_TIPO_PRUEBA: Record<string, string> = {
  HEMATOLOGIA: 'Hematología completa',
  COPROLOGIA: 'Coprología',
  BIOQUIMICA: 'Bioquímica sanguínea',
  UROANALISIS: 'Uroanálisis',
  CITOLOGIA: 'Citología',
  HISTOPATOLOGIA: 'Histopatología',
  OTRO: 'Otra prueba',
};

// Tarjeta de una prueba complementaria en el panel de detalle. Los
// resultados de laboratorio suelen llegar días después de la consulta, así
// que la prueba se puede guardar sin resultado (queda "Pendiente") y
// completarse aquí más tarde.
function TarjetaPruebaComplementaria({
  prueba, puedeEditar, onActualizada,
}: {
  prueba: PruebaComplementaria;
  puedeEditar: boolean;
  onActualizada: (prueba: PruebaComplementaria) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [resultado, setResultado] = useState(prueba.resultado ?? '');
  const [observaciones, setObservaciones] = useState(prueba.observaciones ?? '');

  const mutacion = useMutation({
    mutationFn: () =>
      clienteHttp
        .patch(`/historial-medico/pruebas-complementarias/${prueba.id}`, { resultado, observaciones })
        .then((r) => r.data.datos as PruebaComplementaria),
    onSuccess: (actualizada) => {
      onActualizada(actualizada);
      setEditando(false);
    },
  });

  const abrirEdicion = () => {
    setResultado(prueba.resultado ?? '');
    setObservaciones(prueba.observaciones ?? '');
    mutacion.reset();
    setEditando(true);
  };

  return (
    <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-medium text-on-surface">{ETIQUETAS_TIPO_PRUEBA[prueba.tipo] ?? prueba.tipo}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!prueba.resultado && <Badge variante="amarillo" tamano="xs" punto>Pendiente</Badge>}
          {prueba.fecha && <span className="text-xs text-on-surface-variant">{new Date(prueba.fecha).toLocaleDateString('es-VE')}</span>}
        </div>
      </div>

      {editando ? (
        <div className="space-y-2 mt-2">
          <CampoLabel etiqueta="Resultado">
            <textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} autoFocus
              placeholder="Ej: Dentro de rango, hematocrito 35%..." className="campo-entrada text-sm resize-none" />
          </CampoLabel>
          <CampoLabel etiqueta="Observaciones">
            <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
              className="campo-entrada text-sm" />
          </CampoLabel>
          {mutacion.isError && (
            <p className="text-xs text-error">No se pudo guardar el resultado. Intente de nuevo.</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(false)} disabled={mutacion.isPending}
              className="flex-1 boton boton-secundario text-sm py-1.5">Cancelar</button>
            <button type="button" onClick={() => mutacion.mutate()} disabled={mutacion.isPending}
              className="flex-1 boton boton-primario text-sm py-1.5">
              {mutacion.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {prueba.resultado
            ? <p className="text-xs text-on-surface-variant whitespace-pre-line">{prueba.resultado}</p>
            : <p className="text-xs text-on-surface-variant italic">Sin resultado registrado</p>}
          {prueba.observaciones && <p className="text-xs text-on-surface-variant mt-1">{prueba.observaciones}</p>}
          {puedeEditar && (
            <button type="button" onClick={abrirEdicion}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Icono nombre={prueba.resultado ? 'edit' : 'add'} clase="text-[14px]" />
              {prueba.resultado ? 'Editar resultado' : 'Registrar resultado'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface PropiedadesFormulario {
  onCerrar: () => void;
  onExito: () => void;
  animalIdPredeterminado?: string;
}

function SeccionClinica({ titulo, icono, children }: { titulo: string; icono: string; children: React.ReactNode }) {
  return (
    <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-low">
        <Icono nombre={icono} clase="text-[16px] text-on-surface-variant" />
        <span className="text-xs font-semibold text-on-surface uppercase tracking-wide">{titulo}</span>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function SelectorMedicamento({
  medicamentos, medicamentoId, medicamentoNombreNuevo, onSeleccionar, onEscribir,
}: {
  medicamentos: MedicamentoOpcion[];
  medicamentoId: string;
  medicamentoNombreNuevo: string;
  onSeleccionar: (id: string, nombre: string) => void;
  onEscribir: (texto: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const refContenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const manejador = (e: MouseEvent) => {
      if (refContenedor.current && !refContenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', manejador);
    return () => document.removeEventListener('mousedown', manejador);
  }, []);

  const seleccionado = medicamentos.find((m) => m.id === medicamentoId);
  const texto = seleccionado ? seleccionado.nombre : medicamentoNombreNuevo;
  const textoNorm = texto.trim().toLowerCase();
  const coincidencias = textoNorm
    ? medicamentos.filter((m) => m.nombre.toLowerCase().includes(textoNorm))
    : medicamentos;
  const coincideExacta = medicamentos.some((m) => m.nombre.toLowerCase() === textoNorm);

  return (
    <div ref={refContenedor} className="relative">
      <input
        type="text"
        value={texto}
        onChange={(e) => { onEscribir(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        placeholder="Seleccione o escriba un medicamento..."
        className="campo-entrada text-sm"
        autoComplete="off"
      />
      {abierto && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-xl
                     border border-outline-variant/30 z-50 overflow-hidden max-h-48 overflow-y-auto"
        >
          {coincidencias.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSeleccionar(m.id, m.nombre); setAbierto(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface-container-low transition-colors
                         border-b border-outline-variant/10 last:border-0 flex items-center gap-2 text-sm"
            >
              <Icono nombre="medication" clase="text-[13px] text-outline flex-shrink-0" />
              {m.nombre}
            </button>
          ))}
          {!!textoNorm && !coincideExacta && (
            <div className="px-3 py-2 flex items-center gap-2 text-primary text-xs bg-primary/5">
              <Icono nombre="add_circle" clase="text-[13px] flex-shrink-0" />
              Se creará un medicamento nuevo: "{texto.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampoLabel({ etiqueta, req, children }: { etiqueta: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
        {etiqueta}{req && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function FormularioConsulta({ onCerrar, onExito, animalIdPredeterminado }: PropiedadesFormulario) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormHistorial>({
    ...FORM_VACIO,
    animalId: animalIdPredeterminado ?? '',
  });
  const [error, setError] = useState('');
  // Índices de desparasitaciones que vinieron pre-cargadas (se muestran con badge)
  const [despPrecargadas, setDespPrecargadas] = useState<Set<number>>(new Set());
  // Enfermedades activas del animal seleccionado (de consultas anteriores), para vincular tratamientos
  const [enfermedadesActivas, setEnfermedadesActivas] = useState<EnfermedadActivaOpcion[]>([]);

  const { data: medicamentos = [] } = useQuery<MedicamentoOpcion[]>({
    queryKey: ['medicamentos-catalogo'],
    queryFn: () => clienteHttp.get('/vacunacion/medicamentos').then((r) => r.data.datos),
  });

  const set = (campo: keyof FormHistorial, valor: any) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  // ── Prefill al seleccionar animal ────────────────────────────────────────────
  const cargarPrefill = async (animalId: string) => {
    if (!animalId) return;
    try {
      const { data } = await clienteHttp.get('/historial-medico/prefill', {
        params: { animalId },
      });
      const { ultimaDesparasitacion, enfermedadesActivas: activas } = data.datos as {
        ultimaDesparasitacion: {
          medicamentoId: string; tipo: string;
          fecha: string; dosis?: string; via?: string;
        } | null;
        enfermedadesActivas: EnfermedadActivaOpcion[];
      };

      setEnfermedadesActivas(activas ?? []);

      if (ultimaDesparasitacion) {
        // Pre-cargar con el último registro — conservar la fecha original
        const fechaOriginal = ultimaDesparasitacion.fecha
          ? new Date(ultimaDesparasitacion.fecha).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        setForm((f) => ({
          ...f,
          animalId,
          desparasitaciones: [
            {
              medicamentoId:   ultimaDesparasitacion.medicamentoId,
              medicamentoNombreNuevo: '',
              medicamentoPrincipioActivoNuevo: '',
              tipo:            ultimaDesparasitacion.tipo,
              fecha:           fechaOriginal,
              dosis:           ultimaDesparasitacion.dosis ?? '',
              via:             ultimaDesparasitacion.via ?? '',
            },
          ],
        }));
        setDespPrecargadas(new Set([0]));
      } else {
        setForm((f) => ({ ...f, animalId }));
        setDespPrecargadas(new Set());
      }
    } catch {
      setForm((f) => ({ ...f, animalId }));
      setEnfermedadesActivas([]);
      setDespPrecargadas(new Set());
    }
  };

  const mutacion = useMutation({
    mutationFn: async (datos: FormHistorial) => {
      const payload: any = {
        animalId:      datos.animalId,
        fechaConsulta: new Date(datos.fechaConsulta).toISOString(),
        motivoConsulta: datos.motivoConsulta,
      };
      if (datos.sintomasObservados)  payload.sintomasObservados  = datos.sintomasObservados;
      if (datos.observaciones)       payload.observaciones        = datos.observaciones;
      if (datos.tratamientosPrevios) payload.tratamientosPrevios  = datos.tratamientosPrevios;
      if (datos.cirugias)            payload.cirugias             = datos.cirugias;
      if (datos.temperatura)         payload.temperatura          = parseFloat(datos.temperatura);
      if (datos.frecuenciaCardiaca)  payload.frecuenciaCardiaca   = parseInt(datos.frecuenciaCardiaca);
      if (datos.frecuenciaRespiratoria) payload.frecuenciaRespiratoria = parseInt(datos.frecuenciaRespiratoria);
      if (datos.tiempoLlenadoCapilar)   payload.tiempoLlenadoCapilar   = parseFloat(datos.tiempoLlenadoCapilar);
      if (datos.movimientosRuminales)   payload.movimientosRuminales   = parseInt(datos.movimientosRuminales);
      if (datos.condicionCorporal)      payload.condicionCorporal      = parseFloat(datos.condicionCorporal);
      if (datos.estadoReproductivo)     payload.estadoReproductivo     = datos.estadoReproductivo;
      if (datos.litrosLechesDiarios)    payload.litrosLechesDiarios    = parseFloat(datos.litrosLechesDiarios);
      if (datos.gananciaPeso)           payload.gananciaPeso           = parseFloat(datos.gananciaPeso);
      if (datos.diagnosticoDefinitivo)  payload.diagnosticoDefinitivo  = datos.diagnosticoDefinitivo;
      if (datos.resultadosPruebas) payload.resultadosPruebas = datos.resultadosPruebas;
      const tieneEpid = datos.epidGarrapatas || datos.epidMosquitos || datos.epidMurcielagos || datos.epidMoscas || datos.epidOtros || datos.epidDescripcion;
      if (tieneEpid) {
        payload.informacionEpidemiologica = {
          garrapatas: datos.epidGarrapatas, mosquitos: datos.epidMosquitos,
          murcielagos: datos.epidMurcielagos, moscas: datos.epidMoscas,
          otrosVectores: datos.epidOtros || undefined,
          descripcionEntorno: datos.epidDescripcion || undefined,
        };
      }
      if (datos.desparasitaciones.length) {
        payload.desparasitaciones = await Promise.all(datos.desparasitaciones.map(async (d) => {
          let medicamentoId = d.medicamentoId;
          // Si se escribió un medicamento que no existe en el catálogo, se crea primero
          if (!medicamentoId && d.medicamentoNombreNuevo) {
            // sinCola: hace falta el id del medicamento de inmediato para
            // poder registrar la desparasitación con él.
            const { data: dataMed } = await clienteHttp.post('/vacunacion/medicamentos', {
              nombre: d.medicamentoNombreNuevo,
              ...(d.medicamentoPrincipioActivoNuevo && { principioActivo: d.medicamentoPrincipioActivoNuevo }),
            }, { sinCola: true });
            medicamentoId = dataMed.datos.id;
            queryClient.invalidateQueries({ queryKey: ['medicamentos-catalogo'] });
          }
          return {
            tipo: d.tipo,
            medicamentoId,
            fecha: new Date(d.fecha).toISOString(),
            dosis: d.dosis || undefined,
            via: d.via || undefined,
          };
        }));
      }
      if (datos.vitaminas.length) {
        payload.vitaminas = await Promise.all(datos.vitaminas.map(async (v) => {
          let medicamentoId = v.medicamentoId;
          // Igual que en desparasitaciones: si se escribió un medicamento
          // que no existe en el catálogo, se crea primero.
          if (!medicamentoId && v.medicamentoNombreNuevo) {
            const { data: dataMed } = await clienteHttp.post('/vacunacion/medicamentos', {
              nombre: v.medicamentoNombreNuevo,
            }, { sinCola: true });
            medicamentoId = dataMed.datos.id;
            queryClient.invalidateQueries({ queryKey: ['medicamentos-catalogo'] });
          }
          return {
            medicamentoId,
            fecha: new Date(v.fecha).toISOString(),
            dosis: v.dosis || undefined,
            via: v.via || undefined,
          };
        }));
      }
      if (datos.pruebasComplementarias.length) {
        payload.pruebasComplementarias = datos.pruebasComplementarias.map((p) => ({
          tipo: p.tipo,
          fecha: p.fecha ? new Date(p.fecha).toISOString() : undefined,
          resultado: p.resultado || undefined,
          observaciones: p.observaciones || undefined,
        }));
      }
      if (datos.enfermedades.length) {
        payload.enfermedades = datos.enfermedades.map((en) => ({
          nombreEnfermedad: en.nombreEnfermedad,
          nivelGravedad: en.nivelGravedad || undefined,
          fechaInicio: new Date(en.fechaInicio).toISOString(),
          descripcionClinica: en.descripcionClinica || undefined,
          diagnosticoDefinitivo: en.diagnosticoDefinitivo || undefined,
          pronostico: en.pronostico || undefined,
          planDiagnostico: en.planDiagnostico || undefined,
          tiempoEvolucion: en.tiempoEvolucion || undefined,
          sintomas: en.sintomas || undefined,
          pruebasDiagnostico: en.pruebasDiagnostico || undefined,
        }));
      }
      if (datos.tratamientos.length) {
        payload.tratamientos = await Promise.all(datos.tratamientos.map(async (t) => {
          let medicamentoId = t.medicamentoId;
          // Igual que en desparasitaciones: si se escribió un medicamento
          // que no existe en el catálogo, se crea primero.
          if (!medicamentoId && t.medicamentoNombreNuevo) {
            // sinCola: hace falta el id del medicamento de inmediato para
            // poder registrar el tratamiento con él.
            const { data: dataMed } = await clienteHttp.post('/vacunacion/medicamentos', {
              nombre: t.medicamentoNombreNuevo,
            }, { sinCola: true });
            medicamentoId = dataMed.datos.id;
            queryClient.invalidateQueries({ queryKey: ['medicamentos-catalogo'] });
          }
          return {
            medicamentoId,
            enfermedadDiagnosticadaId: t.enfermedadDiagnosticadaId || undefined,
            fechaInicio: new Date(t.fechaInicio).toISOString(),
            dosis: t.dosis,
            viaAdministracion: t.viaAdministracion,
            frecuencia: t.frecuencia,
            duracionDias: t.duracionDias ? parseInt(t.duracionDias) : undefined,
            observaciones: t.observaciones || undefined,
          };
        }));
      }
      return clienteHttp.post('/historial-medico', payload, { descripcionOffline: 'Consulta médica' });
    },
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al guardar la consulta'),
  });

  const agregarEnfermedad = () =>
    setForm((f) => ({
      ...f,
      enfermedades: [...f.enfermedades, {
        nombreEnfermedad: '', nivelGravedad: '', fechaInicio: new Date().toISOString().split('T')[0], descripcionClinica: '',
        diagnosticoDefinitivo: '', pronostico: '', planDiagnostico: '', tiempoEvolucion: '', sintomas: '', pruebasDiagnostico: '',
      }],
    }));

  const agregarTratamiento = () =>
    setForm((f) => ({
      ...f,
      tratamientos: [...f.tratamientos, { medicamentoId: '', medicamentoNombreNuevo: '', enfermedadDiagnosticadaId: '', fechaInicio: new Date().toISOString().split('T')[0], dosis: '', viaAdministracion: '', frecuencia: '', duracionDias: '', observaciones: '' }],
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.animalId)       { setError('Debe seleccionar un animal'); return; }
    if (!form.motivoConsulta) { setError('El motivo de consulta es requerido'); return; }
    if (form.tratamientos.some((t) => !t.medicamentoId && !t.medicamentoNombreNuevo)) {
      setError('Cada tratamiento debe tener un medicamento seleccionado o escrito');
      return;
    }
    if (form.vitaminas.some((v) => !v.medicamentoId && !v.medicamentoNombreNuevo)) {
      setError('Cada vitamina debe tener un producto seleccionado o escrito');
      return;
    }
    setError('');
    mutacion.mutate(form);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-inverse-surface/40 z-40" onClick={onCerrar} />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
          {/* Header fijo */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 flex-shrink-0">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="medical_services" clase="text-[20px] text-primary" />
              Nueva Consulta Médica
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          {/* Cuerpo scrollable */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            {/* ── 1. Identificación ── */}
            <SeccionClinica titulo="Identificación" icono="badge">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <BuscadorAnimal etiqueta="Animal" requerido valor={form.animalId}
                    alSeleccionar={(id) => {
                      setDespPrecargadas(new Set());
                      setEnfermedadesActivas([]);
                      setForm((f) => ({ ...f, animalId: id, desparasitaciones: [], vitaminas: [] }));
                      if (id) cargarPrefill(id);
                    }}
                    placeholder="Buscar por identificación o nombre..."
                    error={!form.animalId && error === 'Debe seleccionar un animal' ? error : undefined} />
                </div>
                <CampoLabel etiqueta="Fecha de consulta" req>
                  <CampoFecha value={form.fechaConsulta} onChange={(valor) => set('fechaConsulta', valor)} />
                </CampoLabel>
              </div>
            </SeccionClinica>

            {/* ── 2. Anamnesis ── */}
            <SeccionClinica titulo="Anamnesis" icono="history_edu">
              <CampoLabel etiqueta="Motivo de consulta" req>
                <input type="text" value={form.motivoConsulta}
                  onChange={(e) => set('motivoConsulta', e.target.value)}
                  placeholder="Ej: Fiebre, cojera, control rutinario..." className="campo-entrada" />
              </CampoLabel>
              <CampoLabel etiqueta="Signos clínicos">
                <textarea rows={2} value={form.sintomasObservados}
                  onChange={(e) => set('sintomasObservados', e.target.value)}
                  placeholder="Describa los signos clínicos observados..." className="campo-entrada resize-none" />
              </CampoLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CampoLabel etiqueta="Tratamientos previos">
                  <textarea rows={2} value={form.tratamientosPrevios}
                    onChange={(e) => set('tratamientosPrevios', e.target.value)}
                    placeholder="Medicamentos o tratamientos aplicados antes..." className="campo-entrada resize-none" />
                </CampoLabel>
                <CampoLabel etiqueta="Cirugías y enfermedades previas">
                  <textarea rows={2} value={form.cirugias}
                    onChange={(e) => set('cirugias', e.target.value)}
                    placeholder="Historial quirúrgico y enfermedades previas relevantes..." className="campo-entrada resize-none" />
                </CampoLabel>
              </div>
            </SeccionClinica>

            {/* ── 3. Exploración física ── */}
            <SeccionClinica titulo="Exploración Física" icono="stethoscope">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { campo: 'temperatura', et: 'Temperatura (°C)', ph: '38.5', step: '0.1' },
                  { campo: 'frecuenciaCardiaca', et: 'Frec. Cardíaca (lpm)', ph: '60', step: '1' },
                  { campo: 'frecuenciaRespiratoria', et: 'Frec. Respiratoria (rpm)', ph: '20', step: '1' },
                  { campo: 'tiempoLlenadoCapilar', et: 'T. Llenado Capilar (seg)', ph: '1.5', step: '0.5' },
                  { campo: 'movimientosRuminales', et: 'Mov. Ruminales (2 min)', ph: '2', step: '1' },
                  { campo: 'condicionCorporal', et: 'Condición Corporal (1–5)', ph: '3', step: '0.5' },
                ].map(({ campo, et, ph, step }) => (
                  <CampoLabel key={campo} etiqueta={et}>
                    <input type="number" step={step} value={(form as any)[campo]}
                      onChange={(e) => set(campo as keyof FormHistorial, e.target.value)}
                      placeholder={ph} className="campo-entrada" />
                  </CampoLabel>
                ))}
              </div>
            </SeccionClinica>

            {/* ── 4. Estado del animal ── */}
            <SeccionClinica titulo="Estado del Animal" icono="monitor_heart">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CampoLabel etiqueta="Estado reproductivo">
                  <select value={form.estadoReproductivo} onChange={(e) => set('estadoReproductivo', e.target.value)} className="campo-entrada">
                    <option value="">No especificado</option>
                    <option value="ENTERO">Entero/Íntegro</option>
                    <option value="CASTRADO">Castrado</option>
                    <option value="LACTANTE">Lactante</option>
                    <option value="GESTANTE">Gestante</option>
                  </select>
                </CampoLabel>
                <CampoLabel etiqueta="Litros de leche/día">
                  <input type="number" step="0.1" value={form.litrosLechesDiarios}
                    onChange={(e) => set('litrosLechesDiarios', e.target.value)}
                    placeholder="Ej: 8.5" className="campo-entrada" />
                </CampoLabel>
                <CampoLabel etiqueta="Ganancia de peso (kg)">
                  <input type="number" step="0.1" value={form.gananciaPeso}
                    onChange={(e) => set('gananciaPeso', e.target.value)}
                    placeholder="Ej: 12" className="campo-entrada" />
                </CampoLabel>
              </div>
            </SeccionClinica>

            {/* ── 5. Información epidemiológica ── */}
            <SeccionClinica titulo="Información Epidemiológica" icono="pest_control">
              <p className="text-xs text-on-surface-variant mb-2">Vectores presentes en el entorno:</p>
              <div className="flex flex-wrap gap-3 mb-3">
                {[
                  { campo: 'epidGarrapatas', et: 'Garrapatas', ico: 'bug_report' },
                  { campo: 'epidMosquitos',  et: 'Mosquitos',  ico: 'coronavirus' },
                  { campo: 'epidMurcielagos',et: 'Murciélagos',ico: 'cruelty_free' },
                  { campo: 'epidMoscas',     et: 'Moscas',     ico: 'pest_control' },
                ].map(({ campo, et, ico }) => (
                  <label key={campo} className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl border border-outline-variant/30 hover:bg-surface-container transition-colors">
                    <input type="checkbox" checked={(form as any)[campo]}
                      onChange={(e) => set(campo as keyof FormHistorial, e.target.checked)}
                      className="accent-primary w-4 h-4" />
                    <Icono nombre={ico} clase="text-[14px] text-on-surface-variant" />
                    <span className="text-xs font-medium text-on-surface">{et}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CampoLabel etiqueta="Otros vectores">
                  <input type="text" value={form.epidOtros}
                    onChange={(e) => set('epidOtros', e.target.value)}
                    placeholder="Ej: Tábanos, nuches..." className="campo-entrada" />
                </CampoLabel>
                <CampoLabel etiqueta="Descripción del entorno">
                  <input type="text" value={form.epidDescripcion}
                    onChange={(e) => set('epidDescripcion', e.target.value)}
                    placeholder="Zona húmeda, potrero inundado..." className="campo-entrada" />
                </CampoLabel>
              </div>
            </SeccionClinica>

            {/* ── 6. Diagnóstico y plan ── */}
            <SeccionClinica titulo="Diagnóstico y Plan" icono="lab_panel">
              <p className="text-xs text-on-surface-variant -mt-1">
                El diagnóstico, pronóstico, plan y pruebas de cada condición se registran en "Enfermedades Diagnosticadas" más abajo.
              </p>
              <CampoLabel etiqueta="Diagnóstico definitivo">
                <input type="text" value={form.diagnosticoDefinitivo}
                  onChange={(e) => set('diagnosticoDefinitivo', e.target.value)}
                  placeholder="Confirmado post ayudas diagnósticas..." className="campo-entrada" />
              </CampoLabel>
              <CampoLabel etiqueta="Resultados de pruebas (Tuberculosis / Brucelosis, control de rutina)">
                <textarea rows={2} value={form.resultadosPruebas}
                  onChange={(e) => set('resultadosPruebas', e.target.value)}
                  placeholder="Resultados de pruebas obligatorias, fechas, estado..." className="campo-entrada resize-none" />
              </CampoLabel>
              <CampoLabel etiqueta="Observaciones generales">
                <textarea rows={2} value={form.observaciones}
                  onChange={(e) => set('observaciones', e.target.value)}
                  placeholder="Notas adicionales de la consulta..." className="campo-entrada resize-none" />
              </CampoLabel>
            </SeccionClinica>

            {/* ── 7. Enfermedades diagnosticadas ── */}
            <SeccionClinica titulo="Enfermedades Diagnosticadas" icono="bug_report">
              {form.enfermedades.map((enf, idx) => (
                <div key={idx} className="p-3 bg-surface-container rounded-xl space-y-2 relative">
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, enfermedades: f.enfermedades.filter((_, i) => i !== idx) }))}
                    className="absolute top-2 right-2 p-1 text-outline hover:text-error rounded-lg transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CampoLabel etiqueta="Nombre de la enfermedad">
                      <input type="text" value={enf.nombreEnfermedad}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].nombreEnfermedad = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Ej: Mastitis, fiebre aftosa..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Nivel de gravedad">
                      <select value={enf.nivelGravedad}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].nivelGravedad = e.target.value; return { ...f, enfermedades: arr }; })}
                        className="campo-entrada text-sm">
                        <option value="">No especificado</option>
                        {Object.entries(ETIQUETAS_GRAVEDAD).map(([val, et]) => <option key={val} value={val}>{et}</option>)}
                      </select>
                    </CampoLabel>
                    <CampoLabel etiqueta="Fecha de inicio">
                      <CampoFecha value={enf.fechaInicio}
                        onChange={(valor) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].fechaInicio = valor; return { ...f, enfermedades: arr }; })}
                        className="text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Descripción clínica">
                      <input type="text" value={enf.descripcionClinica}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].descripcionClinica = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Hallazgos relevantes..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Signos clínicos">
                      <input type="text" value={enf.sintomas}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].sintomas = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Signos clínicos asociados a esta condición..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Tiempo de evolución">
                      <input type="text" value={enf.tiempoEvolucion}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].tiempoEvolucion = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Ej: 3 días, 2 semanas" className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Diagnóstico">
                      <input type="text" value={enf.diagnosticoDefinitivo}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].diagnosticoDefinitivo = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Diagnóstico de esta condición..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Pronóstico">
                      <input type="text" value={enf.pronostico}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].pronostico = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Favorable, reservado, grave..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Plan diagnóstico">
                      <input type="text" value={enf.planDiagnostico}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].planDiagnostico = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Pruebas a solicitar..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Pruebas diagnóstico">
                      <input type="text" value={enf.pruebasDiagnostico}
                        onChange={(e) => setForm((f) => { const arr = [...f.enfermedades]; arr[idx].pruebasDiagnostico = e.target.value; return { ...f, enfermedades: arr }; })}
                        placeholder="Resultados de exámenes de esta condición..." className="campo-entrada text-sm" />
                    </CampoLabel>
                  </div>
                </div>
              ))}
              <button type="button" onClick={agregarEnfermedad}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors">
                <Icono nombre="add" clase="text-[16px]" /> Agregar enfermedad diagnosticada
              </button>
            </SeccionClinica>

            {/* ── 8. Tratamientos ── */}
            <SeccionClinica titulo="Tratamientos" icono="medication">
              {!form.animalId && form.tratamientos.length === 0 && (
                <p className="text-xs text-on-surface-variant">Seleccione un animal para poder vincular un tratamiento a una enfermedad activa anterior.</p>
              )}
              {form.tratamientos.map((trat, idx) => (
                <div key={idx} className="p-3 bg-surface-container rounded-xl space-y-2 relative">
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, tratamientos: f.tratamientos.filter((_, i) => i !== idx) }))}
                    className="absolute top-2 right-2 p-1 text-outline hover:text-error rounded-lg transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CampoLabel etiqueta="Medicamento *">
                      <SelectorMedicamento
                        medicamentos={medicamentos}
                        medicamentoId={trat.medicamentoId}
                        medicamentoNombreNuevo={trat.medicamentoNombreNuevo}
                        onSeleccionar={(id) => setForm((f) => {
                          const arr = [...f.tratamientos];
                          arr[idx] = { ...arr[idx], medicamentoId: id, medicamentoNombreNuevo: '' };
                          return { ...f, tratamientos: arr };
                        })}
                        onEscribir={(texto) => setForm((f) => {
                          const arr = [...f.tratamientos];
                          arr[idx] = { ...arr[idx], medicamentoId: '', medicamentoNombreNuevo: texto };
                          return { ...f, tratamientos: arr };
                        })}
                      />
                    </CampoLabel>
                    <CampoLabel etiqueta="Enfermedad que atiende">
                      <select value={trat.enfermedadDiagnosticadaId}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].enfermedadDiagnosticadaId = e.target.value; return { ...f, tratamientos: arr }; })}
                        className="campo-entrada text-sm">
                        <option value="">Sin vincular</option>
                        {enfermedadesActivas.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nombreEnfermedad} ({new Date(e.fechaInicio).toLocaleDateString('es-VE')})
                          </option>
                        ))}
                      </select>
                    </CampoLabel>
                    <CampoLabel etiqueta="Fecha de inicio">
                      <CampoFecha value={trat.fechaInicio}
                        onChange={(valor) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].fechaInicio = valor; return { ...f, tratamientos: arr }; })}
                        className="text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Dosis">
                      <input type="text" value={trat.dosis}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].dosis = e.target.value; return { ...f, tratamientos: arr }; })}
                        placeholder="Ej: 10 ml" className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Vía de administración">
                      <input type="text" value={trat.viaAdministracion}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].viaAdministracion = e.target.value; return { ...f, tratamientos: arr }; })}
                        placeholder="Intramuscular, oral..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Frecuencia">
                      <input type="text" value={trat.frecuencia}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].frecuencia = e.target.value; return { ...f, tratamientos: arr }; })}
                        placeholder="Cada 12 horas, diario..." className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Duración (días)">
                      <input type="number" min="1" value={trat.duracionDias}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].duracionDias = e.target.value; return { ...f, tratamientos: arr }; })}
                        placeholder="Ej: 5" className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Observaciones">
                      <input type="text" value={trat.observaciones}
                        onChange={(e) => setForm((f) => { const arr = [...f.tratamientos]; arr[idx].observaciones = e.target.value; return { ...f, tratamientos: arr }; })}
                        placeholder="Notas adicionales..." className="campo-entrada text-sm" />
                    </CampoLabel>
                  </div>
                </div>
              ))}
              <button type="button" onClick={agregarTratamiento}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors">
                <Icono nombre="add" clase="text-[16px]" /> Agregar tratamiento
              </button>
            </SeccionClinica>

            {/* ── 9. Programa de desparasitación ── */}
            <SeccionClinica titulo="Programa de Desparasitación" icono="vaccines">

              {/* Banner informativo cuando hay datos pre-cargados */}
              {despPrecargadas.size > 0 && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-tertiary/10 border border-tertiary/20 rounded-xl text-xs text-on-surface mb-1">
                  <Icono nombre="auto_awesome" clase="text-[15px] text-tertiary flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-tertiary">Pre-cargado automáticamente</span>
                    <span className="text-on-surface-variant"> — datos del último registro de desparasitación del animal. Verifique y ajuste antes de guardar. Al guardar, se registrará también en el módulo de Vacunación.</span>
                  </div>
                </div>
              )}

              {form.desparasitaciones.map((desp, idx) => (
                <div key={idx} className={`p-3 rounded-xl space-y-2 relative ${despPrecargadas.has(idx) ? 'bg-tertiary/5 border border-tertiary/25' : 'bg-surface-container'}`}>
                  {/* Badge pre-cargado */}
                  {despPrecargadas.has(idx) && (
                    <span className="absolute top-2 left-3 text-[10px] font-semibold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">
                      Pre-cargado
                    </span>
                  )}
                  <button type="button"
                    onClick={() => {
                      setForm((f) => ({ ...f, desparasitaciones: f.desparasitaciones.filter((_, i) => i !== idx) }));
                      setDespPrecargadas((prev) => {
                        const next = new Set<number>();
                        prev.forEach((i) => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
                        return next;
                      });
                    }}
                    className="absolute top-2 right-2 p-1 text-outline hover:text-error rounded-lg transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 ${despPrecargadas.has(idx) ? 'mt-5' : ''}`}>
                    <div className="sm:col-span-1">
                      <CampoLabel etiqueta="Medicamento *">
                        <SelectorMedicamento
                          medicamentos={medicamentos}
                          medicamentoId={desp.medicamentoId}
                          medicamentoNombreNuevo={desp.medicamentoNombreNuevo}
                          onSeleccionar={(id) => setForm((f) => {
                            const arr = [...f.desparasitaciones];
                            arr[idx] = { ...arr[idx], medicamentoId: id, medicamentoNombreNuevo: '', medicamentoPrincipioActivoNuevo: '' };
                            return { ...f, desparasitaciones: arr };
                          })}
                          onEscribir={(texto) => setForm((f) => {
                            const arr = [...f.desparasitaciones];
                            arr[idx] = { ...arr[idx], medicamentoId: '', medicamentoNombreNuevo: texto };
                            return { ...f, desparasitaciones: arr };
                          })}
                        />
                      </CampoLabel>
                    </div>
                    {!desp.medicamentoId && desp.medicamentoNombreNuevo && (
                      <CampoLabel etiqueta="Principio activo (medicamento nuevo)">
                        <input type="text" value={desp.medicamentoPrincipioActivoNuevo}
                          onChange={(e) => setForm((f) => { const arr = [...f.desparasitaciones]; arr[idx].medicamentoPrincipioActivoNuevo = e.target.value; return { ...f, desparasitaciones: arr }; })}
                          placeholder="Ej: Ivermectina" className="campo-entrada text-sm" />
                      </CampoLabel>
                    )}
                    <CampoLabel etiqueta="Tipo">
                      <select value={desp.tipo}
                        onChange={(e) => setForm((f) => { const arr = [...f.desparasitaciones]; arr[idx].tipo = e.target.value; return { ...f, desparasitaciones: arr }; })}
                        className="campo-entrada text-sm">
                        <option value="ECTOPARASITO">Ectoparásito</option>
                        <option value="ENDOPARASITO">Endoparásito</option>
                        <option value="AMBOS">Ambos</option>
                      </select>
                    </CampoLabel>
                    <CampoLabel etiqueta="Fecha">
                      <CampoFecha value={desp.fecha}
                        onChange={(valor) => setForm((f) => { const arr = [...f.desparasitaciones]; arr[idx].fecha = valor; return { ...f, desparasitaciones: arr }; })}
                        className="text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Dosis">
                      <input type="text" value={desp.dosis}
                        onChange={(e) => setForm((f) => { const arr = [...f.desparasitaciones]; arr[idx].dosis = e.target.value; return { ...f, desparasitaciones: arr }; })}
                        placeholder="Ej: 1 ml/50 kg" className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Vía">
                      <input type="text" value={desp.via}
                        onChange={(e) => setForm((f) => { const arr = [...f.desparasitaciones]; arr[idx].via = e.target.value; return { ...f, desparasitaciones: arr }; })}
                        placeholder="Subcutánea, oral, pour-on" className="campo-entrada text-sm" />
                    </CampoLabel>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => {
                  setForm((f) => ({
                    ...f,
                    desparasitaciones: [...f.desparasitaciones, { medicamentoId: '', medicamentoNombreNuevo: '', medicamentoPrincipioActivoNuevo: '', tipo: 'AMBOS', fecha: new Date().toISOString().split('T')[0], dosis: '', via: '' }],
                  }));
                }}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors">
                <Icono nombre="add" clase="text-[16px]" /> Agregar desparasitación
              </button>

              {/* Nota sobre sincronización con vacunación */}
              <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 pt-1">
                <Icono nombre="info" clase="text-[13px]" />
                Las desparasitaciones guardadas aquí se registrarán automáticamente en el módulo de Vacunación si existe un calendario de desparasitación activo.
              </p>
            </SeccionClinica>

            {/* ── 10. Vitaminas ── */}
            <SeccionClinica titulo="Vitaminas" icono="water_drop">
              {form.vitaminas.map((vit, idx) => (
                <div key={idx} className="p-3 rounded-xl space-y-2 relative bg-surface-container">
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, vitaminas: f.vitaminas.filter((_, i) => i !== idx) }))}
                    className="absolute top-2 right-2 p-1 text-outline hover:text-error rounded-lg transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1">
                      <CampoLabel etiqueta="Vitamina/producto *">
                        <SelectorMedicamento
                          medicamentos={medicamentos}
                          medicamentoId={vit.medicamentoId}
                          medicamentoNombreNuevo={vit.medicamentoNombreNuevo}
                          onSeleccionar={(id) => setForm((f) => {
                            const arr = [...f.vitaminas];
                            arr[idx] = { ...arr[idx], medicamentoId: id, medicamentoNombreNuevo: '' };
                            return { ...f, vitaminas: arr };
                          })}
                          onEscribir={(texto) => setForm((f) => {
                            const arr = [...f.vitaminas];
                            arr[idx] = { ...arr[idx], medicamentoId: '', medicamentoNombreNuevo: texto };
                            return { ...f, vitaminas: arr };
                          })}
                        />
                      </CampoLabel>
                    </div>
                    <CampoLabel etiqueta="Fecha">
                      <CampoFecha value={vit.fecha}
                        onChange={(valor) => setForm((f) => { const arr = [...f.vitaminas]; arr[idx].fecha = valor; return { ...f, vitaminas: arr }; })}
                        className="text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Dosis">
                      <input type="text" value={vit.dosis}
                        onChange={(e) => setForm((f) => { const arr = [...f.vitaminas]; arr[idx].dosis = e.target.value; return { ...f, vitaminas: arr }; })}
                        placeholder="Ej: 10 ml" className="campo-entrada text-sm" />
                    </CampoLabel>
                    <CampoLabel etiqueta="Vía">
                      <input type="text" value={vit.via}
                        onChange={(e) => setForm((f) => { const arr = [...f.vitaminas]; arr[idx].via = e.target.value; return { ...f, vitaminas: arr }; })}
                        placeholder="Intramuscular, oral..." className="campo-entrada text-sm" />
                    </CampoLabel>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => {
                  setForm((f) => ({
                    ...f,
                    vitaminas: [...f.vitaminas, { medicamentoId: '', medicamentoNombreNuevo: '', fecha: new Date().toISOString().split('T')[0], dosis: '', via: '' }],
                  }));
                }}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors">
                <Icono nombre="add" clase="text-[16px]" /> Agregar vitamina
              </button>
            </SeccionClinica>

            {/* ── 11. Pruebas complementarias ── */}
            <SeccionClinica titulo="Pruebas Complementarias" icono="biotech">
              {form.pruebasComplementarias.map((prueba, idx) => (
                <div key={idx} className="p-3 rounded-xl space-y-2 relative bg-surface-container">
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, pruebasComplementarias: f.pruebasComplementarias.filter((_, i) => i !== idx) }))}
                    className="absolute top-2 right-2 p-1 text-outline hover:text-error rounded-lg transition-colors">
                    <Icono nombre="close" clase="text-[14px]" />
                  </button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CampoLabel etiqueta="Tipo de prueba *">
                      <select value={prueba.tipo}
                        onChange={(e) => setForm((f) => { const arr = [...f.pruebasComplementarias]; arr[idx].tipo = e.target.value; return { ...f, pruebasComplementarias: arr }; })}
                        className="campo-entrada text-sm">
                        {Object.entries(ETIQUETAS_TIPO_PRUEBA).map(([valor, etiqueta]) => (
                          <option key={valor} value={valor}>{etiqueta}</option>
                        ))}
                      </select>
                    </CampoLabel>
                    <CampoLabel etiqueta="Fecha">
                      <CampoFecha value={prueba.fecha}
                        onChange={(valor) => setForm((f) => { const arr = [...f.pruebasComplementarias]; arr[idx].fecha = valor; return { ...f, pruebasComplementarias: arr }; })}
                        className="text-sm" />
                    </CampoLabel>
                  </div>
                  <CampoLabel etiqueta="Resultado">
                    <input type="text" value={prueba.resultado}
                      onChange={(e) => setForm((f) => { const arr = [...f.pruebasComplementarias]; arr[idx].resultado = e.target.value; return { ...f, pruebasComplementarias: arr }; })}
                      placeholder="Ej: Dentro de rango, hematocrito 35%..." className="campo-entrada text-sm" />
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Si el laboratorio aún no lo entrega, déjelo en blanco y regístrelo luego desde el detalle de la consulta.
                    </p>
                  </CampoLabel>
                  <CampoLabel etiqueta="Observaciones">
                    <input type="text" value={prueba.observaciones}
                      onChange={(e) => setForm((f) => { const arr = [...f.pruebasComplementarias]; arr[idx].observaciones = e.target.value; return { ...f, pruebasComplementarias: arr }; })}
                      className="campo-entrada text-sm" />
                  </CampoLabel>
                </div>
              ))}
              <button type="button" onClick={() => {
                  setForm((f) => ({
                    ...f,
                    pruebasComplementarias: [...f.pruebasComplementarias, { tipo: 'HEMATOLOGIA', fecha: new Date().toISOString().split('T')[0], resultado: '', observaciones: '' }],
                  }));
                }}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-primary/40 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors">
                <Icono nombre="add" clase="text-[16px]" /> Agregar prueba complementaria
              </button>
            </SeccionClinica>

            {/* Botones fijos */}
            <div className="flex gap-3 pt-2 pb-1">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : 'Guardar consulta'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
