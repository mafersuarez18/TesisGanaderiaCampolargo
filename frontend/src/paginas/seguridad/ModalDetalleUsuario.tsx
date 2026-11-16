import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../../componentes/ui/Modal';
import Badge, { BadgeRol } from '../../componentes/ui/Badge';
import Icono from '../../componentes/ui/Icono';

// Ficha completa de un usuario: datos de la cuenta, rol, a qué módulos
// tiene acceso y qué puede hacer en cada uno, y un resumen de su actividad.

interface DetalleUsuario {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string | null;
  cedulaIdentidad: string | null;
  cargo: string | null;
  estado: 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO';
  ultimoAcceso: string | null;
  bloqueadoHasta: string | null;
  intentosFallidos: number;
  creadoPor: { nombre: string; apellido: string } | null;
  rol: { id: string; nombre: string; descripcion: string | null };
  privilegios: string[];
  _count: {
    historialesMedicosCreados: number;
    eventosReproductivosRegistrados: number;
    vacunasAplicadas: number;
    desparasitacionesAplicadas: number;
    vitaminasAplicadas: number;
    registrosAuditoria: number;
  };
}

// Módulos del sistema y la descripción legible de cada privilegio
const MODULOS: { clave: string; nombre: string; icono: string; acciones: Record<string, string> }[] = [
  { clave: 'fincas', nombre: 'Fincas', icono: 'home_work', acciones: { ver: 'Consultar', crear: 'Registrar', editar: 'Editar', eliminar: 'Eliminar' } },
  { clave: 'lotes', nombre: 'Lotes y potreros', icono: 'grid_view', acciones: { ver: 'Consultar', crear: 'Registrar', editar: 'Editar', eliminar: 'Eliminar' } },
  { clave: 'animales', nombre: 'Animales', icono: 'pets', acciones: { ver: 'Consultar', crear: 'Registrar', editar: 'Editar', eliminar: 'Eliminar' } },
  { clave: 'historial_medico', nombre: 'Historial médico', icono: 'medical_services', acciones: { ver: 'Consultar', crear: 'Registrar consultas', eliminar: 'Eliminar consultas' } },
  { clave: 'vacunacion', nombre: 'Vacunación y desparasitación', icono: 'vaccines', acciones: { ver: 'Consultar', registrar: 'Registrar aplicaciones', gestionar_calendario: 'Gestionar calendarios' } },
  { clave: 'plan_sanitario', nombre: 'Plan sanitario', icono: 'event_note', acciones: { ver: 'Consultar', gestionar: 'Gestionar' } },
  { clave: 'inseminacion', nombre: 'Inseminación', icono: 'science', acciones: { ver: 'Consultar', crear: 'Registrar' } },
  { clave: 'reproduccion', nombre: 'Reproducción', icono: 'vaca_prenada', acciones: { ver: 'Consultar', crear: 'Registrar' } },
  { clave: 'geolocalizacion', nombre: 'Geolocalización', icono: 'map', acciones: { ver: 'Consultar', gestionar_dispositivos: 'Gestionar collares GPS' } },
  { clave: 'alertas', nombre: 'Alertas', icono: 'notifications_active', acciones: { ver: 'Consultar', evaluar: 'Ejecutar el motor', gestionar_reglas: 'Gestionar reglas' } },
  { clave: 'analytics', nombre: 'Dashboard e indicadores', icono: 'dashboard', acciones: { ver: 'Indicadores básicos', ver_avanzado: 'Indicadores avanzados' } },
  { clave: 'reportes', nombre: 'Reportes', icono: 'analytics', acciones: { generar: 'Generar reportes' } },
  { clave: 'usuarios', nombre: 'Usuarios', icono: 'group', acciones: { ver: 'Consultar', crear: 'Registrar', editar: 'Editar', desbloquear: 'Desbloquear', eliminar: 'Eliminar' } },
  { clave: 'roles', nombre: 'Roles y privilegios', icono: 'admin_panel_settings', acciones: { gestionar: 'Gestionar' } },
  { clave: 'auditoria', nombre: 'Auditoría', icono: 'fact_check', acciones: { ver: 'Consultar' } },
];

const ESTADOS: Record<string, { variante: 'verde' | 'gris' | 'rojo'; etiqueta: string }> = {
  ACTIVO:    { variante: 'verde', etiqueta: 'Activo' },
  INACTIVO:  { variante: 'gris',  etiqueta: 'Inactivo' },
  BLOQUEADO: { variante: 'rojo',  etiqueta: 'Bloqueado' },
};

function fechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">{etiqueta}</p>
      <p className="text-sm text-on-surface mt-0.5 break-words">{valor || '—'}</p>
    </div>
  );
}

export default function ModalDetalleUsuario({ usuarioId, alCerrar, alEditar }: {
  usuarioId: string | null;
  alCerrar: () => void;
  alEditar?: () => void;
}) {
  const { data: u, isLoading } = useQuery<DetalleUsuario>({
    queryKey: ['usuario-detalle', usuarioId],
    queryFn: () => clienteHttp.get(`/usuarios/${usuarioId}`).then((r) => r.data.datos),
    enabled: !!usuarioId,
  });

  const privilegios = new Set(u?.privilegios ?? []);
  // Privilegios que no pertenecen a ninguno de los módulos conocidos
  const otros = (u?.privilegios ?? []).filter((p) => !MODULOS.some((m) => p.startsWith(`${m.clave}.`)));

  return (
    <Modal
      abierto={!!usuarioId}
      alCerrar={alCerrar}
      tamano="xl"
      titulo="Detalle del usuario"
      pie={
        <>
          <button onClick={alCerrar} className="boton boton-secundario">Cerrar</button>
          {alEditar && u && (
            <button onClick={alEditar} className="boton boton-primario gap-2">
              <Icono nombre="edit" clase="text-[16px]" />
              Editar usuario
            </button>
          )}
        </>
      }
    >
      {isLoading || !u ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-surface-container animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Cabecera */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center
                            text-on-primary font-bold text-lg flex-shrink-0">
              {u.nombre[0]}{u.apellido[0]}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-on-surface truncate">{u.nombre} {u.apellido}</p>
              <p className="text-sm text-on-surface-variant truncate">{u.correo}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <BadgeRol rol={u.rol.nombre} />
                <Badge variante={ESTADOS[u.estado]?.variante ?? 'gris'} tamano="xs" punto={u.estado === 'ACTIVO'}>
                  {ESTADOS[u.estado]?.etiqueta ?? u.estado}
                </Badge>
              </div>
            </div>
          </div>

          {/* Datos de la cuenta */}
          <section>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Datos de la cuenta</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-surface-container-low">
              <Dato etiqueta="Cargo" valor={u.cargo} />
              <Dato etiqueta="Teléfono" valor={u.telefono} />
              <Dato etiqueta="Cédula" valor={u.cedulaIdentidad} />
              <Dato etiqueta="Último acceso" valor={fechaHora(u.ultimoAcceso)} />
              <Dato etiqueta="Creado por" valor={u.creadoPor ? `${u.creadoPor.nombre} ${u.creadoPor.apellido}` : null} />
              <Dato etiqueta="Intentos fallidos" valor={String(u.intentosFallidos)} />
              {u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date() && (
                <Dato etiqueta="Bloqueado hasta" valor={fechaHora(u.bloqueadoHasta)} />
              )}
            </div>
          </section>

          {/* Rol y privilegios por módulo */}
          <section>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Rol y privilegios</p>
              <span className="text-xs text-on-surface-variant">{u.privilegios.length} privilegio(s)</span>
            </div>
            <p className="text-sm text-on-surface-variant mb-3">
              Rol <strong className="text-on-surface">{u.rol.nombre}</strong>{u.rol.descripcion ? ` — ${u.rol.descripcion}` : ''}.
              Los privilegios vienen del rol: para cambiarlos, edita el rol en la pestaña "Roles y privilegios".
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODULOS.map((m) => {
                const acciones = Object.entries(m.acciones);
                const concedidas = acciones.filter(([a]) => privilegios.has(`${m.clave}.${a}`));
                const conAcceso = concedidas.length > 0;
                return (
                  <div key={m.clave}
                    className={`p-3 rounded-xl border ${conAcceso ? 'border-primary/25 bg-primary/5' : 'border-outline-variant/20 bg-surface-container-low opacity-70'}`}>
                    <div className="flex items-center gap-2">
                      <Icono nombre={m.icono} clase={`text-[18px] ${conAcceso ? 'text-primary' : 'text-outline'}`} />
                      <span className="text-sm font-semibold text-on-surface flex-1">{m.nombre}</span>
                      {!conAcceso && <span className="text-[11px] text-on-surface-variant">Sin acceso</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {acciones.map(([accion, nombre]) => {
                        const tiene = privilegios.has(`${m.clave}.${accion}`);
                        return (
                          <span key={accion}
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                              tiene ? 'bg-primary/15 text-primary font-medium' : 'bg-surface-container text-outline line-through'}`}>
                            <Icono nombre={tiene ? 'check' : 'close'} clase="text-[12px]" />
                            {nombre}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {otros.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {otros.map((p) => (
                  <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono">{p}</span>
                ))}
              </div>
            )}
          </section>

          {/* Actividad */}
          <section>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Actividad en el sistema</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ['Consultas médicas', u._count.historialesMedicosCreados, 'medical_services'],
                ['Eventos reproductivos', u._count.eventosReproductivosRegistrados, 'vaca_prenada'],
                ['Vacunas aplicadas', u._count.vacunasAplicadas, 'vaccines'],
                ['Desparasitaciones', u._count.desparasitacionesAplicadas, 'pest_control'],
                ['Vitaminas', u._count.vitaminasAplicadas, 'water_drop'],
                ['Acciones auditadas', u._count.registrosAuditoria, 'fact_check'],
              ].map(([etiqueta, valor, icono]) => (
                <div key={etiqueta as string} className="p-3 rounded-xl bg-surface-container-low flex items-center gap-3">
                  <Icono nombre={icono as string} clase="text-[18px] text-primary" />
                  <div>
                    <p className="text-base font-bold text-on-surface leading-tight">{valor as number}</p>
                    <p className="text-[11px] text-on-surface-variant leading-tight">{etiqueta as string}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
