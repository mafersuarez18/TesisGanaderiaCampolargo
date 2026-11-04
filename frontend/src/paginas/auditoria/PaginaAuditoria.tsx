import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import Paginacion from '../../componentes/ui/Paginacion';
import useDebounce from '../../hooks/useDebounce';
import Icono from '../../componentes/ui/Icono';
import CampoFecha from '../../componentes/ui/CampoFecha';

// Historial de acciones del sistema (quién hizo qué, cuándo y desde dónde),
// solo lectura y accesible únicamente para administradores.
interface RegistroAuditoria {
  id: string;
  accion: string;
  recurso: string;
  recursoId?: string;
  descripcion?: string;
  metadatos?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  exitoso: boolean;
  creadoEn: string;
  usuario?: { id: string; nombre: string; apellido: string; rol: string };
}

interface RespuestaAuditoria {
  datos: RegistroAuditoria[];
  meta: { total: number; pagina: number; porPagina: number; totalPaginas: number };
}

const ACCION_COLOR: Record<string, 'verde' | 'rojo' | 'azul' | 'amarillo' | 'tierra' | 'gris'> = {
  CREAR:                  'verde',
  ACTUALIZAR:             'azul',
  ELIMINAR:               'rojo',
  INICIAR_SESION:         'tierra',
  CERRAR_SESION:          'gris',
  LEER:                   'gris',
  INTENTO_ACCESO_FALLIDO: 'rojo',
  EXPORTAR:               'amarillo',
  CONFIGURAR:             'azul',
};

const ACCION_ETIQUETA: Record<string, string> = {
  CREAR:                  'Crear',
  LEER:                   'Leer',
  ACTUALIZAR:             'Actualizar',
  ELIMINAR:               'Eliminar',
  INICIAR_SESION:         'Inicio sesión',
  CERRAR_SESION:          'Cierre sesión',
  INTENTO_ACCESO_FALLIDO: 'Acceso fallido',
  EXPORTAR:               'Exportar',
  CONFIGURAR:             'Configurar',
};

const RECURSO_ICONO: Record<string, string> = {
  Animal:        'pets',
  Usuario:       'person',
  Autenticacion: 'shield',
  HistorialMedico: 'medical_services',
  EnfermedadDiagnosticada: 'coronavirus',
  Tratamiento:   'medication',
  PruebaComplementaria: 'biotech',
  RegistroVacunacion: 'vaccines',
  CalendarioVacunacion: 'event_note',
  EventoReproductivo: 'favorite',
  Gestacion:     'vaca_prenada',
  InseminacionArtificial: 'science',
  Reporte:       'description',
  ReglaAlerta:   'notifications',
  Finca:         'agriculture',
  Lote:          'grid_view',
  default:       'inventory_2',
};

// "Recurso" = tipo de registro sobre el que se hizo la acción
const RECURSO_ETIQUETA: Record<string, string> = {
  Animal: 'Animal',
  HistorialMedico: 'Consulta médica',
  EnfermedadDiagnosticada: 'Diagnóstico',
  Tratamiento: 'Tratamiento',
  PruebaComplementaria: 'Prueba complementaria',
  RegistroVacunacion: 'Vacunación',
  CalendarioVacunacion: 'Calendario de vacunación',
  EventoReproductivo: 'Evento reproductivo',
  Gestacion: 'Gestación',
  InseminacionArtificial: 'Inseminación',
  ActividadPlanSanitario: 'Plan sanitario',
  ReglaAlerta: 'Regla de alerta',
  Usuario: 'Usuario',
  Finca: 'Finca',
  Lote: 'Lote',
  Reporte: 'Reporte',
  Autenticacion: 'Sesión',
};

// Solo las acciones que existen en la BD (las más comunes primero)
const ACCIONES_DISPONIBLES = [
  { valor: '',                       etiqueta: 'Todo' },
  { valor: 'CREAR',                  etiqueta: 'Crear' },
  { valor: 'ACTUALIZAR',             etiqueta: 'Actualizar' },
  { valor: 'ELIMINAR',               etiqueta: 'Eliminar' },
  { valor: 'INICIAR_SESION',         etiqueta: 'Inicio sesión' },
  { valor: 'CERRAR_SESION',          etiqueta: 'Cierre sesión' },
  { valor: 'INTENTO_ACCESO_FALLIDO', etiqueta: 'Acceso fallido' },
  { valor: 'EXPORTAR',               etiqueta: 'Exportar' },
  { valor: 'CONFIGURAR',             etiqueta: 'Configurar' },
];

export default function PaginaAuditoria() {
  const [busqueda, setBusqueda]           = useState('');
  const [accionFiltro, setAccionFiltro]   = useState('');
  const [recursoFiltro, setRecursoFiltro] = useState('');
  const [paginaActual, setPaginaActual]   = useState(1);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [desdeFiltro, setDesdeFiltro]     = useState('');
  const [hastaFiltro, setHastaFiltro]     = useState('');
  const [soloFallidos, setSoloFallidos]   = useState(false);

  const busquedaDebounced = useDebounce(busqueda, 400);

  const { data, isLoading } = useQuery<RespuestaAuditoria>({
    queryKey: ['auditoria', paginaActual, busquedaDebounced, accionFiltro, recursoFiltro, desdeFiltro, hastaFiltro, soloFallidos],
    queryFn: () =>
      clienteHttp
        .get('/auditoria', {
          params: {
            pagina: paginaActual,
            porPagina: 30,
            ...(busquedaDebounced && { busqueda: busquedaDebounced }),
            ...(accionFiltro      && { accion: accionFiltro }),
            ...(recursoFiltro     && { recurso: recursoFiltro }),
            ...(desdeFiltro       && { desde: desdeFiltro }),
            ...(hastaFiltro       && { hasta: hastaFiltro }),
            ...(soloFallidos      && { exitoso: false }),
          },
        })
        .then((r) => r.data),
  });

  const registros = data?.datos ?? [];
  const meta      = data?.meta;

  const tiempoRelativo = (fecha: string) => {
    const diff = Date.now() - new Date(fecha).getTime();
    const seg  = Math.floor(diff / 1000);
    const min  = Math.floor(seg / 60);
    const hrs  = Math.floor(min / 60);
    const dias = Math.floor(hrs / 24);
    if (seg < 60) return 'Ahora';
    if (min < 60) return `${min}m`;
    if (hrs < 24) return `${hrs}h`;
    if (dias < 7) return `${dias}d`;
    return new Date(fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Icono nombre="fact_check" relleno clase="text-[22px] text-on-surface-variant" />
            Registro de Auditoría
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Trazabilidad completa de todas las acciones en el sistema
            {meta && (
              <span className="ml-2 font-medium text-on-surface">
                · {meta.total.toLocaleString('es-VE')} registros
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-high border border-outline-variant/30
                       rounded-xl text-xs text-on-surface-variant">
          <Icono nombre="lock" clase="text-[14px]" />
          Registro inmutable
        </div>
      </motion.div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="tarjeta-vidrio rounded-2xl p-4"
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Icono nombre="search" clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
            <input
              type="text"
              placeholder="Buscar usuario, recurso, descripción..."
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPaginaActual(1); }}
              className="campo-entrada pl-10"
            />
          </div>

          <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto">
            {ACCIONES_DISPONIBLES.map(({ valor, etiqueta }) => (
              <button
                key={valor}
                onClick={() => { setAccionFiltro(valor); setPaginaActual(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  accionFiltro === valor
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          <button
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
            className={`boton gap-2 text-sm ${
              mostrarFiltros ? 'boton-primario' : 'boton-secundario'
            }`}
          >
            <Icono nombre="filter_list" clase="text-[18px]" />
            Filtros
            <Icono nombre={mostrarFiltros ? 'expand_less' : 'expand_more'} clase="text-[16px]" />
          </button>
        </div>

        {mostrarFiltros && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
          >
            <div className="pt-4 mt-4 border-t border-outline-variant/20 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Desde</label>
                <CampoFecha
                  value={desdeFiltro}
                  onChange={(valor) => { setDesdeFiltro(valor); setPaginaActual(1); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Hasta</label>
                <CampoFecha
                  value={hastaFiltro}
                  onChange={(valor) => { setHastaFiltro(valor); setPaginaActual(1); }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Recurso</label>
                <select
                  value={recursoFiltro}
                  onChange={(e) => { setRecursoFiltro(e.target.value); setPaginaActual(1); }}
                  className="campo-entrada"
                >
                  <option value="">Todos</option>
                  {Object.entries(RECURSO_ETIQUETA).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>{etiqueta}</option>
                  ))}
                </select>
                <p className="text-[11px] text-on-surface-variant mt-1">Tipo de registro sobre el que se hizo la acción.</p>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={soloFallidos}
                    onChange={(e) => { setSoloFallidos(e.target.checked); setPaginaActual(1); }}
                    className="w-4 h-4 rounded border-outline-variant accent-error"
                  />
                  <span className="text-xs font-medium text-on-surface-variant">Solo fallidos</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : !registros.length ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <Icono nombre="fact_check" clase="text-[40px] text-outline mx-auto mb-3" />
          <p className="font-medium text-on-surface-variant">Sin registros de auditoría</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="tarjeta-vidrio rounded-2xl overflow-hidden"
        >
          {/* Columnas de ancho fijo/auto: en pantallas angostas se desliza
              horizontal en vez de aplastar todo el contenido. */}
          <div className="overflow-x-auto">
          <div className="min-w-[820px]">
          {/* Header */}
          <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-3 px-5 py-3
                         bg-surface-container-low border-b border-outline-variant/20">
            {['Acción', 'Recurso', 'Descripción', 'Usuario', 'IP', 'Cuándo'].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          <div className="divide-y divide-outline-variant/10">
            {registros.map((reg, idx) => (
              <motion.div
                key={reg.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
                className={`grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-3 items-center px-5 py-3
                           hover:bg-surface-container-low transition-colors text-xs
                           ${!reg.exitoso ? 'bg-error-container/20' : ''}`}
              >
                <Badge variante={ACCION_COLOR[reg.accion] ?? 'gris'} tamano="xs">
                  {ACCION_ETIQUETA[reg.accion] ?? reg.accion}
                </Badge>

                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <Icono nombre={RECURSO_ICONO[reg.recurso] ?? RECURSO_ICONO.default} clase="text-[14px]" />
                  <span className="font-medium">{RECURSO_ETIQUETA[reg.recurso] ?? reg.recurso}</span>
                  {reg.recursoId && (
                    <span className="text-outline font-mono text-[10px]">#{reg.recursoId.slice(-6)}</span>
                  )}
                </div>

                <span className="text-on-surface-variant truncate">{reg.descripcion ?? '—'}</span>

                <span className="text-on-surface-variant whitespace-nowrap">
                  {reg.usuario
                    ? `${reg.usuario.nombre} ${reg.usuario.apellido}`
                    : <span className="text-outline italic">Sistema</span>
                  }
                </span>

                <span className="text-outline font-mono whitespace-nowrap">{reg.ipAddress ?? '—'}</span>

                <span
                  className="text-outline whitespace-nowrap"
                  title={new Date(reg.creadoEn).toLocaleString('es-VE')}
                >
                  {tiempoRelativo(reg.creadoEn)}
                </span>
              </motion.div>
            ))}
          </div>
          </div>
          </div>
        </motion.div>
      )}

      {meta && meta.totalPaginas > 1 && (
        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={meta.totalPaginas}
          totalRegistros={meta.total}
          porPagina={meta.porPagina}
          alCambiarPagina={setPaginaActual}
        />
      )}
    </div>
  );
}
