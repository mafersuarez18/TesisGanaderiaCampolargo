-- Peso del animal resultante de la consulta (peso de referencia + ganancia)
ALTER TABLE "registro_medico" ADD COLUMN "peso_resultante" DOUBLE PRECISION;

-- Consulta en la que se registró cada desparasitación / vitamina (opcional:
-- también se pueden registrar fuera de una consulta)
ALTER TABLE "programa_desparasitacion" ADD COLUMN "registro_medico_id" TEXT;
CREATE INDEX "programa_desparasitacion_registro_medico_id_idx" ON "programa_desparasitacion"("registro_medico_id");
ALTER TABLE "programa_desparasitacion" ADD CONSTRAINT "programa_desparasitacion_registro_medico_id_fkey"
  FOREIGN KEY ("registro_medico_id") REFERENCES "registro_medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "registro_vitaminas" ADD COLUMN "registro_medico_id" TEXT;
CREATE INDEX "registro_vitaminas_registro_medico_id_idx" ON "registro_vitaminas"("registro_medico_id");
ALTER TABLE "registro_vitaminas" ADD CONSTRAINT "registro_vitaminas_registro_medico_id_fkey"
  FOREIGN KEY ("registro_medico_id") REFERENCES "registro_medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vincular los registros existentes con la consulta del mismo animal, día y veterinario
UPDATE "programa_desparasitacion" d SET "registro_medico_id" = (
  SELECT h."id" FROM "registro_medico" h
  WHERE h."animal_id" = d."animal_id" AND h."usuario_id" = d."veterinario_id"
    AND h."fechaConsulta"::date = d."fechaAplicacion"::date
  ORDER BY h."fechaConsulta" DESC LIMIT 1
);
UPDATE "registro_vitaminas" v SET "registro_medico_id" = (
  SELECT h."id" FROM "registro_medico" h
  WHERE h."animal_id" = v."animal_id" AND h."usuario_id" = v."veterinario_id"
    AND h."fechaConsulta"::date = v."fechaAplicacion"::date
  ORDER BY h."fechaConsulta" DESC LIMIT 1
);
