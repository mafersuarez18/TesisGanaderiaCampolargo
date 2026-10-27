import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../ui/Modal';
import CampoFecha from '../ui/CampoFecha';
import Icono from '../ui/Icono';
import {
  DIAS_GESTACION_BOVINA, fechaLocalISO, isoMediodia, invalidarSeguimientoReproductivo,
} from './seguimientoReproductivo';

// Responde "¿quedó preñada?" para una inseminación o monta. Si fue positivo
// el backend abre la gestación (con el parto estimado a 283 días del
// servicio) y la hembra pasa a "en gestación" en Reproducción.

export interface ServicioAConfirmar {
  id: string;
  /** Texto para identificar a la hembra, p. ej. "#ELP-001 · Lucero". */
  descripcion: string;
  /** Fecha del servicio (ISO). Si se desconoce, el backend estima el parto desde el servicio. */
  fecha?: string;
}

export default function ModalConfirmarServicio({ servicio, prenadaInicial = true, alCerrar }: {
  servicio: ServicioAConfirmar | null;
  prenadaInicial?: boolean;
  alCerrar: () => void;
}) {
  return (
    <Modal
      abierto={!!servicio}
      alCerrar={alCerrar}
      titulo="¿Quedó preñada?"
      descripcion={servicio?.descripcion}
    >
      {servicio && (
        <Formulario key={servicio.id} servicio={servicio} prenadaInicial={prenadaInicial} alCerrar={alCerrar} />
      )}
    </Modal>
  );
}

function Formulario({ servicio, prenadaInicial, alCerrar }: {
  servicio: ServicioAConfirmar;
  prenadaInicial: boolean;
  alCerrar: () => void;
}) {
  const qc = useQueryClient();
  const [prenada, setPrenada] = useState(prenadaInicial);
  const [fechaDiagnostico, setFechaDiagnostico] = useState(fechaLocalISO());
  const [metodo, setMetodo] = useState('');
  const [fechaParto, setFechaParto] = useState(
    servicio.fecha ? fechaLocalISO(new Date(servicio.fecha), DIAS_GESTACION_BOVINA) : '',
  );
  const [observaciones, setObservaciones] = useState('');

  const mutacion = useMutation({
    mutationFn: () => clienteHttp.patch(`/reproduccion/servicios/${servicio.id}/confirmar`, {
      prenada,
      fechaDiagnostico: isoMediodia(fechaDiagnostico),
      ...(metodo && { metodoDiagnostico: metodo }),
      ...(prenada && fechaParto && { fechaPartoEsperado: isoMediodia(fechaParto) }),
      ...(observaciones.trim() && { observaciones: observaciones.trim() }),
    }, { descripcionOffline: 'Resultado de inseminación/monta' }),
    onSuccess: (r) => {
      invalidarSeguimientoReproductivo(qc);
      if (!r.data?.offline) {
        toast.success(prenada
          ? 'Preñez confirmada: la hembra quedó en gestación'
          : 'Registrado: la hembra no quedó preñada');
      }
      alCerrar();
    },
    onError: (e: any) => toast.error(e?.response?.data?.mensaje ?? 'No se pudo registrar el resultado'),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); mutacion.mutate(); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          { valor: true,  et: 'Sí, preñada', ico: 'vaca_prenada', activo: 'bg-primary text-on-primary border-primary' },
          { valor: false, et: 'No, vacía',   ico: 'block',          activo: 'bg-error text-on-error border-error' },
        ].map((op) => (
          <button
            key={op.et}
            type="button"
            onClick={() => setPrenada(op.valor)}
            aria-pressed={prenada === op.valor}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
              prenada === op.valor ? op.activo : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <Icono nombre={op.ico} clase="text-[18px]" />
            {op.et}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Fecha de la revisión</label>
          <CampoFecha value={fechaDiagnostico} onChange={setFechaDiagnostico} max={fechaLocalISO()} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Método (opcional)</label>
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="campo-entrada">
            <option value="">No especificado</option>
            <option value="Ecografía">Ecografía</option>
            <option value="Palpación rectal">Palpación rectal</option>
            <option value="No retornó a celo">No retornó a celo</option>
            <option value="Retornó a celo">Retornó a celo</option>
          </select>
        </div>
      </div>

      {prenada ? (
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Parto esperado</label>
          <CampoFecha value={fechaParto} onChange={setFechaParto} placeholder="A 283 días del servicio" />
          <p className="text-[11px] text-on-surface-variant mt-1">
            {fechaParto ? 'Estimado' : 'Si no la indicas, se estima'} a {DIAS_GESTACION_BOVINA} días del servicio.
            Cuando llegue la fecha recibirás una alerta para registrar cómo salió el parto.
          </p>
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant px-3 py-2.5 bg-surface-container rounded-xl">
          La hembra seguirá disponible para un nuevo servicio. Si se vuelve a inseminar, el seguimiento empieza de nuevo.
        </p>
      )}

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
        <textarea
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="campo-entrada resize-none"
          placeholder="Notas de la revisión..."
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={alCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
        <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
          {mutacion.isPending ? 'Guardando...' : 'Guardar resultado'}
        </button>
      </div>
    </form>
  );
}
