import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clienteHttp } from '../../../servicios/clienteAxios';
import { EsqueletoLinea } from '../../../componentes/ui/EsqueletoTarjeta';
import { BadgePrioridad } from '../../../componentes/ui/Badge';
import Icono from '../../../componentes/ui/Icono';

// Últimas notificaciones críticas/altas sin atender, con acceso rápido
// para atenderlas desde el propio dashboard.
interface AlertaResumen {
  id: string;
  titulo: string;
  mensaje?: string;
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  creadoEn: string;
  leida: boolean;
  estado: 'PENDIENTE' | 'ENVIADA' | 'LEIDA' | 'DESCARTADA';
}

const CONFIG_PRIORIDAD = {
  BAJA:    { icono: 'notifications',  color: 'text-primary',   fondo: 'bg-primary/10' },
  MEDIA:   { icono: 'info',           color: 'text-tertiary',  fondo: 'bg-tertiary/10' },
  ALTA:    { icono: 'warning',        color: 'text-secondary', fondo: 'bg-secondary/10' },
  CRITICA: { icono: 'gpp_bad',        color: 'text-error',     fondo: 'bg-error-container' },
};

function formatearFechaRelativa(fechaIso: string): string {
  const diferencia = Date.now() - new Date(fechaIso).getTime();
  const minutos = Math.floor(diferencia / 60000);
  if (minutos < 60) return `hace ${minutos}m`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias}d`;
}

async function obtenerAlertasRecientes(): Promise<AlertaResumen[]> {
  const { data } = await clienteHttp.get('/notificaciones?limite=5&noLeidas=true');
  return data.datos ?? [];
}

export default function ListaAlertasRecientes() {
  const queryClient = useQueryClient();

  const { data: alertas, isLoading } = useQuery({
    queryKey: ['alertas-recientes-dashboard'],
    queryFn: obtenerAlertasRecientes,
    refetchInterval: 1000 * 60 * 2,
  });

  const mutAbordar = useMutation({
    mutationFn: (id: string) => clienteHttp.patch(`/notificaciones/${id}/abordar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas-recientes-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones-conteo'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-resumen'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <EsqueletoLinea className="w-8 h-8 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <EsqueletoLinea className="h-3 w-3/4" />
              <EsqueletoLinea className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!alertas?.length) {
    return (
      <div className="py-8 text-center">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
          <Icono nombre="notifications_off" clase="text-[18px] text-primary" />
        </div>
        <p className="text-sm text-on-surface-variant">Sin alertas pendientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alertas.map((alerta) => {
        const cfg = CONFIG_PRIORIDAD[alerta.prioridad] ?? CONFIG_PRIORIDAD.MEDIA;
        return (
          <div
            key={alerta.id}
            className="flex items-start gap-3 p-2 rounded-xl hover:bg-surface-container-low transition-colors group"
          >
            <div className={`${cfg.fondo} p-2 rounded-xl flex-shrink-0 mt-0.5`}>
              <Icono nombre={cfg.icono} relleno clase={`text-[14px] ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-on-surface truncate">{alerta.titulo}</p>
              <p className="text-[11px] text-outline">{formatearFechaRelativa(alerta.creadoEn)}</p>
              {/* Botón abordar — aparece al hover */}
              <button
                onClick={() => mutAbordar.mutate(alerta.id)}
                disabled={mutAbordar.isPending}
                className="mt-1 flex items-center gap-1 text-[10px] text-on-surface-variant hover:text-primary transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                title="Atender — se cierra para todos los que la recibieron"
              >
                <Icono nombre="check_circle" clase="text-[11px]" />
                Atender
              </button>
            </div>
            <BadgePrioridad prioridad={alerta.prioridad} />
          </div>
        );
      })}
    </div>
  );
}
