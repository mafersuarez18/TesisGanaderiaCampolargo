import { Prisma, EstadoAnimal } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';

// Acceso a datos puro (consultas Prisma); las reglas de negocio viven en
// fincas.servicio.ts.

export interface FiltrosFinca {
  busqueda?: string;
  pagina?: number;
  porPagina?: number;
}

export async function listarFincas(filtros: FiltrosFinca = {}) {
  const { busqueda, pagina = 1, porPagina = 20 } = filtros;

  const donde: Prisma.FincaWhereInput = busqueda
    ? {
        OR: [
          { nombre:    { contains: busqueda, mode: 'insensitive' } },
          { municipio: { contains: busqueda, mode: 'insensitive' } },
          { estado:    { contains: busqueda, mode: 'insensitive' } },
        ],
      }
    : {};

  const [registros, total] = await prisma.$transaction([
    prisma.finca.findMany({
      where: donde,
      include: {
        _count: { select: { lotes: true } },
      },
      orderBy: { nombre: 'asc' },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.finca.count({ where: donde }),
  ]);

  // Animales y potreros no son relaciones directas de Finca (se alcanzan
  // vía Lote), así que se suman aparte por finca.
  const conteoPorFinca = await contarPorFinca(registros.map((f) => f.id));
  const registrosConAnimales = registros.map((f) => ({
    ...f,
    _count: { ...f._count, ...(conteoPorFinca.get(f.id) ?? { animales: 0, potreros: 0 }) },
  }));

  return { registros: registrosConAnimales, total };
}

async function contarPorFinca(fincaIds: string[]): Promise<Map<string, { animales: number; potreros: number }>> {
  const lotesConConteo = await prisma.lote.findMany({
    where: { fincaId: { in: fincaIds } },
    select: { fincaId: true, _count: { select: { animales: true, potreros: true } } },
  });
  const porFinca = new Map<string, { animales: number; potreros: number }>();
  for (const lote of lotesConConteo) {
    const actual = porFinca.get(lote.fincaId) ?? { animales: 0, potreros: 0 };
    porFinca.set(lote.fincaId, {
      animales: actual.animales + lote._count.animales,
      potreros: actual.potreros + lote._count.potreros,
    });
  }
  return porFinca;
}

export async function obtenerFincaPorId(id: string) {
  const finca = await prisma.finca.findUnique({
    where: { id },
    include: {
      lotes: {
        include: {
          _count: { select: { animales: true, potreros: true } },
        },
        orderBy: { nombre: 'asc' },
      },
      _count: { select: { lotes: true } },
    },
  });
  if (!finca) return null;

  const totalAnimales = finca.lotes.reduce((suma, lote) => suma + lote._count.animales, 0);
  const totalPotreros = finca.lotes.reduce((suma, lote) => suma + lote._count.potreros, 0);
  return { ...finca, _count: { ...finca._count, animales: totalAnimales, potreros: totalPotreros } };
}

export async function crearFinca(datos: Prisma.FincaCreateInput) {
  return prisma.finca.create({ data: datos });
}

export async function actualizarFinca(id: string, datos: Prisma.FincaUpdateInput) {
  return prisma.finca.update({ where: { id }, data: datos });
}

export async function eliminarFinca(id: string) {
  return prisma.finca.delete({ where: { id } });
}

export async function existeFincaConNombre(nombre: string, excluirId?: string) {
  const finca = await prisma.finca.findFirst({
    where: {
      nombre: { equals: nombre, mode: 'insensitive' },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true },
  });
  return !!finca;
}

export interface FiltrosAnimalesFinca {
  busqueda?: string;
  loteId?: string;
  estado?: EstadoAnimal;
  pagina?: number;
  porPagina?: number;
}

export async function listarAnimalesDeFinca(fincaId: string, filtros: FiltrosAnimalesFinca = {}) {
  const { busqueda, loteId, estado, pagina = 1, porPagina = 50 } = filtros;

  const donde: Prisma.AnimalWhereInput = {
    lote: { fincaId },
    ...(estado ? { estado } : {}),
    ...(loteId ? { loteId } : {}),
    ...(busqueda
      ? {
          OR: [
            { numeroIdentificacion: { contains: busqueda, mode: 'insensitive' } },
            { nombre:      { contains: busqueda, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [registros, total] = await prisma.$transaction([
    prisma.animal.findMany({
      where: donde,
      select: {
        id:              true,
        numeroIdentificacion:     true,
        nombre:          true,
        sexo:            true,
        estado:          true,
        estadoSanitario: true,
        fechaNacimiento: true,
        pesoActual:      true,
        proposito:       true,
        raza:  { select: { id: true, nombre: true } },
        lote:  { select: { id: true, nombre: true } },
      },
      orderBy: [{ estado: 'asc' }, { numeroIdentificacion: 'asc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
    prisma.animal.count({ where: donde }),
  ]);

  return { registros, total };
}
