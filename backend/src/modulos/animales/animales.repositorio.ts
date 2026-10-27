import { Prisma, EstadoAnimal, Sexo } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';

// Acceso a datos puro (consultas Prisma), sin reglas de negocio — esas
// viven en animales.servicio.ts.

export interface FiltrosAnimal {
  busqueda?: string;
  fincaId?: string;
  loteId?: string;
  razaId?: string;
  sexo?: Sexo;
  estado?: EstadoAnimal;
  pagina?: number;
  porPagina?: number;
  ordenPor?: 'numeroIdentificacion' | 'nombre' | 'fechaNacimiento' | 'fechaIngreso';
  direccionOrden?: 'asc' | 'desc';
}

const seleccionListado = {
  id: true,
  numeroIdentificacion: true,
  tipoIdentificacion: true,
  nombre: true,
  sexo: true,
  estado: true,
  estadoSanitario: true,
  fechaNacimiento: true,
  proposito: true,
  pesoActual: true,
  color: true,
  raza: { select: { id: true, nombre: true } },
  lote:  { select: { id: true, nombre: true, finca: { select: { id: true, nombre: true } } } },
  fechaIngreso: true,
} satisfies Prisma.AnimalSelect;

const seleccionDetalle = {
  ...seleccionListado,
  pesoNacimiento: true,
  marcas: true,
  observaciones: true,
  fechaEgreso: true,
  motivoEgreso: true,
  padre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
  madre: { select: { id: true, numeroIdentificacion: true, nombre: true } },
  _count: {
    select: {
      historialesMedicos: true,
      eventosReproductivos: true,
    },
  },
  actualizadoEn: true,
} satisfies Prisma.AnimalSelect;

export async function contarVacunacionesPorAnimal(animalId: string): Promise<number> {
  return prisma.registroVacunacion.count({ where: { animalId } });
}

export async function listarAnimales(filtros: FiltrosAnimal = {}) {
  const {
    busqueda,
    fincaId,
    loteId,
    razaId,
    sexo,
    estado,
    pagina = 1,
    porPagina = 20,
    ordenPor = 'fechaIngreso',
    direccionOrden = 'desc',
  } = filtros;

  const donde: Prisma.AnimalWhereInput = {
    ...(busqueda && {
      OR: [
        { numeroIdentificacion: { contains: busqueda, mode: 'insensitive' } },
        { nombre:      { contains: busqueda, mode: 'insensitive' } },
        { color:       { contains: busqueda, mode: 'insensitive' } },
      ],
    }),
    ...(fincaId  && { lote: { fincaId } }),
    ...(loteId   && { loteId }),
    ...(razaId   && { razaId }),
    ...(sexo     && { sexo }),
    ...(estado   && { estado }),
  };

  const [registros, total] = await prisma.$transaction([
    prisma.animal.findMany({
      where: donde,
      select: seleccionListado,
      orderBy: { [ordenPor]: direccionOrden },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.animal.count({ where: donde }),
  ]);

  return { registros, total };
}

// Se usa tanto para la ficha de detalle como para validar relaciones
// (padre/madre) al crear o actualizar otro animal.
export async function obtenerAnimalPorId(id: string) {
  return prisma.animal.findUnique({
    where: { id },
    select: seleccionDetalle,
  });
}

export async function obtenerAnimalPorArete(numeroIdentificacion: string) {
  return prisma.animal.findUnique({
    where: { numeroIdentificacion },
    select: seleccionDetalle,
  });
}

export async function crearAnimal(datos: Prisma.AnimalCreateInput) {
  return prisma.animal.create({ data: datos, select: seleccionDetalle });
}

export async function actualizarAnimal(id: string, datos: Prisma.AnimalUpdateInput) {
  return prisma.animal.update({ where: { id }, data: datos, select: seleccionDetalle });
}

export async function eliminarAnimal(id: string) {
  return prisma.animal.delete({ where: { id } });
}

export async function existeAreteRegistrado(numeroIdentificacion: string, excluirId?: string) {
  const animal = await prisma.animal.findFirst({
    where: {
      numeroIdentificacion: { equals: numeroIdentificacion, mode: 'insensitive' },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true },
  });
  return !!animal;
}

export async function listarRazas() {
  return prisma.raza.findMany({ orderBy: { nombre: 'asc' } });
}

export async function existeRazaRegistrada(nombre: string): Promise<boolean> {
  const raza = await prisma.raza.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' } },
    select: { id: true },
  });
  return !!raza;
}

export async function crearRaza(datos: Prisma.RazaCreateInput) {
  return prisma.raza.create({ data: datos });
}

// ── Crías por registrar ──────────────────────────────────────────────────────
// Nacimientos de crías vivas que todavía no tienen un Animal asociado (el
// parto se registra en Reproducción y la cría se da de alta después, cuando
// ya tiene su identificación).

const dondeCriaPendiente: Prisma.NacimientoWhereInput = {
  estadoCria: 'VIVO',
  criaId: null,
  animalOrigen: { is: null },
};

const seleccionCriaPendiente = {
  id: true,
  fechaNacimiento: true,
  sexoCria: true,
  pesoAlNacer: true,
  tipoParto: true,
  observaciones: true,
  gestacion: {
    select: {
      madre: {
        select: {
          id: true,
          numeroIdentificacion: true,
          nombre: true,
          proposito: true,
          raza: { select: { id: true, nombre: true } },
          lote: { select: { id: true, nombre: true, finca: { select: { id: true, nombre: true } } } },
        },
      },
      eventoReproductivo: {
        select: {
          tipo: true,
          inseminacion: { select: { inventarioSemen: { select: { semental: { select: { nombre: true } } } } } },
        },
      },
    },
  },
} satisfies Prisma.NacimientoSelect;

export async function listarCriasPorRegistrar(fincaId?: string) {
  return prisma.nacimiento.findMany({
    where: {
      ...dondeCriaPendiente,
      ...(fincaId && { gestacion: { madre: { lote: { fincaId } } } }),
    },
    select: seleccionCriaPendiente,
    orderBy: { fechaNacimiento: 'desc' },
  });
}

export async function obtenerCriaPorRegistrar(nacimientoId: string) {
  return prisma.nacimiento.findFirst({
    where: { id: nacimientoId, ...dondeCriaPendiente },
    select: seleccionCriaPendiente,
  });
}
