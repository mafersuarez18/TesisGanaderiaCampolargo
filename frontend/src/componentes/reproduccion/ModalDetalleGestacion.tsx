import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import Icono from '../ui/Icono';
import { DIAS_GESTACION_BOVINA } from './seguimientoReproductivo';

// Detalle completo de una gestación: la madre, de qué servicio viene
// (inseminación artificial o monta natural, con su semental o toro), el
// padre, los diagnósticos, la cuenta regresiva y, si ya terminó, el resultado.

interface AnimalCorto { id: string; numeroIdentificacion: string; nombre?: string | null }

interface DetalleGestacion {
  id: string;
  fechaInicio: string;
  fechaPartoEsperado: string;
  fechaPartoReal?: string | null;
  estadoGestacion: 'EN_CURSO' | 'FINALIZADA_PARTO' | 'FINALIZADA_ABORTO' | 'PERDIDA';
  observaciones?: string | null;
  diasGestacion: number;
  diasRestantes: number | null;
  madre: AnimalCorto & { raza?: { nombre: string } | null; lote?: { nombre: string; finca?: { nombre: string } } | null };
  padre?: AnimalCorto | null;
  eventoReproductivo?: {
    id: string; tipo: 'INSEMINACION_ARTIFICIAL' | 'MONTA_NATURAL'; fecha: string;
    descripcion?: string | null; observaciones?: string | null;
    registradoPor?: { nombre: string; apellido: string } | null;
    toro?: AnimalCorto | null;
    inseminacion?: {
      numeroIntento: number; tecnicaDeposicion?: string | null; clasificacionIA?: string | null;
      inventarioSemen?: { codigoDosis: string; semental: { nombre: string; raza?: { nombre: string } | null } } | null;
    } | null;
  } | null;
  diagnosticos: { fechaDiagnostico: string; resultado: string; metodoDiagnostico?: string | null; semanaGestacion?: number | null; observaciones?: string | null }[];
  nacimientos: {
    fechaNacimiento: string; tipoParto?: string | null; pesoAlNacer?: number | null; sexoCria?: string | null; estadoCria?: string | null;
    cria?: AnimalCorto | null;
  }[];
}

const ESTADO: Record<DetalleGestacion['estadoGestacion'], { et: string; variante: 'verde' | 'azul' | 'rojo' | 'gris' }> = {
  EN_CURSO:          { et: 'En curso', variante: 'verde' },
  FINALIZADA_PARTO:  { et: 'Terminó en parto', variante: 'azul' },
  FINALIZADA_ABORTO: { et: 'Terminó en aborto', variante: 'rojo' },
  PERDIDA:           { et: 'Perdida', variante: 'gris' },
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const nombre = (a?: AnimalCorto | null) => (a ? `${a.nombre ? `${a.nombre} ` : ''}#${a.numeroIdentificacion}` : '—');
const legible = (v?: string | null) => (v ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

function Seccion({ icono, titulo, children }: { icono: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-low">
        <Icono nombre={icono} clase="text-[16px] text-primary" />
        <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">{titulo}</p>
      </div>
      <div className="p-3 text-sm space-y-1.5">{children}</div>
    </div>
  );
}

function Fila({ et, children }: { et: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-xs text-on-surface-variant pt-0.5">{et}</span>
      <span className="text-on-surface break-words">{children}</span>
    </div>
  );
}

export default function ModalDetalleGestacion({ gestacionId, alCerrar, alVerAnimal, alRegistrarResultado }: {
  gestacionId: string | null;
  alCerrar: () => void;
  alVerAnimal: (animalId: string) => void;
  alRegistrarResultado?: () => void;
}) {
  const { data: g, isLoading, isError } = useQuery<DetalleGestacion>({
    queryKey: ['gestacion-detalle', gestacionId],
    queryFn: () => clienteHttp.get(`/reproduccion/gestaciones/${gestacionId}`).then((r) => r.data.datos),
    enabled: !!gestacionId,
  });

  const origen = g?.eventoReproductivo;
  const esIA = origen?.tipo === 'INSEMINACION_ARTIFICIAL';
  const progreso = g ? Math.min(100, Math.round((g.diasGestacion / DIAS_GESTACION_BOVINA) * 100)) : 0;

  return (
    <Modal abierto={!!gestacionId} alCerrar={alCerrar} titulo="Detalle de la gestación" tamano="xl"
      pie={g && (
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => { alCerrar(); alVerAnimal(g.madre.id); }} className="boton boton-secundario gap-2 text-sm">
            <Icono nombre="open_in_new" clase="text-[16px]" /> Ver la madre
          </button>
          {g.estadoGestacion === 'EN_CURSO' && alRegistrarResultado && (
            <button type="button" onClick={() => { alCerrar(); alRegistrarResultado(); }} className="boton boton-primario gap-2 text-sm">
              <Icono nombre="child_care" clase="text-[16px]" /> Registrar resultado
            </button>
          )}
        </div>
      )}
    >
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-container animate-pulse" />)}</div>
      ) : isError || !g ? (
        <p className="text-sm text-error">No se pudo cargar la gestación.</p>
      ) : (
        <div className="space-y-3">
          {/* Cabecera: madre, estado y cuenta regresiva */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-base font-bold text-on-surface">{nombre(g.madre)}</p>
              <p className="text-xs text-on-surface-variant">
                {g.madre.raza?.nombre ?? '—'} · {g.madre.lote?.finca?.nombre ?? '—'} · {g.madre.lote?.nombre ?? '—'}
              </p>
            </div>
            <Badge variante={ESTADO[g.estadoGestacion].variante} tamano="sm">{ESTADO[g.estadoGestacion].et}</Badge>
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/15 p-3">
            <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1.5">
              <span>Día {g.diasGestacion} de {DIAS_GESTACION_BOVINA} (semana {Math.floor(g.diasGestacion / 7)})</span>
              <span className="font-semibold text-on-surface">
                {g.diasRestantes == null ? `Cerrada el ${fmt(g.fechaPartoReal)}`
                  : g.diasRestantes < 0 ? `Parto esperado hace ${-g.diasRestantes} día(s)`
                  : g.diasRestantes === 0 ? 'Parto esperado hoy' : `Faltan ${g.diasRestantes} días`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progreso}%` }} />
            </div>
          </div>

          <Seccion icono={esIA ? 'science' : 'pets'} titulo="Origen de la gestación">
            {origen ? (
              <>
                <Fila et="Tipo de servicio">
                  <span className="font-semibold">{esIA ? 'Inseminación artificial' : 'Monta natural'}</span>
                </Fila>
                <Fila et="Fecha del servicio">{fmt(origen.fecha)}</Fila>
                {esIA ? (
                  <>
                    <Fila et="Semental">
                      {origen.inseminacion?.inventarioSemen
                        ? `${origen.inseminacion.inventarioSemen.semental.nombre}${origen.inseminacion.inventarioSemen.semental.raza ? ` (${origen.inseminacion.inventarioSemen.semental.raza.nombre})` : ''}`
                        : '—'}
                    </Fila>
                    <Fila et="Dosis de semen">{origen.inseminacion?.inventarioSemen?.codigoDosis ?? '—'}</Fila>
                    <Fila et="N.° de intento">{origen.inseminacion?.numeroIntento ?? '—'}</Fila>
                    {origen.inseminacion?.tecnicaDeposicion && <Fila et="Técnica">{legible(origen.inseminacion.tecnicaDeposicion)}</Fila>}
                  </>
                ) : (
                  <Fila et="Toro">{origen.toro ? nombre(origen.toro) : 'No se registró'}</Fila>
                )}
                {origen.registradoPor && <Fila et="Registrado por">{origen.registradoPor.nombre} {origen.registradoPor.apellido}</Fila>}
                {origen.descripcion && <Fila et="Nota">{origen.descripcion}</Fila>}
              </>
            ) : (
              <p className="text-xs text-on-surface-variant italic">No quedó registrado el servicio que la originó.</p>
            )}
          </Seccion>

          <Seccion icono="calendar_month" titulo="Fechas">
            <Fila et="Concepción">{fmt(g.fechaInicio)}</Fila>
            <Fila et="Parto esperado">{fmt(g.fechaPartoEsperado)}</Fila>
            {g.fechaPartoReal && <Fila et="Fecha de cierre">{fmt(g.fechaPartoReal)}</Fila>}
            <Fila et="Padre">
              {g.padre ? nombre(g.padre)
                : origen?.inseminacion?.inventarioSemen ? `${origen.inseminacion.inventarioSemen.semental.nombre} (semen)` : 'No se sabe'}
            </Fila>
          </Seccion>

          <Seccion icono="fact_check" titulo={`Diagnósticos (${g.diagnosticos.length})`}>
            {g.diagnosticos.length ? g.diagnosticos.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-outline-variant/15 last:border-0">
                <span className="text-on-surface">
                  {fmt(d.fechaDiagnostico)} · {d.metodoDiagnostico ?? 'Método no indicado'}
                  {d.semanaGestacion != null && ` · semana ${d.semanaGestacion}`}
                </span>
                <Badge variante={d.resultado === 'POSITIVO' ? 'verde' : 'rojo'} tamano="xs">{legible(d.resultado)}</Badge>
              </div>
            )) : <p className="text-xs text-on-surface-variant italic">Sin diagnósticos registrados.</p>}
          </Seccion>

          {g.nacimientos.length > 0 && (
            <Seccion icono="child_care" titulo="Cría">
              {g.nacimientos.map((n, i) => (
                <div key={i} className="space-y-1.5">
                  <Fila et="Estado">{legible(n.estadoCria)}</Fila>
                  <Fila et="Sexo">{legible(n.sexoCria)}</Fila>
                  <Fila et="Peso al nacer">{n.pesoAlNacer != null ? `${n.pesoAlNacer} kg` : '—'}</Fila>
                  <Fila et="Tipo de parto">{legible(n.tipoParto)}</Fila>
                  <Fila et="Registrada como">
                    {n.cria ? (
                      <button type="button" onClick={() => { alCerrar(); alVerAnimal(n.cria!.id); }}
                        className="text-primary font-medium hover:underline">{nombre(n.cria)}</button>
                    ) : 'Pendiente de registrar'}
                  </Fila>
                </div>
              ))}
            </Seccion>
          )}

          {g.observaciones && (
            <Seccion icono="notes" titulo="Observaciones">
              <p className="text-sm text-on-surface whitespace-pre-line">{g.observaciones}</p>
            </Seccion>
          )}
        </div>
      )}
    </Modal>
  );
}
