import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAutenticacionStore } from '../stores/autenticacionStore';
import toast from 'react-hot-toast';
import { encolarPeticion, obtenerPendientes, eliminarPendiente, notificarCambio } from './colaSincronizacion';
import { claveCache, guardarRespuesta, leerRespuesta, respuestaAnimalesOffline } from './cacheOffline';
import { clienteQuery } from './clienteQuery';

// Marca de config para pedirle al interceptor que NUNCA encole esta
// petición sin conexión, aunque sea un POST/PATCH/PUT/DELETE: se usa en
// flujos donde el resultado (p. ej. el id de una raza/medicamento recién
// creado) hace falta de inmediato para completar el mismo formulario, así
// que "guardarlo para más tarde" dejaría el formulario a medias en vez de
// completarlo. También se usa para acciones que no tiene sentido diferir
// (login, "evaluar alertas ahora").
declare module 'axios' {
  export interface AxiosRequestConfig {
    sinCola?: boolean;
    descripcionOffline?: string;
    // Peticiones de fondo (la precarga offline) que no deben mostrarle
    // ningún toast de error al usuario si fallan.
    silencioso?: boolean;
    _temporizadorAviso?: ReturnType<typeof setTimeout>;
  }
}

// Escrituras con señal "aparente" (p. ej. WiFi conectado pero sin salida a
// internet, donde navigator.onLine sigue en true): en vez de esperar los 30s
// generales, a los 8s se da por perdida la conexión y se encola. Las subidas
// de archivos quedan con el timeout general, porque pueden tardar de verdad.
const TIMEOUT_ESCRITURA_MS = 8000;
// Si una escritura tarda más que esto, se avisa en pantalla que se está
// esperando al servidor, para que el usuario no crea que la app se trabó.
const AVISO_LENTITUD_MS = 2500;
// Un solo toast compartido: el aviso de "conexión lenta" se transforma en
// el de "guardado en el dispositivo" en el mismo lugar, sin apilarse. Los
// formularios lo reutilizan para cambiar ese aviso por uno más específico.
export const ID_TOAST_CONEXION = 'conexion-escritura';

// El aviso de "mostrando datos guardados" sale una sola vez por cada corte
// de señal, no en cada consulta que se responde desde el dispositivo.
let avisoDatosGuardadosMostrado = false;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { avisoDatosGuardadosMostrado = false; });
}

function esConsultaGuardable(config?: InternalAxiosRequestConfig): boolean {
  return !!config && (config.method ?? 'get').toLowerCase() === 'get'
    && (!config.responseType || config.responseType === 'json');
}

function esEscritura(config: { method?: string; url?: string }): boolean {
  const metodo = (config.method ?? 'get').toLowerCase();
  return metodo !== 'get' && !config.url?.includes('/auth/');
}

// cerrarToast=false se usa cuando la petición se va a encolar: el aviso de
// lentitud no se cierra porque el de "guardado en el dispositivo" lo
// reemplaza en el mismo lugar.
function limpiarAvisoLentitud(
  config?: { _temporizadorAviso?: ReturnType<typeof setTimeout> },
  cerrarToast = true,
) {
  if (config?._temporizadorAviso) {
    clearTimeout(config._temporizadorAviso);
    config._temporizadorAviso = undefined;
    if (cerrarToast) toast.dismiss(ID_TOAST_CONEXION);
  }
}

// Cliente HTTP único de la app: agrega el token en cada petición y, si el
// backend responde 401, intenta renovarlo automáticamente con el refresh
// token antes de reintentar la petición original (sin que el componente
// que la disparó se entere de nada).
const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export const clienteHttp = axios.create({
  baseURL: URL_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Interceptor de solicitud — adjunta el token de acceso
clienteHttp.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tokenAcceso = useAutenticacionStore.getState().tokenAcceso;
    if (tokenAcceso && config.headers) {
      config.headers.Authorization = `Bearer ${tokenAcceso}`;
    }
    // Si el dispositivo ya sabe que no tiene conexión, no tiene sentido
    // esperar los 30s normales de timeout para recién ahí encolar el
    // registro — eso es lo que hacía que el botón "Guardando..." pareciera
    // trabado. Con la señal apagada, se corta casi de inmediato y el
    // interceptor de respuesta lo encola igual (mismo camino de siempre,
    // solo que mucho más rápido).
    if (!navigator.onLine) {
      config.timeout = 1500;
    } else if (esEscritura(config) && !(config.data instanceof FormData)) {
      config.timeout = TIMEOUT_ESCRITURA_MS;
      config._temporizadorAviso = setTimeout(() => {
        toast.loading(
          config.sinCola
            ? 'La conexión está lenta, esperando respuesta del servidor...'
            : 'La conexión está lenta. Si no responde en unos segundos, se guardará en el dispositivo.',
          { id: ID_TOAST_CONEXION },
        );
      }, AVISO_LENTITUD_MS);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Control para evitar múltiples intentos de renovación simultáneos
let renovandoToken = false;
let colaEspera: Array<(token: string | null) => void> = [];

// Evita mostrar un toast de "sin conexión" por cada petición que falla a la
// vez (p. ej. las 4-5 que dispara el dashboard al cargar sin red) — con uno
// solo cada pocos segundos alcanza.
let ultimoToastRedMs = 0;

function procesarCola(token: string | null) {
  colaEspera.forEach((resolver) => resolver(token));
  colaEspera = [];
}

// Renueva el access token usando el refresh token guardado. Si ya hay una
// renovación en curso (p. ej. disparada por otra petición casi al mismo
// tiempo), espera su resultado en vez de duplicar la llamada al backend.
// Devuelve el nuevo access token, o null si la renovación falló (refresh
// token inválido/vencido o inexistente) — en ese caso sí corresponde cerrar
// la sesión. La usa tanto el interceptor de 401 de abajo como RutaProtegida,
// para que ambos compartan el mismo candado y nunca pisarse.
export async function renovarTokenSilencioso(): Promise<string | null> {
  const tienda = useAutenticacionStore.getState();
  if (!tienda.tokenRefresh) return null;

  if (renovandoToken) {
    return new Promise((resolve) => { colaEspera.push(resolve); });
  }

  renovandoToken = true;
  try {
    const { data } = await axios.post(`${URL_BASE}/auth/renovar-token`, {
      tokenRefresh: tienda.tokenRefresh,
    });
    const { tokenAcceso, expiraEn } = data.datos;
    tienda.actualizarToken(tokenAcceso, expiraEn);
    procesarCola(tokenAcceso);
    return tokenAcceso;
  } catch {
    procesarCola(null);
    return null;
  } finally {
    renovandoToken = false;
  }
}

// Interceptor de respuesta — maneja renovación automática de token y errores
clienteHttp.interceptors.response.use(
  (respuesta) => {
    limpiarAvisoLentitud(respuesta.config);
    // Copia local de cada consulta exitosa, para tenerla sin conexión.
    if (esConsultaGuardable(respuesta.config)) {
      guardarRespuesta(claveCache(respuesta.config.url ?? '', respuesta.config.params), respuesta.data);
    }
    return respuesta;
  },
  async (error: AxiosError) => {
    const solicitudOriginal = error.config as InternalAxiosRequestConfig & { _reintentado?: boolean };
    const seEncolara = !error.response && esEscritura(solicitudOriginal ?? {}) && !solicitudOriginal?.sinCola;
    limpiarAvisoLentitud(solicitudOriginal, !seEncolara);
    // El login y la renovación de token también responden 401 cuando las
    // credenciales o el refresh token son inválidos: ese caso no es una
    // "sesión expirada" a renovar/redirigir, es un error a mostrarle al usuario.
    const esRutaAuth = solicitudOriginal?.url?.includes('/auth/iniciar-sesion')
      || solicitudOriginal?.url?.includes('/auth/renovar-token');

    if (error.response?.status === 401 && !esRutaAuth && !solicitudOriginal._reintentado) {
      solicitudOriginal._reintentado = true;

      const nuevoToken = await renovarTokenSilencioso();

      if (!nuevoToken) {
        useAutenticacionStore.getState().cerrarSesion();
        window.location.href = '/iniciar-sesion';
        return Promise.reject(error);
      }

      solicitudOriginal.headers.Authorization = `Bearer ${nuevoToken}`;
      return clienteHttp(solicitudOriginal);
    }

    // Sin respuesta del servidor: sin conexión, CORS o tiempo agotado. Axios
    // solo da "Network Error" en este caso, que no le dice nada útil al
    // usuario — se muestra un mensaje claro, como mucho uno cada pocos
    // segundos (varias peticiones simultáneas fallan todas juntas sin red).
    if (!error.response) {
      const metodo = (solicitudOriginal?.method ?? 'get').toLowerCase();
      // Login/logout/renovar-token nunca se encolan: "iniciar sesión sin
      // conexión" no tiene un resultado válido que fingir, y encolarlo
      // dejaría a la app actuando como si hubiera una sesión que no existe.
      const esMutacion = esEscritura(solicitudOriginal ?? {});

      // Escrituras (crear/editar/eliminar) que no dependan de una respuesta
      // inmediata se guardan para reintentar solas al volver la señal, en
      // vez de perderse. El propio formulario ve esto como un éxito normal
      // (se cierra, limpia, etc.) — solo cambia el toast que ve el usuario.
      if (esMutacion && !solicitudOriginal.sinCola) {
        await encolarPeticion({
          metodo: metodo as 'post' | 'patch' | 'put' | 'delete',
          url: solicitudOriginal.url ?? '',
          datos: solicitudOriginal.data ? intentarParsear(solicitudOriginal.data) : undefined,
          descripcion: solicitudOriginal.descripcionOffline ?? 'Registro pendiente',
        });
        toast('Sin conexión: se guardó en el dispositivo y se subirá solo cuando vuelva la señal.', {
          id: ID_TOAST_CONEXION, icon: '📶', duration: 6000,
        });
        return Promise.resolve({
          data: { exito: true, offline: true, mensaje: 'Guardado sin conexión', datos: null },
          status: 202,
          statusText: 'Guardado sin conexión (pendiente de sincronizar)',
          headers: {},
          config: error.config,
        });
      }

      // Consultas: se responde con la copia guardada en el dispositivo (la
      // última respuesta con esos mismos parámetros o, para los listados de
      // animales, el listado completo filtrado aquí mismo).
      if (esConsultaGuardable(solicitudOriginal)) {
        const datosGuardados =
          (await leerRespuesta(claveCache(solicitudOriginal.url ?? '', solicitudOriginal.params)))
          ?? (await respuestaAnimalesOffline(solicitudOriginal.url ?? '', solicitudOriginal.params));
        if (datosGuardados !== undefined) {
          if (!avisoDatosGuardadosMostrado && !solicitudOriginal.silencioso) {
            avisoDatosGuardadosMostrado = true;
            toast('Sin conexión: mostrando los datos guardados en el dispositivo.', { icon: '📶', duration: 5000 });
          }
          return {
            data: datosGuardados,
            status: 200,
            statusText: 'Respuesta guardada en el dispositivo',
            headers: {},
            config: solicitudOriginal,
          };
        }
      }

      const ahora = Date.now();
      if (!solicitudOriginal?.silencioso && ahora - ultimoToastRedMs > 4000) {
        ultimoToastRedMs = ahora;
        toast.error('Sin conexión: esta información no está guardada en el dispositivo.');
      }
      return Promise.reject(error);
    }

    // Mostrar toast de error para errores no relacionados con auth
    if ((error.response?.status !== 401 || esRutaAuth) && !solicitudOriginal?.silencioso) {
      const mensaje = (error.response?.data as { mensaje?: string })?.mensaje
        ?? error.message
        ?? 'Ocurrió un error inesperado';

      if (error.response?.status && error.response.status >= 500) {
        toast.error('Error del servidor. Por favor intente nuevamente.');
      } else if (error.response?.status !== 422) {
        // Los errores 422 (validación) se manejan en el formulario
        toast.error(mensaje);
      }
    }

    return Promise.reject(error);
  }
);

// axios serializa el body a texto JSON antes de mandarlo (transformRequest);
// para guardarlo en IndexedDB conviene el objeto real, no el string.
function intentarParsear(datos: unknown): unknown {
  if (typeof datos !== 'string') return datos;
  try { return JSON.parse(datos); } catch { return datos; }
}

// ── Sincronización de la cola offline ────────────────────────────────────────

let sincronizando = false;

/**
 * Reproduce, en orden, todas las peticiones guardadas mientras no había
 * conexión. Se llama sola al recuperar la señal y al abrir la app; también
 * puede dispararse a mano (botón "Sincronizar ahora").
 */
export async function sincronizarPendientes(): Promise<{ exitosos: number; fallidos: number }> {
  if (sincronizando || !navigator.onLine) return { exitosos: 0, fallidos: 0 };
  sincronizando = true;
  let exitosos = 0;
  let fallidos = 0;

  try {
    const pendientes = await obtenerPendientes();
    for (const p of pendientes) {
      try {
        await clienteHttp.request({
          method: p.metodo,
          url: p.url,
          data: p.datos,
          sinCola: true, // si esto también falla, no se debe reencolar duplicado
        });
        await eliminarPendiente(p.id!);
        exitosos++;
      } catch {
        fallidos++; // se deja en la cola para el próximo intento
      }
    }
  } finally {
    sincronizando = false;
  }

  if (exitosos > 0) {
    toast.success(`${exitosos} registro${exitosos === 1 ? '' : 's'} sincronizado${exitosos === 1 ? '' : 's'} correctamente`);
    // Los registros recién subidos ya existen en el servidor: se recargan
    // las pantallas para que aparezcan (p. ej. el animal nuevo en el listado).
    clienteQuery.invalidateQueries();
  }
  notificarCambio();
  return { exitosos, fallidos };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { sincronizarPendientes(); });
  // Por si quedaron pendientes de una sesión anterior y la app abre ya con
  // señal. Solo si hay sesión iniciada — si no, la petición de prueba
  // fallaría con 401 antes de que el usuario llegue a loguearse.
  if (useAutenticacionStore.getState().tokenAcceso) {
    sincronizarPendientes();
  }
}
