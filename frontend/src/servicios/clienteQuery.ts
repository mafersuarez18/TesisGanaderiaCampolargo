import { QueryClient } from '@tanstack/react-query';

// Cliente de React Query (caché de datos del servidor) compartido por toda
// la app. Vive en su propio módulo, y no en principal.tsx, para que
// clienteAxios pueda refrescar las pantallas cuando termina de subir los
// registros guardados sin conexión.
export const clienteQuery = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,          // 5 minutos antes de refetch automático
      gcTime: 1000 * 60 * 30,             // 30 minutos en caché
      // Reintentar una sola vez, pero nunca ante un error 4xx (permisos,
      // validación, "no encontrado"...): reintentar no lo va a arreglar, y
      // cada intento fallido dispara su propio toast de error.
      retry: (conteoFallos, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return conteoFallos < 1;
      },
      refetchOnWindowFocus: false,
      // Con el modo por defecto ('online') React Query ni siquiera ejecuta
      // las consultas sin conexión: quedan en pausa, sin datos, y una ficha
      // termina mostrando "Animal no encontrado". La consulta debe llegar
      // siempre a clienteAxios, que sin red responde con los datos
      // guardados en el dispositivo (cacheOffline).
      networkMode: 'always',
    },
    mutations: {
      retry: 0,
      // Mismo motivo: en modo 'online' la mutación queda en pausa y el
      // botón en "Guardando..." para siempre. Sin conexión quien decide qué
      // hacer es el interceptor de clienteAxios (encolar o fallar rápido).
      networkMode: 'always',
    },
  },
});
