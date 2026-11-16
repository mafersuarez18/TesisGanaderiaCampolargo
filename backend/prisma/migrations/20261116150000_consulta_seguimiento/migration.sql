-- Consulta de seguimiento: apunta a la consulta cuyo tratamiento no funcionó
ALTER TABLE "registro_medico" ADD COLUMN "consulta_origen_id" TEXT;
CREATE INDEX "registro_medico_consulta_origen_id_idx" ON "registro_medico"("consulta_origen_id");
ALTER TABLE "registro_medico" ADD CONSTRAINT "registro_medico_consulta_origen_id_fkey"
  FOREIGN KEY ("consulta_origen_id") REFERENCES "registro_medico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
