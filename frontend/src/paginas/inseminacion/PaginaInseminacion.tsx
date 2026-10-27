import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import Badge from '../../componentes/ui/Badge';
import Modal from '../../componentes/ui/Modal';
import Icono from '../../componentes/ui/Icono';
import Paginacion from '../../componentes/ui/Paginacion';
import SelectorRaza from '../../componentes/ui/SelectorRaza';
import CampoFecha from '../../componentes/ui/CampoFecha';
import { invalidarSeguimientoReproductivo } from '../../componentes/reproduccion/seguimientoReproductivo';
import toast from 'react-hot-toast';
import { isoMediodia } from '../../servicios/fechas';

// Laboratorio de inseminación artificial: catálogo de sementales,
// inventario de dosis de semen y el registro de cada inseminación
// aplicada (que descuenta una dosis del inventario).

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Semental {
  id: string;
  nombre: string;
  registro: string | null;
  origen: string | null;
  observaciones: string | null;
  motivilidad?: number | null;
  raza: { nombre: string };
  _count: { inventariosSemen: number };
}

interface LoteSemen {
  id: string;
  codigoDosis: string;
  cantidadDosis: number;
  cantidadUsada: number;
  motivilidad: number | null;
  concentracion: number | null;
  temperatura: number | null;
  fechaVencimiento: string | null;
  semental: { nombre: string };
}

interface Inseminacion {
  id: string;
  fecha: string;
  tipo: string;
  observaciones: string | null;
  animal: { id: string; numeroIdentificacion: string; nombre: string | null };
  registradoPor: { nombre: string; apellido: string };
  inseminacion: {
    fechaInseminacion: string;
    numeroIntento: number;
    clasificacionIA: string | null;
    tecnicaDeposicion: string | null;
    patologiasVaca: string | null;
    tasaMetabolicaBasal: number | null;
    balanceEnergetico: string | null;
    temperaturaUterina: number | null;
    manejoHato: string | null;
    inventarioSemen: { codigoDosis: string; temperatura: number | null; semental: { nombre: string } } | null;
  } | null;
}

interface Animal { id: string; numeroIdentificacion: string; nombre: string | null; lote?: { finca?: { nombre: string } } }

interface EfectividadSemental {
  sementalId: string;
  sementalNombre: string;
  totalInseminaciones: number;
  inseminacionesEfectivas: number;
  tasaEfectividad: number;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
const api = {
  sementales:    () => clienteHttp.get('/inseminacion/sementales').then((r) => r.data.datos ?? []),
  inventario:    (p: number) => clienteHttp.get('/inseminacion/inventario', { params: { pagina: p, porPagina: 20 } }).then((r) => r.data),
  inseminaciones:(p: number) => clienteHttp.get('/inseminacion', { params: { pagina: p, porPagina: 20 } }).then((r) => r.data),
  animalesHembra:() => clienteHttp.get('/animales', { params: { sexo: 'HEMBRA', estado: 'ACTIVO', porPagina: 200 } }).then((r) => r.data.datos ?? []),
  efectividad:   () => clienteHttp.get('/reproduccion/efectividad-inseminacion').then((r) => r.data.datos ?? []),
};

// ── Esquema form inseminación ─────────────────────────────────────────────────
const esquemaInseminacion = z.object({
  receptoraId:         z.string().min(1, 'Seleccione la receptora'),
  inventarioSemenId:   z.string().min(1, 'Seleccione el lote de semen'),
  fecha:               z.string().min(1, 'Indique la fecha'),
  numeroIntento:       z.coerce.number().int().min(1).max(5).default(1),
  observaciones:       z.string().max(500).optional().or(z.literal('')),
  // Clasificación
  clasificacionIA:     z.enum(['CELO_DETECTADO', 'TIEMPO_FIJO', '']).optional(),
  tecnicaDeposicion:   z.enum(['INTRAUTERINA_RECTOVAGINAL', 'INTRAUTERINA_PROFUNDA', '']).optional(),
  // Factores biológicos
  patologiasVaca:      z.string().max(1000).optional().or(z.literal('')),
  tasaMetabolicaBasal: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  balanceEnergetico:   z.string().max(200).optional().or(z.literal('')),
  // Estrés térmico
  temperaturaUterina:  z.coerce.number().optional().or(z.literal('')),
  // Manejo del hato
  manejoHato:          z.enum(['ALTO', 'MEDIO', 'BAJO', '']).optional(),
});
type FormInseminacion = z.infer<typeof esquemaInseminacion>;

// ── Componente principal ──────────────────────────────────────────────────────
export default function PaginaInseminacion() {
  const { esAdministrador, esVeterinario } = useAutenticacion();
  const puedeRegistrar = esAdministrador || esVeterinario;
  const qc = useQueryClient();

  const [pestaña,      setPestaña]      = useState<'inseminaciones' | 'inventario' | 'sementales' | 'efectividad'>('inseminaciones');
  const [pagIns,       setPagIns]       = useState(1);
  const [pagInv,       setPagInv]       = useState(1);
  const [modalIns,     setModalIns]     = useState(false);
  const [modalLote,    setModalLote]    = useState(false);
  const [modalSemental,setModalSemental]= useState(false);

  // Queries
  const { data: sementales = [] } = useQuery<Semental[]>({ queryKey: ['sementales'], queryFn: api.sementales });
  const { data: dataInv,  isLoading: cargInv  } = useQuery({ queryKey: ['inv-semen', pagInv],    queryFn: () => api.inventario(pagInv) });
  const { data: dataIns,  isLoading: cargIns  } = useQuery({ queryKey: ['inseminaciones', pagIns], queryFn: () => api.inseminaciones(pagIns) });
  const { data: hembras = [] } = useQuery<Animal[]>({ queryKey: ['hembras-select'], queryFn: api.animalesHembra, enabled: modalIns });
  const { data: efectividad = [], isLoading: cargEfec } = useQuery<EfectividadSemental[]>({
    queryKey: ['efectividad-inseminacion'],
    queryFn: api.efectividad,
    enabled: pestaña === 'efectividad',
  });

  const lotes: LoteSemen[]        = dataInv?.datos ?? [];
  const inseminaciones: Inseminacion[] = dataIns?.datos ?? [];
  const lotesDisponibles = lotes.filter((l) => (l.cantidadDosis - l.cantidadUsada) > 0);

  // KPIs
  const dosisDisponibles = lotes.reduce((s, l) => s + Math.max(0, l.cantidadDosis - l.cantidadUsada), 0);

  // Mutation registrar inseminación
  const mutRegistrar = useMutation({
    mutationFn: (datos: FormInseminacion) => {
      const payload: Record<string, any> = {
        receptoraId:       datos.receptoraId,
        inventarioSemenId: datos.inventarioSemenId,
        fecha:             isoMediodia(datos.fecha),
        numeroIntento:     datos.numeroIntento,
      };
      if (datos.observaciones)       payload.observaciones       = datos.observaciones;
      if (datos.clasificacionIA)     payload.clasificacionIA     = datos.clasificacionIA;
      if (datos.tecnicaDeposicion)   payload.tecnicaDeposicion   = datos.tecnicaDeposicion;
      if (datos.patologiasVaca)      payload.patologiasVaca      = datos.patologiasVaca;
      if (datos.tasaMetabolicaBasal) payload.tasaMetabolicaBasal = Number(datos.tasaMetabolicaBasal);
      if (datos.balanceEnergetico)   payload.balanceEnergetico   = datos.balanceEnergetico;
      if (datos.temperaturaUterina)  payload.temperaturaUterina  = Number(datos.temperaturaUterina);
      if (datos.manejoHato)          payload.manejoHato          = datos.manejoHato;
      return clienteHttp.post('/inseminacion', payload, { descripcionOffline: 'Inseminación artificial' });
    },
    onSuccess: (r) => {
      // La inseminación también es un evento reproductivo: queda en
      // Reproducción → Por confirmar hasta que se registre si preñó.
      invalidarSeguimientoReproductivo(qc);
      qc.invalidateQueries({ queryKey: ['inv-semen'] });
      if (!r.data?.offline) {
        toast.success('Inseminación registrada. Quedó en Reproducción → Por confirmar; en 21 días llegará la alerta para revisarla.', { duration: 6000 });
      }
      setModalIns(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.mensaje ?? 'Error al registrar'),
  });

  return (
    <div className="space-y-5">

      {/* Encabezado */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <Icono nombre="science" relleno clase="text-[22px] text-primary" />
            Laboratorio de Inseminación
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Control de inseminaciones artificiales, inventario de semen y sementales
          </p>
        </div>
        {puedeRegistrar && (
          <button onClick={() => setModalIns(true)} className="boton boton-primario gap-2 text-sm">
            <Icono nombre="add_circle" clase="text-[18px]" />
            Nueva inseminación
          </button>
        )}
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { et: 'Inseminaciones totales', val: dataIns?.meta?.total ?? 0,    ico: 'biotech',   col: 'text-primary',   fondo: 'bg-primary/10' },
          { et: 'Sementales registrados', val: sementales.length, ico: 'pets', col: 'text-secondary', fondo: 'bg-secondary/10' },
          { et: 'Lotes de semen',         val: lotes.length,                  ico: 'inventory', col: 'text-tertiary',  fondo: 'bg-tertiary/10' },
          { et: 'Dosis disponibles',      val: dosisDisponibles,              ico: dosisDisponibles < 10 ? 'warning' : 'check_circle', col: dosisDisponibles < 10 ? 'text-error' : 'text-primary', fondo: dosisDisponibles < 10 ? 'bg-error-container' : 'bg-primary/10' },
        ].map((k) => (
          <div key={k.et} className="tarjeta-vidrio rounded-2xl p-4 flex items-center gap-3">
            <div className={`p-2.5 ${k.fondo} rounded-xl flex-shrink-0`}>
              <Icono nombre={k.ico} relleno clase={`text-[20px] ${k.col}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-on-surface">{k.val}</p>
              <p className="text-xs text-on-surface-variant leading-tight">{k.et}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl overflow-x-auto max-w-full">
        {([
          { clave: 'inseminaciones', et: 'Inseminaciones', ico: 'biotech' },
          { clave: 'inventario',     et: 'Inventario semen', ico: 'inventory' },
          { clave: 'sementales',     et: 'Sementales', ico: 'pets' },
          { clave: 'efectividad',    et: 'Efectividad IA', ico: 'insights' },
        ] as const).map((p) => (
          <button
            key={p.clave}
            onClick={() => setPestaña(p.clave)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${
              pestaña === p.clave
                ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icono nombre={p.ico} clase="text-[16px]" />
            {p.et}
          </button>
        ))}
      </div>

      {/* ── PESTAÑA: INSEMINACIONES ─────────────────────────────────────────── */}
      {pestaña === 'inseminaciones' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {cargIns ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
            ))}</div>
          ) : !inseminaciones.length ? (
            <VacioPanel icono="biotech" texto="No hay inseminaciones registradas" subtexto="Registre la primera inseminación artificial" />
          ) : (
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              {inseminaciones.map((ins, idx) => {
                const dosis = ins.inseminacion?.inventarioSemen;
                const intento = ins.inseminacion?.numeroIntento ?? 1;
                return (
                  <div
                    key={ins.id}
                    className={`px-5 py-4 hover:bg-surface-container-low transition-colors
                      ${idx < inseminaciones.length - 1 ? 'border-b border-outline-variant/15' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2.5 rounded-xl flex-shrink-0">
                      <Icono nombre="biotech" relleno clase="text-[20px] text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold text-on-surface">
                          #{ins.animal.numeroIdentificacion}
                          {ins.animal.nombre && <span className="font-normal text-on-surface-variant"> · {ins.animal.nombre}</span>}
                        </span>
                        <Badge variante={intento === 1 ? 'verde' : intento === 2 ? 'amarillo' : 'rojo'} tamano="xs">
                          {intento}° intento
                        </Badge>
                        {ins.inseminacion?.clasificacionIA && (
                          <Badge variante="azul" tamano="xs">
                            {ins.inseminacion.clasificacionIA === 'CELO_DETECTADO' ? 'Celo detectado' : 'IATF'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-on-surface-variant flex-wrap">
                        {dosis && (
                          <>
                            <span className="flex items-center gap-1">
                              <Icono nombre="pets" clase="text-[11px] text-primary" />
                              {dosis.semental.nombre}
                            </span>
                            <span className="flex items-center gap-1">
                              <Icono nombre="inventory" clase="text-[11px] text-outline" />
                              {dosis.codigoDosis}
                            </span>
                          </>
                        )}
                        {ins.inseminacion?.tecnicaDeposicion && (
                          <span className="flex items-center gap-1">
                            <Icono nombre="vaccines" clase="text-[11px] text-outline" />
                            {ins.inseminacion.tecnicaDeposicion === 'INTRAUTERINA_RECTOVAGINAL' ? 'Rectovaginal' : 'Intrauterina profunda'}
                          </span>
                        )}
                        {ins.inseminacion?.manejoHato && (
                          <span className="flex items-center gap-1">
                            <Icono nombre="monitor_heart" clase="text-[11px] text-outline" />
                            Estrés {ins.inseminacion.manejoHato.toLowerCase()}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Icono nombre="person" clase="text-[11px] text-outline" />
                          {ins.registradoPor.nombre} {ins.registradoPor.apellido}
                        </span>
                      </div>
                      {(ins.inseminacion?.tasaMetabolicaBasal != null || ins.inseminacion?.temperaturaUterina != null || ins.inseminacion?.balanceEnergetico) && (
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {ins.inseminacion.tasaMetabolicaBasal != null && (
                            <span className="text-[10px] px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">
                              TMB: {ins.inseminacion.tasaMetabolicaBasal}/5
                            </span>
                          )}
                          {ins.inseminacion.temperaturaUterina != null && (
                            <span className="text-[10px] px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">
                              T° uterina: {ins.inseminacion.temperaturaUterina}°C
                            </span>
                          )}
                          {ins.inseminacion.balanceEnergetico && (
                            <span className="text-[10px] px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">
                              BE: {ins.inseminacion.balanceEnergetico}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-on-surface">
                        {new Date(ins.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      {ins.observaciones && (
                        <p className="text-xs text-outline truncate max-w-[140px]">{ins.observaciones}</p>
                      )}
                    </div>
                    </div>{/* flex items-start */}
                  </div>
                );
              })}

              {dataIns?.meta?.totalPaginas > 1 && (
                <div className="px-4 py-3 border-t border-outline-variant/20">
                  <Paginacion
                    paginaActual={pagIns}
                    totalPaginas={dataIns.meta.totalPaginas}
                    totalRegistros={dataIns.meta.total}
                    porPagina={20}
                    alCambiarPagina={setPagIns}
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── PESTAÑA: INVENTARIO ─────────────────────────────────────────────── */}
      {pestaña === 'inventario' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {puedeRegistrar && (
            <div className="flex justify-end">
              <button onClick={() => setModalLote(true)} className="boton boton-secundario gap-2 text-sm">
                <Icono nombre="add" clase="text-[18px]" />
                Registrar lote de semen
              </button>
            </div>
          )}

          {cargInv ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-surface-container animate-pulse" />
            ))}</div>
          ) : !lotes.length ? (
            <VacioPanel icono="inventory" texto="Sin lotes de semen registrados" subtexto="Registre el inventario del laboratorio" />
          ) : (
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              {/* Las columnas tienen ancho fijo (excepto la primera), así que en
                  pantallas angostas se desliza horizontal en vez de aplastarse. */}
              <div className="overflow-x-auto">
              <div className="min-w-[640px]">
              {/* Cabecera tabla */}
              <div className="grid grid-cols-[1fr_90px_90px_100px_90px] gap-3 px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">
                {['Semental / Código', 'Disponibles', 'Motilidad', 'Vence', 'Estado'].map((h) => (
                  <span key={h} className={h === 'Semental / Código' ? '' : 'text-center'}>{h}</span>
                ))}
              </div>

              {lotes.map((lote, idx) => {
                const disponibles = lote.cantidadDosis - lote.cantidadUsada;
                const pct = Math.round((lote.cantidadUsada / lote.cantidadDosis) * 100);
                const vence = lote.fechaVencimiento ? new Date(lote.fechaVencimiento) : null;
                const vencido = vence ? vence < new Date() : false;
                const porVencer = vence ? (vence.getTime() - Date.now()) < 90 * 24 * 60 * 60 * 1000 : false;

                return (
                  <div
                    key={lote.id}
                    className={`grid grid-cols-[1fr_90px_90px_100px_90px] gap-3 items-center px-5 py-4 text-sm
                      hover:bg-surface-container-low transition-colors
                      ${idx < lotes.length - 1 ? 'border-b border-outline-variant/10' : ''}
                      ${vencido ? 'bg-error-container/10' : ''}`}
                  >
                    <div>
                      <p className="font-semibold text-on-surface">{lote.semental.nombre}</p>
                      <p className="text-xs text-outline font-mono">{lote.codigoDosis}</p>
                      {/* Barra de uso */}
                      <div className="mt-1.5 h-1 rounded-full bg-surface-container-high overflow-hidden w-28">
                        <div
                          className={`h-full rounded-full ${pct > 80 ? 'bg-error' : pct > 50 ? 'bg-secondary' : 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-outline mt-0.5">{lote.cantidadUsada}/{lote.cantidadDosis} dosis usadas</p>
                    </div>

                    <div className="text-center">
                      <p className={`text-lg font-bold ${disponibles === 0 ? 'text-error' : disponibles < 5 ? 'text-secondary' : 'text-primary'}`}>
                        {disponibles}
                      </p>
                      <p className="text-[10px] text-outline">dosis</p>
                    </div>

                    <div className="text-center">
                      {lote.motivilidad != null ? (
                        <>
                          <p className="font-semibold text-on-surface">{lote.motivilidad.toFixed(1)}%</p>
                          <p className="text-[10px] text-outline">motilidad</p>
                        </>
                      ) : <span className="text-outline">—</span>}
                    </div>

                    <div className="text-center">
                      {vence ? (
                        <>
                          <p className={`text-xs font-medium ${vencido ? 'text-error' : porVencer ? 'text-secondary' : 'text-on-surface'}`}>
                            {vence.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          {vencido && <p className="text-[10px] text-error font-semibold">VENCIDO</p>}
                        </>
                      ) : <span className="text-outline">—</span>}
                    </div>

                    <div className="text-center">
                      {vencido ? (
                        <Badge variante="rojo"     tamano="xs">Vencido</Badge>
                      ) : disponibles === 0 ? (
                        <Badge variante="rojo"     tamano="xs">Agotado</Badge>
                      ) : disponibles < 5 ? (
                        <Badge variante="amarillo" tamano="xs">Stock bajo</Badge>
                      ) : (
                        <Badge variante="verde"    tamano="xs" punto>Disponible</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              </div>

              {dataInv?.meta?.totalPaginas > 1 && (
                <div className="px-4 py-3 border-t border-outline-variant/20">
                  <Paginacion
                    paginaActual={pagInv}
                    totalPaginas={dataInv.meta.totalPaginas}
                    totalRegistros={dataInv.meta.total}
                    porPagina={20}
                    alCambiarPagina={setPagInv}
                  />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── PESTAÑA: SEMENTALES ─────────────────────────────────────────────── */}
      {pestaña === 'sementales' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {puedeRegistrar && (
            <div className="flex justify-end">
              <button onClick={() => setModalSemental(true)} className="boton boton-secundario gap-2 text-sm">
                <Icono nombre="add" clase="text-[18px]" />
                Registrar semental
              </button>
            </div>
          )}
          {!sementales.length ? (
            <VacioPanel icono="pets" texto="Sin sementales registrados" subtexto="Registre los donantes en la base de datos" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sementales.map((sem) => (
                <TarjetaSemental key={sem.id} semental={sem} />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ── PESTAÑA: EFECTIVIDAD IA POR SEMENTAL ─────────────────────────────── */}
      {pestaña === 'efectividad' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {cargEfec ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-surface-container animate-pulse" />
            ))}</div>
          ) : !efectividad.length ? (
            <VacioPanel icono="insights" texto="Sin datos de efectividad" subtexto="Se calcula a partir de las inseminaciones registradas con dosis vinculada a un semental" />
          ) : (
            <div className="tarjeta-vidrio rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
              <div className="min-w-[520px]">
              <div className="grid grid-cols-[1fr_110px_90px_100px] gap-3 px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">
                {['Semental', 'Inseminaciones', 'Efectivas', 'Efectividad'].map((h) => (
                  <span key={h} className={h === 'Semental' ? '' : 'text-center'}>{h}</span>
                ))}
              </div>
              {efectividad.map((e, idx) => (
                <div
                  key={e.sementalId}
                  className={`grid grid-cols-[1fr_110px_90px_100px] gap-3 items-center px-5 py-3.5 text-sm
                    hover:bg-surface-container-low transition-colors
                    ${idx < efectividad.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
                >
                  <span className="font-semibold text-on-surface flex items-center gap-2">
                    <Icono nombre="pets" clase="text-[16px] text-secondary" />
                    {e.sementalNombre}
                  </span>
                  <span className="text-center text-on-surface-variant">{e.totalInseminaciones}</span>
                  <span className="text-center text-on-surface-variant">{e.inseminacionesEfectivas}</span>
                  <span className="text-center">
                    <Badge variante={e.tasaEfectividad >= 60 ? 'verde' : e.tasaEfectividad >= 40 ? 'amarillo' : 'rojo'} tamano="xs">
                      {e.tasaEfectividad}%
                    </Badge>
                  </span>
                </div>
              ))}
              </div>
              </div>
            </div>
          )}
          <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <Icono nombre="info" clase="text-[13px]" />
            Efectividad = inseminaciones cuya gestación resultante no terminó en aborto ni pérdida, sobre el total de inseminaciones de ese semental.
          </p>
        </motion.div>
      )}

      {/* ── MODAL: Registrar inseminación ────────────────────────────────────── */}
      <Modal
        abierto={modalIns}
        alCerrar={() => setModalIns(false)}
        titulo="Registrar inseminación artificial"
        descripcion="Complete los datos del procedimiento"
        tamano="xl"
        pie={
          <>
            <button onClick={() => setModalIns(false)} className="boton boton-secundario">Cancelar</button>
            <button
              form="form-inseminacion"
              type="submit"
              disabled={mutRegistrar.isPending}
              className="boton boton-primario gap-2"
            >
              {mutRegistrar.isPending
                ? <><Icono nombre="progress_activity" clase="text-[16px] animate-spin" />Registrando...</>
                : <><Icono nombre="save" clase="text-[16px]" />Registrar</>}
            </button>
          </>
        }
      >
        <FormularioInseminacion
          hembras={hembras}
          lotes={lotesDisponibles}
          onSubmit={(datos) => mutRegistrar.mutate(datos)}
          pendiente={mutRegistrar.isPending}
        />
      </Modal>

      {/* ── MODAL: Registrar lote de semen ───────────────────────────────────── */}
      <AnimatePresence>
        {modalLote && (
          <ModalLoteSemen
            sementales={sementales}
            onCerrar={() => setModalLote(false)}
            onExito={() => {
              qc.invalidateQueries({ queryKey: ['inv-semen'] });
              qc.invalidateQueries({ queryKey: ['sementales'] });
              setModalLote(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── MODAL: Registrar semental ─────────────────────────────────────────── */}
      <AnimatePresence>
        {modalSemental && (
          <ModalSemental
            onCerrar={() => setModalSemental(false)}
            onExito={() => {
              qc.invalidateQueries({ queryKey: ['sementales'] });
              setModalSemental(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function VacioPanel({ icono, texto, subtexto }: { icono: string; texto: string; subtexto: string }) {
  return (
    <div className="tarjeta-vidrio rounded-2xl p-12 text-center">
      <Icono nombre={icono} clase="text-[40px] text-outline mx-auto mb-3" />
      <p className="font-medium text-on-surface-variant">{texto}</p>
      <p className="text-xs text-outline mt-1">{subtexto}</p>
    </div>
  );
}

function TarjetaSemental({ semental }: { semental: Semental }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="tarjeta-vidrio rounded-2xl p-5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
          <Icono nombre="pets" relleno clase="text-[22px] text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-on-surface truncate">{semental.nombre}</p>
          <p className="text-xs text-on-surface-variant">{semental.raza.nombre}</p>
          {semental.registro && (
            <p className="text-[10px] text-outline font-mono mt-0.5">{semental.registro}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {semental.origen && (
          <div className="bg-surface-container rounded-xl p-2.5">
            <p className="text-outline text-[10px] mb-0.5">Origen</p>
            <p className="font-medium text-on-surface">{semental.origen}</p>
          </div>
        )}
        <div className="bg-surface-container rounded-xl p-2.5">
          <p className="text-outline text-[10px] mb-0.5">Lotes registrados</p>
          <p className="font-semibold text-primary text-base">{semental._count.inventariosSemen}</p>
        </div>
      </div>

      {semental.observaciones && (
        <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
          {semental.observaciones}
        </p>
      )}
    </motion.div>
  );
}

// ── Formulario de inseminación ────────────────────────────────────────────────
interface PropsFormInseminacion {
  hembras: Animal[];
  lotes: LoteSemen[];
  onSubmit: (datos: FormInseminacion) => void;
  pendiente: boolean;
}

function GrupoIA({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="px-3 py-2 bg-surface-container-low">
        <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wide">{titulo}</p>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function FormularioInseminacion({ hembras, lotes, onSubmit }: PropsFormInseminacion) {
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormInseminacion>({
    resolver: zodResolver(esquemaInseminacion),
    defaultValues: { numeroIntento: 1, fecha: new Date().toISOString().split('T')[0] },
  });

  return (
    <form id="form-inseminacion" onSubmit={handleSubmit(onSubmit)} className="space-y-4">

      {/* Animal receptora */}
      <CampoForm etiqueta="Receptora (hembra) *" error={errors.receptoraId?.message}>
        <select {...register('receptoraId')} className="campo-entrada">
          <option value="">Seleccionar hembra...</option>
          {hembras.map((h) => (
            <option key={h.id} value={h.id}>
              #{h.numeroIdentificacion}{h.nombre ? ` — ${h.nombre}` : ''}{h.lote?.finca ? ` (${h.lote.finca.nombre})` : ''}
            </option>
          ))}
        </select>
      </CampoForm>

      {/* Lote de semen */}
      <CampoForm etiqueta="Lote de semen *" error={errors.inventarioSemenId?.message}>
        <select {...register('inventarioSemenId')} className="campo-entrada">
          <option value="">Seleccionar lote...</option>
          {lotes.map((l) => {
            const disp = l.cantidadDosis - l.cantidadUsada;
            return (
              <option key={l.id} value={l.id}>
                {l.semental.nombre} — {l.codigoDosis} ({disp} dosis
                {l.motivilidad ? ` · motil. ${l.motivilidad}%` : ''}
                {l.temperatura != null ? ` · temp. ${l.temperatura}°C` : ''})
              </option>
            );
          })}
        </select>
        {!lotes.length && (
          <p className="text-xs text-secondary mt-1 flex items-center gap-1">
            <Icono nombre="warning" clase="text-[12px]" />
            No hay lotes con dosis disponibles
          </p>
        )}
      </CampoForm>

      {/* Fecha e intento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm etiqueta="Fecha del procedimiento *" error={errors.fecha?.message}>
          <Controller name="fecha" control={control} render={({ field }) => (
            <CampoFecha value={field.value ?? ''} onChange={field.onChange} />
          )} />
        </CampoForm>
        <CampoForm etiqueta="N° de intento" error={errors.numeroIntento?.message}>
          <select {...register('numeroIntento')} className="campo-entrada">
            {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}° intento</option>)}
          </select>
        </CampoForm>
      </div>

      {/* Clasificación */}
      <GrupoIA titulo="Clasificación de la inseminación">
        <CampoForm etiqueta="Clasificación IA">
          <select {...register('clasificacionIA')} className="campo-entrada text-sm">
            <option value="">No especificado</option>
            <option value="CELO_DETECTADO">A celo detectado</option>
            <option value="TIEMPO_FIJO">A tiempo fijo (IATF)</option>
          </select>
        </CampoForm>
        <CampoForm etiqueta="Técnica de deposición">
          <select {...register('tecnicaDeposicion')} className="campo-entrada text-sm">
            <option value="">No especificado</option>
            <option value="INTRAUTERINA_RECTOVAGINAL">Intrauterina rectovaginal</option>
            <option value="INTRAUTERINA_PROFUNDA">Intrauterina profunda</option>
          </select>
        </CampoForm>
      </GrupoIA>

      {/* Factores biológicos */}
      <GrupoIA titulo="Factores biológicos de la vaca">
        <div className="col-span-2">
          <CampoForm etiqueta="Patologías de la vaca">
            <input type="text" {...register('patologiasVaca')}
              placeholder="Ej: infección uterina, diarrea viral..."
              className="campo-entrada text-sm" />
          </CampoForm>
        </div>
        <CampoForm etiqueta="Tasa metabólica basal (1–5)">
          <input type="number" min={1} max={5} step={1} {...register('tasaMetabolicaBasal')}
            placeholder="1=bajo · 5=alto" className="campo-entrada text-sm" />
        </CampoForm>
        <CampoForm etiqueta="Balance energético">
          <input type="text" {...register('balanceEnergetico')}
            placeholder="Positivo, negativo..." className="campo-entrada text-sm" />
        </CampoForm>
      </GrupoIA>

      {/* Estrés térmico y manejo */}
      <GrupoIA titulo="Estrés térmico y manejo del hato">
        <CampoForm etiqueta="Temperatura uterina (°C)">
          <input type="number" step={0.1} {...register('temperaturaUterina')}
            placeholder="Ej: 38.8" className="campo-entrada text-sm" />
        </CampoForm>
        <CampoForm etiqueta="Nivel de estrés del hato">
          <select {...register('manejoHato')} className="campo-entrada text-sm">
            <option value="">No especificado</option>
            <option value="BAJO">Bajo</option>
            <option value="MEDIO">Medio</option>
            <option value="ALTO">Alto</option>
          </select>
        </CampoForm>
      </GrupoIA>

      {/* Observaciones */}
      <CampoForm etiqueta="Observaciones">
        <textarea {...register('observaciones')} rows={2}
          placeholder="Notas adicionales del procedimiento..."
          className="campo-entrada resize-none" />
      </CampoForm>
    </form>
  );
}

function CampoForm({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    // min-w-0: sin esto, un <select> dentro de un grid puede forzar la
    // columna (y el modal) a desbordarse — los items de grid no se achican
    // por debajo del ancho intrínseco de su contenido por defecto.
    <div className="min-w-0">
      <label className="block text-xs font-medium text-on-surface-variant mb-1.5">{etiqueta}</label>
      {children}
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="text-error text-xs mt-1">
          {error}
        </motion.p>
      )}
    </div>
  );
}

// ── Modal: Registrar lote de semen ────────────────────────────────────────────

function ModalLoteSemen({
  sementales, onCerrar, onExito,
}: { sementales: Semental[]; onCerrar: () => void; onExito: () => void }) {
  const [form, setForm] = useState({
    sementalId: '',
    codigoDosis: '',
    cantidadDosis: '',
    motivilidad: '',
    concentracion: '',
    volumen: '',
    coloracion: '',
    temperatura: '',
    fechaColeccion: '',
    fechaVencimiento: '',
    observaciones: '',
  });
  const [error, setError] = useState('');

  const mutacion = useMutation({
    mutationFn: () =>
      clienteHttp.post('/inseminacion/inventario', {
        sementalId:    form.sementalId,
        codigoDosis:   form.codigoDosis.trim(),
        cantidadDosis: Number(form.cantidadDosis),
        ...(form.motivilidad     && { motivilidad:     Number(form.motivilidad) }),
        ...(form.concentracion   && { concentracion:   Number(form.concentracion) }),
        ...(form.volumen         && { volumen:         Number(form.volumen) }),
        ...(form.coloracion      && { coloracion:      form.coloracion }),
        ...(form.temperatura     && { temperatura:     Number(form.temperatura) }),
        ...(form.fechaColeccion  && { fechaColeccion:  isoMediodia(form.fechaColeccion) }),
        ...(form.fechaVencimiento && { fechaVencimiento: isoMediodia(form.fechaVencimiento) }),
        ...(form.observaciones   && { observaciones:   form.observaciones }),
      }),
    onSuccess: () => { toast.success('Lote registrado correctamente'); onExito(); },
    onError: (e: any) => setError(e?.response?.data?.mensaje ?? 'Error al registrar el lote'),
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
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="inventory" relleno clase="text-[20px] text-tertiary" />
              Registrar lote de semen
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.sementalId)         { setError('Seleccione el semental'); return; }
              if (!form.codigoDosis.trim()) { setError('El código de dosis es requerido'); return; }
              if (!form.cantidadDosis || Number(form.cantidadDosis) < 1) {
                setError('Ingrese la cantidad de dosis'); return;
              }
              setError('');
              mutacion.mutate();
            }}
            className="p-6 space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Semental <span className="text-error">*</span>
              </label>
              <select
                value={form.sementalId}
                onChange={(e) => setForm((f) => ({ ...f, sementalId: e.target.value }))}
                className="campo-entrada"
              >
                <option value="">Seleccionar semental...</option>
                {sementales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre} — {s.raza.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Código de dosis <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={form.codigoDosis}
                  onChange={(e) => setForm((f) => ({ ...f, codigoDosis: e.target.value }))}
                  placeholder="Ej: LOT-2026-001"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  Cantidad de dosis <span className="text-error">*</span>
                </label>
                <input
                  type="number" min={1}
                  value={form.cantidadDosis}
                  onChange={(e) => setForm((f) => ({ ...f, cantidadDosis: e.target.value }))}
                  placeholder="Ej: 20"
                  className="campo-entrada"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Motilidad (%)</label>
                <input type="number" min={0} max={100} step={0.1}
                  value={form.motivilidad}
                  onChange={(e) => setForm((f) => ({ ...f, motivilidad: e.target.value }))}
                  placeholder="Ej: 80"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Concentración</label>
                <input type="number" min={0} step={0.01}
                  value={form.concentracion}
                  onChange={(e) => setForm((f) => ({ ...f, concentracion: e.target.value }))}
                  placeholder="mill./ml"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Volumen (ml)</label>
                <input type="number" min={0} step={0.01}
                  value={form.volumen}
                  onChange={(e) => setForm((f) => ({ ...f, volumen: e.target.value }))}
                  placeholder="Ej: 0.5"
                  className="campo-entrada"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Temperatura (°C)</label>
                <input type="number" step={0.1}
                  value={form.temperatura}
                  onChange={(e) => setForm((f) => ({ ...f, temperatura: e.target.value }))}
                  placeholder="Ej: -196"
                  className="campo-entrada"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">F. Colección</label>
                <CampoFecha
                  value={form.fechaColeccion}
                  onChange={(valor) => setForm((f) => ({ ...f, fechaColeccion: valor }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">F. Vencimiento</label>
                <CampoFecha
                  value={form.fechaVencimiento}
                  onChange={(valor) => setForm((f) => ({ ...f, fechaVencimiento: valor }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
              <textarea rows={2}
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Coloración, notas de calidad..."
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario gap-2">
                {mutacion.isPending
                  ? <><Icono nombre="progress_activity" clase="text-[16px] animate-spin" />Guardando...</>
                  : <><Icono nombre="save" clase="text-[16px]" />Registrar lote</>}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}

// ── Modal: Registrar semental ─────────────────────────────────────────────────

function ModalSemental({ onCerrar, onExito }: { onCerrar: () => void; onExito: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nombre: '', registro: '', razaId: '', razaNombreNueva: '', razaTipoCruce: '', razaOrigen: '',
    origen: '', observaciones: '',
  });
  const [error, setError] = useState('');

  const esRazaNueva = !form.razaId && !!form.razaNombreNueva;

  const mutacion = useMutation({
    mutationFn: async () => {
      // Igual que en el alta de animales: si la raza escrita no existe en el
      // catálogo, se crea primero y luego se usa su id para el semental.
      let razaId = form.razaId;
      if (!razaId && form.razaNombreNueva) {
        // sinCola: hace falta el id de la raza de inmediato para crear el
        // semental con ella.
        const { data: dataRaza } = await clienteHttp.post('/animales/razas', {
          nombre: form.razaNombreNueva,
          tipoCruce: form.razaTipoCruce,
          ...(form.razaOrigen && { origen: form.razaOrigen }),
        }, { sinCola: true });
        razaId = dataRaza.datos.id;
        qc.invalidateQueries({ queryKey: ['razas-select'] });
      }
      return clienteHttp.post('/inseminacion/sementales', {
        nombre:  form.nombre.trim(),
        razaId,
        ...(form.registro     && { registro:      form.registro.trim() }),
        ...(form.origen       && { origen:        form.origen.trim() }),
        ...(form.observaciones && { observaciones: form.observaciones }),
      }, { descripcionOffline: 'Nuevo semental' });
    },
    onSuccess: () => { toast.success('Semental registrado correctamente'); onExito(); },
    onError: (e: any) => setError(e?.response?.data?.mensaje ?? 'Error al registrar el semental'),
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
        <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              <Icono nombre="pets" relleno clase="text-[20px] text-secondary" />
              Registrar semental
            </h2>
            <button onClick={onCerrar} className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <Icono nombre="close" clase="text-[20px] text-on-surface-variant" />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }
              if (!form.razaId && !form.razaNombreNueva) { setError('Seleccione o escriba una raza'); return; }
              if (esRazaNueva && !form.razaTipoCruce) { setError('Indique el tipo de cruce de la nueva raza'); return; }
              setError('');
              mutacion.mutate();
            }}
            className="p-6 space-y-4"
          >
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-error-container border border-error/20 rounded-xl text-sm text-on-error-container">
                <Icono nombre="error" clase="text-[18px] flex-shrink-0 text-error" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                Nombre <span className="text-error">*</span>
              </label>
              <input type="text"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Toro Guerrero"
                className="campo-entrada"
              />
            </div>

            <SelectorRaza
              razaId={form.razaId}
              razaNombreNueva={form.razaNombreNueva}
              onSeleccionar={(idRaza) => setForm((f) => ({
                ...f, razaId: idRaza, razaNombreNueva: '', razaTipoCruce: '', razaOrigen: '',
              }))}
              onEscribir={(texto) => setForm((f) => ({ ...f, razaId: '', razaNombreNueva: texto }))}
            />
            {esRazaNueva && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                    Tipo de cruce (raza nueva) <span className="text-error">*</span>
                  </label>
                  <input type="text"
                    value={form.razaTipoCruce}
                    onChange={(e) => setForm((f) => ({ ...f, razaTipoCruce: e.target.value }))}
                    placeholder="Ej: F1, Sangre pura..."
                    className="campo-entrada"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Origen de la raza</label>
                  <input type="text"
                    value={form.razaOrigen}
                    onChange={(e) => setForm((f) => ({ ...f, razaOrigen: e.target.value }))}
                    placeholder="Ej: India, Europa..."
                    className="campo-entrada"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">N° Registro</label>
              <input type="text"
                value={form.registro}
                onChange={(e) => setForm((f) => ({ ...f, registro: e.target.value }))}
                placeholder="Registro oficial"
                className="campo-entrada"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Origen / Procedencia</label>
              <input type="text"
                value={form.origen}
                onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))}
                placeholder="País o finca de origen"
                className="campo-entrada"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Observaciones</label>
              <textarea rows={2}
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                placeholder="Características, historial..."
                className="campo-entrada resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCerrar} className="flex-1 boton boton-secundario">Cancelar</button>
              <button type="submit" disabled={mutacion.isPending} className="flex-1 boton boton-primario gap-2">
                {mutacion.isPending
                  ? <><Icono nombre="progress_activity" clase="text-[16px] animate-spin" />Guardando...</>
                  : <><Icono nombre="save" clase="text-[16px]" />Registrar</>}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  );
}
