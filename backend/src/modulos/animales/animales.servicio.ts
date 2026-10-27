import { Sexo, EstadoAnimal, TipoPropositoAnimal, EstadoSanitario, TipoIdentificacion } from '@prisma/client';
import {
  listarAnimales,
  obtenerAnimalPorId,
  obtenerAnimalPorArete,
  crearAnimal,
  actualizarAnimal,
  eliminarAnimal,
  existeAreteRegistrado,
  listarRazas,
  existeRazaRegistrada,
  crearRaza,
  contarVacunacionesPorAnimal,
  listarCriasPorRegistrar,
  obtenerCriaPorRegistrar,
  FiltrosAnimal,
} from './animales.repositorio';
import {
  ErrorNoEncontrado,
  ErrorConflicto,
  ErrorValidacionDatos,
} from '../../compartido/tipos/respuesta';

// Reglas de negocio del módulo de animales: unicidad de arete, coherencia
// de sexo entre padre/madre y cría, y protección contra el borrado de
// animales que ya tienen historial médico o reproductivo asociado.

export async function servicioListarAnimales(filtros: FiltrosAnimal) {
  return listarAnimales(filtros);
}

export async function servicioObtenerAnimal(id: string) {
  const animal = await obtenerAnimalPorId(id);
  if (!animal) throw new ErrorNoEncontrado(`Animal con id '${id}' no encontrado`);
  const registrosVacunacion = await contarVacunacionesPorAnimal(id);
  return {
    ...animal,
    _count: { ...animal._count, registrosVacunacion },
  };
}

export async function servicioObtenerAnimalPorArete(numeroIdentificacion: string) {
  const animal = await obtenerAnimalPorArete(numeroIdentificacion);
  if (!animal) throw new ErrorNoEncontrado(`Animal con identificación '${numeroIdentificacion}' no encontrado`);
  return animal;
}

export interface DatosCrearAnimal {
  numeroIdentificacion:    string;
  tipoIdentificacion?: TipoIdentificacion;
  nombre?:        string;
  sexo:           Sexo;
  proposito:      TipoPropositoAnimal;
  estado?:        EstadoAnimal;
  estadoSanitario?: EstadoSanitario;
  fechaNacimiento?: Date;
  pesoActual?:    number;
  color?:         string;
  marcas?:        string;
  observaciones?: string;
  procedencia?:   string;
  loteId:         string;
  razaId:         string;
  padreId?:       string;
  madreId?:       string;
  // Nacimiento (registrado al cerrar un parto) del que proviene la cría.
  nacimientoId?:  string;
}

export async function servicioListarCriasPorRegistrar(fincaId?: string) {
  const crias = await listarCriasPorRegistrar(fincaId);
  const hoy = Date.now();
  return crias.map((c) => ({
    ...c,
    diasDeNacida: Math.max(0, Math.floor((hoy - c.fechaNacimiento.getTime()) / 86_400_000)),
    semental: c.gestacion.eventoReproductivo?.inseminacion?.inventarioSemen?.semental.nombre ?? null,
  }));
}

export async function servicioCrearAnimal(datos: DatosCrearAnimal) {
  if (await existeAreteRegistrado(datos.numeroIdentificacion)) {
    throw new ErrorConflicto(`Ya existe un animal registrado con esa identificación: '${datos.numeroIdentificacion}'`);
  }

  // Al registrar una cría desde "Crías por registrar", se enlaza con su
  // nacimiento y se toman de él la madre, la fecha y el peso al nacer.
  let nacimiento: Awaited<ReturnType<typeof obtenerCriaPorRegistrar>> = null;
  if (datos.nacimientoId) {
    nacimiento = await obtenerCriaPorRegistrar(datos.nacimientoId);
    if (!nacimiento) {
      throw new ErrorConflicto('Ese nacimiento no existe o su cría ya fue registrada');
    }
    datos.madreId = nacimiento.gestacion.madre.id;
    datos.fechaNacimiento = nacimiento.fechaNacimiento;
  }

  if (datos.padreId) {
    const padre = await obtenerAnimalPorId(datos.padreId);
    if (!padre) throw new ErrorValidacionDatos('El padre especificado no existe');
    if (padre.sexo !== 'MACHO') throw new ErrorValidacionDatos('El padre debe ser de sexo MACHO');
  }

  if (datos.madreId) {
    const madre = await obtenerAnimalPorId(datos.madreId);
    if (!madre) throw new ErrorValidacionDatos('La madre especificada no existe');
    if (madre.sexo !== 'HEMBRA') throw new ErrorValidacionDatos('La madre debe ser de sexo HEMBRA');
  }

  const { loteId, razaId, padreId, madreId, nacimientoId: _nacimientoId, ...resto } = datos;

  return crearAnimal({
    ...resto,
    lote:  { connect: { id: loteId } },
    raza:  { connect: { id: razaId } },
    ...(padreId && { padre: { connect: { id: padreId } } }),
    ...(madreId && { madre: { connect: { id: madreId } } }),
    ...(nacimiento && {
      pesoNacimiento: nacimiento.pesoAlNacer ?? undefined,
      // Las dos direcciones del enlace nacimiento ↔ cría (Nacimiento.criaId
      // y Animal.nacimientoId) quedan apuntando una a la otra.
      nacimientosComoCria: { connect: { id: nacimiento.id } },
      nacimientoOrigen:    { connect: { id: nacimiento.id } },
    }),
  });
}

export type DatosActualizarAnimal = Partial<Omit<DatosCrearAnimal, 'numeroIdentificacion'>> & {
  estado?: EstadoAnimal;
  motivoEgreso?: string;
  fechaEgreso?: Date;
};

export async function servicioActualizarAnimal(
  id: string,
  datos: DatosActualizarAnimal & { numeroIdentificacion?: string },
) {
  const animal = await obtenerAnimalPorId(id);
  if (!animal) throw new ErrorNoEncontrado(`Animal con id '${id}' no encontrado`);

  if (datos.numeroIdentificacion && datos.numeroIdentificacion !== animal.numeroIdentificacion) {
    if (await existeAreteRegistrado(datos.numeroIdentificacion, id)) {
      throw new ErrorConflicto(`Ya existe un animal con esa identificación: '${datos.numeroIdentificacion}'`);
    }
  }

  const { loteId, razaId, padreId, madreId, ...resto } = datos;

  return actualizarAnimal(id, {
    ...resto,
    ...(razaId  !== undefined && { raza: razaId ? { connect: { id: razaId } } : undefined }),
    ...(loteId  !== undefined && loteId && { lote: { connect: { id: loteId } } }),
    ...(padreId !== undefined && { padre: padreId ? { connect: { id: padreId } } : { disconnect: true } }),
    ...(madreId !== undefined && { madre: madreId ? { connect: { id: madreId } } : { disconnect: true } }),
  });
}

export async function servicioEliminarAnimal(id: string) {
  const animal = await obtenerAnimalPorId(id);
  if (!animal) throw new ErrorNoEncontrado(`Animal con id '${id}' no encontrado`);

  const tieneHistorial =
    animal._count.historialesMedicos > 0 ||
    animal._count.eventosReproductivos > 0;

  if (tieneHistorial) {
    throw new ErrorValidacionDatos(
      `No se puede eliminar el animal '${animal.numeroIdentificacion}' porque tiene registros médicos o reproductivos. ` +
      `Cambie su estado a VENDIDO o MUERTO en su lugar.`,
    );
  }

  return eliminarAnimal(id);
}

export async function servicioListarRazas() {
  return listarRazas();
}

export interface DatosCrearRaza {
  nombre:    string;
  tipoCruce: string;
  origen?:   string;
}

export async function servicioCrearRaza(datos: DatosCrearRaza) {
  if (await existeRazaRegistrada(datos.nombre)) {
    throw new ErrorConflicto(`Ya existe una raza llamada '${datos.nombre}'`);
  }
  return crearRaza(datos);
}
