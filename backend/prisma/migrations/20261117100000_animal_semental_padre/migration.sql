-- Padre por inseminación artificial: semental del semen con el que se concibió
ALTER TABLE "animal" ADD COLUMN "semental_padre_id" TEXT;
ALTER TABLE "animal" ADD CONSTRAINT "animal_semental_padre_id_fkey"
  FOREIGN KEY ("semental_padre_id") REFERENCES "semental"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Crías ya registradas que nacieron de una inseminación y no tienen toro como padre
UPDATE "animal" a
SET "semental_padre_id" = s."semental_id"
FROM "nacimiento" n
JOIN "gestacion" g ON g."id" = n."gestacion_id"
JOIN "inseminacion_artificial" ia ON ia."evento_reproductivo_id" = g."evento_reproductivo_id"
JOIN "inventario_semen" s ON s."id" = ia."inventario_semen_id"
WHERE (n."id" = a."nacimiento_id" OR n."animal_cria_id" = a."id")
  AND a."padre_id" IS NULL;
