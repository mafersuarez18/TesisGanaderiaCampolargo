import toast from 'react-hot-toast';
import { clienteHttp } from './clienteAxios';
import { CLAVE_TODOS_LOS_ANIMALES, claveCache, guardarRespuesta } from './cacheOffline';
import { useAutenticacionStore } from '../stores/autenticacionStore';

// Precarga para uso sin conexión: apenas se inicia sesión (y luego cada
// cierto tiempo mientras haya señal) se piden en segundo plano los datos
// que muestra cada pantalla al abrirse, con los mismos parámetros que usa
// esa pantalla. clienteAxios guarda cada respuesta en el dispositivo
// (cacheOffline), así que después se puede usar la app sin señal aunque
// nunca se hayan visitado esas pantallas.
//
// Si se cambian los parámetros con que una pantalla consulta al abrirse,
// hay que actualizarlos aquí también; si no, esa pantalla sin conexión
// solo mostrará lo que se haya visto en ella con señal.

const CLAVE_ULTIMA_PRECARGA = 'campolargo-ultima-precarga';
const INTERVALO_MINIMO_MS = 30 * 60 * 1000;
const PETICIONES_SIMULTANEAS = 4;

interface Consulta {
  url: string;
  params?: Record<string, string | number | boolean>;
}

let precargando = false;

/** Rango "año en curso hasta hoy" del dashboard (estable durante el día). */
export function rangoAnioEnCurso() {
  const ahora = new Date();
  return {
    desde: new Date(ahora.getFullYear(), 0, 1).toISOString(),
    hasta: new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999).toISOString(),
  };
}

async function pedir(consulta: Consulta): Promise<any> {
  try {
    const { data } = await clienteHttp.get(consulta.url, { params: consulta.params, silencioso: true });
    return data;
  } catch {
    return undefined; // sin permiso para ese módulo, error puntual, etc.
  }
}

async function pedirTodas(consultas: Consulta[], yaPedidas: Consulta[]): Promise<void> {
  // Sin repetir las que ya se pidieron (varias pantallas comparten consultas).
  const vistas = new Set(yaPedidas.map((c) => claveCache(c.url, c.params)));
  const cola = consultas.filter((c) => {
    const clave = claveCache(c.url, c.params);
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
  const trabajadores = Array.from({ length: PETICIONES_SIMULTANEAS }, async () => {
    while (cola.length) await pedir(cola.shift()!);
  });
  await Promise.all(trabajadores);
}

function consultasDePantallas(): Consulta[] {
  const anio = new Date().getFullYear();
  return [
    // Barra superior
    { url: '/notificaciones/no-leidas/conteo' },
    { url: '/notificaciones', params: { porPagina: 8 } },
    // Dashboard
    { url: '/analytics/dashboard' },
    { url: '/analytics/porcentaje-tratados', params: rangoAnioEnCurso() },
    { url: '/analytics/recurrencia-patologias' },
    { url: '/notificaciones', params: { limite: 5, noLeidas: true } },
    { url: '/reproduccion/partos-proximos', params: { dias: 30, limite: 5 } },
    // Fincas, lotes y catálogos
    { url: '/fincas', params: { porPagina: 100 } },
    { url: '/lotes' },
    { url: '/animales/razas' },
    { url: '/vacunacion/medicamentos' },
    // Animales (listado por defecto y selectores de padre/madre)
    { url: '/animales', params: { pagina: 1, porPagina: 25, estado: 'ACTIVO' } },
    ...(['MACHO', 'HEMBRA'] as const).map((sexo) => ({
      url: '/animales',
      params: { sexo, estado: 'ACTIVO', porPagina: 200, ordenPor: 'numeroIdentificacion', direccionOrden: 'asc' },
    })),
    // Historial médico
    { url: '/historial-medico', params: { pagina: 1, porPagina: 20 } },
    // Vacunación
    { url: '/vacunacion/calendarios' },
    { url: '/vacunacion', params: { porPagina: 50 } },
    { url: '/vacunacion/cumplimiento-por-lote' },
    // Reproducción
    { url: '/reproduccion/partos-proximos', params: { dias: 60, limite: 50 } },
    { url: '/reproduccion', params: { pagina: 1, porPagina: 25 } },
    { url: '/reproduccion/indicadores', params: { anio } },
    // Inseminación
    { url: '/inseminacion/sementales' },
    { url: '/inseminacion/inventario', params: { pagina: 1, porPagina: 20 } },
    { url: '/inseminacion', params: { pagina: 1, porPagina: 20 } },
    { url: '/animales', params: { sexo: 'HEMBRA', estado: 'ACTIVO', porPagina: 200 } },
    { url: '/reproduccion/efectividad-inseminacion' },
    // Geolocalización
    { url: '/geolocalizacion/dispositivos' },
    { url: '/geolocalizacion/animales' },
    // Alertas
    { url: '/alertas/resumen' },
    { url: '/notificaciones', params: { pagina: 1, porPagina: 20 } },
    { url: '/alertas' },
    { url: '/usuarios' },
    // Seguridad y auditoría (solo responden si el usuario tiene permiso)
    { url: '/roles' },
    { url: '/roles/privilegios/catalogo' },
    { url: '/usuarios', params: { porPagina: 50 } },
    { url: '/auditoria', params: { pagina: 1, porPagina: 30 } },
  ];
}

// Todas las páginas del listado de animales, guardadas juntas: de ahí salen
// sin conexión las búsquedas y filtros que nunca se consultaron con señal.
async function precargarListadoCompletoAnimales(): Promise<Array<{ id: string }>> {
  const todos: Array<{ id: string }> = [];
  for (let pagina = 1; ; pagina++) {
    const respuesta = await pedir({ url: '/animales', params: { pagina, porPagina: 100 } });
    if (!respuesta?.datos) return todos;
    todos.push(...respuesta.datos);
    if (pagina >= (respuesta.meta?.totalPaginas ?? 1)) break;
  }
  await guardarRespuesta(CLAVE_TODOS_LOS_ANIMALES, todos);
  return todos;
}

async function precargarTodo(): Promise<void> {
  const consultaFincas: Consulta = { url: '/fincas', params: { porPagina: 100 } };
  const consultaCalendarios: Consulta = { url: '/vacunacion/calendarios' };
  const [animales, fincas, calendarios] = await Promise.all([
    precargarListadoCompletoAnimales(),
    pedir(consultaFincas),
    pedir(consultaCalendarios),
  ]);
  const anio = new Date().getFullYear();

  await pedirTodas([
    ...consultasDePantallas(),
    // Una por finca: detalle, sus animales, sus lotes e indicadores
    ...((fincas?.datos ?? []) as Array<{ id: string }>).flatMap(({ id }): Consulta[] => [
      { url: `/fincas/${id}` },
      { url: `/fincas/${id}/animales`, params: { pagina: 1, porPagina: 30 } },
      { url: '/lotes', params: { fincaId: id } },
      { url: '/lotes', params: { fincaId: id, porPagina: 100 } },
      { url: '/reproduccion/indicadores', params: { anio, fincaId: id } },
    ]),
    // Registros de cada calendario de vacunación
    ...((calendarios?.datos ?? calendarios ?? []) as Array<{ id: string }>).map(({ id }) => ({
      url: '/vacunacion', params: { porPagina: 50, calendarioVacunacionId: id },
    })),
    // Una por animal: ficha y datos para el formulario de consulta médica
    ...animales.flatMap(({ id }): Consulta[] => [
      { url: `/animales/${id}` },
      { url: '/historial-medico/prefill', params: { animalId: id } },
    ]),
  ], [consultaFincas, consultaCalendarios]);
}

/**
 * Descarga en segundo plano los datos de toda la app. Sin `forzar`, no hace
 * nada si la última precarga fue hace menos de 30 minutos. `avisar` muestra
 * al usuario el progreso (se usa justo después de iniciar sesión).
 */
export async function precargarDatosOffline({ forzar = false, avisar = false } = {}): Promise<void> {
  if (precargando || !navigator.onLine || !useAutenticacionStore.getState().tokenAcceso) return;

  let ultima = 0;
  try { ultima = Number(localStorage.getItem(CLAVE_ULTIMA_PRECARGA)) || 0; } catch { /* sin localStorage */ }
  if (!forzar && Date.now() - ultima < INTERVALO_MINIMO_MS) return;

  precargando = true;
  const idToast = avisar ? toast.loading('Preparando la app para usarla sin conexión...') : undefined;
  try {
    await precargarTodo();
    try { localStorage.setItem(CLAVE_ULTIMA_PRECARGA, String(Date.now())); } catch { /* sin localStorage */ }
    if (idToast) toast.success('Listo: la app ya se puede usar sin conexión.', { id: idToast });
  } catch {
    if (idToast) toast.dismiss(idToast);
  } finally {
    precargando = false;
  }
}

/** Precarga al abrir la app con sesión iniciada y cada vez que vuelve la señal. */
export function iniciarPrecargaAutomatica(): void {
  precargarDatosOffline();
  window.addEventListener('online', () => { precargarDatosOffline(); });
}

export function olvidarUltimaPrecarga(): void {
  try { localStorage.removeItem(CLAVE_ULTIMA_PRECARGA); } catch { /* sin localStorage */ }
}
