import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge from '../../componentes/ui/Badge';
import Icono from '../../componentes/ui/Icono';

// Crías vivas de partos registrados en Reproducción que todavía no se dieron
// de alta como animales (normalmente porque aún no tienen arete). "Registrar"
// abre el formulario de animal ya rellenado con los datos del nacimiento.

export interface CriaPorRegistrar {
  id: string; // id del nacimiento
  fechaNacimiento: string;
  sexoCria: 'MACHO' | 'HEMBRA' | null;
  pesoAlNacer: number | null;
  tipoParto: string;
  observaciones: string | null;
  diasDeNacida: number;
  semental: string | null;
  gestacion: {
    madre: {
      id: string;
      numeroIdentificacion: string;
      nombre: string | null;
      proposito: string;
      raza: { id: string; nombre: string };
      lote: { id: string; nombre: string; finca: { id: string; nombre: string } };
    };
  };
}

export const CLAVE_CRIAS_POR_REGISTRAR = ['crias-por-registrar'];

export function useCriasPorRegistrar() {
  return useQuery<CriaPorRegistrar[]>({
    queryKey: CLAVE_CRIAS_POR_REGISTRAR,
    queryFn: () => clienteHttp.get('/animales/crias-por-registrar').then((r) => r.data.datos ?? []),
  });
}

export function nombreMadre(cria: CriaPorRegistrar) {
  const m = cria.gestacion.madre;
  return `#${m.numeroIdentificacion}${m.nombre ? ` · ${m.nombre}` : ''}`;
}

export default function CriasPorRegistrar() {
  const navegar = useNavigate();
  const { data: crias = [] } = useCriasPorRegistrar();
  if (!crias.length) return null;

  return (
    <div className="tarjeta-vidrio rounded-2xl overflow-hidden border border-secondary/25">
      <div className="flex items-center gap-3 px-4 py-3 bg-secondary/10">
        <div className="p-2 bg-secondary/15 rounded-xl">
          <Icono nombre="child_care" clase="text-[20px] text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface">
            Crías por registrar <span className="text-secondary">({crias.length})</span>
          </p>
          <p className="text-xs text-on-surface-variant">
            Nacieron en un parto registrado y todavía no están en el inventario. Regístralas cuando tengan su identificación.
          </p>
        </div>
      </div>
      {crias.map((c, idx) => (
        <div
          key={c.id}
          className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 ${
            idx < crias.length - 1 ? 'border-b border-outline-variant/20' : ''
          }`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 bg-surface-container rounded-xl flex-shrink-0">
              <Icono nombre="pets" clase="text-[16px] text-on-surface-variant" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-on-surface">Cría de {nombreMadre(c)}</span>
                {c.sexoCria && (
                  <Badge variante={c.sexoCria === 'MACHO' ? 'azul' : 'morado'} tamano="xs">
                    {c.sexoCria === 'MACHO' ? 'Macho' : 'Hembra'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-on-surface-variant">
                Nació el {new Date(c.fechaNacimiento).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                {' '}({c.diasDeNacida === 0 ? 'hoy' : `hace ${c.diasDeNacida} día(s)`})
                {c.pesoAlNacer != null && ` · ${c.pesoAlNacer} kg`}
                {' · '}{c.gestacion.madre.lote.finca.nombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navegar(`/animales/nuevo?nacimiento=${c.id}`)}
            className="boton boton-primario gap-1.5 text-xs py-1.5 px-3 self-start sm:self-auto"
          >
            <Icono nombre="add" clase="text-[16px]" />
            Registrar
          </button>
        </div>
      ))}
    </div>
  );
}
