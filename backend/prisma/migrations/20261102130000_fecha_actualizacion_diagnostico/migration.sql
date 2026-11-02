-- Fecha en que un diagnóstico se agregó o corrigió después de la consulta
ALTER TABLE "detalle_diagnostico" ADD COLUMN "fecha_actualizacion" TIMESTAMP(3);
