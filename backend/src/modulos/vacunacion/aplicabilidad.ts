import { Sexo, TipoPropositoAnimal, CondicionReproductivaVacuna, EstadoGestacion } from '@prisma/client';
import { prisma } from '../../compartido/prisma/clientePrisma';

// A qué animales aplica un calendario de vacunación: sexo, rango de edad,
// propósito y condición reproductiva. Lo usan el cumplimiento por lote (solo
// cuenta los pares animal–calendario que aplican) y el registro de una
// aplicación (advierte si el animal no está en la categoría, sin bloquear).

// "En lactancia" se estima como parto en los últimos DIAS_LACTANCIA días:
// el sistema no registra el secado de la vaca.
export const DIAS_LACTANCIA = 300;
const MS_DIA = 24 * 60 * 60 * 1000;

export interface CriteriosCalendario {
  edadMinimasDias:   number | null;
  edadMaximaDias:    number | null;
  aplicaASexo:       Sexo | null;
  aplicaAPropositos: TipoPropositoAnimal[];
  aplicaACondicion:  CondicionReproductivaVacuna | null;
}

export const SELECCION_CRITERIOS = {
  edadMinimasDias: true,
  edadMaximaDias: true,
  aplicaASexo: true,
  aplicaAPropositos: true,
  aplicaACondicion: true,
} as const;

export interface PerfilAnimal {
  sexo:            Sexo;
  fechaNacimiento: Date | null;
  proposito:       TipoPropositoAnimal;
  gestante:        boolean;
  ultimoParto:     Date | null;
}

const ETIQUETA_PROPOSITO: Record<TipoPropositoAnimal, string> = {
  CARNE: 'carne', LECHE: 'leche', CARNE_LECHE: 'doble propósito',
  REPRODUCCION: 'reproducción', TAUROMAQUIA: 'tauromaquia',
};

/** Razones por las que el calendario no aplica al animal; vacío = aplica. */
export function motivosNoAplica(cal: CriteriosCalendario, animal: PerfilAnimal, hoy = new Date()): string[] {
  const motivos: string[] = [];

  if (cal.aplicaASexo && cal.aplicaASexo !== animal.sexo) {
    motivos.push(`es solo para ${cal.aplicaASexo === 'HEMBRA' ? 'hembras' : 'machos'}`);
  }

  // Sin fecha de nacimiento no se puede saber la edad: no se excluye.
  if (animal.fechaNacimiento) {
    const edad = Math.floor((hoy.getTime() - animal.fechaNacimiento.getTime()) / MS_DIA);
    if (cal.edadMinimasDias != null && edad < cal.edadMinimasDias) {
      motivos.push(`requiere al menos ${cal.edadMinimasDias} días de edad (tiene ${edad})`);
    }
    if (cal.edadMaximaDias != null && edad > cal.edadMaximaDias) {
      motivos.push(`es hasta los ${cal.edadMaximaDias} días de edad (tiene ${edad})`);
    }
  }

  if (cal.aplicaAPropositos.length && !cal.aplicaAPropositos.includes(animal.proposito)) {
    motivos.push(`es para animales de ${cal.aplicaAPropositos.map((p) => ETIQUETA_PROPOSITO[p]).join(' o ')}`);
  }

  const enLactancia = animal.sexo === 'HEMBRA' && !!animal.ultimoParto
    && hoy.getTime() - animal.ultimoParto.getTime() <= DIAS_LACTANCIA * MS_DIA;

  if (cal.aplicaACondicion === 'SECAS') {
    // Animales que no están dando leche: los machos también cuentan.
    if (enLactancia) motivos.push('es para animales secos y esta hembra está en lactancia');
  } else if (cal.aplicaACondicion) {
    if (animal.sexo !== 'HEMBRA') {
      motivos.push('es solo para hembras según su condición reproductiva');
    } else if (cal.aplicaACondicion === 'GESTANTES' && !animal.gestante) {
      motivos.push('es solo para hembras gestantes');
    } else if (cal.aplicaACondicion === 'VACIAS' && animal.gestante) {
      motivos.push('es solo para hembras vacías (no gestantes)');
    } else if (cal.aplicaACondicion === 'EN_LACTANCIA') {
      if (!enLactancia) motivos.push(`es solo para hembras en lactancia (parto en los últimos ${DIAS_LACTANCIA} días)`);
    }
  }

  return motivos;
}

/** Gestación en curso y último parto de cada hembra (para la condición reproductiva). */
export async function cargarEstadoReproductivo(animalIds: string[]) {
  const gestaciones = await prisma.gestacion.findMany({
    where: {
      madreId: { in: animalIds },
      OR: [
        { estadoGestacion: EstadoGestacion.EN_CURSO },
        { estadoGestacion: EstadoGestacion.FINALIZADA_PARTO, fechaPartoReal: { not: null } },
      ],
    },
    select: { madreId: true, estadoGestacion: true, fechaPartoReal: true },
  });

  const gestantes = new Set<string>();
  const ultimoParto = new Map<string, Date>();
  for (const g of gestaciones) {
    if (g.estadoGestacion === EstadoGestacion.EN_CURSO) gestantes.add(g.madreId);
    else if (g.fechaPartoReal && (ultimoParto.get(g.madreId)?.getTime() ?? 0) < g.fechaPartoReal.getTime()) {
      ultimoParto.set(g.madreId, g.fechaPartoReal);
    }
  }
  return { gestantes, ultimoParto };
}
