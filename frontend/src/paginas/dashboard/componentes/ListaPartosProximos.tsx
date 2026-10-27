import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { clienteHttp } from '../../../servicios/clienteAxios';
import { EsqueletoLinea } from '../../../componentes/ui/EsqueletoTarjeta';
import Icono from '../../../componentes/ui/Icono';

// Gestaciones con parto esperado en el corto plazo, coloreadas según
// cuán cerca está la fecha (urgente/próximo/futuro).
interface PartoProximo {
  id: string;
  madreNumeroIdentificacion: string;
  madreNombre?: string;
  fechaPartoEsperado: string;
  finca: string;
  diasRestantes: number;
}

function clasesDias(dias: number): string {
  if (dias <= 7)  return 'text-error bg-error-container';
  if (dias <= 15) return 'text-secondary bg-secondary/10';
  return 'text-primary bg-primary/10';
}

async function obtenerPartosProximos(): Promise<PartoProximo[]> {
  const { data } = await clienteHttp.get('/reproduccion/partos-proximos?dias=30&limite=5');
  return data.datos ?? [];
}

export default function ListaPartosProximos() {
  const { data: partos, isLoading } = useQuery({
    queryKey: ['partos-proximos-dashboard'],
    queryFn: obtenerPartosProximos,
    refetchInterval: 1000 * 60 * 10,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <EsqueletoLinea className="w-8 h-8 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <EsqueletoLinea className="h-3 w-2/3" />
              <EsqueletoLinea className="h-3 w-1/2" />
            </div>
            <EsqueletoLinea className="w-14 h-5 rounded-full flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (!partos?.length) {
    return (
      <div className="py-8 text-center">
        <div className="w-10 h-10 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-2">
          <Icono nombre="vaca_prenada" clase="text-[18px] text-secondary" />
        </div>
        <p className="text-sm text-on-surface-variant">Sin partos en los próximos 30 días</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {partos.map((parto) => (
        <div
          key={parto.id}
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-container-low transition-colors cursor-pointer"
        >
          <div className="bg-secondary/10 p-2 rounded-xl flex-shrink-0">
            <Icono nombre="vaca_prenada" relleno clase="text-[14px] text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-on-surface truncate">
              {parto.madreNombre ?? `Identificación ${parto.madreNumeroIdentificacion}`}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <Icono nombre="calendar_today" clase="text-[10px] text-outline" />
              <p className="text-[11px] text-outline">
                {new Date(parto.fechaPartoEsperado).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}
                {' · '}{parto.finca}
              </p>
            </div>
          </div>
          <span className={clsx(
            'text-[11px] font-semibold px-2 py-1 rounded-full flex-shrink-0',
            clasesDias(parto.diasRestantes),
          )}>
            {parto.diasRestantes}d
          </span>
        </div>
      ))}
    </div>
  );
}
