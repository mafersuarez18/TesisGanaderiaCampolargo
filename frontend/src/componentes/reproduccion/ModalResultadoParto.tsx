import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../ui/Modal';
import CampoFecha from '../ui/CampoFecha';
import Icono from '../ui/Icono';
import { fechaLocalISO, isoMediodia, invalidarSeguimientoReproductivo } from './seguimientoReproductivo';

// Cierra una gestación en curso con su resultado (parto, aborto o pérdida).
// En un parto también se registran los datos de la cría; el backend deja el
// nacimiento y el evento en el historial reproductivo de la madre.

export interface GestacionACerrar {
  id: string;
  /** Texto para identificar a la madre, p. ej. "#CAL-005 · Paloma". */
  descripcion: string;
}

type Resultado = 'PARTO' | 'ABORTO' | 'PERDIDA';

const OPCIONES: { valor: Resultado; et: string; ico: string; activo: string }[] = [
  { valor: 'PARTO',   et: 'Parto',   ico: 'child_care', activo: 'bg-primary text-on-primary border-primary' },
  { valor: 'ABORTO',  et: 'Aborto',  ico: 'warning',    activo: 'bg-error text-on-error border-error' },
  { valor: 'PERDIDA', et: 'Pérdida', ico: 'heart_broken', activo: 'bg-error text-on-error border-error' },
];

export default function ModalResultadoParto({ gestacion, alCerrar }: {
  gestacion: GestacionACerrar | null;
  alCerrar: () => void;
}) {
  return (
    <Modal
      abierto={!!gestacion}
      alCerrar={alCerrar}
      titulo="¿Cómo salió el parto?"
      descripcion={gestacion?.descripcion}
    >
      {gestacion && <Formulario key={gestacion.id} gestacion={gestacion} alCerrar={alCerrar} />}
    </Modal>
  );
}

function Formulario({ gestacion, alCerrar }: { gestacion: GestacionACerrar; alCerrar: () => void }) {
  const qc = useQueryClient();
  const [resultado, setResultado] = useState<Resultado>('PARTO');
  const [fecha, setFecha] = useState(fechaLocalISO());
  const [tipoParto, setTipoParto] = useState('NORMAL');
  const [sexoCria, setSexoCria] = useState('');
  const [estadoCria, setEstadoCria] = useState('VIVO');
  const [peso, setPeso] = useState('');
  const [complicaciones, setComplicaciones] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const esParto = resultado === 'PARTO';

  const mutacion = useMutation({
    mutationFn: () => clienteHttp.patch(`/reproduccion/gestaciones/${gestacion.id}/cerrar`, {
      resultado,
      fechaPartoReal: isoMediodia(fecha),
      nacimiento: {
        ...(esParto && {
          tipoParto,
          estadoCria,
          ...(sexoCria && { sexoCria }),
          ...(peso && { pesoAlNacer: Number(peso) }),
          ...(complicaciones.trim() && { complicaciones: complicaciones.trim() }),
        }),
        ...(observaciones.trim() && { observaciones: observaciones.trim() }),
      },
    }, { descripcionOffline: 'Resultado de parto' }),
    onSuccess: (r) => {
      invalidarSeguimientoReproductivo(qc);
      if (!r.data?.offline) {
        toast.success(
          !esParto ? 'Registrado: la gestación quedó cerrada'
            : estadoCria === 'VIVO' ? 'Parto registrado. La cría quedó en Animales → Crías por registrar para darla de alta cuando tenga su identificación.'
            : 'Parto registrado: la gestación quedó cerrada',
          { duration: 6000 },
        );
      }
      alCerrar();
    },
    onError: (e: any) => toast.error(e?.response?.data?.mensaje ?? 'No se pudo registrar el resultado'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutacion.mutate(); }} className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {OPCIONES.map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => setResultado(op.valor)}
            aria-pressed={resultado === op.valor}
            className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
              resultado === op.valor ? op.activo : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <Icono nombre={op.ico} clase="text-[18px]" />
            {op.et}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
          {esParto ? 'Fecha del parto' : 'Fecha'}
        </label>
        <CampoFecha value={fecha} onChange={setFecha} max={fechaLocalISO()} />
      </div>

      {esParto && (
        <div className="grid grid-cols-2 gap-3 p-3 bg-surface-container rounded-xl">
          <p className="col-span-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Cría</p>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Estado</label>
            <select value={estadoCria} onChange={(e) => setEstadoCria(e.target.value)} className="campo-entrada text-sm">
              <option value="VIVO">Viva</option>
              <option value="MUERTO_AL_NACER">Muerta al nacer</option>
              <option value="MUERTO_NEONATAL">Murió en las primeras 24 h</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Sexo</label>
            <select value={sexoCria} onChange={(e) => setSexoCria(e.target.value)} className="campo-entrada text-sm">
              <option value="">Sin especificar</option>
              <option value="HEMBRA">Hembra</option>
              <option value="MACHO">Macho</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Tipo de parto</label>
            <select value={tipoParto} onChange={(e) => setTipoParto(e.target.value)} className="campo-entrada text-sm">
              <option value="NORMAL">Normal</option>
              <option value="DISTOCICO">Distócico</option>
              <option value="CESAREA">Cesárea</option>
              <option value="PREMATURO">Prematuro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Peso al nacer (kg)</label>
            <input
              type="number" min="0" step="0.1" value={peso}
              onChange={(e) => setPeso(e.target.value)}
              className="campo-entrada text-sm" placeholder="Ej: 32"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Complicaciones</label>
            <input
              type="text" value={complicaciones}
              onChange={(e) => setComplicaciones(e.target.value)}
              className="campo-entrada text-sm" placeholder="Ninguna"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
        <textarea
          rows={2}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          className="campo-entrada resize-none"
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
