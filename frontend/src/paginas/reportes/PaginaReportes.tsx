import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { clienteHttp } from '../../servicios/clienteAxios';
import Icono from '../../componentes/ui/Icono';
import BuscadorAnimal from '../../componentes/ui/BuscadorAnimal';
import type { AnimalResumen } from '../../componentes/ui/BuscadorAnimal';

// Central de descargas: cada tarjeta dispara un GET al backend que
// devuelve el archivo (PDF o Excel) directamente como blob.
interface TipoReporte {
  id: string;
  titulo: string;
  descripcion: string;
  icono: string;
  colorIcono: string;
  fondoIcono: string;
  endpoint: string;
  formatos: ('pdf' | 'excel')[];
}

export default function PaginaReportes() {
  const [cargando, setCargando]         = useState<string | null>(null);
  const [anio, setAnio]                 = useState(new Date().getFullYear());
  const [fincaId, setFincaId]           = useState('');
  const [estado, setEstado]             = useState('');
  const [animalId, setAnimalId]         = useState('');
  const [animalClinico, setAnimalClinico] = useState<AnimalResumen | null>(null);

  const { data: fincas = [] } = useQuery({
    queryKey: ['fincas-reportes'],
    queryFn: () => clienteHttp.get('/fincas?porPagina=100').then((r) => r.data.datos ?? []),
  });

  const descargar = async (endpoint: string, formato: 'pdf' | 'excel', nombre: string) => {
    const clave = `${endpoint}-${formato}`;
    try {
      setCargando(clave);
      const tipo = formato === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const extension = formato === 'pdf' ? 'pdf' : 'xlsx';

      const respuesta = await clienteHttp.get(endpoint, {
        params: { formato, anio, ...(fincaId && { fincaId }), ...(estado && { estado }) },
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([respuesta.data], { type: tipo }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `${nombre}_${new Date().toISOString().split('T')[0]}.${extension}`;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar el reporte:', err);
    } finally {
      setCargando(null);
    }
  };

  const reportes: TipoReporte[] = [
    {
      id:          'inventario',
      titulo:      'Inventario de Animales',
      descripcion: 'Listado completo del hato con estado sanitario, raza, edad y peso. Filtrable por finca y estado.',
      icono:       'pets',
      colorIcono:  'text-secondary',
      fondoIcono:  'bg-secondary/10',
      endpoint:    '/reportes/inventario',
      formatos:    ['pdf', 'excel'],
    },
    {
      id:          'sanitario',
      titulo:      'Reporte Sanitario',
      descripcion: 'Historial médico consolidado: diagnósticos, tratamientos, vacunaciones y enfermedades activas por período.',
      icono:       'medical_services',
      colorIcono:  'text-error',
      fondoIcono:  'bg-error-container',
      endpoint:    '/reportes/sanitario',
      formatos:    ['pdf', 'excel'],
    },
    {
      id:          'vacunacion',
      titulo:      'Cumplimiento de Vacunación',
      descripcion: 'Estado de vacunación del hato por calendario. Identifica animales con vacunas pendientes o vencidas.',
      icono:       'vaccines',
      colorIcono:  'text-primary',
      fondoIcono:  'bg-primary/10',
      endpoint:    '/reportes/vacunacion',
      formatos:    ['pdf', 'excel'],
    },
    {
      id:          'reproductivo',
      titulo:      'Indicadores Reproductivos',
      descripcion: 'Tasa de preñez, natalidad, mortalidad de crías, días abiertos y eficiencia reproductiva anual.',
      icono:       'vaca_prenada',
      colorIcono:  'text-tertiary',
      fondoIcono:  'bg-tertiary/10',
      endpoint:    '/reportes/reproductivo',
      formatos:    ['pdf', 'excel'],
    },
  ];

  const descargarHistorial = async () => {
    if (!animalId) return;
    try {
      setCargando('historial-animal');
      const r = await clienteHttp.get(`/reportes/historial-animal/${animalId}`, { responseType: 'blob' });
      const nombre = animalClinico
        ? `historial_${animalClinico.numeroIdentificacion}`
        : `historial_${animalId}`;
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `${nombre}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar historial:', err);
    } finally {
      setCargando(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Parámetros globales */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="tarjeta-vidrio rounded-2xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Icono nombre="tune" clase="text-[18px] text-primary" />
          <h2 className="text-sm font-semibold text-on-surface">Parámetros globales</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Año</label>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="campo-entrada"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Estado animal</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="campo-entrada">
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activos</option>
              <option value="VENDIDO">Vendidos</option>
              <option value="MUERTO">Muertos</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Finca (opcional)</label>
            <select
              value={fincaId}
              onChange={(e) => setFincaId(e.target.value)}
              className="campo-entrada"
            >
              <option value="">Todas las fincas</option>
              {(fincas as any[]).map((f: any) => (
                <option key={f.id} value={f.id}>{f.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

      {/* Tarjetas de reportes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportes.map((rep, idx) => (
          <motion.div
            key={rep.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="tarjeta-vidrio rounded-2xl p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start gap-4 mb-5">
              <div className={`p-3 rounded-2xl ${rep.fondoIcono} flex-shrink-0`}>
                <Icono nombre={rep.icono} relleno clase={`text-[24px] ${rep.colorIcono}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-on-surface">{rep.titulo}</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">{rep.descripcion}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {rep.formatos.includes('pdf') && (
                <button
                  onClick={() => descargar(rep.endpoint, 'pdf', rep.id)}
                  disabled={!!cargando}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
                             bg-error text-on-primary hover:opacity-90 transition-opacity
                             disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {cargando === `${rep.endpoint}-pdf` ? (
                    <Icono nombre="progress_activity" clase="text-[16px] animate-spin" />
                  ) : (
                    <Icono nombre="picture_as_pdf" clase="text-[16px]" />
                  )}
                  PDF
                </button>
              )}

              {rep.formatos.includes('excel') && (
                <button
                  onClick={() => descargar(rep.endpoint, 'excel', rep.id)}
                  disabled={!!cargando}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
                             bg-primary text-on-primary hover:opacity-90 transition-opacity
                             disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {cargando === `${rep.endpoint}-excel` ? (
                    <Icono nombre="progress_activity" clase="text-[16px] animate-spin" />
                  ) : (
                    <Icono nombre="table_chart" clase="text-[16px]" />
                  )}
                  Excel
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Reportes Clínicos por animal */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="tarjeta-vidrio rounded-2xl p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 rounded-2xl bg-error-container flex-shrink-0">
            <Icono nombre="folder_shared" relleno clase="text-[24px] text-error" />
          </div>
          <div>
            <h3 className="font-bold text-on-surface">Reporte Clínico por Animal</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Historial médico completo de un animal en PDF — todas sus consultas, tratamientos y desparasitaciones.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <BuscadorAnimal
              valor={animalId}
              alSeleccionar={(id, animal) => { setAnimalId(id); setAnimalClinico(animal); }}
              etiqueta="Animal"
              placeholder="Buscar por identificación o nombre..."
            />
          </div>
          <button
            onClick={descargarHistorial}
            disabled={!animalId || cargando === 'historial-animal'}
            className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-medium
                       bg-error text-on-primary hover:opacity-90 transition-opacity
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
          >
            {cargando === 'historial-animal' ? (
              <Icono nombre="progress_activity" clase="text-[16px] animate-spin" />
            ) : (
              <Icono nombre="picture_as_pdf" clase="text-[16px]" />
            )}
            Descargar PDF
          </button>
        </div>

        {animalId && animalClinico && (
          <p className="text-xs text-on-surface-variant mt-3 flex items-center gap-1.5">
            <Icono nombre="info" clase="text-[13px]" />
            Se generará el historial completo del animal
            <span className="font-semibold text-on-surface">
              #{animalClinico.numeroIdentificacion}{animalClinico.nombre ? ` — ${animalClinico.nombre}` : ''}
            </span>
          </p>
        )}
      </motion.div>

      {/* Nota informativa */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-start gap-3 px-5 py-4 bg-surface-container rounded-2xl border border-outline-variant/20"
      >
        <Icono nombre="info" clase="text-[18px] text-on-surface-variant flex-shrink-0 mt-0.5" />
        <div className="text-sm text-on-surface-variant">
          <p className="font-medium text-on-surface mb-1">Sobre los reportes</p>
          <p>
            Los reportes se generan en tiempo real con los datos actuales de la base de datos.
            Los filtros de año, estado y finca aplican a todos los reportes.
            Los archivos Excel pueden abrirse en Microsoft Excel, Google Sheets o LibreOffice Calc.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
