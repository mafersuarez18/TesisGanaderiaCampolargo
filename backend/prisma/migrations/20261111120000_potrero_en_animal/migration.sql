-- Potrero donde se aloja el animal (opcional; pertenece al lote del animal)
ALTER TABLE "animal" ADD COLUMN "potrero_id" TEXT;
CREATE INDEX "animal_potrero_id_idx" ON "animal"("potrero_id");
ALTER TABLE "animal" ADD CONSTRAINT "animal_potrero_id_fkey"
  FOREIGN KEY ("potrero_id") REFERENCES "potrero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
