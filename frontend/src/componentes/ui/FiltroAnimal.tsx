import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from './Icono';

// Aviso que se muestra cuando una lista (historial médico, vacunación,
// eventos reproductivos) está filtrada por un animal, normalmente porque se
// llegó desde su ficha: dice de qué animal se trata, permite volver a la
// ficha y quitar el filtro para ver todos los registros.
export default function FiltroAnimal({ animalId, alQuitar }: { animalId: string; alQuitar: () => void }) {
  const { data: animal } = useQuery<{ numeroIdentificacion: string; nombre?: string | null }>({
    queryKey: ['animal', animalId],
    queryFn: () => clienteHttp.get(`/animales/${animalId}`).then((r) => r.data.datos),
  });

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 rounded-2xl bg-primary/10 border border-primary/20">
      <Icono nombre="filter_alt" clase="text-[18px] text-primary flex-shrink-0" />
      <p className="text-sm text-on-surface flex-1 min-w-0">
        Mostrando solo los registros de{' '}
        <strong>
          {animal ? `#${animal.numeroIdentificacion}${animal.nombre ? ` · ${animal.nombre}` : ''}` : 'este animal'}
        </strong>
      </p>
      <div className="flex items-center gap-2">
        <Link
          to={`/animales/${animalId}`}
          className="px-3 py-1 rounded-lg text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
        >
          Ver ficha
        </Link>
        <button
          type="button"
          onClick={alQuitar}
          className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-surface-container-lowest text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Icono nombre="close" clase="text-[14px]" />
          Ver todos
        </button>
      </div>
    </div>
  );
}
