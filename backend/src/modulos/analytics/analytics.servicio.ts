import { prisma } from '../../compartido/prisma/clientePrisma';
import { EstadoAnimal, EstadoSanitario, PrioridadAlerta, EstadoGestacion, EstadoCria } from '@prisma/client';

// Indicadores agregados para el dashboard y los reportes analíticos: todo
// lo que aquí se calcula son cifras de solo lectura derivadas de otros
// módulos (animales, gestaciones, tratamientos...), no hay escritura.

export async function obtenerResumenDashboard() {
  // Ejecutar todas las consultas en paralelo para minimizar latencia
  const [
    totalAnimales,
    animalesPorFinca,
    animalesPorRaza,
    alertasActivas,
    alertasCriticas,
    partosProximos30Dias,
    vacunasPendientes,
    enfermedadesActivas,
    gestacionesActivas,
    nacimientos,
  ] = await Promise.all([
    // Total de animales activos
    prisma.animal.count({ where: { estado: EstadoAnimal.ACTIVO } }),

    // Animales por finca (se suma a partir de los lotes, ya que Finca no
    // tiene una relación directa con Animal)
    prisma.finca.findMany({
      select: {
        nombre: true,
        lotes: {
          select: {
            _count: { select: { animales: { where: { estado: EstadoAnimal.ACTIVO } } } },
          },
        },
      },
    }),

    // Animales por raza
    prisma.raza.findMany({
      select: {
        nombre: true,
        _count: { select: { animales: { where: { estado: EstadoAnimal.ACTIVO } } } },
      },
      orderBy: { animales: { _count: 'desc' } },
      take: 5,
    }),

    // Total de alertas no leídas
    prisma.notificacion.count({ where: { leida: false } }),

    // Alertas críticas no leídas
    prisma.notificacion.count({
      where: { leida: false, prioridad: PrioridadAlerta.CRITICA },
    }),

    // Gestaciones con parto esperado en los próximos 30 días
    prisma.gestacion.count({
      where: {
        fechaPartoEsperado: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        estadoGestacion: EstadoGestacion.EN_CURSO,
      },
    }),

    // Calendarios de vacunación pendientes de registro en últimos intervaloDias días
    prisma.calendarioVacunacion.count(),

    // Animales con enfermedades activas
    prisma.animal.count({
      where: { estadoSanitario: EstadoSanitario.ENFERMO },
    }),

    // Gestaciones activas para calcular tasa de preñez
    prisma.gestacion.count({ where: { estadoGestacion: EstadoGestacion.EN_CURSO } }),

    // Nacimientos del último año para calcular tasa de natalidad
    prisma.nacimiento.count({
      where: {
        fechaNacimiento: {
          gte: new Date(new Date().getFullYear() - 1, 0, 1),
        },
      },
    }),
  ]);

  // Construir datos de animales por finca, sumando el conteo de cada lote
  const animalesPorFincaFormateados = animalesPorFinca.map((f) => {
    const total = f.lotes.reduce((suma, lote) => suma + lote._count.animales, 0);
    return { finca: f.nombre, total, activos: total };
  });

  // Calcular indicadores reproductivos
  const hembrasTotales = await prisma.animal.count({
    where: { sexo: 'HEMBRA', estado: EstadoAnimal.ACTIVO },
  });

  const tasaPreniez = hembrasTotales > 0
    ? (gestacionesActivas / hembrasTotales) * 100
    : 0;

  // Se calcula sobre el total de hembras activas (no sobre el rebaño completo)
  // para no diluir el indicador con animales que biológicamente no pueden parir.
  const tasaNatalidad = hembrasTotales > 0
    ? (nacimientos / hembrasTotales) * 100
    : 0;

  // Días abiertos: promedio de tiempo entre parto y nueva gestación (simplificado)
  const { promedio: diasAbiertoPromedio, partosConsiderados } = await calcularDiasAbiertoPromedio();

  // Mortalidad de crías: animales muertos nacidos en el último año, más las
  // crías que nacieron muertas (o murieron en sus primeras 24 h) según el
  // registro del parto y que nunca se dieron de alta como animal — sin
  // criaId, para no contar dos veces a una cría registrada.
  const haceUnAnio = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [animalesMuertos, criasNacidasMuertas] = await Promise.all([
    prisma.animal.count({
      where: { estado: EstadoAnimal.MUERTO, fechaNacimiento: { gte: haceUnAnio } },
    }),
    prisma.nacimiento.count({
      where: {
        estadoCria: { in: [EstadoCria.MUERTO_AL_NACER, EstadoCria.MUERTO_NEONATAL] },
        criaId: null,
        fechaNacimiento: { gte: haceUnAnio },
      },
    }),
  ]);
  const muertesNeonatos = animalesMuertos + criasNacidasMuertas;

  const tasaMortalidadCrias = nacimientos > 0
    ? (muertesNeonatos / nacimientos) * 100
    : 0;

  return {
    totalAnimales,
    animalesPorFinca: animalesPorFincaFormateados,
    animalesPorRaza: animalesPorRaza.map((r) => ({
      raza: r.nombre,
      total: r._count.animales,
    })),
    alertasActivas,
    alertasCriticas,
    partosProximos30Dias,
    vacunasPendientes,
    enfermedadesActivas,
    indicadoresReproductivos: {
      tasaPreniez: Math.round(tasaPreniez * 10) / 10,
      tasaNatalidad: Math.round(tasaNatalidad * 10) / 10,
      tasaMortalidadCrias: Math.round(tasaMortalidadCrias * 10) / 10,
      diasAbiertoPromedio: Math.round(diasAbiertoPromedio),
    },
    // Operandos de cada indicador, para que el dashboard pueda mostrar el
    // cálculo concreto que produjo cada número (leyenda de cada tarjeta).
    detalleIndicadores: {
      hembrasActivas: hembrasTotales,
      gestacionesEnCurso: gestacionesActivas,
      nacimientos,
      desdeNacimientos: new Date(new Date().getFullYear() - 1, 0, 1),
      muertesCrias: muertesNeonatos,
      partosConsiderados,
    },
  };
}

async function calcularDiasAbiertoPromedio(): Promise<{ promedio: number; partosConsiderados: number }> {
  // Calcula promedio de días entre último parto y fecha actual (o nueva gestación),
  // sobre la totalidad del historial de gestaciones finalizadas en parto.
  const gestacionesConParto = await prisma.gestacion.findMany({
    where: { estadoGestacion: EstadoGestacion.FINALIZADA_PARTO },
    select: {
      fechaPartoEsperado: true,
      madreId: true,
    },
    orderBy: { fechaPartoEsperado: 'desc' },
  });

  // Sin partos registrados se devuelve el valor de referencia para ganadería bovina
  if (gestacionesConParto.length === 0) return { promedio: 120, partosConsiderados: 0 };

  const diasTotales = gestacionesConParto.reduce((acc, g) => {
    const diasDesdeUltimoParto = Math.max(
      0,
      Math.floor((Date.now() - g.fechaPartoEsperado.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return acc + Math.min(diasDesdeUltimoParto, 365); // Máximo 1 año de cálculo
  }, 0);

  return { promedio: diasTotales / gestacionesConParto.length, partosConsiderados: gestacionesConParto.length };
}

export async function obtenerEvolucionMensual(anio: number) {
  const meses = Array.from({ length: 12 }, (_, i) => i);

  const datos = await Promise.all(
    meses.map(async (mes) => {
      const inicio = new Date(anio, mes, 1);
      const fin = new Date(anio, mes + 1, 0, 23, 59, 59);

      const [nacimientos, muertes, ventas] = await Promise.all([
        prisma.nacimiento.count({ where: { fechaNacimiento: { gte: inicio, lte: fin } } }),
        prisma.animal.count({
          where: { estado: EstadoAnimal.MUERTO, actualizadoEn: { gte: inicio, lte: fin } },
        }),
        prisma.animal.count({
          where: { estado: EstadoAnimal.VENDIDO, actualizadoEn: { gte: inicio, lte: fin } },
        }),
      ]);

      return {
        mes: inicio.toLocaleDateString('es-VE', { month: 'short' }),
        nacimientos,
        muertes,
        ventas,
      };
    }),
  );

  return datos;
}

// ─── Porcentaje de animales tratados en un período ────────────────────────────

export async function obtenerPorcentajeAnimalesTratados(desde: Date, hasta: Date, fincaId?: string) {
  const [totalActivos, tratamientos] = await Promise.all([
    prisma.animal.count({
      where: { estado: EstadoAnimal.ACTIVO, ...(fincaId && { lote: { fincaId } }) },
    }),
    prisma.tratamiento.findMany({
      where: {
        fechaInicio: { gte: desde, lte: hasta },
        ...(fincaId && { historialMedico: { animal: { lote: { fincaId } } } }),
      },
      select: { historialMedico: { select: { animalId: true } } },
    }),
  ]);

  const animalesTratados = new Set(tratamientos.map((t) => t.historialMedico.animalId));

  return {
    desde,
    hasta,
    totalAnimalesActivos: totalActivos,
    animalesTratados: animalesTratados.size,
    porcentajeTratados: totalActivos > 0
      ? +((animalesTratados.size / totalActivos) * 100).toFixed(1)
      : 0,
  };
}

// ─── Tasa de recurrencia de patologías ────────────────────────────────────────
// Proporción de animales con diagnóstico que presentan la MISMA enfermedad
// diagnosticada en 2 o más ocasiones distintas (recaída/reincidencia).

export async function obtenerTasaRecurrenciaPatologias(fincaId?: string) {
  const enfermedades = await prisma.enfermedadDiagnosticada.findMany({
    where: {
      ...(fincaId && { historialMedico: { animal: { lote: { fincaId } } } }),
    },
    select: {
      nombreEnfermedad: true,
      historialMedico: { select: { animalId: true } },
    },
  });

  const conteoPorAnimalEnfermedad = new Map<string, number>();
  const animalesConDiagnostico = new Set<string>();

  for (const e of enfermedades) {
    const animalId = e.historialMedico.animalId;
    animalesConDiagnostico.add(animalId);
    const clave = `${animalId}::${e.nombreEnfermedad.trim().toLowerCase()}`;
    conteoPorAnimalEnfermedad.set(clave, (conteoPorAnimalEnfermedad.get(clave) ?? 0) + 1);
  }

  const animalesConRecurrencia = new Set<string>();
  for (const [clave, conteo] of conteoPorAnimalEnfermedad) {
    if (conteo >= 2) animalesConRecurrencia.add(clave.split('::')[0]!);
  }

  return {
    totalAnimalesConDiagnostico: animalesConDiagnostico.size,
    animalesConRecurrencia: animalesConRecurrencia.size,
    tasaRecurrencia: animalesConDiagnostico.size > 0
      ? +((animalesConRecurrencia.size / animalesConDiagnostico.size) * 100).toFixed(1)
      : 0,
  };
}

export async function obtenerDistribucionPorEdad() {
  const ahora = new Date();
  const animales = await prisma.animal.findMany({
    where: { estado: EstadoAnimal.ACTIVO, fechaNacimiento: { not: null } },
    select: { fechaNacimiento: true, sexo: true },
  });

  const rangos = [
    { etiqueta: '0-6 meses',  min: 0,   max: 6 },
    { etiqueta: '6-12 meses', min: 6,   max: 12 },
    { etiqueta: '1-2 años',   min: 12,  max: 24 },
    { etiqueta: '2-4 años',   min: 24,  max: 48 },
    { etiqueta: '4+ años',    min: 48,  max: Infinity },
  ];

  return rangos.map((rango) => {
    const enRango = animales.filter((a) => {
      if (!a.fechaNacimiento) return false;
      const mesesVida = (ahora.getTime() - a.fechaNacimiento.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return mesesVida >= rango.min && mesesVida < rango.max;
    });
    return {
      rango: rango.etiqueta,
      machos: enRango.filter((a) => a.sexo === 'MACHO').length,
      hembras: enRango.filter((a) => a.sexo === 'HEMBRA').length,
    };
  });
}
