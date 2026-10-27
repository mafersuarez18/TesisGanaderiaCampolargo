import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import { rangoAnioEnCurso } from '../../servicios/precargaOffline';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import EsqueletoTarjeta from '../../componentes/ui/EsqueletoTarjeta';
import GraficaAnimalesPorFinca from './componentes/GraficaAnimalesPorFinca';
import GraficaIndicadoresReproductivos from './componentes/GraficaIndicadoresReproductivos';
import ListaAlertasRecientes from './componentes/ListaAlertasRecientes';
import ListaPartosProximos from './componentes/ListaPartosProximos';
import LeyendaIndicador, { ExplicacionIndicador } from './componentes/LeyendaIndicador';
import Icono from '../../componentes/ui/Icono';
import { Link } from 'react-router-dom';

// Resumen ejecutivo del sistema: KPIs generales y los widgets de las
// componentes/ (gráficas y listas) que consumen el mismo endpoint agregado.
interface ResumenDashboard {
  totalAnimales: number;
  animalesPorFinca: Array<{ finca: string; total: number; activos: number }>;
  animalesPorRaza: Array<{ raza: string; total: number }>;
  alertasActivas: number;
  alertasCriticas: number;
  partosProximos30Dias: number;
  vacunasPendientes: number;
  enfermedadesActivas: number;
  indicadoresReproductivos: {
    tasaPreniez: number;
    tasaNatalidad: number;
    tasaMortalidadCrias: number;
    diasAbiertoPromedio: number;
  };
  detalleIndicadores?: {
    hembrasActivas: number;
    gestacionesEnCurso: number;
    nacimientos: number;
    desdeNacimientos: string;
    muertesCrias: number;
    partosConsiderados: number;
  };
}

async function obtenerResumen(): Promise<ResumenDashboard> {
  const { data } = await clienteHttp.get('/analytics/dashboard');
  return data.datos;
}

interface PorcentajeTratados {
  totalAnimalesActivos: number;
  animalesTratados: number;
  porcentajeTratados: number;
}

interface RecurrenciaPatologias {
  totalAnimalesConDiagnostico: number;
  animalesConRecurrencia: number;
  tasaRecurrencia: number;
}

async function obtenerPorcentajeTratados(): Promise<PorcentajeTratados> {
  // "Hasta" es el final de hoy, no el instante actual: así la consulta es la
  // misma durante todo el día y se puede responder sin conexión con la que
  // dejó guardada la precarga.
  const { data } = await clienteHttp.get('/analytics/porcentaje-tratados', {
    params: rangoAnioEnCurso(),
  });
  return data.datos;
}

async function obtenerRecurrenciaPatologias(): Promise<RecurrenciaPatologias> {
  const { data } = await clienteHttp.get('/analytics/recurrencia-patologias');
  return data.datos;
}

// ── Leyendas de los indicadores ──────────────────────────────────────────────
// Describen exactamente lo que calcula analytics.servicio.ts en el backend,
// con los valores actuales. Si cambia una fórmula allá, actualizarla aquí.

function porcentaje(parte: number, total: number, sinTotal: string): string {
  if (total <= 0) return `${sinTotal}, el indicador queda en 0 %`;
  return `${parte} ÷ ${total} × 100 = ${((parte / total) * 100).toFixed(1)} %`;
}

function construirExplicaciones(
  resumen?: ResumenDashboard,
  tratados?: PorcentajeTratados,
  recurrencia?: RecurrenciaPatologias,
): Record<string, ExplicacionIndicador> {
  const d = resumen?.detalleIndicadores;
  const desde = d ? new Date(d.desdeNacimientos).toLocaleDateString('es-VE') : `01/01/${new Date().getFullYear() - 1}`;

  return {
    totalAnimales: {
      titulo: 'Total Animales',
      descripcion: 'Cantidad de animales con estado Activo. No incluye vendidos, muertos, robados ni transferidos.',
      calculo: resumen ? `${resumen.totalAnimales} animales activos` : undefined,
    },
    alertasActivas: {
      titulo: 'Alertas Activas',
      descripcion: 'Notificaciones generadas por el motor de alertas que todavía no se han leído, de todos los usuarios. "Críticas" son las de prioridad crítica.',
      calculo: resumen ? `${resumen.alertasActivas} sin leer, de las cuales ${resumen.alertasCriticas} son críticas` : undefined,
    },
    partos30: {
      titulo: 'Partos (30 días)',
      descripcion: 'Gestaciones en curso cuya fecha probable de parto cae entre hoy y los próximos 30 días.',
      calculo: resumen ? `${resumen.partosProximos30Dias} gestaciones con parto esperado en 30 días` : undefined,
    },
    vacunasPendientes: {
      titulo: 'Vacunas Pendientes',
      descripcion: 'Cantidad de calendarios de vacunación y desparasitación registrados en el sistema.',
      calculo: resumen ? `${resumen.vacunasPendientes} calendarios registrados` : undefined,
      nota: 'Hoy cuenta calendarios, no aplicaciones vencidas. Las vacunas vencidas o próximas se avisan en Alertas.',
    },
    enfermedades: {
      titulo: 'Enfermedades',
      descripcion: 'Animales cuyo estado sanitario actual es Enfermo.',
      calculo: resumen ? `${resumen.enfermedadesActivas} animales enfermos` : undefined,
    },
    preniez: {
      titulo: 'Tasa de Preñez',
      descripcion: 'Proporción de las hembras activas que tienen una gestación en curso.',
      formula: 'Gestaciones en curso ÷ hembras activas × 100',
      calculo: d ? porcentaje(d.gestacionesEnCurso, d.hembrasActivas, 'Sin hembras activas') : undefined,
    },
    natalidad: {
      titulo: 'Tasa de Natalidad',
      descripcion: `Nacimientos registrados desde el ${desde} en relación con las hembras activas.`,
      formula: 'Nacimientos ÷ hembras activas × 100',
      calculo: d ? porcentaje(d.nacimientos, d.hembrasActivas, 'Sin hembras activas') : undefined,
      nota: 'Cuenta los nacimientos desde el 1 de enero del año anterior, no solo los de los últimos 12 meses.',
    },
    mortalidad: {
      titulo: 'Mortalidad de Crías',
      descripcion: `Animales con estado Muerto nacidos en los últimos 365 días, en relación con los nacimientos registrados desde el ${desde}.`,
      formula: 'Crías muertas ÷ nacimientos × 100',
      calculo: d ? porcentaje(d.muertesCrias, d.nacimientos, 'Sin nacimientos registrados') : undefined,
    },
    diasAbiertos: {
      titulo: 'Días Abiertos',
      descripcion: 'Promedio de días transcurridos desde cada parto registrado (gestaciones finalizadas por parto) hasta hoy, contando como máximo 365 días por parto.',
      formula: 'Suma de días desde cada parto ÷ cantidad de partos',
      calculo: d
        ? (d.partosConsiderados > 0
          ? `Promedio sobre ${d.partosConsiderados} partos = ${resumen!.indicadoresReproductivos.diasAbiertoPromedio} días`
          : 'Sin partos registrados: se muestra el valor de referencia de 120 días')
        : undefined,
      nota: 'Es una aproximación: mide los días desde el último parto aunque la vaca ya haya quedado preñada de nuevo.',
    },
    tratados: {
      titulo: 'Animales tratados este año',
      descripcion: 'Animales distintos que recibieron al menos un tratamiento iniciado entre el 1 de enero y hoy, en relación con los animales activos.',
      formula: 'Animales tratados ÷ animales activos × 100',
      calculo: tratados ? porcentaje(tratados.animalesTratados, tratados.totalAnimalesActivos, 'Sin animales activos') : undefined,
    },
    recurrencia: {
      titulo: 'Recurrencia de patologías',
      descripcion: 'De los animales que alguna vez tuvieron un diagnóstico, cuántos tuvieron la misma enfermedad diagnosticada en 2 o más ocasiones (se compara el nombre de la enfermedad). Considera todo el historial.',
      formula: 'Animales con enfermedad repetida ÷ animales con diagnóstico × 100',
      calculo: recurrencia
        ? porcentaje(recurrencia.animalesConRecurrencia, recurrencia.totalAnimalesConDiagnostico, 'Sin animales con diagnóstico')
        : undefined,
    },
  };
}

const variantesContenedor = {
  oculto: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const variantesElemento = {
  oculto: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function PaginaDashboard() {
  const { usuario, tienePrivilegio } = useAutenticacion();
  const puedeVerAnalyticsAvanzado = tienePrivilegio('analytics.ver_avanzado');

  const { data: resumen, isLoading } = useQuery({
    queryKey: ['dashboard-resumen'],
    queryFn: obtenerResumen,
    refetchInterval: 1000 * 60 * 5,
  });
  // "Indicadores Clínicos" es analítica avanzada: sin el privilegio, ni
  // siquiera se piden (antes se pedían igual y el 403 disparaba un toast de
  // error por cada una, aunque el usuario nunca vaya a poder verlas).
  const { data: tratados, isLoading: cargandoTratados } = useQuery({
    queryKey: ['dashboard-porcentaje-tratados'],
    queryFn: obtenerPorcentajeTratados,
    enabled: puedeVerAnalyticsAvanzado,
  });
  const { data: recurrencia, isLoading: cargandoRecurrencia } = useQuery({
    queryKey: ['dashboard-recurrencia-patologias'],
    queryFn: obtenerRecurrenciaPatologias,
    enabled: puedeVerAnalyticsAvanzado,
  });

  const explicaciones = construirExplicaciones(resumen, tratados, recurrencia);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <motion.div
      variants={variantesContenedor}
      initial="oculto"
      animate="visible"
      className="space-y-6"
    >
      {/* Encabezado */}
      <motion.div variants={variantesElemento} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            {saludo}, {usuario?.nombre}
          </h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            Resumen operativo — Sucesión Joao Campolargo
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full">
          <Icono nombre="calendar_today" clase="text-[14px]" />
          {new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </motion.div>

      {/* KPIs principales */}
      <motion.div variants={variantesElemento}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <TarjetaKPI
            icono="pets"
            etiqueta="Total Animales"
            explicacion={explicaciones.totalAnimales}
            valor={resumen?.totalAnimales}
            colorIcono="text-primary"
            fondoIcono="bg-primary/10"
            cargando={isLoading}
          />
          <TarjetaKPI
            icono="warning"
            etiqueta="Alertas Activas"
            explicacion={explicaciones.alertasActivas}
            valor={resumen?.alertasActivas}
            subvalor={resumen?.alertasCriticas ? `${resumen.alertasCriticas} críticas` : undefined}
            colorIcono="text-error"
            fondoIcono="bg-error-container"
            colorValor={resumen?.alertasCriticas ? 'text-error' : undefined}
            bordeError={!!resumen?.alertasCriticas}
            cargando={isLoading}
          />
          <TarjetaKPI
            icono="pregnant_woman"
            etiqueta="Partos (30 días)"
            explicacion={explicaciones.partos30}
            valor={resumen?.partosProximos30Dias}
            colorIcono="text-secondary"
            fondoIcono="bg-secondary-container"
            cargando={isLoading}
          />
          <TarjetaKPI
            icono="vaccines"
            etiqueta="Vacunas Pendientes"
            explicacion={explicaciones.vacunasPendientes}
            valor={resumen?.vacunasPendientes}
            colorIcono="text-tertiary"
            fondoIcono="bg-tertiary-container/20"
            colorValor={resumen?.vacunasPendientes ? 'text-tertiary' : undefined}
            cargando={isLoading}
          />
          <TarjetaKPI
            icono="medical_services"
            etiqueta="Enfermedades"
            explicacion={explicaciones.enfermedades}
            valor={resumen?.enfermedadesActivas}
            colorIcono="text-error"
            fondoIcono="bg-error-container"
            cargando={isLoading}
          />
        </div>
      </motion.div>

      {/* Indicadores reproductivos */}
      <motion.div variants={variantesElemento}>
        <p className="text-xs font-semibold text-on-surface-variant mb-3 uppercase tracking-wider">
          Indicadores Reproductivos
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { clave: 'preniez', et: 'Tasa de Preñez',    val: resumen?.indicadoresReproductivos.tasaPreniez,        uni: '%',    ico: 'trending_up',   pos: true  },
            { clave: 'natalidad', et: 'Tasa de Natalidad', val: resumen?.indicadoresReproductivos.tasaNatalidad,       uni: '%',    ico: 'trending_up',   pos: true  },
            { clave: 'mortalidad', et: 'Mortalidad Crías',  val: resumen?.indicadoresReproductivos.tasaMortalidadCrias, uni: '%',    ico: 'trending_down', pos: false },
            { clave: 'diasAbiertos', et: 'Días Abiertos',     val: resumen?.indicadoresReproductivos.diasAbiertoPromedio, uni: ' días',ico: 'schedule',      pos: false },
          ].map((ind) => (
            <div key={ind.et} className="tarjeta-vidrio rounded-2xl p-4">
              {isLoading ? (
                <EsqueletoTarjeta className="h-16" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icono
                      nombre={ind.ico}
                      clase={`text-[16px] ${ind.pos ? 'text-primary' : 'text-error'}`}
                    />
                    <p className="text-xs text-on-surface-variant truncate">{ind.et}</p>
                    <span className="ml-auto"><LeyendaIndicador explicacion={explicaciones[ind.clave]!} /></span>
                  </div>
                  <p className="text-xl font-bold text-on-surface">
                    {ind.val?.toFixed(1) ?? '—'}
                    <span className="text-sm font-normal text-on-surface-variant">{ind.uni}</span>
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Indicadores clínicos — analítica avanzada, requiere el privilegio */}
      {puedeVerAnalyticsAvanzado && (
        <motion.div variants={variantesElemento}>
          <p className="text-xs font-semibold text-on-surface-variant mb-3 uppercase tracking-wider">
            Indicadores Clínicos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="tarjeta-vidrio rounded-2xl p-4">
              {cargandoTratados ? (
                <EsqueletoTarjeta className="h-16" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icono nombre="vaccines" clase="text-[16px] text-primary" />
                    <p className="text-xs text-on-surface-variant truncate">Animales tratados este año</p>
                    <span className="ml-auto"><LeyendaIndicador explicacion={explicaciones.tratados!} /></span>
                  </div>
                  <p className="text-xl font-bold text-on-surface">
                    {tratados?.porcentajeTratados.toFixed(1) ?? '—'}
                    <span className="text-sm font-normal text-on-surface-variant">%</span>
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {tratados?.animalesTratados ?? 0} de {tratados?.totalAnimalesActivos ?? 0} animales activos
                  </p>
                </>
              )}
            </div>
            <div className="tarjeta-vidrio rounded-2xl p-4">
              {cargandoRecurrencia ? (
                <EsqueletoTarjeta className="h-16" />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icono nombre="autorenew" clase="text-[16px] text-error" />
                    <p className="text-xs text-on-surface-variant truncate">Recurrencia de patologías</p>
                    <span className="ml-auto"><LeyendaIndicador explicacion={explicaciones.recurrencia!} /></span>
                  </div>
                  <p className="text-xl font-bold text-on-surface">
                    {recurrencia?.tasaRecurrencia.toFixed(1) ?? '—'}
                    <span className="text-sm font-normal text-on-surface-variant">%</span>
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {recurrencia?.animalesConRecurrencia ?? 0} de {recurrencia?.totalAnimalesConDiagnostico ?? 0} animales con diagnóstico
                  </p>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Gráficas */}
      <motion.div variants={variantesElemento}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="tarjeta-vidrio rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-on-surface">Animales por Finca</h3>
              <Link to="/fincas" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Ver todo <Icono nombre="chevron_right" clase="text-[16px]" />
              </Link>
            </div>
            <GraficaAnimalesPorFinca datos={resumen?.animalesPorFinca ?? []} cargando={isLoading} />
          </div>
          <div className="tarjeta-vidrio rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-on-surface">Indicadores Reproductivos</h3>
              <Link to="/reproduccion" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Ver todo <Icono nombre="chevron_right" clase="text-[16px]" />
              </Link>
            </div>
            <GraficaIndicadoresReproductivos datos={resumen?.indicadoresReproductivos} cargando={isLoading} />
          </div>
        </div>
      </motion.div>

      {/* Listas recientes */}
      <motion.div variants={variantesElemento}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="tarjeta-vidrio rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2">
                <Icono nombre="notifications_active" clase="text-[18px] text-error" />
                Alertas Recientes
              </h3>
              <Link to="/alertas" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Ver todas <Icono nombre="arrow_forward" clase="text-[14px]" />
              </Link>
            </div>
            <ListaAlertasRecientes />
          </div>
          <div className="tarjeta-vidrio rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-on-surface flex items-center gap-2">
                <Icono nombre="pregnant_woman" clase="text-[18px] text-secondary" />
                Partos Próximos
              </h3>
              <Link to="/reproduccion" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Ver todos <Icono nombre="arrow_forward" clase="text-[14px]" />
              </Link>
            </div>
            <ListaPartosProximos />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Tarjeta KPI ──────────────────────────────────────────────────────────────

interface PropsTarjetaKPI {
  icono: string;
  etiqueta: string;
  valor?: number;
  subvalor?: string;
  colorIcono: string;
  fondoIcono: string;
  colorValor?: string;
  bordeError?: boolean;
  cargando?: boolean;
  explicacion: ExplicacionIndicador;
}

function TarjetaKPI({ icono, etiqueta, valor, subvalor, colorIcono, fondoIcono, colorValor, bordeError, cargando, explicacion }: PropsTarjetaKPI) {
  if (cargando) return <EsqueletoTarjeta className="h-28" />;

  return (
    <div className={`tarjeta-vidrio rounded-2xl p-4 cursor-default
                     ${bordeError ? 'border-l-4 border-l-error' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`${fondoIcono} p-2.5 rounded-xl flex-shrink-0`}>
          <Icono nombre={icono} relleno clase={`text-[20px] ${colorIcono}`} />
        </div>
        <LeyendaIndicador explicacion={explicacion} />
      </div>
      <p className={`text-2xl font-bold ${colorValor ?? 'text-on-surface'}`}>
        {valor?.toLocaleString('es-VE') ?? '—'}
      </p>
      <p className="text-xs text-on-surface-variant mt-0.5">{etiqueta}</p>
      {subvalor && <p className="text-xs text-error mt-0.5 font-medium">{subvalor}</p>}
    </div>
  );
}
