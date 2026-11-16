import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from '../ui/Icono';

interface Aptitud {
  edadDias: number | null;
  edadMinimaDias: number;
  cumple: boolean | null;
  advertencia: string | null;
}

// Advierte (sin bloquear) cuando la hembra elegida para un servicio
// reproductivo no tiene la edad mínima recomendable.
export default function AvisoEdadReproductiva({ animalId, fecha }: { animalId: string; fecha?: string }) {
  const { data } = useQuery<Aptitud>({
    queryKey: ['aptitud-reproductiva', animalId, fecha],
    queryFn: () => clienteHttp
      .get(`/reproduccion/aptitud/${animalId}`, { params: fecha ? { fecha } : {}, silencioso: true })
      .then((r) => r.data.datos),
    enabled: !!animalId,
    staleTime: 60_000,
  });

  if (!data?.advertencia) return null;
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-tertiary/10 border border-tertiary/30 text-xs text-on-surface">
      <Icono nombre="warning" relleno clase="text-[18px] text-tertiary flex-shrink-0 mt-0.5" />
      <p>{data.advertencia}</p>
    </div>
  );
}
