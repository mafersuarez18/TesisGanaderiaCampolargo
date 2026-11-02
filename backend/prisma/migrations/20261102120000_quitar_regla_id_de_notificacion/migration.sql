-- La notificación ya no guarda reglaId: la regla se obtiene a través de la
-- asignación regla-usuario (regla_usuario_id), y el campo no se leía en
-- ningún lado. El CHECK "notificacion_destinatario_unico" (usuario_id o
-- regla_usuario_id, nunca ambos ni ninguno) no cambia.

-- DropForeignKey
ALTER TABLE "notificacion" DROP CONSTRAINT IF EXISTS "notificaciones_reglaId_fkey";

-- AlterTable
ALTER TABLE "notificacion" DROP COLUMN "reglaId";
