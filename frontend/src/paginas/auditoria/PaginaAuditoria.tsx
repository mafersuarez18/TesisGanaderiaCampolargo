import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import Paginacion from '../../componentes/ui/Paginacion';
import useDebounce from '../../hooks/useDebounce';
import Icono from '../../componentes/ui/Icono';
import CampoFecha from '../../componentes/ui/CampoFecha';
import Modal from '../../componentes/ui/Modal';
import { useNavigate } from 'react-router-dom';

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

interface DetalleAuditoria {
  id: string;
  accion: string;
  modulo: string;
  descripcion: string;
  recurso: string;
  recursoId?: string | null;
  exitoso: boolean;
  errorMensaje?: string | null;
  creadoEn: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  usuario?: { nombre: string; apellido: string; correo: string; rol: { nombre: string } } | null;
  registroAfectado?: { descripcion: string | null; eliminado: boolean } | null;
  animal?: { id: string; texto: string } | null;
  datosEnviados: { campo: string; valor: string }[];
  datosPrevios: { campo: string; valor: string }[];
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

// Express guarda la IP en formato IPv6: "::1" es el propio equipo y
// "::ffff:192.168.0.5" es una IPv4 envuelta. Se muestra la dirección limpia.
function formatearIP(ip?: string | null): { direccion: string; nota?: string } {
  if (!ip) return { direccion: '—' };
  const limpia = ip.replace(/^::ffff:/i, '');
  if (limpia === '::1' || limpia === '127.0.0.1') return { direccion: '127.0.0.1', nota: 'Este mismo equipo' };
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(limpia)) return { direccion: limpia, nota: 'Red local' };
  return { direccion: limpia };
}

// "Mozilla/5.0 (Windows NT 10.0...) ... Edg/157" → "Microsoft Edge en Windows"
function describirNavegador(ua?: string | null): string {
  if (!ua) return '—';
  const navegador = /Edg\//.test(ua) ? 'Microsoft Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Google Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (!navegador && !sistema) return ua;
  return [navegador ?? 'Navegador', sistema && `en ${sistema}`].filter(Boolean).join(' ');
}

function ModalDetalleAuditoria({ registroId, alCerrar }: { registroId: string | null; alCerrar: () => void }) {
  const navegar = useNavigate();
  const { data: d, isLoading, isError } = useQuery<DetalleAuditoria>({
    queryKey: ['auditoria-detalle', registroId],
    queryFn: () => clienteHttp.get(`/auditoria/${registroId}`).then((r) => r.data.datos),
    enabled: !!registroId,
  });

  const Seccion = ({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-low">
        <Icono nombre={icono} clase="text-[16px] text-primary" />
        <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">{titulo}</p>
      </div>
      <div className="p-3 text-sm space-y-1.5">{children}</div>
    </div>
  );
  const Fila = ({ et, children }: { et: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[130px_1fr] gap-2">
      <span className="text-xs text-on-surface-variant pt-0.5">{et}</span>
      <span className="text-on-surface break-words">{children}</span>
    </div>
  );
  const TablaDatos = ({ filas }: { filas: { campo: string; valor: string }[] }) => (
    <div className="divide-y divide-outline-variant/15">
      {filas.map((f, i) => (
        <div key={i} className="grid grid-cols-[150px_1fr] gap-2 py-1.5 text-xs">
          <span className="text-on-surface-variant">{f.campo}</span>
          <span className="text-on-surface break-words">{f.valor}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Modal abierto={!!registroId} alCerrar={alCerrar} titulo="Detalle de la acción" tamano="xl">
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />)}</div>
      ) : isError || !d ? (
        <p className="text-sm text-error">No se pudo cargar el detalle de este registro.</p>
      ) : (
        <div className="space-y-3">
          <Seccion icono="task_alt" titulo="Qué se hizo">
            <Fila et="Acción">
              <Badge variante={ACCION_COLOR[d.accion] ?? 'gris'} tamano="xs">{ACCION_ETIQUETA[d.accion] ?? d.accion}</Badge>
            </Fila>
            <Fila et="Descripción">{d.descripcion}</Fila>
            <Fila et="Resultado">
              {d.exitoso
                ? <span className="text-primary font-medium">Se completó correctamente</span>
                : <span className="text-error font-medium">Falló{d.errorMensaje ? `: ${d.errorMensaje}` : ''}</span>}
            </Fila>
          </Seccion>

          <Seccion icono={RECURSO_ICONO[d.recurso] ?? RECURSO_ICONO.default} titulo="Sobre qué registro">
            <Fila et="Tipo de registro">{RECURSO_ETIQUETA[d.recurso] ?? d.recurso}</Fila>
            <Fila et="Registro">
              {d.registroAfectado?.descripcion
                ?? (d.registroAfectado?.eliminado
                  ? <span className="text-on-surface-variant italic">Ya no existe (se eliminó después)</span>
                  : <span className="text-on-surface-variant italic">No se guardó la referencia del registro</span>)}
            </Fila>
            {d.animal && (
              <Fila et="Animal">
                <button
                  onClick={() => { alCerrar(); navegar(`/animales/${d.animal!.id}`); }}
                  className="inline-flex items-center gap-1 text-primary font-medium hover:underline"
                >
                  {d.animal.texto}
                  <Icono nombre="open_in_new" clase="text-[14px]" />
                </button>
              </Fila>
            )}
            {d.recursoId && <Fila et="Código interno"><span className="font-mono text-xs">{d.recursoId}</span></Fila>}
          </Seccion>

          <Seccion icono="person" titulo="Quién lo hizo">
            {d.usuario ? (
              <>
                <Fila et="Usuario">{d.usuario.nombre} {d.usuario.apellido}</Fila>
                <Fila et="Correo">{d.usuario.correo}</Fila>
                <Fila et="Rol">{d.usuario.rol.nombre.charAt(0) + d.usuario.rol.nombre.slice(1).toLowerCase()}</Fila>
              </>
            ) : (
              <Fila et="Usuario"><span className="italic text-on-surface-variant">Sistema (acción automática o sin sesión)</span></Fila>
            )}
          </Seccion>

          <Seccion icono="schedule" titulo="Cuándo y desde dónde">
            <Fila et="Fecha y hora">
              {new Date(d.creadoEn).toLocaleString('es-VE', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </Fila>
            <Fila et="Dirección IP">
              <span className="font-mono">{formatearIP(d.ipAddress).direccion}</span>
              {formatearIP(d.ipAddress).nota && <span className="text-xs text-on-surface-variant"> · {formatearIP(d.ipAddress).nota}</span>}
            </Fila>
            <Fila et="Navegador">{describirNavegador(d.userAgent)}</Fila>
          </Seccion>

          {d.datosPrevios.length > 0 && (
            <Seccion icono="history" titulo="Datos anteriores">
              <TablaDatos filas={d.datosPrevios} />
            </Seccion>
          )}
          <Seccion icono="edit_note" titulo={d.accion === 'ACTUALIZAR' ? 'Datos modificados' : 'Datos registrados'}>
            {d.datosEnviados.length
              ? <TablaDatos filas={d.datosEnviados} />
              : <p className="text-xs text-on-surface-variant italic">Esta acción no envió datos (p. ej. una eliminación, un inicio de sesión o una exportación).</p>}
          </Seccion>
        </div>
      )}
    </Modal>
  );
}

export default function PaginaAuditoria() {
  const [busqueda, setBusqueda]           = useState('');
  const [accionFiltro, setAccionFiltro]   = useState('');
  const [recursoFiltro, setRecursoFiltro] = useState('');
  const [paginaActual, setPaginaActual]   = useState(1);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [desdeFiltro, setDesdeFiltro]     = useState('');
  const [hastaFiltro, setHastaFiltro]     = useState('');
  const [soloFallidos, setSoloFallidos]   = useState(false);
  const [detalleId, setDetalleId]         = useState<string | null>(null);

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
          {/* Tabla real: cabecera y filas comparten el ancho de cada columna.
              En pantallas angostas se desliza horizontal en vez de aplastarse. */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/20">
                {['Acción', 'Recurso', 'Descripción', 'Usuario', 'IP', 'Cuándo'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {registros.map((reg, idx) => {
                const ip = formatearIP(reg.ipAddress);
                return (
                  <motion.tr
                    key={reg.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setDetalleId(reg.id)}
                    title="Ver el detalle de esta acción"
                    className={`hover:bg-surface-container-low transition-colors align-top cursor-pointer
                               ${!reg.exitoso ? 'bg-error-container/20' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variante={ACCION_COLOR[reg.accion] ?? 'gris'} tamano="xs">
                        {ACCION_ETIQUETA[reg.accion] ?? reg.accion}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-on-surface">
                        <Icono nombre={RECURSO_ICONO[reg.recurso] ?? RECURSO_ICONO.default} clase="text-[14px] text-on-surface-variant" />
                        <span className="font-medium">{RECURSO_ETIQUETA[reg.recurso] ?? reg.recurso}</span>
                      </div>
                      {reg.recursoId && (
                        <p className="text-on-surface-variant font-mono text-[10px] mt-0.5" title={reg.recursoId}>
                          #{reg.recursoId.slice(-6)}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-3 text-on-surface min-w-[220px]">
                      <p className="line-clamp-2" title={reg.descripcion ?? undefined}>{reg.descripcion ?? '—'}</p>
                    </td>

                    <td className="px-4 py-3 text-on-surface whitespace-nowrap">
                      {reg.usuario
                        ? `${reg.usuario.nombre} ${reg.usuario.apellido}`
                        : <span className="text-on-surface-variant italic">Sistema</span>
                      }
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap" title={reg.ipAddress ?? undefined}>
                      <span className="font-mono text-on-surface">{ip.direccion}</span>
                      {ip.nota && <p className="text-[10px] text-on-surface-variant mt-0.5">{ip.nota}</p>}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-on-surface">{tiempoRelativo(reg.creadoEn)}</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        {new Date(reg.creadoEn).toLocaleString('es-VE', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
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
      <ModalDetalleAuditoria registroId={detalleId} alCerrar={() => setDetalleId(null)} />
    </div>
  );
}
