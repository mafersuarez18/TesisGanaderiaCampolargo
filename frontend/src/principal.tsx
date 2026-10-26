import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { clienteQuery } from './servicios/clienteQuery';
import { iniciarPrecargaAutomatica } from './servicios/precargaOffline';
import './estilos/global.css';

// Punto de entrada de la SPA: monta el árbol de React con el router, el
// cliente de React Query (caché de datos del servidor) y el sistema de
// notificaciones toast, todos compartidos por toda la aplicación.

// Descarga en segundo plano los datos de todas las pantallas para que la
// app se pueda usar sin conexión sin haberlas visitado antes.
iniciarPrecargaAutomatica();

const elementoRaiz = document.getElementById('raiz');
if (!elementoRaiz) throw new Error('No se encontró el elemento raíz #raiz');

ReactDOM.createRoot(elementoRaiz).render(
  <React.StrictMode>
    <QueryClientProvider client={clienteQuery}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          gutter={8}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#ffffff',
              color: '#111827',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              padding: '12px 16px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
            error: { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </React.StrictMode>
);
