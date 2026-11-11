import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from '../../componentes/ui/Icono';
import Modal from '../../componentes/ui/Modal';

// CRUD de potreros (áreas de pasto dentro de un lote donde se alojan sus
// animales), con filtro por finca y lote. Al tocar un potrero se ven los
// animales activos que aloja.

interface FincaOpcion { id: string; nombre: string }
interface LoteOpcion { id: string; nombre: string; fincaId: string; finca: { nombre: string } }

interface Potrero {
  id: string;
  nombre: string;
  hectareas: number | null;
  descripcion: string | null;
  loteId: string;
  lote: { id: string; nombre: string; finca: { id: string; nombre: string } };
  _count: { animales: number };
}

interface PotreroDetalle extends Potrero {
  animales: { id: string; numeroIdentificacion: string; nombre: string | null; sexo: 'MACHO' | 'HEMBRA' }[];
}

interface FormPotrero { fincaId: string; loteId: string; nombre: string; hectareas: string; descripcion: string }
const formVacio: FormPotrero = { fincaId: '', loteId: '', nombre: '', hectareas: '', descripcion: '' };

export default function SeccionPotreros({ fincas, puedeEditar, puedeEliminar, loteInicial }: {
  fincas: FincaOpcion[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** Lote preseleccionado al venir desde la tarjeta de un lote. */
  loteInicial?: string;
}) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [fincaFiltro, setFincaFiltro] = useState('');
  const [loteFiltro, setLoteFiltro] = useState(loteInicial ?? '');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Potrero | null>(null);
  const [eliminando, setEliminando] = useState<Potrero | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [form, setForm] = useState<FormPotrero>(formVacio);

  useEffect(() => { if (loteInicial) setLoteFiltro(loteInicial); }, [loteInicial]);

  const { data: lotes = [] } = useQuery<LoteOpcion[]>({
    queryKey: ['lotes', ''],
    queryFn: () => clienteHttp.get('/lotes').then((r) => r.data.datos ?? []),
  });

  const { data: potreros = [], isLoading } = useQuery<Potrero[]>({
    queryKey: ['potreros', fincaFiltro, loteFiltro],
    queryFn: () => clienteHttp.get('/potreros', {
      params: { ...(fincaFiltro && { fincaId: fincaFiltro }), ...(loteFiltro && { loteId: loteFiltro }) },
    }).then((r) => r.data.datos ?? []),
  });

  const { data: detalle, isLoading: cargandoDetalle } = useQuery<PotreroDetalle>({
    queryKey: ['potrero', detalleId],
    queryFn: () => clienteHttp.get(`/potreros/${detalleId}`).then((r) => r.data.datos),
    enabled: !!detalleId,
  });

  const refrescar = () => {
    for (const clave of ['potreros', 'potrero', 'potreros-lote', 'lotes', 'fincas']) qc.invalidateQueries({ queryKey: [clave] });
  };

  const mutGuardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: form.nombre.trim(),
        loteId: form.loteId,
        hectareas: form.hectareas ? Number(form.hectareas) : null,
        descripcion: form.descripcion.trim() || null,
      };
      return editando
        ? clienteHttp.patch(`/potreros/${editando.id}`, datos, { descripcionOffline: 'Edición de potrero' })
        : clienteHttp.post('/potreros', datos, { descripcionOffline: 'Nuevo potrero' });
    },
    onSuccess: (r) => {
      refrescar();
      if (!r.data?.offline) toast.success(editando ? 'Potrero actualizado correctamente' : 'Potrero creado correctamente');
      cerrarModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.mensaje ?? 'No se pudo guardar el potrero'),
  });

  const mutEliminar = useMutation({
    mutationFn: (id: string) => clienteHttp.delete(`/potreros/${id}`),
    onSuccess: () => { refrescar(); toast.success('Potrero eliminado correctamente'); setEliminando(null); },
    onError: (e: any) => toast.error(e?.response?.data?.mensaje ?? 'No se pudo eliminar el potrero'),
  });

  function abrirCrear() {
    const lote = lotes.find((l) => l.id === loteFiltro);
    setEditando(null);
    setForm({ ...formVacio, fincaId: lote?.fincaId ?? fincaFiltro, loteId: lote?.id ?? '' });
    setModalAbierto(true);
  }
  function abrirEditar(p: Potrero) {
    setEditando(p);
    setForm({
      fincaId: p.lote.finca.id, loteId: p.loteId, nombre: p.nombre,
      hectareas: p.hectareas?.toString() ?? '', descripcion: p.descripcion ?? '',
    });
    setModalAbierto(true);
  }
  function cerrarModal() { setModalAbierto(false); setEditando(null); setForm(formVacio); }

  const lotesDelFiltro = lotes.filter((l) => !fincaFiltro || l.fincaId === fincaFiltro);
  const lotesDelForm = lotes.filter((l) => !form.fincaId || l.fincaId === form.fincaId);
  const totalHa = potreros.reduce((s, p) => s + (p.hectareas ?? 0), 0);
  const totalAnimales = potreros.reduce((s, p) => s + p._count.animales, 0);

  return (
    <div className="space-y-4">
      {/* Filtros y resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select value={fincaFiltro} onChange={(e) => { setFincaFiltro(e.target.value); setLoteFiltro(''); }}
            className="campo-entrada text-sm py-1.5 w-auto">
            <option value="">Todas las fincas</option>
            {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <select value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)} className="campo-entrada text-sm py-1.5 w-auto">
            <option value="">Todos los lotes</option>
            {lotesDelFiltro.map((l) => <option key={l.id} value={l.id}>{l.nombre}{fincaFiltro ? '' : ` · ${l.finca.nombre}`}</option>)}
          </select>
          <span className="text-xs text-on-surface-variant">
            {potreros.length} potrero(s) · {totalHa ? `${totalHa.toLocaleString('es-VE')} ha` : 'sin superficie registrada'} · {totalAnimales} animal(es)
          </span>
        </div>
        {puedeEditar && (
          <button onClick={abrirCrear} className="boton boton-primario gap-2 text-sm">
            <Icono nombre="add" clase="text-[18px]" />
            Nuevo potrero
          </button>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />)}</div>
      ) : !potreros.length ? (
        <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
          <Icono nombre="grass" clase="text-[40px] text-outline mx-auto mb-3" />
          <p className="font-medium text-on-surface-variant">Sin potreros registrados</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {loteFiltro ? 'Este lote no tiene potreros aún.' : 'Cree el primer potrero para indicar dónde se alojan los animales.'}
          </p>
        </div>
      ) : (
        <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/20">
                  {['Potrero', 'Lote', 'Finca', 'Superficie', 'Animales', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {potreros.map((p, idx) => (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                    onClick={() => setDetalleId(p.id)} title="Ver los animales del potrero"
                    className="hover:bg-surface-container-low cursor-pointer transition-colors align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icono nombre="grass" clase="text-[16px] text-primary" />
                        <span className="font-semibold text-on-surface">{p.nombre}</span>
                      </div>
                      {p.descripcion && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{p.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 text-on-surface">{p.lote.nombre}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{p.lote.finca.nombre}</td>
                    <td className="px-4 py-3 text-on-surface">{p.hectareas != null ? `${p.hectareas.toLocaleString('es-VE')} ha` : '—'}</td>
                    <td className="px-4 py-3 text-on-surface">{p._count.animales}</td>
                    <td className="px-4 py-3">
                      {puedeEditar && (
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => abrirEditar(p)} title="Editar"
                            className="p-1.5 hover:bg-surface-container rounded-lg transition-colors">
                            <Icono nombre="edit" clase="text-[16px] text-on-surface-variant" />
                          </button>
                          {puedeEliminar && (
                            <button onClick={() => setEliminando(p)} title="Eliminar"
                              className="p-1.5 hover:bg-error-container rounded-lg transition-colors">
                              <Icono nombre="delete" clase="text-[16px] text-on-surface-variant" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Crear / editar */}
      <Modal abierto={modalAbierto} alCerrar={cerrarModal} titulo={editando ? 'Editar potrero' : 'Nuevo potrero'} tamano="md">
        <form onSubmit={(e) => { e.preventDefault(); mutGuardar.mutate(); }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Finca *</label>
              <select value={form.fincaId} onChange={(e) => setForm((f) => ({ ...f, fincaId: e.target.value, loteId: '' }))}
                className="campo-entrada w-full" required>
                <option value="">Seleccionar finca…</option>
                {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">Lote *</label>
              <select value={form.loteId} onChange={(e) => setForm((f) => ({ ...f, loteId: e.target.value }))}
                className="campo-entrada w-full" required disabled={!form.fincaId}>
                <option value="">{form.fincaId ? 'Seleccionar lote…' : 'Primero la finca'}</option>
                {lotesDelForm.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
              {editando && editando._count.animales > 0 && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Aloja {editando._count.animales} animal(es): no se puede cambiar de lote hasta reasignarlos.
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Nombre del potrero *</label>
            <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Potrero CA-A-3, La Vega" className="campo-entrada w-full" required maxLength={100} />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Superficie (hectáreas)</label>
            <input type="number" min="0" step="0.1" value={form.hectareas}
              onChange={(e) => setForm((f) => ({ ...f, hectareas: e.target.value }))}
              placeholder="Opcional, ej: 12.5" className="campo-entrada w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={2} maxLength={500} placeholder="Tipo de pasto, bebederos, sombra…" className="campo-entrada w-full resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={cerrarModal} className="boton boton-secundario flex-1">Cancelar</button>
            <button type="submit" disabled={mutGuardar.isPending} className="boton boton-primario flex-1">
              {mutGuardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detalle: animales del potrero */}
      <Modal abierto={!!detalleId} alCerrar={() => setDetalleId(null)} titulo={detalle?.nombre ?? 'Potrero'}
        descripcion={detalle ? `${detalle.lote.nombre} · ${detalle.lote.finca.nombre}${detalle.hectareas != null ? ` · ${detalle.hectareas} ha` : ''}` : undefined}
        tamano="md">
        {cargandoDetalle || !detalle ? (
          <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
        ) : (
          <div className="space-y-3">
            {detalle.descripcion && <p className="text-sm text-on-surface-variant">{detalle.descripcion}</p>}
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Animales alojados ({detalle.animales.length})
            </p>
            {detalle.animales.length ? (
              <div className="rounded-xl border border-outline-variant/30 divide-y divide-outline-variant/15 max-h-72 overflow-y-auto">
                {detalle.animales.map((a) => (
                  <button key={a.id} type="button" onClick={() => navegar(`/animales/${a.id}`)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-container-low">
                    <Icono nombre="pets" clase="text-[14px] text-outline" />
                    <span className="font-medium text-on-surface">#{a.numeroIdentificacion}</span>
                    {a.nombre && <span className="text-on-surface-variant">· {a.nombre}</span>}
                    <span className="ml-auto text-xs text-on-surface-variant">{a.sexo === 'HEMBRA' ? 'Hembra' : 'Macho'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant italic">
                No aloja animales. Se asignan desde el formulario del animal (Ubicación → Potrero).
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmar eliminación */}
      <Modal abierto={!!eliminando} alCerrar={() => setEliminando(null)} titulo="¿Eliminar potrero?" tamano="sm">
        {eliminando && (
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Se eliminará el potrero <strong className="text-on-surface">"{eliminando.nombre}"</strong> de {eliminando.lote.nombre}.
              {eliminando._count.animales > 0
                ? ` Aloja ${eliminando._count.animales} animal(es): primero hay que asignarlos a otro potrero.`
                : ' Esta acción no se puede deshacer.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setEliminando(null)} className="boton boton-secundario flex-1">Cancelar</button>
              <button onClick={() => mutEliminar.mutate(eliminando.id)}
                disabled={mutEliminar.isPending || eliminando._count.animales > 0}
                className="boton flex-1 bg-error text-white hover:bg-error/90 disabled:opacity-50">
                {mutEliminar.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
