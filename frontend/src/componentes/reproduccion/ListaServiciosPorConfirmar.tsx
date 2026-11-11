import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../ui/Badge';
import Icono from '../ui/Icono';
import ModalConfirmarServicio, { type ServicioAConfirmar } from './ModalConfirmarServicio';
import ModalDetalleEvento from './ModalDetalleEvento';

// Servicios a los que falta registrar si la hembra quedó preñada. Se usa en
// dos lugares: Inseminación (solo inseminaciones) y Reproducción (solo montas
// naturales). Al confirmar la preñez se abre la gestación, que queda
// vinculada al servicio y muestra su origen en Reproducción → Gestaciones.

export interface ServicioPorConfirmar {
  id: string;
  tipo: 'INSEMINACION_ARTIFICIAL' | 'MONTA_NATURAL';
  fecha: string;
  observaciones?: string;
  animal: { id: string; numeroIdentificacion: string; nombre?: string; lote?: { finca?: { nombre: string } } };
  semental: string | null;
  toro: string | null;
  numeroIntento: number | null;
  diasTranscurridos: number;
  fechaRevision: string;
  listoParaRevisar: boolean;
}

/** Servicios por confirmar de un tipo (comparte caché con el resto del seguimiento). */
export function useServiciosPorConfirmar(tipo?: ServicioPorConfirmar['tipo']) {
  return useQuery<ServicioPorConfirmar[]>({
    queryKey: ['servicios-por-confirmar', tipo ?? 'todos'],
    queryFn: () => clienteHttp.get('/reproduccion/servicios-por-confirmar', { params: tipo ? { tipo } : {} })
      .then((r) => r.data.datos ?? []),
    refetchInterval: 5 * 60_000,
  });
}

const nombreAnimal = (numero: string, nombre?: string | null) => `#${numero}${nombre ? ` · ${nombre}` : ''}`;

export default function ListaServiciosPorConfirmar({ tipo }: { tipo: ServicioPorConfirmar['tipo'] }) {
  const navegar = useNavigate();
  const { data: servicios = [], isLoading } = useServiciosPorConfirmar(tipo);
  const [aConfirmar, setAConfirmar] = useState<ServicioAConfirmar | null>(null);
  const [prenadaInicial, setPrenadaInicial] = useState(true);
  const [detalle, setDetalle] = useState<ServicioPorConfirmar | null>(null);

  const esIA = tipo === 'INSEMINACION_ARTIFICIAL';
  const abrirConfirmacion = (s: ServicioPorConfirmar, prenada: boolean) => {
    setPrenadaInicial(prenada);
    setAConfirmar({
      id: s.id, descripcion: nombreAnimal(s.animal.numeroIdentificacion, s.animal.nombre), fecha: s.fecha, tipo: s.tipo, toro: s.toro,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 px-4 py-3 bg-surface-container rounded-2xl border border-outline-variant/20">
        <Icono nombre="info" clase="text-[18px] text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {esIA
            ? 'Inseminaciones a las que falta registrar si la hembra quedó preñada.'
            : 'Montas naturales a las que falta registrar si la hembra quedó preñada. Las inseminaciones se confirman en el módulo Inseminación.'}
          {' '}A los 21 días del servicio llega una alerta para revisarla; al confirmar la preñez se abre la gestación
          (Reproducción → Gestaciones) indicando que fue resultado de {esIA ? 'una inseminación' : 'una monta natural'}.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />)}
        </div>
      ) : !servicios.length ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <Icono nombre="task_alt" clase="text-[40px] text-outline mx-auto mb-3" />
          <p className="font-medium text-on-surface-variant">Nada pendiente por confirmar</p>
          <p className="text-sm text-outline mt-1">
            {esIA ? 'Las inseminaciones nuevas aparecerán aquí' : 'Las montas naturales nuevas aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
          {servicios.map((s, idx) => (
            <div
              key={s.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3
                         ${idx < servicios.length - 1 ? 'border-b border-outline-variant/20' : ''}`}
            >
              <button type="button" onClick={() => setDetalle(s)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="p-2 bg-surface-container rounded-xl flex-shrink-0">
                  <Icono nombre={esIA ? 'science' : 'pets'} clase="text-[16px] text-on-surface-variant" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {nombreAnimal(s.animal.numeroIdentificacion, s.animal.nombre)}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {esIA ? 'Inseminación' : 'Monta natural'} del{' '}
                    {new Date(s.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {s.semental && ` · ${s.semental}`}{s.toro && ` · Toro ${s.toro}`}
                    {' · '}hace {s.diasTranscurridos} día(s)
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {!s.listoParaRevisar && (
                  <Badge variante="gris" tamano="xs">
                    Revisar el {new Date(s.fechaRevision).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                  </Badge>
                )}
                <button type="button" onClick={() => abrirConfirmacion(s, true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  Preñada
                </button>
                <button type="button" onClick={() => abrirConfirmacion(s, false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-error-container text-on-error-container hover:opacity-80 transition-colors">
                  Vacía
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalConfirmarServicio servicio={aConfirmar} prenadaInicial={prenadaInicial} alCerrar={() => setAConfirmar(null)} />
      <ModalDetalleEvento
        eventoId={detalle?.id ?? null}
        alCerrar={() => setDetalle(null)}
        alVerAnimal={(animalId) => navegar(`/animales/${animalId}`)}
        alConfirmar={(prenada) => {
          if (!detalle) return;
          setDetalle(null);
          abrirConfirmacion(detalle, prenada);
        }}
      />
    </div>
  );
}
