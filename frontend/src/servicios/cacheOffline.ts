import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Copia local (IndexedDB) de las respuestas GET de la API, para poder
// mostrar datos sin conexión. clienteAxios guarda aquí cada respuesta
// exitosa y, si una consulta falla por falta de red, responde con lo
// guardado. precargaOffline.ts la llena apenas se inicia sesión, para que
// no haga falta haber visitado cada pantalla antes de quedarse sin señal.
//
// A diferencia de la caché del service worker (que solo existe en el build
// de producción y compara la URL exacta), la clave aquí es la ruta con los
// parámetros ordenados y sin los vacíos: '/animales?estado=ACTIVO&pagina=1'
// es la misma clave sin importar en qué orden la arme cada pantalla.

interface RespuestaGuardada {
  datos: unknown;
  guardadoEn: number;
}

interface EsquemaCache extends DBSchema {
  respuestas: {
    key: string;
    value: RespuestaGuardada;
  };
}

// Listado completo de animales (todas las páginas): de aquí salen, sin
// conexión, las búsquedas y filtros de animales que nunca se consultaron
// con esos mismos parámetros (buscador, filtros del listado, etc.).
export const CLAVE_TODOS_LOS_ANIMALES = '__animales_todos__';

let promesaDB: Promise<IDBPDatabase<EsquemaCache>> | null = null;

function obtenerDB() {
  if (!promesaDB) {
    promesaDB = openDB<EsquemaCache>('campolargo-cache-offline', 1, {
      upgrade(db) {
        db.createObjectStore('respuestas');
      },
    });
  }
  return promesaDB;
}

function parametrosNormalizados(url: string, params?: Record<string, unknown>): URLSearchParams {
  const u = new URL(url, 'http://local');
  const entradas: Array<[string, string]> = [];
  u.searchParams.forEach((valor, clave) => {
    if (valor !== '') entradas.push([clave, valor]);
  });
  Object.entries(params ?? {}).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== '') entradas.push([clave, String(valor)]);
  });
  entradas.sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entradas);
}

export function claveCache(url: string, params?: Record<string, unknown>): string {
  const ruta = new URL(url, 'http://local').pathname;
  const qs = parametrosNormalizados(url, params).toString();
  return qs ? `${ruta}?${qs}` : ruta;
}

export async function guardarRespuesta(clave: string, datos: unknown): Promise<void> {
  try {
    const db = await obtenerDB();
    await db.put('respuestas', { datos, guardadoEn: Date.now() }, clave);
  } catch {
    // Sin espacio o IndexedDB no disponible (p. ej. navegación privada):
    // la app sigue funcionando, solo que sin copia offline.
  }
}

export async function leerRespuesta(clave: string): Promise<unknown | undefined> {
  try {
    const db = await obtenerDB();
    return (await db.get('respuestas', clave))?.datos;
  } catch {
    return undefined;
  }
}

export async function vaciarCacheOffline(): Promise<void> {
  try {
    const db = await obtenerDB();
    await db.clear('respuestas');
  } catch { /* nada que vaciar */ }
}

// ── Listados de animales sin conexión ────────────────────────────────────────

interface AnimalListado {
  numeroIdentificacion: string;
  nombre?: string | null;
  color?: string | null;
  sexo: string;
  estado: string;
  fechaIngreso?: string;
  fechaNacimiento?: string;
  raza?: { id: string } | null;
  lote?: { id: string; finca?: { id: string } | null } | null;
  [campo: string]: unknown;
}

/**
 * Arma, sin conexión, la respuesta de GET /animales o GET
 * /fincas/:id/animales con cualquier combinación de búsqueda, filtros,
 * orden y página, aplicando sobre el listado completo guardado los mismos
 * criterios que usa el backend (animales.repositorio.ts). Devuelve
 * undefined si la ruta no es un listado de animales o si todavía no se
 * guardó el listado completo.
 */
export async function respuestaAnimalesOffline(url: string, params?: Record<string, unknown>) {
  const ruta = new URL(url, 'http://local').pathname;
  const deFinca = ruta.match(/^\/fincas\/([^/]+)\/animales$/);
  if (ruta !== '/animales' && !deFinca) return undefined;

  const todos = (await leerRespuesta(CLAVE_TODOS_LOS_ANIMALES)) as AnimalListado[] | undefined;
  if (!todos) return undefined;

  const p = Object.fromEntries(parametrosNormalizados(url, params));
  const busqueda = p.busqueda?.toLowerCase();
  const fincaId = deFinca ? deFinca[1] : p.fincaId;

  const filtrados = todos.filter((a) =>
    (!busqueda || [a.numeroIdentificacion, a.nombre, a.color].some((v) => v?.toLowerCase().includes(busqueda)))
    && (!fincaId || a.lote?.finca?.id === fincaId)
    && (!p.loteId || a.lote?.id === p.loteId)
    && (!p.razaId || a.raza?.id === p.razaId)
    && (!p.sexo || a.sexo === p.sexo)
    && (!p.estado || a.estado === p.estado),
  );

  const ordenPor = p.ordenPor ?? 'fechaIngreso';
  const signo = (p.direccionOrden ?? 'desc') === 'asc' ? 1 : -1;
  filtrados.sort((a, b) => signo * String(a[ordenPor] ?? '').localeCompare(String(b[ordenPor] ?? '')));

  const pagina = Math.max(1, Number(p.pagina) || 1);
  const porPagina = Math.min(100, Math.max(1, Number(p.porPagina) || 20));
  return {
    exito: true,
    mensaje: 'Listado obtenido sin conexión',
    datos: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina),
    meta: {
      total: filtrados.length,
      pagina,
      porPagina,
      totalPaginas: Math.ceil(filtrados.length / porPagina),
    },
  };
}
