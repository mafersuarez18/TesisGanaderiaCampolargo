import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Modal from '../ui/Modal';
import Icono from '../ui/Icono';
import { clienteHttp } from '../../servicios/clienteAxios';

// Detalle de una alerta: de qué se trata, qué hay que hacer y qué la generó.

interface DetalleAlerta {
  id: string;
  titulo: string;
  mensaje: string;
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  estado: string;
  entidadTipo: string | null;
  creadoEn: string;
  fechaLeida: string | null;
  atendidaPor: { nombre: string; apellido: string } | null;
  regla: {
    nombre: string; descripcion: string | null; tipoAlerta: string;
    umbralValor: number | null; umbralUnidad: string | null;
  } | null;
  destinatarios: string[];
  registro: { descripcion: string | null; animal?: { id: string; texto: string } | null; eliminado: boolean } | null;
}

interface Guia {
  queEs: string;
  pasos: string[];
  /** Cómo se cierra la alerta sin presionar "Atender". */
  seResuelve?: string;
  modulo?: { ruta: string; etiqueta: string };
}

const GUIAS: Record<string, Guia> = {
  VACUNA_VENCIDA: {
    queEs: 'Ya pasó la fecha en que le correspondía al animal la siguiente dosis de esta vacuna, y no hay una aplicación registrada después.',
    pasos: [
      'Aplique la vacuna al animal lo antes posible.',
      'Regístrela con "Registrar aplicación": el formulario sale lleno con la dosis, la vía y el lote de la aplicación anterior.',
      'Si el animal no debe recibirla (por ejemplo, ya se vacunó fuera del sistema), presione "Atender" para cerrar la alerta.',
    ],
    seResuelve: 'Se cierra sola al registrar la aplicación.',
    modulo: { ruta: '/vacunacion', etiqueta: 'Ir a Vacunación' },
  },
  VACUNA_PROXIMA: {
    queEs: 'Se acerca la fecha de la siguiente dosis de esta vacuna para el animal.',
    pasos: [
      'Programe la vacunación antes de la fecha indicada.',
      'Cuando la aplique, regístrela con "Registrar aplicación".',
    ],
    seResuelve: 'Se cierra sola al registrar la aplicación.',
    modulo: { ruta: '/vacunacion', etiqueta: 'Ir a Vacunación' },
  },
  PARTO_PROXIMO: {
    queEs: 'La vaca está cerca de su fecha probable de parto.',
    pasos: [
      'Muévala a un potrero de maternidad cercano y vigílela a diario.',
      'Tenga listo lo necesario para atender el parto.',
      'Cuando para, registre el resultado del parto y después la cría en "Crías por registrar".',
    ],
    seResuelve: 'Se cierra al registrar el resultado del parto.',
    modulo: { ruta: '/reproduccion', etiqueta: 'Ir a Reproducción' },
  },
  PARTO_CUMPLIDO: {
    queEs: 'Ya pasó la fecha esperada de parto y la gestación sigue abierta en el sistema.',
    pasos: [
      'Verifique si la vaca ya parió.',
      'Presione "Registrar resultado del parto" e indique si nació la cría, si hubo aborto o si la gestación se perdió.',
      'Si todavía no pare, pida una revisión al veterinario.',
    ],
    seResuelve: 'Se cierra al registrar el resultado del parto.',
    modulo: { ruta: '/reproduccion', etiqueta: 'Ir a Reproducción' },
  },
  DIAS_ABIERTOS: {
    queEs: 'La vaca lleva más días de los recomendados sin una nueva preñez confirmada desde su último parto. Cada día abierto alarga el intervalo entre partos.',
    pasos: [
      'Observe si presenta celo y programe el servicio (inseminación o monta).',
      'Si no cicla, pida una evaluación reproductiva al veterinario.',
    ],
    seResuelve: 'Deja de generarse cuando se confirma una nueva gestación.',
    modulo: { ruta: '/reproduccion', etiqueta: 'Ir a Reproducción' },
  },
  INTERVALO: {
    queEs: 'El tiempo entre los partos de la vaca supera lo recomendado, lo que reduce su productividad.',
    pasos: [
      'Revise su historia reproductiva y si presenta celo.',
      'Programe el servicio o pida una evaluación reproductiva al veterinario.',
    ],
    modulo: { ruta: '/reproduccion', etiqueta: 'Ir a Reproducción' },
  },
  REVISAR_SERVICIO: {
    queEs: 'Ya pasó el tiempo necesario para confirmar si la vaca quedó preñada después del servicio.',
    pasos: [
      'Haga el diagnóstico de gestación (palpación o ecografía).',
      'Responda "Sí, preñada" o "No, vacía".',
      'Si quedó preñada, se abre la gestación con su fecha probable de parto.',
    ],
    seResuelve: 'Se cierra al confirmar el resultado.',
    modulo: { ruta: '/reproduccion', etiqueta: 'Ir a Reproducción' },
  },
  TRATAMIENTO: {
    queEs: 'El tratamiento indicado al animal ya debió terminar y falta registrar si funcionó.',
    pasos: [
      'Revise al animal.',
      'Responda "Sí, mejoró" o "No mejoró".',
      'Si no mejoró, el sistema ofrece abrir una consulta de seguimiento con los antecedentes ya cargados.',
    ],
    seResuelve: 'Se cierra al responder.',
    modulo: { ruta: '/historial-medico', etiqueta: 'Ir a Historial médico' },
  },
  ENFERMEDAD: {
    queEs: 'Un diagnóstico del animal sigue activo más tiempo del esperado.',
    pasos: [
      'Revise la evolución del animal con el veterinario.',
      'Si ya se recuperó, actualice el diagnóstico en su historial médico.',
      'Si no mejora, abra una consulta de seguimiento para ajustar el tratamiento.',
    ],
    modulo: { ruta: '/historial-medico', etiqueta: 'Ir a Historial médico' },
  },
  SIN_CONTROL: {
    queEs: 'El animal lleva demasiado tiempo sin una consulta veterinaria registrada.',
    pasos: ['Programe una revisión general.', 'Registre la consulta en su historial médico.'],
    modulo: { ruta: '/historial-medico', etiqueta: 'Ir a Historial médico' },
  },
  PESO: {
    queEs: 'Corresponde pesar los animales para seguir su ganancia de peso.',
    pasos: [
      'Pese los animales indicados.',
      'Registre el peso en una consulta de su historial médico: el sistema calcula la ganancia respecto al pesaje anterior.',
    ],
    modulo: { ruta: '/historial-medico', etiqueta: 'Ir a Historial médico' },
  },
  SEMEN: {
    queEs: 'Quedan pocas dosis disponibles del semen de este semental.',
    pasos: [
      'Revise el inventario en Inseminación → Inventario de semen.',
      'Pida nuevas pajuelas al proveedor y registre el lote nuevo al recibirlo.',
    ],
    modulo: { ruta: '/inseminacion', etiqueta: 'Ir a Inseminación' },
  },
  GPS: {
    queEs: 'El collar GPS está por quedarse sin batería. Si se apaga, el animal deja de verse en el mapa.',
    pasos: [
      'Programe el cambio o la carga de la batería en la próxima ronda.',
      'Después verifique en Geolocalización que el collar vuelva a reportar.',
    ],
    modulo: { ruta: '/mapa', etiqueta: 'Ir a Geolocalización' },
  },
  GENERAL: {
    queEs: 'Aviso del sistema.',
    pasos: ['Lea el mensaje y realice lo que indica.', 'Cuando esté resuelto, presione "Atender".'],
  },
};

// El tipo de alerta se deduce del título (todas las alertas, de regla o del
// sistema, lo traen con un prefijo fijo)
function claveDeAlerta(titulo: string): string {
  const t = titulo.split(' — ')[0]!.toLowerCase();
  if (t.startsWith('vacuna vencida')) return 'VACUNA_VENCIDA';
  if (t.startsWith('vacuna próxima')) return 'VACUNA_PROXIMA';
  if (t.startsWith('parto próximo')) return 'PARTO_PROXIMO';
  if (t.startsWith('fecha de parto cumplida')) return 'PARTO_CUMPLIDO';
  if (t.startsWith('días abiertos')) return 'DIAS_ABIERTOS';
  if (t.startsWith('intervalo reproductivo')) return 'INTERVALO';
  if (t.startsWith('revisar ')) return 'REVISAR_SERVICIO';
  if (t.startsWith('tratamiento finalizado')) return 'TRATAMIENTO';
  if (t.startsWith('enfermedad')) return 'ENFERMEDAD';
  if (t.startsWith('sin control veterinario')) return 'SIN_CONTROL';
  if (t.startsWith('control de peso') || t.startsWith('pesaje')) return 'PESO';
  if (t.startsWith('inventario de semen')) return 'SEMEN';
  if (t.startsWith('collar gps')) return 'GPS';
  return 'GENERAL';
}

const PRIORIDAD: Record<DetalleAlerta['prioridad'], { et: string; clase: string; explicacion: string }> = {
  CRITICA: { et: 'Crítica', clase: 'bg-error-container text-on-error-container', explicacion: 'Atender de inmediato.' },
  ALTA:    { et: 'Alta',    clase: 'bg-orange-100 text-orange-800', explicacion: 'Atender hoy.' },
  MEDIA:   { et: 'Media',   clase: 'bg-tertiary-container/40 text-on-surface', explicacion: 'Atender en los próximos días.' },
  BAJA:    { et: 'Baja',    clase: 'bg-surface-container text-on-surface-variant', explicacion: 'Informativa.' },
};

const fmtFechaHora = (iso: string) => new Date(iso).toLocaleString('es-VE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function Seccion({ titulo, icono, children }: { titulo: string; icono: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icono nombre={icono} clase="text-[15px]" />
        {titulo}
      </p>
      {children}
    </div>
  );
}

export default function ModalDetalleAlerta({ notificacionId, alCerrar, acciones, alAtender }: {
  notificacionId: string | null;
  alCerrar: () => void;
  /** Acciones rápidas de la alerta (registrar aplicación, ¿mejoró?, etc.). */
  acciones?: ReactNode;
  /** Si se indica y la alerta sigue pendiente, se ofrece "Atender". */
  alAtender?: () => void;
}) {
  const { data: d, isLoading, isError } = useQuery<DetalleAlerta>({
    queryKey: ['notificacion-detalle', notificacionId],
    queryFn: () => clienteHttp.get(`/notificaciones/${notificacionId}/detalle`).then((r) => r.data.datos),
    enabled: !!notificacionId,
  });
  const guia = d ? GUIAS[claveDeAlerta(d.titulo)]! : null;
  const pendiente = d && d.estado !== 'DESCARTADA';
  const prioridad = d ? PRIORIDAD[d.prioridad] ?? PRIORIDAD.BAJA : null;

  return (
    <Modal abierto={!!notificacionId} alCerrar={alCerrar} titulo={d?.titulo ?? 'Detalle de la alerta'}
      descripcion={d ? `Generada el ${fmtFechaHora(d.creadoEn)}` : undefined} tamano="lg">
      {isError ? (
        <p className="text-sm text-on-surface-variant">Esta alerta ya no existe (se atendió o se eliminó su regla).</p>
      ) : isLoading || !d || !guia || !prioridad ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-surface-container animate-pulse" />)}</div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${prioridad.clase}`}>
              Prioridad {prioridad.et.toLowerCase()}
            </span>
            <span className="text-xs text-on-surface-variant">{prioridad.explicacion}</span>
            {!pendiente && (
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                <Icono nombre="task_alt" clase="text-[14px]" />
                {d.atendidaPor ? `Atendida por ${d.atendidaPor.nombre} ${d.atendidaPor.apellido}` : 'Resuelta'}
                {d.fechaLeida && ` el ${fmtFechaHora(d.fechaLeida)}`}
              </span>
            )}
          </div>

          <Seccion titulo="¿De qué se trata?" icono="info">
            <div className="rounded-xl bg-surface-container p-3 text-sm space-y-1.5">
              <p className="text-on-surface">{d.mensaje}</p>
              <p className="text-on-surface-variant">{guia.queEs}</p>
              {d.registro?.descripcion && (
                <p className="text-xs text-on-surface-variant">
                  <span className="font-semibold">Registro: </span>{d.registro.descripcion}
                </p>
              )}
              {d.registro?.eliminado && (
                <p className="text-xs text-on-surface-variant italic">El registro al que se refería ya no existe.</p>
              )}
              {d.registro?.animal && (
                <Link to={`/animales/${d.registro.animal.id}`} onClick={alCerrar}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Icono nombre="pets" clase="text-[14px]" />
                  Ver ficha de {d.registro.animal.texto}
                </Link>
              )}
            </div>
          </Seccion>

          <Seccion titulo="¿Qué hay que hacer?" icono="checklist">
            <ol className="space-y-1.5 text-sm text-on-surface">
              {guia.pasos.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            {guia.seResuelve && (
              <p className="text-xs text-on-surface-variant mt-2 flex items-center gap-1">
                <Icono nombre="auto_mode" clase="text-[14px]" />
                {guia.seResuelve} "Atender" la cierra sin registrar nada.
              </p>
            )}
            {pendiente && acciones && (
              // Al usar una acción, el detalle se cierra para dejar ver su formulario
              <div onClickCapture={alCerrar} className="mt-2">{acciones}</div>
            )}
          </Seccion>

          <Seccion titulo="Origen" icono="rule">
            <div className="rounded-xl border border-outline-variant/30 p-3 text-sm space-y-1.5">
              {d.regla ? (
                <>
                  <p><span className="text-xs text-on-surface-variant">Regla: </span>{d.regla.nombre}</p>
                  {d.regla.descripcion && <p className="text-xs text-on-surface-variant">{d.regla.descripcion}</p>}
                  {d.regla.umbralValor != null && (
                    <p>
                      <span className="text-xs text-on-surface-variant">Umbral: </span>
                      {d.regla.umbralValor} {d.regla.umbralUnidad ?? ''}
                    </p>
                  )}
                </>
              ) : (
                <p><span className="text-xs text-on-surface-variant">Regla: </span>Alerta automática del sistema</p>
              )}
              <p>
                <span className="text-xs text-on-surface-variant">La recibieron: </span>
                {d.destinatarios.length ? d.destinatarios.join(', ') : '—'}
              </p>
            </div>
          </Seccion>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {guia.modulo && (
              <Link to={guia.modulo.ruta} onClick={alCerrar} className="boton boton-secundario text-sm gap-1.5">
                <Icono nombre="arrow_forward" clase="text-[16px]" />
                {guia.modulo.etiqueta}
              </Link>
            )}
            {pendiente && alAtender && (
              <button type="button" onClick={() => { alAtender(); alCerrar(); }} className="boton boton-primario text-sm gap-1.5">
                <Icono nombre="check_circle" clase="text-[16px]" />
                Atender
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
