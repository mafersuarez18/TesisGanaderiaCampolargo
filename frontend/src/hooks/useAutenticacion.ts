import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAutenticacionStore } from '../stores/autenticacionStore';
import { clienteHttp } from '../servicios/clienteAxios';
import { vaciarCacheOffline } from '../servicios/cacheOffline';
import { precargarDatosOffline, olvidarUltimaPrecarga } from '../servicios/precargaOffline';
import toast from 'react-hot-toast';

interface DatosInicioSesion {
  correo: string;
  contrasena: string;
}

// Envuelve el store de autenticación (persistido en localStorage) con las
// acciones que necesitan tocar la red (login/logout) y navegar, para que
// los componentes no tengan que orquestar ambas cosas por su cuenta.
export function useAutenticacion() {
  const [cargando, setCargando] = useState(false);
  const navegar = useNavigate();
  const tienda = useAutenticacionStore();

  const estaAutenticado = tienda.estaAutenticado();

  async function iniciarSesion(datos: DatosInicioSesion): Promise<void> {
    setCargando(true);
    try {
      const respuesta = await clienteHttp.post('/auth/iniciar-sesion', datos);
      const { usuario, tokenAcceso, tokenRefresh, expiraEn } = respuesta.data.datos;

      tienda.iniciarSesion(usuario, tokenAcceso, tokenRefresh, expiraEn);
      toast.success(`Bienvenido, ${usuario.nombre}`);
      navegar('/dashboard');
      // Deja toda la app disponible sin conexión desde el primer momento.
      precargarDatosOffline({ forzar: true, avisar: true });
    } finally {
      setCargando(false);
    }
  }

  async function cerrarSesion(): Promise<void> {
    try {
      await clienteHttp.post('/auth/cerrar-sesion');
    } catch {
      // Si falla el cierre en servidor, igual limpiamos localmente
    } finally {
      // Los datos guardados para uso sin conexión son de este usuario: no
      // deben quedar en el dispositivo para el próximo que inicie sesión.
      await vaciarCacheOffline();
      olvidarUltimaPrecarga();
      tienda.cerrarSesion();
      navegar('/iniciar-sesion');
      toast.success('Sesión cerrada correctamente');
    }
  }

  function tienePermiso(...roles: string[]): boolean {
    if (!tienda.usuario) return false;
    return roles.includes(tienda.usuario.rol.nombre);
  }

  // Verifica si el usuario tiene al menos uno de los privilegios indicados
  // (ej. tienePrivilegio('animales.crear')), reflejando lo que el backend valida.
  function tienePrivilegio(...codigos: string[]): boolean {
    if (!tienda.usuario) return false;
    return codigos.some((codigo) => tienda.usuario!.privilegios.includes(codigo));
  }

  return {
    usuario: tienda.usuario,
    estaAutenticado,
    cargando,
    iniciarSesion,
    cerrarSesion,
    tienePermiso,
    tienePrivilegio,
    esAdministrador: tienda.usuario?.rol.nombre === 'ADMINISTRADOR',
    esVeterinario: tienda.usuario?.rol.nombre === 'VETERINARIO',
    esTecnico: tienda.usuario?.rol.nombre === 'TECNICO',
  };
}
