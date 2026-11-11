import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from './Icono';

// Campo "buscar o crear" para el potrero de un animal, igual que el de raza:
// lista los potreros del lote elegido (con cuántos animales aloja cada uno) y,
// si se escribe un nombre que no está, el backend lo crea en ese lote al
// guardar el animal. Resuelve potreroId (existente) o potreroNombre (nuevo).
interface PotreroOpcion { id: string; nombre: string; hectareas: number | null; _count: { animales: number } }

interface PropsSelectorPotrero {
  loteId: string;
  potreroId: string;
  potreroNombre: string;
  /** Hectáreas del potrero nuevo (texto del campo; vacío = sin indicar). */
  hectareas: string;
  onSeleccionar: (id: string) => void;
  onEscribir: (texto: string) => void;
  onHectareas: (valor: string) => void;
}

export default function SelectorPotrero({
  loteId, potreroId, potreroNombre, hectareas, onSeleccionar, onEscribir, onHectareas,
}: PropsSelectorPotrero) {
  const { data: potreros = [] } = useQuery<PotreroOpcion[]>({
    queryKey: ['potreros-lote', loteId],
    queryFn: () => clienteHttp.get(`/lotes/${loteId}/potreros`).then((r) => r.data.datos ?? []),
    enabled: !!loteId,
  });

  const [abierto, setAbierto] = useState(false);
  const refContenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const manejador = (e: MouseEvent) => {
      if (refContenedor.current && !refContenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', manejador);
    return () => document.removeEventListener('mousedown', manejador);
  }, []);

  const seleccionado = potreros.find((p) => p.id === potreroId);
  const texto = seleccionado ? seleccionado.nombre : potreroNombre;
  const normalizado = texto.trim().toLowerCase();
  const coincidencias = normalizado ? potreros.filter((p) => p.nombre.toLowerCase().includes(normalizado)) : potreros;
  const coincideExacta = potreros.some((p) => p.nombre.toLowerCase() === normalizado);
  const esNuevo = !seleccionado && !!normalizado && !coincideExacta;

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--color-piedra-600)] mb-1.5">Potrero</label>
      <div ref={refContenedor} className="relative">
        <input
          type="text"
          value={texto}
          onChange={(e) => { onEscribir(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          disabled={!loteId}
          placeholder={loteId ? 'Seleccione o escriba un potrero...' : 'Primero seleccione un lote'}
          className="campo-entrada disabled:opacity-60"
          autoComplete="off"
        />
        {abierto && loteId && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-lowest rounded-xl shadow-xl
                          border border-outline-variant/30 z-50 overflow-hidden max-h-52 overflow-y-auto">
            {coincidencias.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSeleccionar(p.id); setAbierto(false); }}
                className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low transition-colors
                           border-b border-outline-variant/10 last:border-0 flex items-center gap-2"
              >
                <Icono nombre="grass" clase="text-[14px] text-outline flex-shrink-0" />
                <span className="text-sm text-on-surface flex-1">
                  {p.nombre}
                  {p.hectareas != null && <span className="text-on-surface-variant"> · {p.hectareas} ha</span>}
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  {p._count.animales} {p._count.animales === 1 ? 'animal' : 'animales'}
                </span>
              </button>
            ))}
            {!!normalizado && !coincideExacta && (
              <div className="px-4 py-2.5 flex items-center gap-2 text-primary text-sm bg-primary/5">
                <Icono nombre="add_circle" clase="text-[14px] flex-shrink-0" />
                Se registrará un potrero nuevo en este lote: "{texto.trim()}"
              </div>
            )}
            {!coincidencias.length && !normalizado && (
              <div className="px-4 py-3 text-xs text-on-surface-variant">
                Este lote aún no tiene potreros. Escriba el nombre para registrar uno.
              </div>
            )}
          </div>
        )}
      </div>
      {esNuevo ? (
        <div className="mt-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
          <label className="block text-xs font-medium text-[var(--color-piedra-600)] mb-1.5">
            Superficie del potrero nuevo (hectáreas)
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={hectareas}
            onChange={(e) => onHectareas(e.target.value)}
            placeholder="Opcional, ej: 12.5"
            className="campo-entrada"
          />
          <p className="text-[11px] text-on-surface-variant mt-1">Si no la sabe, déjela en blanco.</p>
        </div>
      ) : (
        <p className="text-[11px] text-on-surface-variant mt-1">Opcional. Muestra los potreros del lote y cuántos animales tiene cada uno.</p>
      )}
    </div>
  );
}
