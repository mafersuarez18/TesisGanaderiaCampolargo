import { Sexo, EstadoAnimal, TipoPropositoAnimal, EstadoSanitario, TipoIdentificacion } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';
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
  potreroId?:     string | null;
  potreroNombre?: string;
  potreroHectareas?: number;
  razaId:         string;
  padreId?:       string;
  madreId?:       string;
  // Nacimiento (registrado al cerrar un parto) del que proviene la cría.
  nacimientoId?:  string;
}

/**
 * Potrero que corresponde guardar: uno existente del lote, o el escrito a
 * mano (se reutiliza si ya hay uno con ese nombre en el lote; si no, se crea).
 * Devuelve null para dejar el animal sin potrero.
 */
async function resolverPotrero(
  loteId: string, potreroId?: string | null, potreroNombre?: string, hectareas?: number,
): Promise<string | null> {
  if (potreroNombre) {
    const existente = await prisma.potrero.findFirst({
      where: { loteId, nombre: { equals: potreroNombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existente) return existente.id;
    const nuevo = await prisma.potrero.create({ data: { nombre: potreroNombre, loteId, hectareas }, select: { id: true } });
    return nuevo.id;
  }
  if (!potreroId) return null;
  const potrero = await prisma.potrero.findUnique({ where: { id: potreroId }, select: { loteId: true } });
  if (!potrero) throw new ErrorValidacionDatos('El potrero seleccionado no existe');
  if (potrero.loteId !== loteId) throw new ErrorValidacionDatos('El potrero no pertenece al lote seleccionado');
  return potreroId;
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
    datos.padreId ??= nacimiento.gestacion.padre?.id;
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

  const {
    loteId, razaId, padreId, madreId, nacimientoId: _nacimientoId,
    potreroId: _p, potreroNombre, potreroHectareas, ...resto
  } = datos;
  const potreroId = await resolverPotrero(loteId, datos.potreroId, potreroNombre, potreroHectareas);

  return crearAnimal({
    ...resto,
    lote:  { connect: { id: loteId } },
    ...(potreroId && { potrero: { connect: { id: potreroId } } }),
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

  // Las mismas reglas de sexo que al crear: el padre es macho y la madre
  // hembra, y no se puede cambiar el sexo de un animal que ya figura como
  // padre/madre o que tiene registros reproductivos propios de su sexo.
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
  if (datos.sexo && datos.sexo !== animal.sexo) {
    const [hijos, gestaciones, eventosDeHembra] = await Promise.all([
      prisma.animal.count({ where: animal.sexo === 'MACHO' ? { padreId: id } : { madreId: id } }),
      prisma.gestacion.count({ where: { madreId: id } }),
      prisma.eventoReproductivo.count({
        where: {
          animalId: id,
          tipo: { in: ['INSEMINACION_ARTIFICIAL', 'MONTA_NATURAL', 'DIAGNOSTICO_GESTACION', 'PARTO', 'ABORTO', 'DETECCION_CELO'] },
        },
      }),
    ]);
    if (hijos > 0 || gestaciones > 0 || eventosDeHembra > 0) {
      throw new ErrorValidacionDatos(
        `No se puede cambiar el sexo: el animal ya tiene ${hijos > 0 ? `crías registradas como ${animal.sexo === 'MACHO' ? 'padre' : 'madre'}` : 'registros reproductivos de hembra'}`,
      );
    }
  }

  const { loteId, razaId, padreId, madreId, potreroId: potreroIdNuevo, potreroNombre, potreroHectareas, ...resto } = datos;

  // El potrero pertenece al lote: si se indica uno se valida contra el lote
  // final; si el animal cambia de lote sin indicar potrero, se le quita.
  const loteFinal = loteId || animal.lote.id;
  const cambiaPotrero = potreroIdNuevo !== undefined || !!potreroNombre;
  const potreroFinal = cambiaPotrero
    ? await resolverPotrero(loteFinal, potreroIdNuevo, potreroNombre, potreroHectareas)
    : loteFinal !== animal.lote.id ? null : undefined;

  return actualizarAnimal(id, {
    ...resto,
    ...(potreroFinal !== undefined && {
      potrero: potreroFinal ? { connect: { id: potreroFinal } } : { disconnect: true },
    }),
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
