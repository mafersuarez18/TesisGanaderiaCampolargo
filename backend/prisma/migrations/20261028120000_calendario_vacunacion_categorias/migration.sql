-- Categorías de animales a las que aplica un calendario de vacunación,
-- además del sexo: rango de edad, propósito y condición reproductiva.

-- CreateEnum
CREATE TYPE "CondicionReproductivaVacuna" AS ENUM ('GESTANTES', 'VACIAS', 'EN_LACTANCIA');

-- AlterTable
ALTER TABLE "calendario_vacunacion"
  ADD COLUMN "edad_maxima_dias" INTEGER,
  ADD COLUMN "aplica_a_propositos" "TipoPropositoAnimal"[] DEFAULT ARRAY[]::"TipoPropositoAnimal"[],
  ADD COLUMN "aplica_a_condicion" "CondicionReproductivaVacuna";
