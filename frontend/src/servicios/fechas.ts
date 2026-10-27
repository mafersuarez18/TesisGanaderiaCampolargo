// Fechas "de calendario" (sin hora) entre los formularios y la API.
//
// Un 'YYYY-MM-DD' enviado tal cual se interpreta como medianoche UTC, que en
// Venezuela (UTC-4) es la noche del día anterior: al mostrarlo, la fecha sale
// un día antes. Por eso se envía al mediodía local y se lee en hora local.

/** Fecha local de hoy (o de `base`, desplazada N días) en formato 'YYYY-MM-DD'. */
export function fechaLocalISO(base: Date = new Date(), sumarDias = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + sumarDias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' → ISO al mediodía local, para no correr el día por zona horaria. */
export function isoMediodia(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`);
  // Vacío o con otro formato: se deja igual y que lo valide el backend.
  return Number.isNaN(d.getTime()) ? fecha : d.toISOString();
}
