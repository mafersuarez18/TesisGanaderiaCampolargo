-- Toro de una monta natural y padre (toro) de una gestación, ambos opcionales
ALTER TABLE "evento_reproductivo" ADD COLUMN "toro_id" TEXT;
ALTER TABLE "gestacion" ADD COLUMN "padre_id" TEXT;

ALTER TABLE "evento_reproductivo" ADD CONSTRAINT "evento_reproductivo_toro_id_fkey"
  FOREIGN KEY ("toro_id") REFERENCES "animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gestacion" ADD CONSTRAINT "gestacion_padre_id_fkey"
  FOREIGN KEY ("padre_id") REFERENCES "animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
