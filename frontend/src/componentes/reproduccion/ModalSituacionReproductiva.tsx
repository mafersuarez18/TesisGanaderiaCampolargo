import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import Modal from '../ui/Modal';
import Icono from '../ui/Icono';
import { invalidarSeguimientoReproductivo, isoMediodia, fechaLocalISO } from './seguimientoReproductivo';

// Cuando se intenta inseminar, registrar una monta o un celo a una hembra que
// tiene un servicio sin confirmar o una gestación en curso, el backend
// responde 409 con el caso y aquí se pregunta qué pasó:
//  - Preñada: no se registra lo nuevo. Si había un servicio pendiente, se
//    confirma la preñez (se abre la gestación).
//  - Vacía: el formulario reenvía con resolucionPrevia = 'VACIA' y el backend
//    cierra lo pendiente (diagnóstico negativo o gestación perdida) antes de
//    registrar lo nuevo.

export interface ConflictoReproductivo {
  mensaje: string;
  codigo: 'SERVICIO_PENDIENTE' | 'GESTACION_EN_CURSO';
  animal: { id: string; nombre: string };
  servicio?: { id: string; tipo: 'INSEMINACION_ARTIFICIAL' | 'MONTA_NATURAL'; fecha: string; dias: number };
  gestacion?: { id: string; fechaInicio: string; fechaPartoEsperado: string; dias: number; origen: string | null };
}

/** Extrae el caso de un error de la API, o null si es otro tipo de error. */
export function conflictoReproductivo(error: any): ConflictoReproductivo | null {
  const datos = error?.response?.data;
  const codigo = datos?.detalle?.codigo;
  if (error?.response?.status !== 409 || (codigo !== 'SERVICIO_PENDIENTE' && codigo !== 'GESTACION_EN_CURSO')) return null;
  return { mensaje: datos.mensaje, ...datos.detalle };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

export default function ModalSituacionReproductiva({ conflicto, queSeRegistra, alCerrar, alVacia, alPrenada }: {
  conflicto: ConflictoReproductivo | null;
  /** Lo que se estaba registrando, p. ej. "la inseminación". */
  queSeRegistra: string;
  /** Cierra solo esta ventana (vuelve al formulario). */
  alCerrar: () => void;
  /** Está vacía: reenviar el registro con resolucionPrevia = 'VACIA'. */
  alVacia: () => void;
  /** Está preñada: se cancela el registro (cerrar el formulario). */
  alPrenada: () => void;
}) {
  const qc = useQueryClient();
  const [procesando, setProcesando] = useState(false);
  const esServicio = conflicto?.codigo === 'SERVICIO_PENDIENTE';

  const confirmarPrenada = async () => {
    if (!conflicto) return;
    if (esServicio && conflicto.servicio) {
      setProcesando(true);
      try {
        await clienteHttp.patch(`/reproduccion/servicios/${conflicto.servicio.id}/confirmar`, {
          prenada: true,
          fechaDiagnostico: isoMediodia(fechaLocalISO()),
        });
        invalidarSeguimientoReproductivo(qc);
        toast.success(`Preñez confirmada: se abrió la gestación de ${conflicto.animal.nombre}. No se registró ${queSeRegistra}.`);
      } catch (e: any) {
        toast.error(e?.response?.data?.mensaje ?? 'No se pudo confirmar la preñez');
        setProcesando(false);
        return;
      }
      setProcesando(false);
    } else {
      toast(`${conflicto.animal.nombre} sigue preñada: no se registró ${queSeRegistra}.`, { icon: '🐄' });
    }
    alPrenada();
  };

  const servicio = conflicto?.servicio;
  const gestacion = conflicto?.gestacion;
  const tipoServicio = servicio?.tipo === 'INSEMINACION_ARTIFICIAL' ? 'inseminó' : 'tuvo monta natural';

  return (
    <Modal
      abierto={!!conflicto}
      alCerrar={procesando ? () => {} : alCerrar}
      titulo={esServicio ? '¿Quedó preñada?' : '¿Qué pasó con su gestación?'}
      tamano="md"
    >
      {conflicto && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
            <Icono nombre="help" clase="text-[22px] text-amber-700 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              {esServicio && servicio ? (
                <>
                  <strong>{conflicto.animal.nombre}</strong> se {tipoServicio} hace <strong>{servicio.dias} {servicio.dias === 1 ? 'día' : 'días'}</strong>{' '}
                  ({fmt(servicio.fecha)}) y todavía no se ha confirmado si quedó preñada. ¿Quedó preñada?
                </>
              ) : gestacion ? (
                <>
                  <strong>{conflicto.animal.nombre}</strong> tiene un diagnóstico de gestación: lleva <strong>{gestacion.dias} días</strong>{' '}
                  preñada (desde el {fmt(gestacion.fechaInicio)}, parto esperado el {fmt(gestacion.fechaPartoEsperado)}).
                  ¿Sigue preñada?
                </>
              ) : conflicto.mensaje}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={procesando}
              onClick={confirmarPrenada}
              className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-left transition-colors disabled:opacity-60"
            >
              <span className="flex items-center gap-2 font-semibold text-primary">
                <Icono nombre={procesando ? 'progress_activity' : 'vaca_prenada'} clase={`text-[20px] ${procesando ? 'animate-spin' : ''}`} />
                {esServicio ? 'Preñada' : 'Sigue preñada'}
              </span>
              <span className="text-xs text-on-surface-variant">
                {esServicio
                  ? `Se confirma la preñez (se abre la gestación) y no se registra ${queSeRegistra}.`
                  : `No se registra ${queSeRegistra}.`}
              </span>
            </button>
            <button
              type="button"
              disabled={procesando}
              onClick={alVacia}
              className="flex flex-col items-start gap-1 p-4 rounded-xl border-2 border-error/30 bg-error-container/30 hover:bg-error-container/50 text-left transition-colors disabled:opacity-60"
            >
              <span className="flex items-center gap-2 font-semibold text-error">
                <Icono nombre="block" clase="text-[20px]" />
                Vacía
              </span>
              <span className="text-xs text-on-surface-variant">
                {esServicio
                  ? `Se registra que no quedó preñada y luego ${queSeRegistra}.`
                  : `Se cierra la gestación como perdida y luego se registra ${queSeRegistra}.`}
              </span>
            </button>
          </div>

          <button type="button" onClick={alCerrar} disabled={procesando}
            className="w-full text-xs text-on-surface-variant hover:text-on-surface underline">
            Volver al formulario sin decidir
          </button>
        </div>
      )}
    </Modal>
  );
}
