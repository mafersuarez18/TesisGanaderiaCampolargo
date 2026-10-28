-- El fabricante del calendario de vacunación se quita: el laboratorio se
-- toma del medicamento asociado. Antes de borrar la columna, se copia su
-- valor al medicamento cuando este no tiene laboratorio, para no perderlo.
UPDATE "medicamento" m
   SET "laboratorio" = c."fabricante"
  FROM "calendario_vacunacion" c
 WHERE c."medicamento_id" = m."id"
   AND c."fabricante" IS NOT NULL
   AND (m."laboratorio" IS NULL OR m."laboratorio" = '');

-- AlterTable
ALTER TABLE "calendario_vacunacion" DROP COLUMN "fabricante";
