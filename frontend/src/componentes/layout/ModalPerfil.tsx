import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { useAutenticacionStore } from '../../stores/autenticacionStore';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from '../ui/Icono';
import toast from 'react-hot-toast';

interface PropsModalPerfil {
  abierto: boolean;
  alCerrar: () => void;
}

// Modal de autoservicio del usuario: editar sus propios datos (nombre,
// cargo, teléfono) o cambiar su contraseña, con validación en el cliente
// antes de llamar al backend.
export default function ModalPerfil({ abierto, alCerrar }: PropsModalPerfil) {
  const { usuario } = useAutenticacion();
  const tienda = useAutenticacionStore();
  const [pestana, setPestana] = useState<'datos' | 'contrasena'>('datos');

  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [apellido, setApellido] = useState(usuario?.apellido ?? '');
  const [cargo, setCargo] = useState('');
  const [telefono, setTelefono] = useState('');

  const [contrasenaActual, setContrasenaActual] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');

  const mutacionDatos = useMutation({
    mutationFn: () => clienteHttp.patch('/usuarios/mi-perfil', { nombre, apellido, cargo, telefono }),
    onSuccess: (res) => {
      // Sin conexión la edición quedó en la cola offline y el servidor no
      // devolvió datos: se reflejan los que se acaban de escribir.
      const datos = res.data.datos ?? { nombre, apellido, cargo };
      tienda.actualizarUsuario({ nombre: datos.nombre, apellido: datos.apellido, cargo: datos.cargo });
      if (!res.data.offline) toast.success('Perfil actualizado correctamente');
      alCerrar();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo actualizar el perfil');
    },
  });

  const mutacionContrasena = useMutation({
    mutationFn: () => clienteHttp.patch('/usuarios/cambiar-contrasena', { contrasenaActual, nuevaContrasena }),
    onSuccess: () => {
      toast.success('Contraseña cambiada correctamente');
      setContrasenaActual('');
      setNuevaContrasena('');
      setConfirmarContrasena('');
      alCerrar();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo cambiar la contraseña');
    },
  });

  function guardarDatos(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !apellido.trim()) {
      toast.error('Nombre y apellido son obligatorios');
      return;
    }
    mutacionDatos.mutate();
  }

  function guardarContrasena(e: React.FormEvent) {
    e.preventDefault();
    if (nuevaContrasena !== confirmarContrasena) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }
    if (nuevaContrasena.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    mutacionContrasena.mutate();
  }

  const rolEtiqueta =
    usuario?.rol.nombre === 'ADMINISTRADOR' ? 'Administrador' :
    usuario?.rol.nombre === 'VETERINARIO'   ? 'Veterinario'   :
    usuario?.rol.nombre === 'TECNICO'       ? 'Técnico de Campo' :
    usuario?.rol.descripcion || usuario?.rol.nombre || '';

  const iniciales = `${usuario?.nombre?.charAt(0) ?? ''}${usuario?.apellido?.charAt(0) ?? ''}`;

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={alCerrar}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div
              className="w-full max-w-md bg-surface-container-lowest rounded-3xl shadow-[var(--shadow-lg)]
                         border border-outline-variant/30 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabecera */}
              <div className="bg-primary-container/30 px-6 pt-6 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary-container flex items-center justify-center
                                    text-on-primary-container font-bold text-xl flex-shrink-0">
                      {iniciales}
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-on-surface">
                        {usuario?.nombre} {usuario?.apellido}
                      </h2>
                      <p className="text-xs text-on-surface-variant">{usuario?.correo}</p>
                      <span className="mt-1 inline-block text-[11px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
                        {rolEtiqueta}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={alCerrar}
                    className="p-1.5 hover:bg-surface-container rounded-lg transition-colors"
                  >
                    <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
                  </button>
                </div>

                {/* Pestañas */}
                <div className="flex gap-1 mt-4 bg-surface-container/50 rounded-xl p-1">
                  {(['datos', 'contrasena'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setPestana(tab)}
                      className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all
                        ${pestana === tab
                          ? 'bg-surface text-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      {tab === 'datos' ? 'Mis datos' : 'Contraseña'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contenido */}
              <div className="px-6 py-5">
                {pestana === 'datos' ? (
                  <form onSubmit={guardarDatos} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Nombre</label>
                        <input
                          type="text"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className="campo-entrada w-full"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-on-surface-variant mb-1">Apellido</label>
                        <input
                          type="text"
                          value={apellido}
                          onChange={(e) => setApellido(e.target.value)}
                          className="campo-entrada w-full"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Cargo (opcional)</label>
                      <input
                        type="text"
                        value={cargo}
                        onChange={(e) => setCargo(e.target.value)}
                        placeholder="Ej: Veterinario jefe"
                        className="campo-entrada w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Teléfono (opcional)</label>
                      <input
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="+58 412 000 0000"
                        className="campo-entrada w-full"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={alCerrar} className="boton boton-secundario flex-1">
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={mutacionDatos.isPending}
                        className="boton boton-primario flex-1"
                      >
                        {mutacionDatos.isPending ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={guardarContrasena} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Contraseña actual</label>
                      <input
                        type="password"
                        value={contrasenaActual}
                        onChange={(e) => setContrasenaActual(e.target.value)}
                        className="campo-entrada w-full"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Nueva contraseña</label>
                      <input
                        type="password"
                        value={nuevaContrasena}
                        onChange={(e) => setNuevaContrasena(e.target.value)}
                        className="campo-entrada w-full"
                        required
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <p className="text-[11px] text-on-surface-variant mt-1">Mínimo 8 caracteres</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Confirmar nueva contraseña</label>
                      <input
                        type="password"
                        value={confirmarContrasena}
                        onChange={(e) => setConfirmarContrasena(e.target.value)}
                        className={`campo-entrada w-full ${confirmarContrasena && confirmarContrasena !== nuevaContrasena ? 'border-error' : ''}`}
                        required
                        autoComplete="new-password"
                      />
                      {confirmarContrasena && confirmarContrasena !== nuevaContrasena && (
                        <p className="text-[11px] text-error mt-1">Las contraseñas no coinciden</p>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={alCerrar} className="boton boton-secundario flex-1">
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={mutacionContrasena.isPending || (!!confirmarContrasena && confirmarContrasena !== nuevaContrasena)}
                        className="boton boton-primario flex-1"
                      >
                        {mutacionContrasena.isPending ? 'Cambiando...' : 'Cambiar contraseña'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
