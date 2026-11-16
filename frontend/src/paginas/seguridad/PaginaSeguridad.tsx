import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import type { AxiosResponse } from 'axios';
import { clienteHttp } from '../../servicios/clienteAxios';
import Badge, { BadgeRol } from '../../componentes/ui/Badge';
import Modal, { ModalConfirmacion } from '../../componentes/ui/Modal';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Icono from '../../componentes/ui/Icono';
import { QUERY_PERFIL_SESION } from '../../componentes/layout/permisos';
import ModalDetalleUsuario from './ModalDetalleUsuario';

// Administración de usuarios, roles y sus privilegios. Cada pestaña y acción
// se muestra según los privilegios 'usuarios.*' y 'roles.gestionar' (los
// mismos que exige el backend). Tras cualquier cambio se refrescan los
// permisos de la sesión, por si el cambio afecta al propio usuario.
interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  privilegios: Privilegio[];
  _count: { usuarios: number };
}

interface Privilegio {
  id: string;
  descripcion: string;
}

interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  rol: { id: string; nombre: string; descripcion: string | null };
  estado: 'ACTIVO' | 'INACTIVO' | 'BLOQUEADO';
  ultimoAcceso?: string;
}

interface RespuestaUsuarios {
  datos: Usuario[];
  meta: { total: number; pagina: number; porPagina: number; totalPaginas: number };
}

interface FormUsuario {
  nombre: string;
  apellido: string;
  correo: string;
  contrasena: string;
  rolId: string;
}

const ESTADO_ESTILOS: Record<string, { variante: 'verde' | 'gris' | 'rojo'; etiqueta: string }> = {
  ACTIVO:    { variante: 'verde', etiqueta: 'Activo' },
  INACTIVO:  { variante: 'gris',  etiqueta: 'Inactivo' },
  BLOQUEADO: { variante: 'rojo',  etiqueta: 'Bloqueado' },
};

const COLORES_ROL = [
  { col: 'text-tertiary',  fondo: 'bg-tertiary/10' },
  { col: 'text-primary',   fondo: 'bg-primary/10' },
  { col: 'text-secondary', fondo: 'bg-secondary/10' },
  { col: 'text-error',     fondo: 'bg-error/10' },
];

function colorParaRol(indice: number) {
  return COLORES_ROL[indice % COLORES_ROL.length]!;
}

function etiquetaPrivilegio(codigo: string): { modulo: string; accion: string } {
  const [modulo, ...resto] = codigo.split('.');
  const accion = resto.join('.') || codigo;
  return {
    modulo: (modulo ?? codigo).replace(/_/g, ' '),
    accion: accion.replace(/_/g, ' '),
  };
}

export default function PaginaSeguridad() {
  const { tienePrivilegio } = useAutenticacion();
  const verUsuarios = tienePrivilegio('usuarios.ver');
  const verRoles = tienePrivilegio('roles.gestionar');
  const [pestanaElegida, setPestana] = useState<'usuarios' | 'roles'>('usuarios');
  const pestana = !verUsuarios ? 'roles' : !verRoles ? 'usuarios' : pestanaElegida;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Icono nombre="security" relleno clase="text-[22px] text-primary" />
            Seguridad
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Gestión de usuarios, roles y privilegios
          </p>
        </div>
      </motion.div>

      <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto max-w-full">
        {([
          { valor: 'usuarios', etiqueta: 'Usuarios', icono: 'group', visible: verUsuarios },
          { valor: 'roles',    etiqueta: 'Roles y privilegios', icono: 'admin_panel_settings', visible: verRoles },
        ] as const).filter((t) => t.visible).map((t) => (
          <button
            key={t.valor}
            onClick={() => setPestana(t.valor)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap ${
              pestana === t.valor
                ? 'bg-primary text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icono nombre={t.icono} clase="text-[16px]" />
            {t.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' ? <PanelUsuarios /> : <PanelRoles />}
    </div>
  );
}

// ── Panel: Usuarios ──────────────────────────────────────────────────────────

function PanelUsuarios() {
  const queryClient = useQueryClient();
  const { usuario: usuarioActual, tienePrivilegio } = useAutenticacion();
  const puedeCrear  = tienePrivilegio('usuarios.crear');
  const puedeEditar = tienePrivilegio('usuarios.editar');
  const puedeBloquear = tienePrivilegio('usuarios.editar', 'usuarios.desbloquear');

  const [usuarioDetalle, setUsuarioDetalle]   = useState<string | null>(null);
  const [mostrarForm, setMostrarForm]         = useState(false);
  const [usuarioEditar, setUsuarioEditar]     = useState<Usuario | null>(null);
  const [usuarioBloquear, setUsuarioBloquear] = useState<{ id: string; bloqueado: boolean } | null>(null);
  const [busqueda, setBusqueda]               = useState('');
  const [filtroRolId, setFiltroRolId]         = useState('');

  const { data: roles = [] } = useQuery<Rol[]>({
    queryKey: ['roles'],
    queryFn: () => clienteHttp.get('/roles').then((r) => r.data.datos),
  });

  const { data, isLoading } = useQuery<RespuestaUsuarios>({
    queryKey: ['usuarios', busqueda, filtroRolId],
    queryFn: () =>
      clienteHttp
        .get('/usuarios', {
          params: { porPagina: 50, ...(busqueda && { busqueda }), ...(filtroRolId && { rolId: filtroRolId }) },
        })
        .then((r) => r.data),
  });

  const bloquearMutacion = useMutation({
    mutationFn: ({ id, bloqueado }: { id: string; bloqueado: boolean }) =>
      clienteHttp.patch(`/usuarios/${id}`, { estado: bloqueado ? 'BLOQUEADO' : 'ACTIVO' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      queryClient.invalidateQueries({ queryKey: ['usuario-detalle'] });
      setUsuarioBloquear(null);
    },
  });

  const usuarios      = data?.datos ?? [];
  const totalUsuarios = data?.meta?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* KPIs por rol */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">
          <span className="font-medium text-on-surface">{totalUsuarios}</span> usuarios registrados
        </p>
        {puedeCrear && (
          <button
            onClick={() => { setUsuarioEditar(null); setMostrarForm(true); }}
            className="boton boton-primario gap-2 text-sm"
          >
            <Icono nombre="person_add" clase="text-[18px]" />
            Nuevo usuario
          </button>
        )}
      </div>

      <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.max(roles.length, 1)}, minmax(0, 1fr))` }}>
        {roles.map((rol, idx) => {
          const { col, fondo } = colorParaRol(idx);
          return (
            <div key={rol.id} className="tarjeta-vidrio rounded-2xl p-4">
              <div className={`p-2.5 ${fondo} rounded-xl w-fit mb-3`}>
                <Icono nombre="admin_panel_settings" relleno clase={`text-[20px] ${col}`} />
              </div>
              <p className={`text-3xl font-bold ${col}`}>{rol._count.usuarios}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{rol.descripcion || rol.nombre}</p>
            </div>
          );
        })}
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Icono nombre="search" clase="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="campo-entrada pl-10"
          />
        </div>
        <div className="flex gap-1 p-1 bg-surface-container rounded-xl flex-wrap">
          <button
            onClick={() => setFiltroRolId('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtroRolId === '' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Todos
          </button>
          {roles.map((rol) => (
            <button
              key={rol.id}
              onClick={() => setFiltroRolId(rol.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filtroRolId === rol.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {rol.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : !usuarios.length ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <Icono nombre="group" clase="text-[40px] text-outline mx-auto mb-3" />
          <p className="font-medium text-on-surface-variant">Sin usuarios</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="tarjeta-vidrio rounded-2xl overflow-hidden"
        >
          {/* Columnas de ancho fijo: en pantallas angostas se desliza
              horizontal en vez de aplastar el nombre/correo del usuario. */}
          <div className="overflow-x-auto">
          <div className="min-w-[600px]">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 bg-surface-container-low
                         border-b border-outline-variant/20">
            {['Usuario', 'Rol', 'Estado', 'Último acceso', 'Acciones'].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {usuarios.map((u, idx) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => setUsuarioDetalle(u.id)}
              title="Ver toda la información y privilegios del usuario"
              className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-6 py-4 cursor-pointer
                         hover:bg-surface-container-low transition-colors
                         ${idx < usuarios.length - 1 ? 'border-b border-outline-variant/15' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/60 to-primary
                               flex items-center justify-center text-on-primary font-bold text-sm flex-shrink-0">
                  {u.nombre[0]}{u.apellido[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {u.nombre} {u.apellido}
                    {u.id === usuarioActual?.id && (
                      <span className="ml-2 text-[10px] font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        Tú
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate">{u.correo}</p>
                </div>
              </div>

              <BadgeRol rol={u.rol.nombre} />

              <Badge variante={ESTADO_ESTILOS[u.estado]?.variante ?? 'gris'} tamano="xs" punto={u.estado === 'ACTIVO'}>
                {ESTADO_ESTILOS[u.estado]?.etiqueta ?? u.estado}
              </Badge>

              <span className="text-xs text-on-surface-variant">
                {u.ultimoAcceso
                  ? new Date(u.ultimoAcceso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' })
                  : '—'}
              </span>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setUsuarioDetalle(u.id)}
                  title="Ver detalle"
                  className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                >
                  <Icono nombre="visibility" clase="text-[16px]" />
                </button>
                {puedeEditar && (
                  <button
                    onClick={() => { setUsuarioEditar(u); setMostrarForm(true); }}
                    title="Editar"
                    className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    <Icono nombre="edit" clase="text-[16px]" />
                  </button>
                )}
                {puedeBloquear && u.id !== usuarioActual?.id && (
                  <button
                    onClick={() => setUsuarioBloquear({ id: u.id, bloqueado: u.estado !== 'BLOQUEADO' })}
                    title={u.estado === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear'}
                    className={`p-1.5 rounded-lg transition-colors ${
                      u.estado === 'BLOQUEADO'
                        ? 'text-primary hover:bg-primary/10'
                        : 'text-outline hover:text-error hover:bg-error-container'
                    }`}
                  >
                    <Icono nombre={u.estado === 'BLOQUEADO' ? 'lock_open' : 'lock'} clase="text-[16px]" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
          </div>
          </div>
        </motion.div>
      )}

      {/* Modal: Crear / Editar */}
      <AnimatePresence>
        {mostrarForm && (
          <FormularioUsuario
            usuarioEditar={usuarioEditar}
            roles={roles}
            onCerrar={() => { setMostrarForm(false); setUsuarioEditar(null); }}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['usuarios'] });
              queryClient.invalidateQueries({ queryKey: ['usuario-detalle'] });
              queryClient.invalidateQueries({ queryKey: ['roles'] });
              queryClient.invalidateQueries({ queryKey: QUERY_PERFIL_SESION });
              setMostrarForm(false);
              setUsuarioEditar(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal: ficha completa del usuario */}
      <ModalDetalleUsuario
        usuarioId={usuarioDetalle}
        alCerrar={() => setUsuarioDetalle(null)}
        alEditar={puedeEditar ? () => {
          const u = usuarios.find((x) => x.id === usuarioDetalle);
          setUsuarioDetalle(null);
          if (u) { setUsuarioEditar(u); setMostrarForm(true); }
        } : undefined}
      />

      {/* Modal: Bloquear / Desbloquear */}
      <ModalConfirmacion
        abierto={!!usuarioBloquear}
        titulo={usuarioBloquear?.bloqueado ? 'Bloquear usuario' : 'Desbloquear usuario'}
        descripcion={
          usuarioBloquear?.bloqueado
            ? 'El usuario no podrá iniciar sesión mientras esté bloqueado. ¿Confirma?'
            : '¿Desea restaurar el acceso de este usuario?'
        }
        textoConfirmar={usuarioBloquear?.bloqueado ? 'Bloquear' : 'Desbloquear'}
        variante={usuarioBloquear?.bloqueado ? 'peligro' : 'info'}
        cargando={bloquearMutacion.isPending}
        alConfirmar={() =>
          usuarioBloquear &&
          bloquearMutacion.mutate({ id: usuarioBloquear.id, bloqueado: usuarioBloquear.bloqueado })
        }
        alCerrar={() => setUsuarioBloquear(null)}
      />
    </div>
  );
}

// ── Formulario: Crear / Editar Usuario ──────────────────────────────────────

function FormularioUsuario({
  usuarioEditar,
  roles,
  onCerrar,
  onExito,
}: { usuarioEditar: Usuario | null; roles: Rol[]; onCerrar: () => void; onExito: () => void }) {
  const esEdicion = !!usuarioEditar;
  const [form, setForm] = useState<FormUsuario>({
    nombre:     usuarioEditar?.nombre    ?? '',
    apellido:   usuarioEditar?.apellido  ?? '',
    correo:     usuarioEditar?.correo    ?? '',
    contrasena: '',
    rolId:      usuarioEditar?.rol.id ?? roles[0]?.id ?? '',
  });
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: (datos: FormUsuario): Promise<AxiosResponse> => {
      if (esEdicion) {
        const { contrasena, ...resto } = datos;
        return clienteHttp.patch(`/usuarios/${usuarioEditar.id}`, {
          ...resto,
          ...(contrasena && { contrasena }),
        });
      }
      return clienteHttp.post('/usuarios', datos);
    },
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al guardar el usuario'),
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-inverse-surface/40 z-40" onClick={onCerrar}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre={esEdicion ? 'manage_accounts' : 'person_add'} clase="text-[20px] text-primary" />
              {esEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.nombre.trim() || !form.apellido.trim()) { setError('Nombre y apellido son requeridos'); return; }
              if (!form.correo.trim()) { setError('El correo es requerido'); return; }
              if (!form.rolId) { setError('Debe seleccionar un rol'); return; }
              if (!esEdicion && !form.contrasena) { setError('La contraseña es requerida'); return; }
              if (!esEdicion && form.contrasena.length < 8) { setError('La contraseña debe tener mínimo 8 caracteres'); return; }
              setError('');
              mutacion.mutate(form);
            }}
            className="p-6 space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { campo: 'nombre',   et: 'Nombre' },
                { campo: 'apellido', et: 'Apellido' },
              ].map(({ campo, et }) => (
                <div key={campo}>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                    {et} <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={(form as any)[campo]}
                    onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
                    className="campo-entrada"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Correo electrónico <span className="text-error">*</span>
              </label>
              <input
                type="email" value={form.correo}
                onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))}
                className="campo-entrada"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Contraseña {!esEdicion && <span className="text-error">*</span>}
                {esEdicion && <span className="font-normal text-outline">(vacía para no cambiar)</span>}
              </label>
              <div className="relative">
                <input
                  type={mostrarContrasena ? 'text' : 'password'}
                  value={form.contrasena}
                  onChange={(e) => setForm((f) => ({ ...f, contrasena: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="campo-entrada pr-11"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarContrasena(!mostrarContrasena)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                >
                  <Icono nombre={mostrarContrasena ? 'visibility_off' : 'visibility'} clase="text-[18px]" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Rol</label>
              <select
                value={form.rolId}
                onChange={(e) => setForm((f) => ({ ...f, rolId: e.target.value }))}
                className="campo-entrada"
              >
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.nombre}{rol.descripcion ? ` — ${rol.descripcion}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario">
                {mutacion.isPending ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ── Panel: Roles y Privilegios ───────────────────────────────────────────────

function PanelRoles() {
  const queryClient = useQueryClient();
  const [rolEditar, setRolEditar] = useState<Rol | 'nuevo' | null>(null);
  const [rolEliminar, setRolEliminar] = useState<Rol | null>(null);

  const { data: roles = [], isLoading } = useQuery<Rol[]>({
    queryKey: ['roles'],
    queryFn: () => clienteHttp.get('/roles').then((r) => r.data.datos),
  });

  const eliminarMutacion = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/roles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setRolEliminar(null);
    },
    onError: (err: any) => {
      setRolEliminar(null);
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.mensaje ?? 'No se pudo eliminar el rol');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">
          Los roles determinan qué puede hacer cada usuario. Cada rol agrupa un conjunto de privilegios.
        </p>
        <button onClick={() => setRolEditar('nuevo')} className="boton boton-primario gap-2 text-sm flex-shrink-0">
          <Icono nombre="add_moderator" clase="text-[18px]" />
          Nuevo rol
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((rol, idx) => {
            const { col, fondo } = colorParaRol(idx);
            return (
              <motion.div
                key={rol.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="tarjeta-vidrio rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 ${fondo} rounded-xl flex-shrink-0`}>
                      <Icono nombre="admin_panel_settings" relleno clase={`text-[20px] ${col}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-on-surface truncate">{rol.nombre}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {rol.descripcion || 'Sin descripción'} · {rol._count.usuarios} usuario(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setRolEditar(rol)}
                      title="Editar rol y privilegios"
                      className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      <Icono nombre="edit" clase="text-[16px]" />
                    </button>
                    <button
                      onClick={() => setRolEliminar(rol)}
                      title="Eliminar rol"
                      className="p-1.5 text-outline hover:text-error hover:bg-error-container rounded-lg transition-colors"
                    >
                      <Icono nombre="delete" clase="text-[16px]" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {rol.privilegios.length === 0 ? (
                    <span className="text-xs text-on-surface-variant italic">Sin privilegios asignados</span>
                  ) : (
                    rol.privilegios.slice(0, 8).map((p) => (
                      <span key={p.id} className="text-[10px] font-medium px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                        {p.descripcion}
                      </span>
                    ))
                  )}
                  {rol.privilegios.length > 8 && (
                    <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">
                      +{rol.privilegios.length - 8} más
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {rolEditar && (
          <FormularioRol
            rol={rolEditar === 'nuevo' ? null : rolEditar}
            onCerrar={() => setRolEditar(null)}
            onExito={() => {
              queryClient.invalidateQueries({ queryKey: ['roles'] });
              queryClient.invalidateQueries({ queryKey: ['usuario-detalle'] });
              // Si el rol editado es el propio, el menú y los botones cambian ya
              queryClient.invalidateQueries({ queryKey: QUERY_PERFIL_SESION });
              setRolEditar(null);
            }}
          />
        )}
      </AnimatePresence>

      <ModalConfirmacion
        abierto={!!rolEliminar}
        titulo="Eliminar rol"
        descripcion={`¿Eliminar el rol "${rolEliminar?.nombre}"? Esto solo es posible si no tiene usuarios asignados.`}
        textoConfirmar="Eliminar"
        variante="peligro"
        cargando={eliminarMutacion.isPending}
        alConfirmar={() => rolEliminar && eliminarMutacion.mutate(rolEliminar.id)}
        alCerrar={() => setRolEliminar(null)}
      />
    </div>
  );
}

// ── Formulario: Crear / Editar Rol (con asignación de privilegios) ──────────

function FormularioRol({
  rol,
  onCerrar,
  onExito,
}: { rol: Rol | null; onCerrar: () => void; onExito: () => void }) {
  const esEdicion = !!rol;
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? '');
  const [privilegioIds, setPrivilegioIds] = useState<Set<string>>(
    new Set(rol?.privilegios.map((p) => p.id) ?? []),
  );
  const [error, setError] = useState('');

  const { data: privilegios = [] } = useQuery<Privilegio[]>({
    queryKey: ['privilegios'],
    queryFn: () => clienteHttp.get('/roles/privilegios/catalogo').then((r) => r.data.datos),
  });

  const gruposPrivilegios = privilegios.reduce<Record<string, Privilegio[]>>((acc, p) => {
    const { modulo } = etiquetaPrivilegio(p.descripcion);
    (acc[modulo] ??= []).push(p);
    return acc;
  }, {});

  const mutacion = useMutation({
    mutationFn: async () => {
      let rolId: string;
      if (rol) {
        await clienteHttp.patch(`/roles/${rol.id}`, { nombre, descripcion: descripcion || undefined });
        rolId = rol.id;
      } else {
        // sinCola: hace falta el id del rol de inmediato para asignarle
        // los privilegios en el mismo flujo.
        const creado = await clienteHttp.post('/roles', { nombre, descripcion: descripcion || undefined }, { sinCola: true });
        rolId = creado.data.datos.id;
      }
      await clienteHttp.put(`/roles/${rolId}/privilegios`, { privilegioIds: Array.from(privilegioIds) });
    },
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err?.response?.data?.mensaje ?? 'Error al guardar el rol'),
  });

  function alternarPrivilegio(id: string) {
    setPrivilegioIds((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
  }

  return (
    <Modal
      abierto
      alCerrar={onCerrar}
      tamano="lg"
      titulo={rol ? `Editar rol: ${rol.nombre}` : 'Nuevo rol'}
      descripcion="Define el nombre y selecciona los privilegios que tendrán los usuarios con este rol"
      pie={
        <>
          <button onClick={onCerrar} className="boton boton-secundario">Cancelar</button>
          <button
            onClick={() => {
              if (!nombre.trim()) { setError('El nombre del rol es requerido'); return; }
              setError('');
              mutacion.mutate();
            }}
            disabled={mutacion.isPending}
            className="boton boton-primario"
          >
            {mutacion.isPending ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear rol'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
            <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              Nombre <span className="text-error">*</span>
            </label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo-entrada" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Descripción</label>
            <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="campo-entrada" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-on-surface-variant">
              Privilegios ({privilegioIds.size} seleccionados)
            </label>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-3 border border-outline-variant/20 rounded-xl p-3">
            {Object.entries(gruposPrivilegios).map(([modulo, items]) => (
              <div key={modulo}>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 capitalize">
                  {modulo}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((p) => {
                    const activo = privilegioIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => alternarPrivilegio(p.id)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                          activo
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-surface-container text-on-surface-variant border-outline-variant/30 hover:border-primary/50'
                        }`}
                      >
                        {p.descripcion}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Modal>
  );
}
