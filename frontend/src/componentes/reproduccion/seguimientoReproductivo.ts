import type { QueryClient } from '@tanstack/react-query';

// Utilidades compartidas por los formularios de seguimiento reproductivo
// (confirmar un servicio, registrar el resultado de un parto), que se usan
// tanto desde Reproducción como desde las alertas.

export { fechaLocalISO, isoMediodia } from '../../servicios/fechas';

export const DIAS_GESTACION_BOVINA = 283;

/** Refresca todo lo que cambia al confirmar un servicio o cerrar una gestación. */
export function invalidarSeguimientoReproductivo(qc: QueryClient) {
  for (const clave of [
    'servicios-por-confirmar', 'eventos-reproductivos', 'partos-proximos', 'partos-proximos-dashboard',
    'gestaciones-activas', 'indicadores-reproductivos', 'inseminaciones', 'dashboard-resumen', 'animal',
    'notificaciones', 'alertas-resumen', 'notificaciones-conteo', 'crias-por-registrar',
  ]) {
    qc.invalidateQueries({ queryKey: [clave] });
  }
}
