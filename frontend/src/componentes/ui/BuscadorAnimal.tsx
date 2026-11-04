import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from './Icono';

// Campo de búsqueda con autocompletado de animales (por identificación o nombre),
// reutilizado en los formularios que necesitan referenciar un animal
// existente (historial médico, reproducción, vacunación...).
export interface AnimalResumen {
  id: string;
  numeroIdentificacion: string;
  nombre: string | null;
  sexo?: 'MACHO' | 'HEMBRA';
}

interface PropsBuscadorAnimal {
  valor: string;
  alSeleccionar: (id: string, animal: AnimalResumen | null) => void;
  etiqueta?: string;
  requerido?: boolean;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  // Limita la búsqueda a un sexo (p. ej. solo hembras para un parto)
  sexo?: 'MACHO' | 'HEMBRA';
}

export default function BuscadorAnimal({
  valor,
  alSeleccionar,
  etiqueta,
  requerido,
  placeholder = 'Buscar por identificación o nombre...',
  error,
  disabled,
  sexo,
}: PropsBuscadorAnimal) {
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [animalMostrado, setAnimalMostrado] = useState<AnimalResumen | null>(null);
  const refContenedor = useRef<HTMLDivElement>(null);

  // Cuando el valor cambia externamente, limpiar el texto de búsqueda
  useEffect(() => {
    if (!valor) {
      setAnimalMostrado(null);
      setTermino('');
    }
  }, [valor]);

  const { data: resultados = [], isFetching } = useQuery<AnimalResumen[]>({
    queryKey: ['animales-busqueda', termino, sexo],
    queryFn: () =>
      clienteHttp
        .get('/animales', {
          params: { busqueda: termino, porPagina: 8, estado: 'ACTIVO', ...(sexo && { sexo }) },
        })
        .then((r) => r.data.datos ?? []),
    enabled: termino.length >= 1,
    staleTime: 0,
  });

  useEffect(() => {
    const manejador = (e: MouseEvent) => {
      if (refContenedor.current && !refContenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', manejador);
    return () => document.removeEventListener('mousedown', manejador);
  }, []);

  const textoVisual = animalMostrado
    ? `#${animalMostrado.numeroIdentificacion}${animalMostrado.nombre ? ` — ${animalMostrado.nombre}` : ''}`
    : '';

  const limpiar = () => {
    setTermino('');
    setAnimalMostrado(null);
    alSeleccionar('', null);
    setAbierto(false);
  };

  const seleccionar = (animal: AnimalResumen) => {
    setAnimalMostrado(animal);
    setTermino('');
    setAbierto(false);
    alSeleccionar(animal.id, animal);
  };

  return (
    <div>
      {etiqueta && (
        <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
          {etiqueta} {requerido && <span className="text-error">*</span>}
        </label>
      )}
      <div ref={refContenedor} className="relative">
        <div className="relative">
          <Icono
            nombre="search"
            clase="absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-outline pointer-events-none"
          />
          <input
            type="text"
            value={termino || textoVisual}
            onChange={(e) => {
              setTermino(e.target.value);
              setAbierto(true);
              if (!e.target.value) limpiar();
            }}
            onFocus={() => {
              if (animalMostrado) setTermino('');
              setAbierto(true);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="campo-entrada pl-9 pr-8"
          />
          {(valor || termino) && !disabled && (
            <button
              type="button"
              onClick={limpiar}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5
                         hover:bg-error-container rounded-lg transition-colors"
            >
              <Icono nombre="close" clase="text-[14px] text-outline hover:text-error" />
            </button>
          )}
        </div>

        {abierto && termino.length >= 1 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-xl
                        border border-outline-variant/30 z-50 overflow-hidden max-h-52 overflow-y-auto"
          >
            {isFetching ? (
              <div className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2">
                <Icono nombre="progress_activity" clase="text-[14px] animate-spin text-primary" />
                Buscando...
              </div>
            ) : !resultados.length ? (
              <div className="px-4 py-3 text-xs text-on-surface-variant">
                Sin resultados para "{termino}"{sexo && (sexo === 'HEMBRA' ? ' entre las hembras' : ' entre los machos')}
              </div>
            ) : (
              resultados.map((animal) => (
                <button
                  key={animal.id}
                  type="button"
                  onClick={() => seleccionar(animal)}
                  className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low transition-colors
                             border-b border-outline-variant/10 last:border-0 flex items-center gap-2"
                >
                  <Icono nombre="pets" clase="text-[14px] text-outline flex-shrink-0" />
                  <span className="text-sm font-medium text-on-surface">#{animal.numeroIdentificacion}</span>
                  {animal.nombre && (
                    <span className="text-xs text-on-surface-variant">— {animal.nombre}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-error text-xs mt-1">{error}</p>}
      {valor && animalMostrado && (
        <p className="text-xs text-primary mt-1 flex items-center gap-1">
          <Icono nombre="check_circle" clase="text-[12px]" />
          Animal seleccionado: #{animalMostrado.numeroIdentificacion}
          {animalMostrado.nombre && ` — ${animalMostrado.nombre}`}
        </p>
      )}
    </div>
  );
}
