-- Quién atendió una alerta (se cierra para todos sus destinatarios)
ALTER TABLE "notificacion" ADD COLUMN "atendida_por_id" TEXT;

ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_atendida_por_id_fkey"
  FOREIGN KEY ("atendida_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
