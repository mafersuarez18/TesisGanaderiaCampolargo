import { prisma } from '../../compartido/prisma/clientePrisma';

// Detalle legible de un registro de auditoría: en vez de mostrar IDs crudos,
// se dice a qué registro se le hizo la acción (p. ej. "Consulta del 03/11/2026
// — La Princesa #ELP-001") y los datos enviados se traducen a etiquetas en
// español, resolviendo los IDs de animales, medicamentos, lotes, etc.

const fmtFecha = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const nombreAnimal = (a: { numeroIdentificacion: string; nombre: string | null } | null | undefined) =>
  a ? `${a.nombre ? `${a.nombre} ` : ''}#${a.numeroIdentificacion}` : '—';

const etiquetaEnum = (v: string) => {
  const t = v.toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const SEL_ANIMAL = { select: { id: true, numeroIdentificacion: true, nombre: true } } as const;

export interface RegistroAfectado {
  /** Texto que identifica el registro, o null si ya no existe. */
  descripcion: string | null;
  /** Animal relacionado, para poder abrir su ficha. */
  animal?: { id: string; texto: string } | null;
  eliminado: boolean;
}

/** Describe el registro sobre el que se hizo la acción. */
export async function describirRegistro(tipo: string | null, id: string | null): Promise<RegistroAfectado | null> {
  if (!tipo || !id) return null;
  const animalRef = (a: { id: string; numeroIdentificacion: string; nombre: string | null } | null | undefined) =>
    a ? { id: a.id, texto: nombreAnimal(a) } : null;

  try {
    switch (tipo) {
      case 'Animal': {
        const a = await prisma.animal.findUnique({ where: { id }, select: { id: true, numeroIdentificacion: true, nombre: true } });
        return a ? { descripcion: `Animal ${nombreAnimal(a)}`, animal: animalRef(a), eliminado: false } : null;
      }
      case 'HistorialMedico': {
        const h = await prisma.historialMedico.findUnique({ where: { id }, select: { fechaConsulta: true, motivoConsulta: true, animal: SEL_ANIMAL } });
        return h ? { descripcion: `Consulta del ${fmtFecha(h.fechaConsulta)} — ${h.motivoConsulta}`, animal: animalRef(h.animal), eliminado: false } : null;
      }
      case 'Tratamiento': {
        const t = await prisma.tratamiento.findUnique({ where: { id }, select: { fechaInicio: true, medicamento: { select: { nombre: true } }, historialMedico: { select: { animal: SEL_ANIMAL } } } });
        return t ? { descripcion: `Tratamiento con ${t.medicamento?.nombre ?? 'medicamento'} desde el ${fmtFecha(t.fechaInicio)}`, animal: animalRef(t.historialMedico.animal), eliminado: false } : null;
      }
      case 'EnfermedadDiagnosticada': {
        const e = await prisma.enfermedadDiagnosticada.findUnique({ where: { id }, select: { nombreEnfermedad: true, fechaInicio: true, historialMedico: { select: { animal: SEL_ANIMAL } } } });
        return e ? { descripcion: `Diagnóstico: ${e.nombreEnfermedad} (desde el ${fmtFecha(e.fechaInicio)})`, animal: animalRef(e.historialMedico.animal), eliminado: false } : null;
      }
      case 'PruebaComplementaria': {
        const p = await prisma.pruebaComplementaria.findUnique({ where: { id }, select: { tipo: true, fecha: true, historialMedico: { select: { animal: SEL_ANIMAL } } } });
        return p ? { descripcion: `Prueba ${etiquetaEnum(p.tipo).toLowerCase()}${p.fecha ? ` del ${fmtFecha(p.fecha)}` : ''}`, animal: animalRef(p.historialMedico.animal), eliminado: false } : null;
      }
      case 'InseminacionArtificial': {
        const i = await prisma.inseminacionArtificial.findUnique({ where: { id }, select: { fechaInseminacion: true, inventarioSemen: { select: { codigoDosis: true } }, eventoReproductivo: { select: { animal: SEL_ANIMAL } } } });
        return i ? { descripcion: `Inseminación del ${fmtFecha(i.fechaInseminacion)}${i.inventarioSemen ? ` (dosis ${i.inventarioSemen.codigoDosis})` : ''}`, animal: animalRef(i.eventoReproductivo.animal), eliminado: false } : null;
      }
      case 'EventoReproductivo': {
        const e = await prisma.eventoReproductivo.findUnique({ where: { id }, select: { tipo: true, fecha: true, animal: SEL_ANIMAL } });
        return e ? { descripcion: `${etiquetaEnum(e.tipo)} del ${fmtFecha(e.fecha)}`, animal: animalRef(e.animal), eliminado: false } : null;
      }
      case 'Gestacion': {
        const g = await prisma.gestacion.findUnique({ where: { id }, select: { fechaInicio: true, estadoGestacion: true, madre: SEL_ANIMAL } });
        return g ? { descripcion: `Gestación iniciada el ${fmtFecha(g.fechaInicio)} (${etiquetaEnum(g.estadoGestacion).toLowerCase()})`, animal: animalRef(g.madre), eliminado: false } : null;
      }
      case 'RegistroVacunacion': {
        const r = await prisma.registroVacunacion.findUnique({ where: { id }, select: { fechaAplicacion: true, calendarioVacunacion: { select: { nombreVacuna: true } }, animal: SEL_ANIMAL } });
        return r ? { descripcion: `${r.calendarioVacunacion?.nombreVacuna ?? 'Vacuna'} aplicada el ${fmtFecha(r.fechaAplicacion)}`, animal: animalRef(r.animal), eliminado: false } : null;
      }
      case 'CalendarioVacunacion': {
        const c = await prisma.calendarioVacunacion.findUnique({ where: { id }, select: { nombreVacuna: true, intervaloDias: true } });
        return c ? { descripcion: `Protocolo ${c.nombreVacuna} (cada ${c.intervaloDias} días)`, eliminado: false } : null;
      }
      case 'ActividadPlanSanitario': {
        const a = await prisma.actividadPlanSanitario.findUnique({ where: { id }, select: { nombreControl: true, categoria: true } });
        return a ? { descripcion: `Plan sanitario: ${a.nombreControl} (${etiquetaEnum(a.categoria).toLowerCase()})`, eliminado: false } : null;
      }
      case 'DispositivoGPS': {
        const d = await prisma.dispositivoGPS.findUnique({ where: { id }, select: { codigoDispositivo: true, animal: SEL_ANIMAL } });
        return d ? { descripcion: `Collar GPS ${d.codigoDispositivo}`, animal: animalRef(d.animal), eliminado: false } : null;
      }
      case 'InventarioSemen': {
        const s = await prisma.inventarioSemen.findUnique({ where: { id }, select: { codigoDosis: true } });
        return s ? { descripcion: `Lote de semen ${s.codigoDosis}`, eliminado: false } : null;
      }
      case 'Usuario': {
        const u = await prisma.usuario.findUnique({ where: { id }, select: { nombre: true, apellido: true, correo: true } });
        return u ? { descripcion: `Usuario ${u.nombre} ${u.apellido} (${u.correo})`, eliminado: false } : null;
      }
      case 'Finca': case 'Lote': case 'Potrero': case 'Semental': case 'Medicamento': case 'Raza': case 'Rol': case 'ReglaAlerta': {
        const etiquetas: Record<string, string> = { Finca: 'Finca', Lote: 'Lote', Potrero: 'Potrero', Semental: 'Semental', Medicamento: 'Medicamento', Raza: 'Raza', Rol: 'Rol', ReglaAlerta: 'Regla de alerta' };
        const modelo = (prisma as unknown as Record<string, { findUnique: (a: object) => Promise<{ nombre: string } | null> }>)[
          tipo.charAt(0).toLowerCase() + tipo.slice(1)
        ];
        const r = await modelo?.findUnique({ where: { id }, select: { nombre: true } });
        return r ? { descripcion: `${etiquetas[tipo]} ${r.nombre}`, eliminado: false } : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Datos enviados en la acción ──────────────────────────────────────────────

const ETIQUETAS_CAMPO: Record<string, string> = {
  animalId: 'Animal', receptoraId: 'Receptora', madreId: 'Madre', padreId: 'Padre', toroId: 'Toro',
  medicamentoId: 'Medicamento', inventarioSemenId: 'Dosis de semen', sementalId: 'Semental',
  loteId: 'Lote', fincaId: 'Finca', razaId: 'Raza', rolId: 'Rol', usuarioId: 'Usuario',
  calendarioVacunacionId: 'Protocolo de vacunación', enfermedadDiagnosticadaId: 'Diagnóstico',
  fecha: 'Fecha', fechaConsulta: 'Fecha de consulta', fechaInicio: 'Fecha de inicio', fechaAplicacion: 'Fecha de aplicación',
  fechaNacimiento: 'Fecha de nacimiento', fechaPartoEsperado: 'Parto esperado', fechaPartoReal: 'Fecha del parto',
  fechaInicioGestacion: 'Inicio de la gestación', motivoConsulta: 'Motivo de consulta', observaciones: 'Observaciones',
  descripcion: 'Descripción', nombre: 'Nombre', apellido: 'Apellido', correo: 'Correo', numeroIdentificacion: 'N.° de identificación',
  sexo: 'Sexo', estado: 'Estado', estadoSanitario: 'Estado sanitario', estadoReproductivo: 'Estado reproductivo',
  dosis: 'Dosis', via: 'Vía', viaAdministracion: 'Vía de administración', frecuencia: 'Frecuencia', duracionDias: 'Duración (días)',
  numeroIntento: 'N.° de intento', tipo: 'Tipo', resultado: 'Resultado', prenada: '¿Quedó preñada?', mejoro: '¿Mejoró?',
  nombreEnfermedad: 'Enfermedad', nivelGravedad: 'Gravedad', diagnosticoDefinitivo: 'Diagnóstico definitivo',
  temperatura: 'Temperatura (°C)', pesoActual: 'Peso (kg)', pesoNacimiento: 'Peso al nacer (kg)', texto: 'Texto',
  metodoDiagnostico: 'Método de diagnóstico', codigoDispositivo: 'Código del collar', frecuenciaMinutos: 'Frecuencia (min)',
  tecnicaDeposicion: 'Técnica de deposición', clasificacionIA: 'Clasificación', manejoHato: 'Manejo del hato',
  temperaturaUterina: 'Temperatura uterina (°C)', balanceEnergetico: 'Balance energético', tasaMetabolicaBasal: 'Tasa metabólica basal',
};

// Campo genérico "fechaUltimoParto" → "Fecha ultimo parto"
function etiquetaCampo(clave: string): string {
  if (ETIQUETAS_CAMPO[clave]) return ETIQUETAS_CAMPO[clave]!;
  const t = clave.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

async function resolverId(clave: string, id: string): Promise<string | null> {
  try {
    if (['animalId', 'receptoraId', 'madreId', 'padreId', 'toroId'].includes(clave)) {
      return nombreAnimal(await prisma.animal.findUnique({ where: { id }, select: { numeroIdentificacion: true, nombre: true } }));
    }
    const porNombre: Record<string, string> = {
      medicamentoId: 'medicamento', loteId: 'lote', fincaId: 'finca', razaId: 'raza', rolId: 'rol', sementalId: 'semental',
    };
    if (porNombre[clave]) {
      const modelo = (prisma as unknown as Record<string, { findUnique: (a: object) => Promise<{ nombre: string } | null> }>)[porNombre[clave]!];
      return (await modelo?.findUnique({ where: { id }, select: { nombre: true } }))?.nombre ?? null;
    }
    if (clave === 'inventarioSemenId') return (await prisma.inventarioSemen.findUnique({ where: { id }, select: { codigoDosis: true } }))?.codigoDosis ?? null;
    if (clave === 'calendarioVacunacionId') return (await prisma.calendarioVacunacion.findUnique({ where: { id }, select: { nombreVacuna: true } }))?.nombreVacuna ?? null;
    if (clave === 'usuarioId') {
      const u = await prisma.usuario.findUnique({ where: { id }, select: { nombre: true, apellido: true } });
      return u ? `${u.nombre} ${u.apellido}` : null;
    }
    if (clave === 'enfermedadDiagnosticadaId') return (await prisma.enfermedadDiagnosticada.findUnique({ where: { id }, select: { nombreEnfermedad: true } }))?.nombreEnfermedad ?? null;
  } catch { /* se muestra el valor tal cual */ }
  return null;
}

function valorLegible(valor: unknown): string {
  if (valor == null || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') return String(valor);
  if (typeof valor === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(valor)) {
      const d = new Date(valor);
      if (!Number.isNaN(d.getTime())) return fmtFecha(d);
    }
    // Valores de lista (ACTIVO, EN_TRATAMIENTO...); siglas cortas como "IM" se dejan igual
    if (/^[A-Z][A-Z_Ñ]{3,}$/.test(valor)) return etiquetaEnum(valor);
    return valor;
  }
  if (Array.isArray(valor)) return valor.length ? valor.map((v) => (typeof v === 'object' ? JSON.stringify(v) : valorLegible(v))).join(', ') : '—';
  return JSON.stringify(valor);
}

export interface CampoLegible {
  campo: string;
  valor: string;
}

/**
 * Animal mencionado en los datos enviados (animalId, receptoraId o madreId),
 * para registros viejos que no guardaron el id del registro creado.
 */
export async function animalDeLosDatos(datos: unknown): Promise<{ id: string; texto: string } | null> {
  if (!datos || typeof datos !== 'object') return null;
  const d = datos as Record<string, unknown>;
  const id = [d['animalId'], d['receptoraId'], d['madreId']].find((v): v is string => typeof v === 'string');
  if (!id) return null;
  const a = await prisma.animal.findUnique({ where: { id }, select: { id: true, numeroIdentificacion: true, nombre: true } }).catch(() => null);
  return a ? { id: a.id, texto: nombreAnimal(a) } : null;
}

/** Traduce el JSON de datos enviados a una lista campo → valor legible. */
export async function datosLegibles(datos: unknown): Promise<CampoLegible[]> {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return [];
  const filas: CampoLegible[] = [];
  for (const [clave, valor] of Object.entries(datos as Record<string, unknown>)) {
    // Listas de objetos (p. ej. enfermedades o tratamientos de una consulta):
    // se resume la cantidad en vez de volcar el JSON completo.
    if (Array.isArray(valor) && valor.some((v) => v && typeof v === 'object')) {
      filas.push({ campo: etiquetaCampo(clave), valor: `${valor.length} registro(s)` });
      continue;
    }
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      filas.push({ campo: etiquetaCampo(clave), valor: Object.entries(valor).filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => `${etiquetaCampo(k)}: ${valorLegible(v)}`).join(' · ') || '—' });
      continue;
    }
    const resuelto = typeof valor === 'string' && /Id$/.test(clave) ? await resolverId(clave, valor) : null;
    filas.push({ campo: etiquetaCampo(clave), valor: resuelto ?? valorLegible(valor) });
  }
  return filas;
}
