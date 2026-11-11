import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import Icono from '../ui/Icono';

// Detalle de un evento reproductivo (inseminación, monta, diagnóstico...):
// lo que se registró en el servicio y, si ya se confirmó, la gestación que
// abrió. Desde aquí se puede ir a la ficha del animal o, si el servicio está
// por confirmar, registrar si quedó preñada.

interface AnimalCorto { id: string; numeroIdentificacion: string; nombre?: string | null }

interface DetalleEvento {
  id: string;
  tipo: string;
  fecha: string;
  descripcion?: string | null;
  observaciones?: string | null;
  animal: {
    id: string; numeroIdentificacion: string; nombre?: string | null;
    lote?: { nombre: string; finca?: { nombre: string } } | null;
  };
  registradoPor: { nombre: string; apellido: string };
  inseminacion?: {
    numeroIntento: number;
    clasificacionIA?: string | null;
    tecnicaDeposicion?: string | null;
    patologiasVaca?: string | null;
    tasaMetabolicaBasal?: number | null;
    balanceEnergetico?: string | null;
    temperaturaUterina?: number | null;
    manejoHato?: string | null;
    observaciones?: string | null;
    inventarioSemen?: { codigoDosis: string; semental: { nombre: string; raza?: { nombre: string } | null } } | null;
  } | null;
  toro?: AnimalCorto | null;
  diagnosticoGestacion?: {
    resultado: string; metodoDiagnostico?: string | null; semanaGestacion?: number | null;
    gestacion?: { estadoGestacion: string; fechaInicio: string; fechaPartoEsperado: string; padre?: AnimalCorto | null } | null;
  } | null;
  gestacion?: { estadoGestacion: string; fechaPartoEsperado: string; fechaPartoReal?: string | null; padre?: AnimalCorto | null } | null;
  // Solo en partos y abortos: la gestación que se cerró y sus crías
  diagnosticoPosterior?: {
    fecha: string; observaciones?: string | null;
    diagnosticoGestacion?: { resultado: string; metodoDiagnostico?: string | null } | null;
  } | null;
  gestacionCerrada?: {
    fechaInicio: string; fechaPartoEsperado: string; observaciones?: string | null; padre?: AnimalCorto | null;
    nacimientos: Array<{
      tipoParto: string; pesoAlNacer?: number | null; estadoCria: string; sexoCria?: string | null;
      observaciones?: string | null; complicaciones?: string | null;
      cria?: { id: string; numeroIdentificacion: string; nombre?: string | null } | null;
    }>;
  } | null;
}

const TIPOS: Record<string, string> = {
  INSEMINACION_ARTIFICIAL: 'Inseminación artificial',
  MONTA_NATURAL: 'Monta natural',
  DETECCION_CELO: 'Detección de celo',
  DIAGNOSTICO_GESTACION: 'Diagnóstico de gestación',
  PARTO: 'Parto',
  ABORTO: 'Aborto',
  DESTETE: 'Destete',
  DESCARTE_REPRODUCTIVO: 'Descarte reproductivo',
};
const CLASIFICACION: Record<string, string> = { CELO_DETECTADO: 'Celo detectado', TIEMPO_FIJO: 'Tiempo fijo (IATF)' };
const TECNICA: Record<string, string> = {
  INTRAUTERINA_RECTOVAGINAL: 'Intrauterina rectovaginal', INTRAUTERINA_PROFUNDA: 'Intrauterina profunda',
};
const ESTRES: Record<string, string> = { ALTO: 'Alto', MEDIO: 'Medio', BAJO: 'Bajo' };
const TIPO_PARTO: Record<string, string> = { NORMAL: 'Normal', DISTOCICO: 'Distócico', CESAREA: 'Cesárea', PREMATURO: 'Prematuro' };
const ESTADO_CRIA: Record<string, string> = {
  VIVO: 'Viva', MUERTO_AL_NACER: 'Muerta al nacer', MUERTO_NEONATAL: 'Murió en las primeras 24 h',
};
const etiquetaAnimal = (a: AnimalCorto) => `#${a.numeroIdentificacion}${a.nombre ? ` · ${a.nombre}` : ''}`;
const diasHastaHoy = (iso: string) => {
  const f = new Date(iso);
  const hoy = new Date();
  return Math.round((new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime()
    - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / (24 * 60 * 60 * 1000));
};
const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / (24 * 60 * 60 * 1000));
const ESTADO_GESTACION: Record<string, { et: string; variante: 'verde' | 'azul' | 'rojo' | 'gris' }> = {
  EN_CURSO: { et: 'Gestación en curso', variante: 'azul' },
  FINALIZADA_PARTO: { et: 'Terminó en parto', variante: 'verde' },
  FINALIZADA_ABORTO: { et: 'Terminó en aborto', variante: 'rojo' },
  FINALIZADA_PERDIDA: { et: 'Pérdida', variante: 'gris' },
};

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

function Fila({ etiqueta, valor }: { etiqueta: string; valor?: React.ReactNode }) {
  if (valor === undefined || valor === null || valor === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-outline-variant/10 last:border-0 text-sm">
      <span className="text-on-surface-variant">{etiqueta}</span>
      <span className="text-on-surface font-medium text-right">{valor}</span>
    </div>
  );
}

function Seccion({ titulo, icono, children }: { titulo: string; icono: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1.5 flex items-center gap-1.5">
        <Icono nombre={icono} clase="text-[13px]" /> {titulo}
      </p>
      <div className="bg-surface-container rounded-xl px-3 py-1">{children}</div>
    </section>
  );
}

export default function ModalDetalleEvento({ eventoId, alCerrar, alVerAnimal, alConfirmar }: {
  eventoId: string | null;
  alCerrar: () => void;
  alVerAnimal: (animalId: string) => void;
  /** Solo para servicios por confirmar: abre el registro de preñada / vacía. */
  alConfirmar?: (prenada: boolean) => void;
}) {
  const { data: ev, isLoading, isError } = useQuery<DetalleEvento>({
    queryKey: ['evento-reproductivo', eventoId],
    queryFn: () => clienteHttp.get(`/reproduccion/${eventoId}`).then((r) => r.data.datos),
    enabled: !!eventoId,
  });
  const ia = ev?.inseminacion;
  const estadoGest = ev?.gestacion ? ESTADO_GESTACION[ev.gestacion.estadoGestacion] : undefined;

  return (
    <Modal
      abierto={!!eventoId}
      alCerrar={alCerrar}
      titulo={ev ? TIPOS[ev.tipo] ?? ev.tipo : 'Detalle del evento'}
      descripcion={ev ? `#${ev.animal.numeroIdentificacion}${ev.animal.nombre ? ` · ${ev.animal.nombre}` : ''} — ${fechaLarga(ev.fecha)}` : undefined}
      pie={ev && (
        <div className="flex flex-wrap gap-2 w-full">
          <button type="button" onClick={() => alVerAnimal(ev.animal.id)} className="boton boton-secundario text-sm gap-1.5">
            <Icono nombre="open_in_new" clase="text-[16px]" /> Ver animal
          </button>
          {alConfirmar && (
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => alConfirmar(true)}
                className="px-3 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                Preñada
              </button>
              <button type="button" onClick={() => alConfirmar(false)}
                className="px-3 py-2 rounded-xl text-sm font-semibold bg-error-container text-on-error-container hover:opacity-80 transition-colors">
                Vacía
              </button>
            </div>
          )}
        </div>
      )}
    >
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 rounded-xl bg-surface-container animate-pulse" />
        ))}</div>
      ) : isError || !ev ? (
        <p className="text-sm text-error">No se pudo cargar el detalle del evento.</p>
      ) : (
        <div className="space-y-4">
          <Seccion titulo="Registro" icono="event">
            <Fila etiqueta="Fecha" valor={fechaLarga(ev.fecha)} />
            <Fila etiqueta="Ubicación" valor={ev.animal.lote && `${ev.animal.lote.finca?.nombre ?? ''} · ${ev.animal.lote.nombre}`} />
            <Fila etiqueta="Registrado por" valor={`${ev.registradoPor.nombre} ${ev.registradoPor.apellido}`} />
            <Fila etiqueta="Descripción" valor={ev.descripcion} />
            <Fila etiqueta="Toro" valor={ev.toro && (
              <button type="button" onClick={() => alVerAnimal(ev.toro!.id)} className="text-primary hover:underline">
                {etiquetaAnimal(ev.toro)}
              </button>
            )} />
          </Seccion>

          {ia && (
            <Seccion titulo="Inseminación" icono="science">
              <Fila etiqueta="Semental" valor={ia.inventarioSemen &&
                `${ia.inventarioSemen.semental.nombre}${ia.inventarioSemen.semental.raza ? ` (${ia.inventarioSemen.semental.raza.nombre})` : ''}`} />
              <Fila etiqueta="Lote de semen" valor={ia.inventarioSemen?.codigoDosis} />
              <Fila etiqueta="Intento" valor={`${ia.numeroIntento}.º`} />
              <Fila etiqueta="Clasificación" valor={ia.clasificacionIA && (CLASIFICACION[ia.clasificacionIA] ?? ia.clasificacionIA)} />
              <Fila etiqueta="Técnica de deposición" valor={ia.tecnicaDeposicion && (TECNICA[ia.tecnicaDeposicion] ?? ia.tecnicaDeposicion)} />
              <Fila etiqueta="Tasa metabólica basal" valor={ia.tasaMetabolicaBasal != null ? `${ia.tasaMetabolicaBasal} / 5` : undefined} />
              <Fila etiqueta="Temperatura uterina" valor={ia.temperaturaUterina != null ? `${ia.temperaturaUterina} °C` : undefined} />
              <Fila etiqueta="Balance energético" valor={ia.balanceEnergetico} />
              <Fila etiqueta="Estrés por manejo" valor={ia.manejoHato && (ESTRES[ia.manejoHato] ?? ia.manejoHato)} />
              <Fila etiqueta="Patologías de la vaca" valor={ia.patologiasVaca} />
            </Seccion>
          )}

          {ev.diagnosticoGestacion && (
            <Seccion titulo="Diagnóstico" icono="ecg_heart">
              <Fila etiqueta="Resultado" valor={ev.diagnosticoGestacion.resultado === 'POSITIVO' ? 'Positivo (preñada)'
                : ev.diagnosticoGestacion.resultado === 'NEGATIVO' ? 'Negativo (vacía)' : ev.diagnosticoGestacion.resultado} />
              <Fila etiqueta="Método" valor={ev.diagnosticoGestacion.metodoDiagnostico} />
              <Fila etiqueta="Semana de gestación" valor={ev.diagnosticoGestacion.semanaGestacion ?? undefined} />
              {ev.diagnosticoGestacion.gestacion && (
                <>
                  <Fila etiqueta="Gestación" valor={
                    <Badge variante={ESTADO_GESTACION[ev.diagnosticoGestacion.gestacion.estadoGestacion]?.variante ?? 'gris'} tamano="xs">
                      {ESTADO_GESTACION[ev.diagnosticoGestacion.gestacion.estadoGestacion]?.et ?? ev.diagnosticoGestacion.gestacion.estadoGestacion}
                    </Badge>
                  } />
                  <Fila etiqueta="Parto esperado" valor={`${fechaLarga(ev.diagnosticoGestacion.gestacion.fechaPartoEsperado)}${
                    ev.diagnosticoGestacion.gestacion.estadoGestacion === 'EN_CURSO'
                      ? ` (faltan ${Math.max(0, diasHastaHoy(ev.diagnosticoGestacion.gestacion.fechaPartoEsperado))} días)` : ''}`} />
                  <Fila etiqueta="Padre" valor={ev.diagnosticoGestacion.gestacion.padre && etiquetaAnimal(ev.diagnosticoGestacion.gestacion.padre)} />
                </>
              )}
            </Seccion>
          )}

          {(ev.tipo === 'INSEMINACION_ARTIFICIAL' || ev.tipo === 'MONTA_NATURAL') && (
            <Seccion titulo="Resultado" icono="vaca_prenada">
              {ev.gestacion && estadoGest ? (
                <div className="py-1.5 space-y-1.5">
                  <Badge variante={estadoGest.variante} tamano="xs">{estadoGest.et}</Badge>
                  <Fila etiqueta={ev.gestacion.fechaPartoReal ? 'Fecha de cierre' : 'Parto esperado'}
                    valor={fechaLarga(ev.gestacion.fechaPartoReal ?? ev.gestacion.fechaPartoEsperado)} />
                  <Fila etiqueta="Padre" valor={ev.gestacion.padre && etiquetaAnimal(ev.gestacion.padre)} />
                </div>
              ) : ev.diagnosticoPosterior ? (
                <div className="py-1.5 space-y-1.5">
                  <Badge variante={ev.diagnosticoPosterior.diagnosticoGestacion?.resultado === 'POSITIVO' ? 'verde' : 'rojo'} tamano="xs">
                    {ev.diagnosticoPosterior.diagnosticoGestacion?.resultado === 'POSITIVO' ? 'Preñada' : 'No quedó preñada'}
                  </Badge>
                  <Fila etiqueta="Diagnóstico" valor={`${fechaLarga(ev.diagnosticoPosterior.fecha)}${
                    ev.diagnosticoPosterior.diagnosticoGestacion?.metodoDiagnostico ? ` · ${ev.diagnosticoPosterior.diagnosticoGestacion.metodoDiagnostico}` : ''}`} />
                  <Fila etiqueta="Nota" valor={ev.diagnosticoPosterior.observaciones} />
                </div>
              ) : (
                <p className="py-1.5 text-sm text-on-surface-variant">
                  Por confirmar: aún no se ha registrado si quedó preñada.
                </p>
              )}
            </Seccion>
          )}

          {ev.gestacionCerrada && (
            <Seccion titulo={ev.tipo === 'ABORTO' ? 'Gestación interrumpida' : 'Gestación'} icono="vaca_prenada">
              <Fila etiqueta="Inicio" valor={fechaLarga(ev.gestacionCerrada.fechaInicio)} />
              <Fila etiqueta="Parto esperado" valor={fechaLarga(ev.gestacionCerrada.fechaPartoEsperado)} />
              <Fila etiqueta="Días de gestación" valor={diasEntre(ev.gestacionCerrada.fechaInicio, ev.fecha)} />
              <Fila etiqueta="Padre" valor={ev.gestacionCerrada.padre && etiquetaAnimal(ev.gestacionCerrada.padre)} />
              <Fila etiqueta="Notas" valor={ev.gestacionCerrada.observaciones} />
            </Seccion>
          )}

          {ev.gestacionCerrada?.nacimientos.map((n, i) => (
            <Seccion key={i} titulo={ev.gestacionCerrada!.nacimientos.length > 1 ? `Cría ${i + 1}` : 'Cría'} icono="child_care">
              <Fila etiqueta="Estado" valor={
                <Badge variante={n.estadoCria === 'VIVO' ? 'verde' : 'rojo'} tamano="xs">{ESTADO_CRIA[n.estadoCria] ?? n.estadoCria}</Badge>
              } />
              <Fila etiqueta="Sexo" valor={n.sexoCria === 'MACHO' ? 'Macho' : n.sexoCria === 'HEMBRA' ? 'Hembra' : undefined} />
              <Fila etiqueta="Peso al nacer" valor={n.pesoAlNacer != null ? `${n.pesoAlNacer} kg` : undefined} />
              <Fila etiqueta="Tipo de parto" valor={TIPO_PARTO[n.tipoParto] ?? n.tipoParto} />
              <Fila etiqueta="Complicaciones" valor={n.complicaciones} />
              <Fila etiqueta="Observaciones" valor={n.observaciones} />
              <Fila etiqueta="Registrada como" valor={n.cria ? (
                <button type="button" onClick={() => alVerAnimal(n.cria!.id)} className="text-primary hover:underline">
                  #{n.cria.numeroIdentificacion}{n.cria.nombre ? ` · ${n.cria.nombre}` : ''}
                </button>
              ) : n.estadoCria === 'VIVO' ? 'Pendiente (ver "Crías por registrar" en Animales)' : undefined} />
            </Seccion>
          ))}

          {(ev.observaciones || ia?.observaciones) && (
            <Seccion titulo="Observaciones" icono="notes">
              <p className="py-1.5 text-sm text-on-surface whitespace-pre-line">{ev.observaciones ?? ia?.observaciones}</p>
            </Seccion>
          )}
        </div>
      )}
    </Modal>
  );
}
