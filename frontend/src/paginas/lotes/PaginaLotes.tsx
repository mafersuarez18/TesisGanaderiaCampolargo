import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Icono from '../../componentes/ui/Icono';
import toast from 'react-hot-toast';
import SeccionPotreros from './SeccionPotreros';

// CRUD de lotes (agrupaciones de animales dentro de una finca), con
// filtro por finca, y en otra pestaña el de sus potreros.
interface Finca {
  id: string;
  nombre: string;
  municipio: string;
  estado: string;
}

interface Lote {
  id: string;
  nombre: string;
  descripcion?: string;
  capacidad?: number;
  fincaId: string;
  finca: { nombre: string };
  _count: { animales: number; potreros: number };
}

async function obtenerFincas(): Promise<{ datos: Finca[] }> {
  const { data } = await clienteHttp.get('/fincas?porPagina=100');
  return data;
}

async function obtenerLotes(fincaId?: string): Promise<Lote[]> {
  const params = fincaId ? `?fincaId=${fincaId}` : '';
  const { data } = await clienteHttp.get(`/lotes${params}`);
  return data.datos;
}

interface FormLote {
  nombre: string;
  descripcion: string;
  capacidad: string;
  fincaId: string;
}

const formVacio: FormLote = { nombre: '', descripcion: '', capacidad: '', fincaId: '' };

export default function PaginaLotes() {
  const { esAdministrador, esVeterinario } = useAutenticacion();
  const cliente = useQueryClient();
  const puedeEditar = esAdministrador || esVeterinario;

  const [fincaFiltro, setFincaFiltro] = useState<string>('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [loteEditar, setLoteEditar] = useState<Lote | null>(null);
  const [loteEliminar, setLoteEliminar] = useState<Lote | null>(null);
  const [form, setForm] = useState<FormLote>(formVacio);
  const [loteDetalle, setLoteDetalle] = useState<Lote | null>(null);
  const [pestana, setPestana] = useState<'lotes' | 'potreros'>('lotes');
  // Lote a mostrar al pasar a Potreros desde la tarjeta de un lote
  const [lotePotreros, setLotePotreros] = useState<string | undefined>(undefined);

  const { data: fincasData, isLoading: cargandoFincas } = useQuery({
    queryKey: ['fincas'],
    queryFn: obtenerFincas,
  });
  const fincas = fincasData?.datos ?? [];

  const { data: lotes = [], isLoading: cargandoLotes } = useQuery({
    queryKey: ['lotes', fincaFiltro],
    queryFn: () => obtenerLotes(fincaFiltro || undefined),
  });

  const mutacionCrear = useMutation({
    mutationFn: (datos: Omit<FormLote, 'capacidad'> & { capacidad?: number }) =>
      clienteHttp.post('/lotes', datos),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['lotes'] });
      cliente.invalidateQueries({ queryKey: ['fincas'] });
      toast.success('Lote creado correctamente');
      cerrarModal();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo crear el lote');
    },
  });

  const mutacionActualizar = useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: { nombre?: string; descripcion?: string; capacidad?: number } }) =>
      clienteHttp.patch(`/lotes/${id}`, datos),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['lotes'] });
      toast.success('Lote actualizado correctamente');
      cerrarModal();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo actualizar el lote');
    },
  });

  const mutacionEliminar = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/lotes/${id}`),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['lotes'] });
      cliente.invalidateQueries({ queryKey: ['fincas'] });
      toast.success('Lote eliminado correctamente');
      setLoteEliminar(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'No se pudo eliminar el lote');
    },
  });

  function abrirCrear() {
    setLoteEditar(null);
    setForm({ ...formVacio, fincaId: fincaFiltro });
    setModalAbierto(true);
  }

  function abrirEditar(lote: Lote) {
    setLoteEditar(lote);
    setForm({
      nombre:      lote.nombre,
      descripcion: lote.descripcion ?? '',
      capacidad:   lote.capacidad?.toString() ?? '',
      fincaId:     lote.fincaId,
    });
    setModalAbierto(true);
  }

  function cerrarModal() {
    setModalAbierto(false);
    setLoteEditar(null);
    setForm(formVacio);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nombre      = form.nombre.trim();
    const descripcion = form.descripcion.trim();
    const capacidad   = form.capacidad ? parseInt(form.capacidad, 10) : undefined;
    if (loteEditar) {
      mutacionActualizar.mutate({
        id: loteEditar.id,
        datos: { nombre, descripcion: descripcion || undefined, capacidad },
      });
    } else {
      mutacionCrear.mutate({ nombre, descripcion, capacidad, fincaId: form.fincaId });
    }
  }

  const totalAnimales = lotes.reduce((s, l) => s + l._count.animales, 0);
  const totalCapacidad = lotes.reduce((s, l) => s + (l.capacidad ?? 0), 0);
  const ocupacion = totalCapacidad > 0 ? Math.round((totalAnimales / totalCapacidad) * 100) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { ico: 'grid_view',  val: lotes.length,      et: 'Lotes totales',      col: 'text-primary',   bg: 'bg-primary/10'    },
          { ico: 'pets',       val: totalAnimales,      et: 'Animales asignados', col: 'text-tertiary',  bg: 'bg-tertiary/10'   },
          { ico: 'home_work',  val: fincas.length,      et: 'Fincas',             col: 'text-secondary', bg: 'bg-secondary/10'  },
          { ico: 'percent',    val: ocupacion !== null ? `${ocupacion}%` : '—', et: 'Ocupación',    col: 'text-on-surface', bg: 'bg-surface-container' },
        ].map(({ ico, val, et, col, bg }) => (
          <div key={et} className="tarjeta-vidrio rounded-2xl p-4">
            <div className={`${bg} p-2.5 rounded-xl w-fit mb-3`}>
              <Icono nombre={ico} relleno clase={`text-[20px] ${col}`} />
            </div>
            <p className="text-2xl font-bold text-on-surface">{cargandoLotes ? '—' : val}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{et}</p>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl w-fit max-w-full overflow-x-auto">
        {([
          { clave: 'lotes', et: 'Lotes', ico: 'grid_view' },
          { clave: 'potreros', et: 'Potreros', ico: 'grass' },
        ] as const).map((p) => (
          <button
            key={p.clave}
            onClick={() => { setPestana(p.clave); if (p.clave === 'potreros') setLotePotreros(undefined); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              pestana === p.clave ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icono nombre={p.ico} clase="text-[16px]" />
            {p.et}
          </button>
        ))}
      </div>

      {pestana === 'potreros' && (
        <SeccionPotreros
          fincas={fincas}
          puedeEditar={puedeEditar}
          puedeEliminar={esAdministrador}
          loteInicial={lotePotreros}
        />
      )}

      {pestana === 'lotes' && (<>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Gestión de Lotes
          </p>
          {!cargandoFincas && fincas.length > 0 && (
            <select
              value={fincaFiltro}
              onChange={(e) => setFincaFiltro(e.target.value)}
              className="campo-entrada text-sm py-1.5"
            >
              <option value="">Todas las fincas</option>
              {fincas.map((f) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          )}
        </div>
        {puedeEditar && (
          <button onClick={abrirCrear} className="boton boton-primario gap-2 text-sm">
            <Icono nombre="add" clase="text-[18px]" />
            Nuevo lote
          </button>
        )}
      </div>

      {/* Lista de lotes */}
      {cargandoLotes ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : lotes.length === 0 ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-container mx-auto mb-4 flex items-center justify-center">
            <Icono nombre="grid_view" clase="text-[32px] text-outline" />
          </div>
          <p className="font-medium text-on-surface-variant">Sin lotes registrados</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {fincaFiltro ? 'Esta finca no tiene lotes aún.' : 'Crea el primer lote para organizar tus animales.'}
          </p>
          {puedeEditar && (
            <button onClick={abrirCrear} className="boton boton-primario mt-4 text-sm gap-2">
              <Icono nombre="add" clase="text-[18px]" />
              Nuevo lote
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lotes.map((lote, idx) => {
            const pct = lote.capacidad ? Math.min(100, Math.round((lote._count.animales / lote.capacidad) * 100)) : null;
            const colorBarra = pct === null ? 'bg-primary' : pct >= 90 ? 'bg-error' : pct >= 75 ? 'bg-tertiary' : 'bg-primary';

            return (
              <motion.div
                key={lote.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="tarjeta-vidrio rounded-2xl p-5 flex flex-col gap-3 group hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-secondary/10 rounded-xl flex-shrink-0">
                      <Icono nombre="grid_view" relleno clase="text-[20px] text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-on-surface">{lote.nombre}</h3>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-on-surface-variant">
                        <Icono nombre="home_work" clase="text-[12px]" />
                        {lote.finca.nombre}
                      </div>
                    </div>
                  </div>
                  {puedeEditar && (
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => abrirEditar(lote)}
                        className="p-1.5 hover:bg-surface-container rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Icono nombre="edit" clase="text-[16px] text-on-surface-variant hover:text-primary" />
                      </button>
                      {esAdministrador && (
                        <button
                          onClick={() => setLoteEliminar(lote)}
                          className="p-1.5 hover:bg-error-container rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Icono nombre="delete" clase="text-[16px] text-on-surface-variant hover:text-error" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {lote.descripcion && (
                  <p className="text-xs text-on-surface-variant line-clamp-2">{lote.descripcion}</p>
                )}

                {/* Barra de ocupación */}
                {lote.capacidad ? (
                  <div>
                    <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                      <span>
                        <strong className="text-on-surface">{lote._count.animales}</strong> / {lote.capacidad} animales
                      </span>
                      <span className={pct! >= 90 ? 'text-error font-semibold' : ''}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colorBarra}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {pct! >= 90 && (
                      <p className="text-[11px] text-error mt-1 flex items-center gap-1">
                        <Icono nombre="warning" clase="text-[12px]" />
                        Lote casi lleno
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Icono nombre="pets" clase="text-[14px] text-outline" />
                    <span className="text-xs text-on-surface-variant">
                      <strong className="text-on-surface">{lote._count.animales}</strong> animales asignados
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => { setLotePotreros(lote.id); setPestana('potreros'); }}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline w-fit"
                >
                  <Icono nombre="grass" clase="text-[14px]" />
                  {lote._count.potreros} {lote._count.potreros === 1 ? 'potrero' : 'potreros'} · Ver y gestionar
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      </>)}

      {/* Modal crear/editar */}
      <AnimatePresence>
        {modalAbierto && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={cerrarModal}
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
                <div className="px-6 py-5 border-b border-outline-variant/20 flex items-center justify-between">
                  <h3 className="font-bold text-on-surface">
                    {loteEditar ? 'Editar lote' : 'Nuevo lote'}
                  </h3>
                  <button onClick={cerrarModal} className="p-1.5 hover:bg-surface-container rounded-lg">
                    <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
                  </button>
                </div>

                <form onSubmit={guardar} className="px-6 py-5 space-y-4">
                  {!loteEditar && (
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">Finca *</label>
                      <select
                        value={form.fincaId}
                        onChange={(e) => setForm((f) => ({ ...f, fincaId: e.target.value }))}
                        className="campo-entrada w-full"
                        required
                      >
                        <option value="">Seleccionar finca…</option>
                        {fincas.map((f) => (
                          <option key={f.id} value={f.id}>{f.nombre}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Nombre del lote *</label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej: Lote A, Novillas, Maternidad"
                      className="campo-entrada w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Descripción</label>
                    <textarea
                      value={form.descripcion}
                      onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                      placeholder="Descripción del propósito o características del lote…"
                      rows={2}
                      className="campo-entrada w-full resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">
                      Capacidad máxima de animales
                    </label>
                    <input
                      type="number"
                      value={form.capacidad}
                      onChange={(e) => setForm((f) => ({ ...f, capacidad: e.target.value }))}
                      placeholder="Ej: 50"
                      min={1}
                      className="campo-entrada w-full"
                    />
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Opcional. Permite visualizar el porcentaje de ocupación.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={cerrarModal} className="boton boton-secundario flex-1">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={mutacionCrear.isPending || mutacionActualizar.isPending}
                      className="boton boton-primario flex-1"
                    >
                      {(mutacionCrear.isPending || mutacionActualizar.isPending) ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal confirmar eliminación */}
      <AnimatePresence>
        {loteEliminar && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setLoteEliminar(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <div
                className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-[var(--shadow-lg)]
                           border border-outline-variant/30 p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-12 rounded-2xl bg-error-container flex items-center justify-center mx-auto mb-4">
                  <Icono nombre="delete" clase="text-[24px] text-error" />
                </div>
                <h3 className="font-bold text-center text-on-surface mb-2">¿Eliminar lote?</h3>
                <p className="text-sm text-on-surface-variant text-center mb-6">
                  Se eliminará el lote <strong>"{loteEliminar.nombre}"</strong>. Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setLoteEliminar(null)} className="boton boton-secundario flex-1">
                    Cancelar
                  </button>
                  <button
                    onClick={() => mutacionEliminar.mutate(loteEliminar.id)}
                    disabled={mutacionEliminar.isPending}
                    className="boton flex-1 bg-error text-white hover:bg-error/90"
                  >
                    {mutacionEliminar.isPending ? 'Eliminando…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
