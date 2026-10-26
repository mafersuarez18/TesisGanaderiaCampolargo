import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Icono from '../../componentes/ui/Icono';
import { clienteHttp } from '../../servicios/clienteAxios';
import { useAutenticacion } from '../../hooks/useAutenticacion';
import { useOnline } from '../../hooks/useOnline';
import Badge, { BadgeEstadoAnimal } from '../../componentes/ui/Badge';
import { ModalConfirmacion } from '../../componentes/ui/Modal';
import { EsqueletoLinea } from '../../componentes/ui/EsqueletoTarjeta';
import toast from 'react-hot-toast';

const ETIQUETA_TIPO_IDENTIFICACION: Record<string, string> = {
  ARETE: 'arete',
  HIERRO_NUMERO: 'hierro/número',
  MICROCHIP: 'microchip',
  OTRO: 'otro',
};

const ETIQUETA_PROPOSITO: Record<string, string> = {
  CARNE:        'Carne',
  LECHE:        'Leche',
  CARNE_LECHE:  'Doble propósito',
  REPRODUCCION: 'Reproducción',
  TAUROMAQUIA:  'Tauromaquia',
};

// Ficha completa de un animal: datos generales y accesos a su historial
// médico, reproductivo y de vacunación (cada uno vive en su propia página,
// filtrada por este animal).
async function obtenerAnimal(id: string) {
  const { data } = await clienteHttp.get(`/animales/${id}`);
  return data.datos;
}

async function eliminarAnimal(id: string) {
  await clienteHttp.delete(`/animales/${id}`);
}

export default function PaginaDetalleAnimal() {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { esAdministrador, esVeterinario } = useAutenticacion();
  const puedeEditar  = esAdministrador || esVeterinario;
  const puedeEliminar = esAdministrador;

  const [modalEliminar, setModalEliminar] = useState(false);

  const estaEnLinea = useOnline();
  const { data: animal, isLoading } = useQuery({
    queryKey: ['animal', id],
    queryFn: () => obtenerAnimal(id!),
    enabled: !!id,
  });

  const mutacionEliminar = useMutation({
    mutationFn: () => eliminarAnimal(id!),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['animales'] });
      toast.success('Animal eliminado correctamente');
      navegar('/animales');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.mensaje ?? 'Error al eliminar el animal');
    },
  });

  if (isLoading) return <EsqueletoDetalle />;
  if (!animal) return (
    <div className="text-center py-20">
      <Icono nombre={estaEnLinea ? 'error_outline' : 'wifi_off'} clase="text-[32px] text-outline mx-auto mb-2" />
      <p className="text-on-surface-variant">
        {estaEnLinea
          ? 'Animal no encontrado'
          : 'Sin conexión: la ficha de este animal no está guardada en el dispositivo. Se podrá ver cuando se recupere la conectividad.'}
      </p>
      <Link to="/animales" className="text-sm text-primary hover:underline mt-2 block">
        Volver al listado
      </Link>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5 max-w-4xl"
    >
      {/* Navegación */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navegar(-1)}
          className="p-2 hover:bg-surface-container rounded-xl transition-colors"
          aria-label="Volver"
        >
          <Icono nombre="arrow_back" clase="text-[20px] text-on-surface-variant" />
        </button>
        <nav className="text-sm text-on-surface-variant">
          <Link to="/animales" className="hover:text-primary">Animales</Link>
          <span className="mx-2">/</span>
          <span className="text-on-surface font-medium">#{animal.numeroIdentificacion}</span>
        </nav>
      </div>

      {/* Encabezado del animal */}
      <div className="tarjeta-vidrio rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icono nombre="pets" relleno clase="text-[28px] text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-on-surface">
                  {animal.nombre ?? `Animal #${animal.numeroIdentificacion}`}
                </h1>
                <BadgeEstadoAnimal estado={animal.estado} />
              </div>
              <p className="text-on-surface-variant text-sm">
                Identificación: <strong className="font-mono text-on-surface">#{animal.numeroIdentificacion}</strong>
                {animal.tipoIdentificacion && <> ({ETIQUETA_TIPO_IDENTIFICACION[animal.tipoIdentificacion] ?? animal.tipoIdentificacion})</>}
                {animal.raza && <> · {animal.raza.nombre}</>}
              </p>
            </div>
          </div>

          {(puedeEditar || puedeEliminar) && (
            <div className="flex items-center gap-2">
              {puedeEditar && (
                <button
                  onClick={() => navegar(`/animales/${id}/editar`)}
                  className="boton boton-secundario gap-2"
                >
                  <Icono nombre="edit" clase="text-[16px]" />
                  Editar
                </button>
              )}
              {puedeEliminar && (
                <button onClick={() => setModalEliminar(true)} className="boton boton-peligro gap-2">
                  <Icono nombre="delete" clase="text-[16px]" />
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Información en grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Datos generales */}
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-on-surface mb-4 flex items-center gap-2">
            <Icono nombre="label" clase="text-[16px] text-on-surface-variant" />
            Datos generales
          </h2>
          <dl className="space-y-3">
            <CampoDetalle etiqueta="Sexo">
              <Badge variante={animal.sexo === 'MACHO' ? 'azul' : 'morado'}>
                {animal.sexo === 'MACHO' ? 'Macho' : 'Hembra'}
              </Badge>
            </CampoDetalle>
            <CampoDetalle etiqueta="Estado sanitario">
              <Badge variante={animal.estadoSanitario === 'SANO' ? 'verde' : 'rojo'} punto>
                {animal.estadoSanitario?.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}
              </Badge>
            </CampoDetalle>
            <CampoDetalle etiqueta="Propósito">
              {animal.proposito ? (ETIQUETA_PROPOSITO[animal.proposito] ?? animal.proposito) : '—'}
            </CampoDetalle>
            {animal.color && <CampoDetalle etiqueta="Color">{animal.color}</CampoDetalle>}
            {animal.marcas && <CampoDetalle etiqueta="Marcas">{animal.marcas}</CampoDetalle>}
          </dl>
        </div>

        {/* Ubicación */}
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-on-surface mb-4 flex items-center gap-2">
            <Icono nombre="location_on" clase="text-[16px] text-on-surface-variant" />
            Ubicación
          </h2>
          <dl className="space-y-3">
            <CampoDetalle etiqueta="Finca">{animal.lote?.finca?.nombre ?? '—'}</CampoDetalle>
            <CampoDetalle etiqueta="Lote">{animal.lote?.nombre ?? '—'}</CampoDetalle>
            <CampoDetalle etiqueta="Potrero">{animal.potrero?.nombre ?? '—'}</CampoDetalle>
            {animal.latitudActual && animal.longitudActual && (
              <CampoDetalle etiqueta="Coordenadas GPS">
                <span className="font-mono text-xs">
                  {animal.latitudActual.toFixed(6)}, {animal.longitudActual.toFixed(6)}
                </span>
              </CampoDetalle>
            )}
          </dl>
        </div>

        {/* Datos físicos */}
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-on-surface mb-4 flex items-center gap-2">
            <Icono nombre="monitor_weight" clase="text-[16px] text-on-surface-variant" />
            Datos físicos y cronológicos
          </h2>
          <dl className="space-y-3">
            <CampoDetalle etiqueta="Fecha de nacimiento">
              {animal.fechaNacimiento
                ? new Date(animal.fechaNacimiento).toLocaleDateString('es-VE', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })
                : '—'}
            </CampoDetalle>
            <CampoDetalle etiqueta="Edad">
              {animal.fechaNacimiento ? calcularEdad(animal.fechaNacimiento) : '—'}
            </CampoDetalle>
            <CampoDetalle etiqueta="Peso registrado">
              {animal.pesoActual ? `${animal.pesoActual} kg` : '—'}
            </CampoDetalle>
          </dl>
        </div>

        {/* Genealogía */}
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-on-surface mb-4 flex items-center gap-2">
            <Icono nombre="family_restroom" clase="text-[16px] text-on-surface-variant" />
            Genealogía
          </h2>
          <dl className="space-y-3">
            <CampoDetalle etiqueta="Padre">
              {animal.padre ? (
                <Link
                  to={`/animales/${animal.padre.id}`}
                  className="text-[var(--color-verde-600)] hover:underline text-sm"
                >
                  {animal.padre.nombre ?? `#${animal.padre.numeroIdentificacion}`}
                </Link>
              ) : '—'}
            </CampoDetalle>
            <CampoDetalle etiqueta="Madre">
              {animal.madre ? (
                <Link
                  to={`/animales/${animal.madre.id}`}
                  className="text-[var(--color-verde-600)] hover:underline text-sm"
                >
                  {animal.madre.nombre ?? `#${animal.madre.numeroIdentificacion}`}
                </Link>
              ) : '—'}
            </CampoDetalle>
          </dl>
        </div>
      </div>

      {/* Estadísticas de historial */}
      <div className="tarjeta-vidrio rounded-2xl p-5">
        <h2 className="font-semibold text-sm text-on-surface mb-4">Historial de registros</h2>
        <div className="grid grid-cols-3 gap-4">
          <EstadisticaHistorial
            nombre="medical_services"
            colorIcono="text-error"
            fondoIcono="bg-error-container"
            etiqueta="Consultas médicas"
            valor={animal._count?.historialesMedicos ?? 0}
            href={`/historial-medico?animalId=${id}`}
          />
          <EstadisticaHistorial
            nombre="vaccines"
            colorIcono="text-primary"
            fondoIcono="bg-primary/10"
            etiqueta="Vacunaciones"
            valor={animal._count?.registrosVacunacion ?? 0}
            href={`/vacunacion?animalId=${id}`}
          />
          <EstadisticaHistorial
            nombre="child_care"
            colorIcono="text-secondary"
            fondoIcono="bg-secondary/10"
            etiqueta="Eventos reproductivos"
            valor={animal._count?.eventosReproductivos ?? 0}
            href={`/reproduccion?animalId=${id}`}
          />
        </div>
      </div>

      {/* Descripción */}
      {animal.observaciones && (
        <div className="tarjeta-vidrio rounded-2xl p-5">
          <h2 className="font-semibold text-sm text-on-surface mb-2">Observaciones</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">{animal.observaciones}</p>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      <ModalConfirmacion
        abierto={modalEliminar}
        alCerrar={() => setModalEliminar(false)}
        alConfirmar={() => mutacionEliminar.mutate()}
        titulo={`¿Eliminar animal #${animal.numeroIdentificacion}?`}
        descripcion="Esta acción es irreversible. Solo se puede eliminar si el animal no tiene registros médicos o reproductivos."
        textoConfirmar="Sí, eliminar"
        variante="peligro"
        cargando={mutacionEliminar.isPending}
      />
    </motion.div>
  );
}

function CampoDetalle({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-outline flex-shrink-0 mt-0.5">{etiqueta}</dt>
      <dd className="text-sm text-on-surface text-right">{children}</dd>
    </div>
  );
}

function EstadisticaHistorial({
  nombre, colorIcono, fondoIcono, etiqueta, valor, href,
}: { nombre: string; colorIcono: string; fondoIcono: string; etiqueta: string; valor: number; href: string }) {
  return (
    <Link to={href} className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-surface-container-low transition-colors text-center">
      <div className={`${fondoIcono} w-10 h-10 rounded-xl flex items-center justify-center`}>
        <Icono nombre={nombre} relleno clase={`text-[18px] ${colorIcono}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-on-surface">{valor}</p>
        <p className="text-[11px] text-outline">{etiqueta}</p>
      </div>
    </Link>
  );
}

function calcularEdad(fechaNacimiento: string): string {
  const diff = Date.now() - new Date(fechaNacimiento).getTime();
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (dias < 30) return `${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `${meses} meses`;
  const anios = Math.floor(meses / 12);
  const mesesResto = meses % 12;
  return mesesResto > 0 ? `${anios} año(s) y ${mesesResto} mes(es)` : `${anios} año(s)`;
}

function EsqueletoDetalle() {
  return (
    <div className="space-y-5 max-w-4xl">
      <EsqueletoLinea className="h-8 w-48" />
      <div className="tarjeta p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl esqueleto" />
          <div className="space-y-2 flex-1">
            <EsqueletoLinea className="h-6 w-48" />
            <EsqueletoLinea className="h-4 w-32" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tarjeta p-5">
            <EsqueletoLinea className="h-4 w-32 mb-4" />
            <div className="space-y-3">
              {[0, 1, 2].map((j) => <EsqueletoLinea key={j} className={`h-3 ${j === 1 ? 'w-3/4' : 'w-1/2'}`} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
