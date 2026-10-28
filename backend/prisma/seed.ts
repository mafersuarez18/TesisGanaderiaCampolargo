// =============================================================
// SEED — Datos de prueba del Sistema Campolargo
// Basado en la información real de la Sucesión Joao Campolargo
// Estado Yaracuy, Venezuela
// =============================================================

import { PrismaClient, Sexo, EstadoAnimal, TipoPropositoAnimal, EstadoSanitario, TipoAlertaRegla, PrioridadAlerta } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando carga de datos de prueba...');

  // ----------------------------------------------------------
  // 1. RAZAS
  // ----------------------------------------------------------
  const razaBrahman = await prisma.raza.upsert({
    where: { nombre: 'Brahman' },
    update: {},
    create: {
      nombre: 'Brahman',
      origen: 'India / Estados Unidos',
      tipoCruce: 'Sangre pura',
    },
  });

  const razaSenepol = await prisma.raza.upsert({
    where: { nombre: 'Senepol' },
    update: {},
    create: {
      nombre: 'Senepol',
      origen: 'Islas Vírgenes de EE.UU.',
      tipoCruce: 'Sangre pura',
    },
  });

  const razaCasta = await prisma.raza.upsert({
    where: { nombre: 'Casta de Lidia' },
    update: {},
    create: {
      nombre: 'Casta de Lidia',
      origen: 'España',
      tipoCruce: 'Sangre pura',
    },
  });

  const razaCebu = await prisma.raza.upsert({
    where: { nombre: 'Cebú' },
    update: {},
    create: {
      nombre: 'Cebú',
      origen: 'India',
      tipoCruce: 'Sangre pura',
    },
  });

  console.log('Razas cargadas:', [razaBrahman.nombre, razaSenepol.nombre, razaCasta.nombre, razaCebu.nombre].join(', '));

  // ----------------------------------------------------------
  // 2. FINCAS (Las 3 fincas reales de la empresa)
  // ----------------------------------------------------------
  const fincaParaiso = await prisma.finca.upsert({
    where: { nombre: 'El Paraíso' },
    update: {},
    create: {
      nombre: 'El Paraíso',
      municipio: 'Cocorote',
      estado: 'Yaracuy',
      hectareas: 680,
      descripcion: 'Finca principal. Sede del laboratorio de inseminación artificial. Concentra ganado Brahman y Casta de Lidia.',
      latitudCentro: 10.1875,
      longitudCentro: -68.5234,
    },
  });

  const fincaCampoAlegre = await prisma.finca.upsert({
    where: { nombre: 'Campo Alegre' },
    update: {},
    create: {
      nombre: 'Campo Alegre',
      municipio: 'Sucre',
      estado: 'Yaracuy',
      hectareas: 750,
      descripcion: 'Finca de producción de carne. Mayor concentración de animales Senepol y cruces Brahman x Senepol.',
      latitudCentro: 10.2318,
      longitudCentro: -68.4912,
    },
  });

  const fincaLasPenas = await prisma.finca.upsert({
    where: { nombre: 'Las Peñas' },
    update: {},
    create: {
      nombre: 'Las Peñas',
      municipio: 'Veroes',
      estado: 'Yaracuy',
      hectareas: 570,
      descripcion: 'Finca de recría. Gestión de bovinos jóvenes y novillos en desarrollo.',
      latitudCentro: 10.2756,
      longitudCentro: -68.4461,
    },
  });

  console.log('Fincas cargadas: El Paraíso, Campo Alegre, Las Peñas');

  // ----------------------------------------------------------
  // 3. LOTES
  // ----------------------------------------------------------
  const loteParaisoA = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote A - Reproductoras', fincaId: fincaParaiso.id } },
    update: {},
    create: { nombre: 'Lote A - Reproductoras', fincaId: fincaParaiso.id, capacidad: 60, descripcion: 'Vacas en ciclo reproductivo activo' },
  });

  const loteParaisoB = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote B - Casta', fincaId: fincaParaiso.id } },
    update: {},
    create: { nombre: 'Lote B - Casta', fincaId: fincaParaiso.id, capacidad: 40, descripcion: 'Ganado de lidia y espectáculos taurinos' },
  });

  const loteParaisoC = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote C - Novillos', fincaId: fincaParaiso.id } },
    update: {},
    create: { nombre: 'Lote C - Novillos', fincaId: fincaParaiso.id, capacidad: 90, descripcion: 'Novillos en engorde' },
  });

  const loteCampoAlegreA = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote A - Vacas Paridas', fincaId: fincaCampoAlegre.id } },
    update: {},
    create: { nombre: 'Lote A - Vacas Paridas', fincaId: fincaCampoAlegre.id, capacidad: 70, descripcion: 'Vacas con cría al pie' },
  });

  const loteCampoAlegreB = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote B - Engorde', fincaId: fincaCampoAlegre.id } },
    update: {},
    create: { nombre: 'Lote B - Engorde', fincaId: fincaCampoAlegre.id, capacidad: 140, descripcion: 'Novillos y mautas en finalización' },
  });

  const loteLasPenasA = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote A - Recría', fincaId: fincaLasPenas.id } },
    update: {},
    create: { nombre: 'Lote A - Recría', fincaId: fincaLasPenas.id, capacidad: 80, descripcion: 'Becerros y mautas en recría' },
  });

  const loteLasPenasB = await prisma.lote.upsert({
    where: { nombre_fincaId: { nombre: 'Lote B - Hembras Vientre', fincaId: fincaLasPenas.id } },
    update: {},
    create: { nombre: 'Lote B - Hembras Vientre', fincaId: fincaLasPenas.id, capacidad: 70, descripcion: 'Novillas para incorporar a reproducción' },
  });

  console.log('Lotes creados');

  // ----------------------------------------------------------
  // 4. USUARIOS DEL SISTEMA
  // ----------------------------------------------------------
  // Los roles (ADMINISTRADOR / VETERINARIO / TECNICO) y su catálogo de
  // privilegios se crean como datos de referencia en la migración de RBAC
  // (20260825120000_rbac_roles_privilegios), no aquí — este seed solo
  // registra las cuentas de demostración que los usan.
  const [rolAdministrador, rolVeterinario, rolTecnico] = await Promise.all([
    prisma.rol.findUniqueOrThrow({ where: { nombre: 'ADMINISTRADOR' } }),
    prisma.rol.findUniqueOrThrow({ where: { nombre: 'VETERINARIO' } }),
    prisma.rol.findUniqueOrThrow({ where: { nombre: 'TECNICO' } }),
  ]);

  const hashContrasena = await bcrypt.hash('Campolargo2026!', 12);

  const administrador = await prisma.usuario.upsert({
    where: { correo: 'admin@campolargo.com' },
    update: {},
    create: {
      nombre: 'Carmen Rosa',
      apellido: 'Campolargo',
      correo: 'admin@campolargo.com',
      contrasena: hashContrasena,
      rolId: rolAdministrador.id,
      telefono: '04121556740',
      cargo: 'CEO - Administradora General',
    },
  });

  const veterinario = await prisma.usuario.upsert({
    where: { correo: 'veterinario@campolargo.com' },
    update: {},
    create: {
      nombre: 'Dr. Alejandro',
      apellido: 'Rodríguez',
      correo: 'veterinario@campolargo.com',
      contrasena: hashContrasena,
      rolId: rolVeterinario.id,
      cargo: 'Médico Veterinario Principal',
      creadoPorId: administrador.id,
    },
  });

  const tecnico = await prisma.usuario.upsert({
    where: { correo: 'tecnico@campolargo.com' },
    update: {},
    create: {
      nombre: 'José',
      apellido: 'Pereira',
      correo: 'tecnico@campolargo.com',
      contrasena: hashContrasena,
      rolId: rolTecnico.id,
      cargo: 'Técnico de Campo - El Paraíso',
      creadoPorId: administrador.id,
    },
  });

  console.log('Usuarios creados: admin, veterinario, técnico');

  // ----------------------------------------------------------
  // 5. MEDICAMENTOS BASE
  // ----------------------------------------------------------
  const ivermectina = await prisma.medicamento.upsert({
    where: { id: 'med-ivermectina' },
    update: {},
    create: {
      id: 'med-ivermectina',
      nombre: 'Ivermectina 1%',
      principioActivo: 'Ivermectina',
      laboratorio: 'Virbac',
      presentacion: 'Inyectable',
      concentracion: '10 mg/ml',
      unidadMedida: 'ml',
    },
  });

  const closantel = await prisma.medicamento.upsert({
    where: { id: 'med-closantel' },
    update: {},
    create: {
      id: 'med-closantel',
      nombre: 'Closantel 10%',
      principioActivo: 'Closantel',
      laboratorio: 'Intervet',
      presentacion: 'Oral',
      concentracion: '100 mg/ml',
      unidadMedida: 'ml',
    },
  });

  const oxitetraciclina = await prisma.medicamento.upsert({
    where: { id: 'med-oxitetracilina' },
    update: {},
    create: {
      id: 'med-oxitetracilina',
      nombre: 'Oxitetraciclina LA 200',
      principioActivo: 'Oxitetraciclina',
      laboratorio: 'Pfizer',
      presentacion: 'Inyectable',
      concentracion: '200 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Antibiótico de amplio espectro de larga acción',
    },
  });

  const vacunaFiebreMortal = await prisma.medicamento.upsert({
    where: { id: 'med-fiebre-aftosa' },
    update: {},
    create: {
      id: 'med-fiebre-aftosa',
      nombre: 'Vacuna Fiebre Aftosa bivalente',
      principioActivo: 'Virus inactivado tipos O y A',
      laboratorio: 'Biogenética',
      presentacion: 'Inyectable',
      unidadMedida: 'dosis',
    },
  });

  const vacunaBrucelosis = await prisma.medicamento.upsert({
    where: { id: 'med-brucelosis' },
    update: {},
    create: {
      id: 'med-brucelosis',
      nombre: 'Vacuna Brucelosis RB51',
      principioActivo: 'Brucella abortus cepa RB51',
      presentacion: 'Inyectable',
      unidadMedida: 'dosis',
    },
  });

  // ── Desparasitantes ────────────────────────────────────────
  const fenbendazol25 = await prisma.medicamento.upsert({
    where: { id: 'med-fenbendazol-25' },
    update: {},
    create: {
      id: 'med-fenbendazol-25',
      nombre: 'Fenbendazol al 25%',
      principioActivo: 'Fenbendazol',
      presentacion: 'Oral (suspensión)',
      concentracion: '250 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Antiparasitario oral para gastrointestinales y pulmonares. 1 ml por cada 50 kg PV.',
    },
  });

  const levamisol15 = await prisma.medicamento.upsert({
    where: { id: 'med-levamisol-15' },
    update: {},
    create: {
      id: 'med-levamisol-15',
      nombre: 'Levamisol al 15%',
      principioActivo: 'Levamisol',
      presentacion: 'Inyectable (intramuscular)',
      concentracion: '150 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Antiparasitario IM para gastrointestinales y pulmonares. 1 ml por cada 30 kg PV.',
    },
  });

  const ivermectina315 = await prisma.medicamento.upsert({
    where: { id: 'med-ivermectina-315' },
    update: {},
    create: {
      id: 'med-ivermectina-315',
      nombre: 'Ivermectina al 3,15%',
      principioActivo: 'Ivermectina',
      presentacion: 'Inyectable (subcutáneo)',
      concentracion: '31,5 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Control de gastrointestinales, pulmonares y ectoparásitos. 1 ml por cada 50 kg PV. Solo animales secos.',
    },
  });

  const lombifarm = await prisma.medicamento.upsert({
    where: { id: 'med-lombifarm' },
    update: {},
    create: {
      id: 'med-lombifarm',
      nombre: 'Lombifarm (Fenbendazol + Triclabendazol)',
      principioActivo: 'Fenbendazol + Triclabendazol',
      presentacion: 'Oral',
      unidadMedida: 'ml',
      descripcion: 'Para gastrointestinales y hepáticos. 1 ml por cada 10 kg PV. Solo animales secos.',
    },
  });

  const doramectina1 = await prisma.medicamento.upsert({
    where: { id: 'med-doramectina-1' },
    update: {},
    create: {
      id: 'med-doramectina-1',
      nombre: 'Doramectina al 1%',
      principioActivo: 'Doramectina',
      presentacion: 'Inyectable (subcutáneo)',
      concentracion: '10 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Para pulmonares y ectoparásitos. 1 ml por cada 50 kg PV. Solo animales secos.',
    },
  });

  const tratoril = await prisma.medicamento.upsert({
    where: { id: 'med-tratoril' },
    update: {},
    create: {
      id: 'med-tratoril',
      nombre: 'Tratoril (Toltrazuril al 5%)',
      principioActivo: 'Toltrazuril',
      presentacion: 'Oral',
      concentracion: '50 mg/ml',
      unidadMedida: 'ml',
      descripcion: 'Para coccidiosis intestinal. 3 ml por cada 10 kg PV. Solo animales secos.',
    },
  });

  // ── Vacunas adicionales ────────────────────────────────────
  const vacunaTriple = await prisma.medicamento.upsert({
    where: { id: 'med-triple-carbon' },
    update: {},
    create: {
      id: 'med-triple-carbon',
      nombre: 'Vacuna Triple (Carbón Sintomático + Septicemia + Clostridiosis)',
      principioActivo: 'Clostridium chauvoei, Pasteurella multocida, Clostridium spp.',
      presentacion: 'Inyectable (subcutáneo)',
      unidadMedida: 'dosis',
      descripcion: '2-5 ml subcutánea según marca comercial. Revacunar a los 15 días de la primera dosis.',
    },
  });

  const vacunaCarbonBact = await prisma.medicamento.upsert({
    where: { id: 'med-carbon-bacteridiano' },
    update: {},
    create: {
      id: 'med-carbon-bacteridiano',
      nombre: 'Vacuna Carbón Bacteridiano (Ántrax)',
      principioActivo: 'Bacillus anthracis cepa Sterne',
      presentacion: 'Inyectable (subcutáneo)',
      unidadMedida: 'dosis',
      descripcion: '2 ml subcutánea. Aplicar en áreas de presentación de la enfermedad.',
    },
  });

  const vacunaRabia = await prisma.medicamento.upsert({
    where: { id: 'med-rabia-bovina' },
    update: {},
    create: {
      id: 'med-rabia-bovina',
      nombre: 'Vacuna Rabia Bovina',
      principioActivo: 'Virus rábico inactivado',
      presentacion: 'Inyectable (intramuscular)',
      unidadMedida: 'dosis',
      descripcion: '2 ml intramuscular. Según presentación de la enfermedad en la zona. Anual.',
    },
  });

  const vacunaIBRDVB = await prisma.medicamento.upsert({
    where: { id: 'med-ibr-dvb-lepto' },
    update: {},
    create: {
      id: 'med-ibr-dvb-lepto',
      nombre: 'Vacuna IBR–DVB–Leptospirosis (±PI3, Campylobacter)',
      principioActivo: 'Herpesvirus bovino tipo 1, VDVB, Leptospira spp.',
      presentacion: 'Inyectable (intramuscular)',
      unidadMedida: 'dosis',
      descripcion: '5 ml intramuscular. Con asesoría del médico veterinario, previo diagnóstico de la enfermedad en el predio.',
    },
  });

  const vacunaAnaplasmosis = await prisma.medicamento.upsert({
    where: { id: 'med-anaplasmosis-babesiosis' },
    update: {},
    create: {
      id: 'med-anaplasmosis-babesiosis',
      nombre: 'Vacuna Anaplasmosis y Babesiosis',
      principioActivo: 'Anaplasma marginale, Babesia bovis, Babesia bigemina',
      presentacion: 'Inyectable (intramuscular)',
      unidadMedida: 'dosis',
      descripcion: '2 ml intramuscular (cada vial independiente). Su aplicación requiere asesoría de un médico veterinario.',
    },
  });

  // ── Vitaminas ──────────────────────────────────────────────
  const vitaminaADE = await prisma.medicamento.upsert({
    where: { id: 'med-vitaminico-ade' },
    update: {},
    create: {
      id: 'med-vitaminico-ade',
      nombre: 'ADELER (Vitaminas A, D3, E)',
      principioActivo: 'Vitamina A, Vitamina D3, Vitamina E',
      presentacion: 'Inyectable (intramuscular)',
      unidadMedida: 'ml',
      descripcion: '4-6 ml intramuscular. Refuerzo vitamínico general del hato.',
    },
  });

  console.log('Medicamentos cargados');

  // ----------------------------------------------------------
  // 6. CALENDARIOS DE VACUNACIÓN Y DESPARASITACIÓN
  // ----------------------------------------------------------

  // ── PLAN DE VACUNACIÓN EN BOVINOS ─────────────────────────

  // Fiebre Aftosa — todas las edades, cada 6 meses, 2 ml subcutánea
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-fiebre-aftosa' },
    update: {},
    create: {
      id: 'cal-fiebre-aftosa',
      nombreVacuna: 'Fiebre Aftosa',
      descripcion: 'Todas las edades. 2 ml vía subcutánea en la paleta o tabla del cuello. Según calendario oficial INSAI.',
      intervaloDias: 180,
      medicamentoId: vacunaFiebreMortal.id,
    },
  });

  // Brucelosis — terneras 3 a 8 meses, dosis única
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-brucelosis' },
    update: {},
    create: {
      id: 'cal-brucelosis',
      nombreVacuna: 'Brucelosis RB51',
      descripcion: 'Terneras entre tres y ocho meses. Dosis única. 2 ml subcutánea. De acuerdo al programa oficial.',
      intervaloDias: 365,
      aplicaASexo: Sexo.HEMBRA,
      edadMinimasDias: 90,
      medicamentoId: vacunaBrucelosis.id,
    },
  });

  // Triple (Carbón Sintomático + Septicemia + Clostridiosis) — desde los 3 meses
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-triple-carbon' },
    update: {},
    create: {
      id: 'cal-triple-carbon',
      nombreVacuna: 'Triple (Carbón Sintomático, Septicemia, Clostridiosis)',
      descripcion: 'Machos y hembras desde los tres meses. Primera dosis + revacunación a los 15 días (OBLIGATORIA para efecto del biológico), luego anual. 2 a 5 ml subcutánea según marca comercial.',
      intervaloDias: 365,
      edadMinimasDias: 90,
      medicamentoId: vacunaTriple.id,
    },
  });

  // Carbón Bacteridiano (Ántrax) — desde los 3 meses, anual
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-carbon-bacteridiano' },
    update: {},
    create: {
      id: 'cal-carbon-bacteridiano',
      nombreVacuna: 'Carbón Bacteridiano (Ántrax)',
      descripcion: 'De tres meses en adelante. Revacunación 21–30 días después de la primera, luego anual. 2 ml subcutánea. Aplicar en áreas de presentación.',
      intervaloDias: 365,
      edadMinimasDias: 90,
      medicamentoId: vacunaCarbonBact.id,
    },
  });

  // Rabia Bovina — desde los 4 meses, anual
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-rabia-bovina' },
    update: {},
    create: {
      id: 'cal-rabia-bovina',
      nombreVacuna: 'Rabia Bovina',
      descripcion: 'De cuatro meses en adelante. Anual. 2 ml vía intramuscular. Según presentación de la enfermedad en la zona.',
      intervaloDias: 365,
      edadMinimasDias: 120,
      medicamentoId: vacunaRabia.id,
    },
  });

  // IBR–DVB–Leptospirosis — reproductores, desde los 3 meses; hembras antes del servicio + posparto
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-ibr-dvb-lepto' },
    update: {},
    create: {
      id: 'cal-ibr-dvb-lepto',
      nombreVacuna: 'IBR – DVB – Leptospirosis (±PI3, Campylobacter)',
      descripcion: 'Hembras y machos reproductores desde los 3 meses. Primera dosis + un mes después + anual. Hembras: al mes + un mes posparto + luego anual. 5 ml intramuscular. Con asesoría veterinaria y diagnóstico previo en el predio.',
      intervaloDias: 365,
      edadMinimasDias: 90,
      medicamentoId: vacunaIBRDVB.id,
    },
  });

  // Anaplasmosis y Babesiosis — 3 y 12 meses de edad, revacunación igual
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-anaplasmosis-babesiosis' },
    update: {},
    create: {
      id: 'cal-anaplasmosis-babesiosis',
      nombreVacuna: 'Anaplasmosis y Babesiosis',
      descripcion: '3 y 12 meses de edad, revacunar a los 3 y 12 meses. 2 ml intramuscular (cada vial independiente). Requiere asesoría de médico veterinario.',
      intervaloDias: 180,
      edadMinimasDias: 90,
      medicamentoId: vacunaAnaplasmosis.id,
    },
  });

  // ── PLAN DE DESPARASITACIÓN ───────────────────────────────

  // Terneros < 6 meses — Fenbendazol 25% (alternado con Levamisol 15%)
  // Primer turno con Fenbendazol, segundo con Levamisol; secuencia cada 30 días
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-terneros-fenbendazol' },
    update: {},
    create: {
      id: 'cal-desp-terneros-fenbendazol',
      nombreVacuna: 'Desparasitación Terneros — Fenbendazol 25%',
      descripcion: 'Terneros hasta seis meses de edad. Gastrointestinales y pulmonares. Aplicar la primera vez y alternar al mes siguiente con Levamisol 15%, luego volver a Fenbendazol; mantener secuencia hasta los 6 meses. 1 ml por cada 50 kg PV vía oral.',
      intervaloDias: 60,
      edadMinimasDias: 0,
      medicamentoId: fenbendazol25.id,
    },
  });

  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-terneros-levamisol' },
    update: {},
    create: {
      id: 'cal-desp-terneros-levamisol',
      nombreVacuna: 'Desparasitación Terneros — Levamisol 15%',
      descripcion: 'Terneros hasta seis meses de edad. Gastrointestinales y pulmonares. Aplicar el mes siguiente al Fenbendazol 25% y continuar alternando. 1 ml por cada 30 kg PV vía intramuscular.',
      intervaloDias: 60,
      edadMinimasDias: 0,
      medicamentoId: levamisol15.id,
    },
  });

  // Animales mayores de 6 meses EN PRODUCCIÓN LÁCTEA — Fenbendazol 25% cada 4 meses
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-lactea-fenbendazol' },
    update: {},
    create: {
      id: 'cal-desp-lactea-fenbendazol',
      nombreVacuna: 'Desparasitación Producción Láctea — Fenbendazol 25%',
      descripcion: 'Animales mayores de 6 meses en producción láctea. Gastrointestinales y pulmonares. Cada 4 meses. 1 ml por cada 50 kg PV vía oral.',
      intervaloDias: 120,
      edadMinimasDias: 180,
      medicamentoId: fenbendazol25.id,
    },
  });

  // Animales SECOS (no en producción láctea) — protocolo completo cada 4 meses
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-secos-ivermectina' },
    update: {},
    create: {
      id: 'cal-desp-secos-ivermectina',
      nombreVacuna: 'Desparasitación Animales Secos — Ivermectina 3,15%',
      descripcion: 'Animales secos mayores de 6 meses (no en producción láctea). Gastrointestinales, pulmonares y ectoparásitos. Cada 4 meses. 1 ml por cada 50 kg PV vía subcutánea.',
      intervaloDias: 120,
      edadMinimasDias: 180,
      medicamentoId: ivermectina315.id,
    },
  });

  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-secos-lombifarm' },
    update: {},
    create: {
      id: 'cal-desp-secos-lombifarm',
      nombreVacuna: 'Desparasitación Animales Secos — Lombifarm',
      descripcion: 'Animales secos mayores de 6 meses. Gastrointestinales y hepáticos. Cada 4 meses. 1 ml por cada 10 kg PV vía oral.',
      intervaloDias: 120,
      edadMinimasDias: 180,
      medicamentoId: lombifarm.id,
    },
  });

  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-secos-doramectina' },
    update: {},
    create: {
      id: 'cal-desp-secos-doramectina',
      nombreVacuna: 'Desparasitación Animales Secos — Doramectina 1%',
      descripcion: 'Animales secos mayores de 6 meses. Pulmonares y ectoparásitos. Cada 4 meses. 1 ml por cada 50 kg PV vía subcutánea.',
      intervaloDias: 120,
      edadMinimasDias: 180,
      medicamentoId: doramectina1.id,
    },
  });

  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desp-secos-tratoril' },
    update: {},
    create: {
      id: 'cal-desp-secos-tratoril',
      nombreVacuna: 'Desparasitación Animales Secos — Tratoril (Toltrazuril 5%)',
      descripcion: 'Animales secos mayores de 6 meses. Coccidiosis intestinal. Cada 4 meses. 3 ml por cada 10 kg PV vía oral.',
      intervaloDias: 120,
      edadMinimasDias: 180,
      medicamentoId: tratoril.id,
    },
  });

  // Mantener entrada legacy de desparasitación con Ivermectina 1% (ya existía en BD)
  await prisma.calendarioVacunacion.upsert({
    where: { id: 'cal-desparasitacion' },
    update: {},
    create: {
      id: 'cal-desparasitacion',
      nombreVacuna: 'Desparasitación (Ivermectina 1%)',
      descripcion: 'Control de parásitos externos e internos cada 3 meses (protocolo legacy)',
      intervaloDias: 90,
      medicamentoId: ivermectina.id,
    },
  });

  console.log('Calendarios de vacunación y desparasitación creados');

  // ----------------------------------------------------------
  // 7. SEMENTALES DEL LABORATORIO
  // ----------------------------------------------------------
  const sementalNegro = await prisma.semental.upsert({
    where: { registro: 'SEM-001-BRAH' },
    update: {},
    create: {
      nombre: 'Campolargo Negro',
      registro: 'SEM-001-BRAH',
      origen: 'Venezuela',
      razaId: razaBrahman.id,
      observaciones: 'Semental élite de la finca. Alta progenie comprobada.',
    },
  });

  const sementalMaestro = await prisma.semental.upsert({
    where: { registro: 'SEM-002-SEN' },
    update: {},
    create: {
      nombre: 'Maestro Senepol',
      registro: 'SEM-002-SEN',
      origen: 'Brasil',
      razaId: razaSenepol.id,
      observaciones: 'Importado. Excelentes características de carne y adaptación.',
    },
  });

  // Inventario de semen
  await prisma.inventarioSemen.upsert({
    where: { codigoDosis: 'DOS-NEGRO-001' },
    update: {},
    create: {
      codigoDosis: 'DOS-NEGRO-001',
      sementalId: sementalNegro.id,
      cantidadDosis: 50,
      cantidadUsada: 12,
      motivilidad: 78.5,
      concentracion: 85.0,
      fechaVencimiento: new Date('2027-06-30'),
    },
  });

  await prisma.inventarioSemen.upsert({
    where: { codigoDosis: 'DOS-MAESTRO-001' },
    update: {},
    create: {
      codigoDosis: 'DOS-MAESTRO-001',
      sementalId: sementalMaestro.id,
      cantidadDosis: 35,
      cantidadUsada: 8,
      motivilidad: 82.0,
      concentracion: 91.0,
      fechaVencimiento: new Date('2027-03-15'),
    },
  });

  console.log('Sementales e inventario de semen cargados');

  // ----------------------------------------------------------
  // 8. ANIMALES (muestra representativa de las ~550 reses)
  // ----------------------------------------------------------
  // Se crean 30 animales de ejemplo distribuidos en las 3 fincas.
  // El seed completo de 550 animales está en seed-animales-completo.ts

  const animalesParaiso = [
    { numeroIdentificacion: 'ELP-001', nombre: 'La Princesa', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteParaisoA.id, pesoActual: 420 },
    { numeroIdentificacion: 'ELP-002', nombre: 'La Reina', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteParaisoA.id, pesoActual: 445 },
    { numeroIdentificacion: 'ELP-003', nombre: 'Estrella', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.CARNE, razaId: razaSenepol.id, loteId: loteParaisoA.id, pesoActual: 390 },
    { numeroIdentificacion: 'ELP-004', nombre: 'Tornado', sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.TAUROMAQUIA, razaId: razaCasta.id, loteId: loteParaisoB.id, pesoActual: 520 },
    { numeroIdentificacion: 'ELP-005', nombre: 'Vendaval', sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.TAUROMAQUIA, razaId: razaCasta.id, loteId: loteParaisoB.id, pesoActual: 490 },
    { numeroIdentificacion: 'ELP-006', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteParaisoC.id, pesoActual: 320 },
    { numeroIdentificacion: 'ELP-007', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteParaisoC.id, pesoActual: 310 },
    { numeroIdentificacion: 'ELP-008', nombre: 'La Morena', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteParaisoA.id, pesoActual: 410, estadoSanitario: EstadoSanitario.EN_TRATAMIENTO },
    { numeroIdentificacion: 'ELP-009', nombre: 'La Canela', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.CARNE_LECHE, razaId: razaSenepol.id, loteId: loteParaisoA.id, pesoActual: 380 },
    { numeroIdentificacion: 'ELP-010', nombre: 'Rayo', sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.TAUROMAQUIA, razaId: razaCasta.id, loteId: loteParaisoB.id, pesoActual: 475 },
  ];

  const animalesCampoAlegre = [
    { numeroIdentificacion: 'CAL-001', nombre: 'Bella', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteCampoAlegreA.id, pesoActual: 430 },
    { numeroIdentificacion: 'CAL-002', nombre: 'Paloma', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaSenepol.id, loteId: loteCampoAlegreA.id, pesoActual: 405 },
    { numeroIdentificacion: 'CAL-003', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteCampoAlegreB.id, pesoActual: 380 },
    { numeroIdentificacion: 'CAL-004', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaSenepol.id, loteId: loteCampoAlegreB.id, pesoActual: 395 },
    { numeroIdentificacion: 'CAL-005', nombre: 'La Gorda', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteCampoAlegreA.id, pesoActual: 460 },
    { numeroIdentificacion: 'CAL-006', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaCebu.id, loteId: loteCampoAlegreB.id, pesoActual: 345 },
    { numeroIdentificacion: 'CAL-007', nombre: 'Consentida', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaSenepol.id, loteId: loteCampoAlegreA.id, pesoActual: 415 },
    { numeroIdentificacion: 'CAL-008', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteCampoAlegreB.id, pesoActual: 412 },
    { numeroIdentificacion: 'CAL-009', nombre: 'Mimosa', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.CARNE_LECHE, razaId: razaSenepol.id, loteId: loteCampoAlegreA.id, pesoActual: 395 },
    { numeroIdentificacion: 'CAL-010', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteCampoAlegreB.id, pesoActual: 368 },
  ];

  const animalesLasPenas = [
    { numeroIdentificacion: 'LPN-001', nombre: null, sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteLasPenasB.id, pesoActual: 285 },
    { numeroIdentificacion: 'LPN-002', nombre: null, sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaSenepol.id, loteId: loteLasPenasB.id, pesoActual: 295 },
    { numeroIdentificacion: 'LPN-003', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteLasPenasA.id, pesoActual: 220 },
    { numeroIdentificacion: 'LPN-004', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteLasPenasA.id, pesoActual: 240 },
    { numeroIdentificacion: 'LPN-005', nombre: 'Fresita', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaSenepol.id, loteId: loteLasPenasB.id, pesoActual: 270 },
    { numeroIdentificacion: 'LPN-006', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaCebu.id, loteId: loteLasPenasA.id, pesoActual: 195 },
    { numeroIdentificacion: 'LPN-007', nombre: null, sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteLasPenasB.id, pesoActual: 260 },
    { numeroIdentificacion: 'LPN-008', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaSenepol.id, loteId: loteLasPenasA.id, pesoActual: 230 },
    { numeroIdentificacion: 'LPN-009', nombre: 'Manchita', sexo: Sexo.HEMBRA, proposito: TipoPropositoAnimal.REPRODUCCION, razaId: razaBrahman.id, loteId: loteLasPenasB.id, pesoActual: 290 },
    { numeroIdentificacion: 'LPN-010', nombre: null, sexo: Sexo.MACHO, proposito: TipoPropositoAnimal.CARNE, razaId: razaBrahman.id, loteId: loteLasPenasA.id, pesoActual: 215 },
  ];

  const todosLosAnimales = [...animalesParaiso, ...animalesCampoAlegre, ...animalesLasPenas];

  for (const datosAnimal of todosLosAnimales) {
    await prisma.animal.upsert({
      where: { numeroIdentificacion: datosAnimal.numeroIdentificacion },
      update: {},
      create: {
        ...datosAnimal,
        fechaNacimiento: new Date(Date.now() - Math.random() * 5 * 365 * 24 * 60 * 60 * 1000),
        color: ['Pardo', 'Negro', 'Blanco', 'Colorado', 'Bayero', 'Pinto'][Math.floor(Math.random() * 6)],
        estadoSanitario: datosAnimal.estadoSanitario ?? EstadoSanitario.SANO,
      },
    });
  }

  console.log(`${todosLosAnimales.length} animales de muestra cargados`);

  // ----------------------------------------------------------
  // 9. REGLAS DE ALERTA POR DEFECTO
  // ----------------------------------------------------------
  const reglasAlerta = [
    {
      id: 'regla-vacuna-proxima',
      nombre: 'Vacuna próxima a vencer',
      tipoAlerta: TipoAlertaRegla.VACUNA_PROXIMA,
      prioridad: PrioridadAlerta.ALTA,
      umbralValor: 7,
      umbralUnidad: 'dias',
      usuarioIds: [veterinario.id, administrador.id],
    },
    {
      id: 'regla-vacuna-vencida',
      nombre: 'Vacuna vencida',
      tipoAlerta: TipoAlertaRegla.VACUNA_VENCIDA,
      prioridad: PrioridadAlerta.CRITICA,
      umbralValor: 0,
      umbralUnidad: 'dias',
      usuarioIds: [veterinario.id, administrador.id, tecnico.id],
    },
    {
      id: 'regla-parto-proximo',
      nombre: 'Parto próximo (7 días)',
      tipoAlerta: TipoAlertaRegla.PARTO_PROXIMO,
      prioridad: PrioridadAlerta.ALTA,
      umbralValor: 7,
      umbralUnidad: 'dias',
      usuarioIds: [veterinario.id, administrador.id, tecnico.id],
    },
    {
      id: 'regla-dias-abiertos',
      nombre: 'Días abiertos excedidos',
      tipoAlerta: TipoAlertaRegla.DIAS_ABIERTOS_EXCEDIDOS,
      prioridad: PrioridadAlerta.MEDIA,
      umbralValor: 90,
      umbralUnidad: 'dias',
      usuarioIds: [veterinario.id],
    },
    {
      id: 'regla-enfermedad-activa',
      nombre: 'Enfermedad activa sin resolución',
      tipoAlerta: TipoAlertaRegla.ENFERMEDAD_ACTIVA_SIN_RESOLUCION,
      prioridad: PrioridadAlerta.ALTA,
      umbralValor: 14,
      umbralUnidad: 'dias',
      usuarioIds: [veterinario.id, administrador.id],
    },
    {
      id: 'regla-inventario-semen',
      nombre: 'Inventario de semen bajo',
      tipoAlerta: TipoAlertaRegla.INVENTARIO_SEMEN_BAJO,
      prioridad: PrioridadAlerta.MEDIA,
      umbralValor: 10,
      umbralUnidad: 'unidades',
      usuarioIds: [administrador.id, veterinario.id],
    },
  ];

  for (const { usuarioIds, ...regla } of reglasAlerta) {
    await prisma.reglaAlerta.upsert({
      where: { id: regla.id },
      update: {},
      create: {
        ...regla,
        creadoPorId: administrador.id,
        usuariosNotificados: { create: usuarioIds.map((usuarioId) => ({ usuarioId })) },
      },
    });
  }

  console.log('Reglas de alerta por defecto creadas');

  // ----------------------------------------------------------
  // 10. DISPOSITIVOS GPS Y REGISTROS DE UBICACIÓN (datos de prueba)
  // ----------------------------------------------------------
  // Mientras no hay trackers IoT reales en campo, se simula el flujo completo
  // tal como quedará cuando se configuren: un DispositivoGPS por animal (con
  // su propia apiKey, igual que un dispositivo real) y su historial de
  // posiciones, con velocidad instantánea incluida, para que los reportes de
  // movilidad (distancia, tiempo de actividad, velocidad promedio) tengan
  // datos reales con los que calcular.
  const animalesParaGPS = await prisma.animal.findMany({
    where: { lote: { fincaId: fincaParaiso.id } },
    take: 5,
    select: { id: true, numeroIdentificacion: true },
  });

  let numeroDispositivo = 1;
  for (const animal of animalesParaGPS) {
    const dispositivo = await prisma.dispositivoGPS.upsert({
      where: { animalId: animal.id },
      update: {},
      create: {
        codigoDispositivo: `GPS-ELP-${String(numeroDispositivo).padStart(3, '0')}`,
        modelo: 'ESP32-GPS',
        fabricante: 'Genérico',
        apiKey: `sim_${animal.numeroIdentificacion.toLowerCase()}_${Math.random().toString(36).slice(2, 10)}`,
        nivelBateria: 60 + Math.round(Math.random() * 40),
        animalId: animal.id,
      },
    });

    // Los primeros 3 dispositivos simulan estar reportando activamente
    // (última señal hace pocos minutos); los últimos 2 simulan llevar horas
    // desconectados, para que el estado "en línea" del panel sea realista.
    const desconectado = numeroDispositivo > 3;
    const finRecorridoMs = desconectado
      ? Date.now() - 20 * 60 * 60 * 1000
      : Date.now() - numeroDispositivo * 60 * 1000;
    numeroDispositivo += 1;

    // Recorrido simulado tipo "caminata" (cada punto parte del anterior, no
    // de un centro fijo), con velocidad de pastoreo.
    let lat = 10.1875 + (Math.random() - 0.5) * 0.01;
    let lng = -68.5234 + (Math.random() - 0.5) * 0.01;
    const puntos = 8;
    let ultimaFecha = new Date(finRecorridoMs);
    for (let i = puntos - 1; i >= 0; i--) {
      lat += (Math.random() - 0.5) * 0.0015;
      lng += (Math.random() - 0.5) * 0.0015;
      const fechaRegistro = new Date(finRecorridoMs - i * 3 * 60 * 60 * 1000); // cada 3 horas
      if (i === 0) ultimaFecha = fechaRegistro;
      await prisma.registroUbicacion.create({
        data: {
          animalId: animal.id,
          dispositivoGPSId: dispositivo.id,
          latitud: lat,
          longitud: lng,
          altitud: 450 + Math.random() * 50,
          precision: 5 + Math.random() * 10,
          velocidad: +(Math.random() * 3).toFixed(1), // pastoreo: 0-3 km/h aprox.
          fechaRegistro,
        },
      });
    }

    await prisma.dispositivoGPS.update({
      where: { id: dispositivo.id },
      data: {
        ultimaConexion: ultimaFecha,
        estado: desconectado ? 'SIN_SEÑAL' : 'ACTIVO',
      },
    });
  }

  console.log('Dispositivos GPS y registros de ubicación de prueba creados');

  // ----------------------------------------------------------
  // 11. POTREROS (subdivisiones de cada lote)
  // ----------------------------------------------------------
  const lotesParaPotreros = [
    { lote: loteParaisoA, prefijo: 'PA-A' },
    { lote: loteParaisoB, prefijo: 'PA-B' },
    { lote: loteParaisoC, prefijo: 'PA-C' },
    { lote: loteCampoAlegreA, prefijo: 'CA-A' },
    { lote: loteCampoAlegreB, prefijo: 'CA-B' },
    { lote: loteLasPenasA, prefijo: 'LP-A' },
    { lote: loteLasPenasB, prefijo: 'LP-B' },
  ];

  for (const { lote, prefijo } of lotesParaPotreros) {
    for (let n = 1; n <= 2; n++) {
      const id = `potrero-${prefijo}-${n}`;
      await prisma.potrero.upsert({
        where: { id },
        update: {},
        create: {
          id,
          nombre: `Potrero ${prefijo}-${n}`,
          hectareas: 8 + Math.round(Math.random() * 12),
          descripcion: n === 1 ? 'Pastoreo rotativo principal' : 'Potrero de descanso',
          loteId: lote.id,
        },
      });
    }
  }
  console.log('Potreros creados');

  // Animales de referencia reutilizados en las secciones clínicas y
  // reproductivas siguientes (ya existen, creados en la sección 8).
  const aretesNecesarios = [
    'ELP-001', 'ELP-002', 'ELP-003', 'ELP-008', 'ELP-009',
    'CAL-001', 'CAL-002', 'CAL-005', 'CAL-007', 'CAL-009',
    'LPN-001', 'LPN-002', 'LPN-005', 'LPN-009',
  ];
  const animalesPorArete = Object.fromEntries(
    (await prisma.animal.findMany({ where: { numeroIdentificacion: { in: aretesNecesarios } } }))
      .map((a) => [a.numeroIdentificacion, a])
  );

  // ----------------------------------------------------------
  // 12. HISTORIALES MÉDICOS (consultas, diagnósticos y tratamientos)
  // ----------------------------------------------------------
  const historialMorena = await prisma.historialMedico.upsert({
    where: { id: 'hist-elp008-1' },
    update: {},
    create: {
      id: 'hist-elp008-1',
      animalId: animalesPorArete['ELP-008'].id,
      veterinarioId: veterinario.id,
      fechaConsulta: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      motivoConsulta: 'Disminución de apetito y descarga nasal',
      sintomasObservados: 'Letargo, mucosidad nasal, tos ocasional',
      temperatura: 39.8,
      frecuenciaCardiaca: 76,
      frecuenciaRespiratoria: 32,
      tiempoLlenadoCapilar: 2,
      movimientosRuminales: 1,
      condicionCorporal: 3,
      estadoReproductivo: 'LACTANTE',
      litrosLechesDiarios: 6.5,
      diagnosticoDefinitivo: 'Mastitis clínica en cuarto posterior izquierdo',
      estadoSanitario: 'EN_TRATAMIENTO',
    },
  });

  const enfMorena = await prisma.enfermedadDiagnosticada.upsert({
    where: { id: 'enf-elp008-mastitis' },
    update: {},
    create: {
      id: 'enf-elp008-mastitis',
      historialMedicoId: historialMorena.id,
      nombreEnfermedad: 'Mastitis clínica',
      nivelGravedad: 'MODERADA',
      fechaInicio: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      activa: true,
      descripcionClinica: 'Inflamación y endurecimiento del cuarto posterior izquierdo, secreción anormal',
      sintomas: 'Calor local, dolor a la palpación, leche con grumos',
      tiempoEvolucion: '3 días',
      diagnosticoDefinitivo: 'Mastitis clínica bacteriana',
      pronostico: 'Favorable con tratamiento antibiótico',
      planDiagnostico: 'Cultivo de leche si no hay mejoría en 5 días',
    },
  });

  await prisma.tratamiento.upsert({
    where: { id: 'trat-elp008-oxitetraciclina' },
    update: {},
    create: {
      id: 'trat-elp008-oxitetraciclina',
      historialMedicoId: historialMorena.id,
      enfermedadDiagnosticadaId: enfMorena.id,
      medicamentoId: oxitetraciclina.id,
      fechaInicio: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dosis: '15 ml',
      viaAdministracion: 'Intramuscular',
      frecuencia: 'Cada 24 horas',
      duracionDias: 5,
      estado: 'EN_CURSO',
      respuestaTratamiento: 'Mejoría parcial, disminución de la inflamación',
    },
  });

  await prisma.informacionEpidemiologica.upsert({
    where: { historialMedicoId: historialMorena.id },
    update: {},
    create: {
      historialMedicoId: historialMorena.id,
      garrapatas: true,
      mosquitos: false,
      murcielagos: false,
      moscas: true,
      otrosVectores: 'Tábanos ocasionales',
      descripcionEntorno: 'Potrero con zona húmeda cerca del bebedero',
      veterinarioRegistroId: veterinario.id,
    },
  });

  await prisma.pruebaComplementaria.upsert({
    where: { id: 'prueba-elp008-hematologia' },
    update: {},
    create: {
      id: 'prueba-elp008-hematologia',
      historialMedicoId: historialMorena.id,
      tipo: 'HEMATOLOGIA',
      fecha: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      resultado: 'Leucocitosis leve con neutrofilia, compatible con proceso infeccioso localizado',
      observaciones: 'Hematocrito dentro de rango',
    },
  });

  await prisma.historialMedico.upsert({
    where: { id: 'hist-cal005-1' },
    update: {},
    create: {
      id: 'hist-cal005-1',
      animalId: animalesPorArete['CAL-005'].id,
      veterinarioId: veterinario.id,
      fechaConsulta: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      motivoConsulta: 'Control sanitario de rutina',
      temperatura: 38.4,
      frecuenciaCardiaca: 68,
      frecuenciaRespiratoria: 24,
      condicionCorporal: 3.5,
      resultadosPruebas: 'Tuberculosis: negativo. Brucelosis: negativo. Control anual al día.',
      diagnosticoDefinitivo: 'Animal sano, sin hallazgos relevantes',
    },
  });

  await prisma.pruebaComplementaria.upsert({
    where: { id: 'prueba-cal005-coprologia' },
    update: {},
    create: {
      id: 'prueba-cal005-coprologia',
      historialMedicoId: 'hist-cal005-1',
      tipo: 'COPROLOGIA',
      fecha: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      resultado: 'Negativo a huevos de parásitos gastrointestinales',
    },
  });

  const historialFresita = await prisma.historialMedico.upsert({
    where: { id: 'hist-lpn005-1' },
    update: {},
    create: {
      id: 'hist-lpn005-1',
      animalId: animalesPorArete['LPN-005'].id,
      veterinarioId: tecnico.id,
      fechaConsulta: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      motivoConsulta: 'Distensión abdominal tras cambio de potrero',
      sintomasObservados: 'Abdomen distendido del lado izquierdo, inquietud',
      temperatura: 38.9,
      frecuenciaCardiaca: 88,
      movimientosRuminales: 0,
      diagnosticoDefinitivo: 'Timpanismo espumoso leve',
    },
  });

  const enfFresita = await prisma.enfermedadDiagnosticada.upsert({
    where: { id: 'enf-lpn005-timpanismo' },
    update: {},
    create: {
      id: 'enf-lpn005-timpanismo',
      historialMedicoId: historialFresita.id,
      nombreEnfermedad: 'Timpanismo espumoso',
      nivelGravedad: 'LEVE',
      fechaInicio: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      fechaResolucion: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000),
      activa: false,
      descripcionClinica: 'Distensión ruminal por exceso de forraje leguminoso tierno',
      pronostico: 'Favorable, resuelto sin complicaciones',
    },
  });

  await prisma.tratamiento.upsert({
    where: { id: 'trat-lpn005-antibiotico' },
    update: {},
    create: {
      id: 'trat-lpn005-antibiotico',
      historialMedicoId: historialFresita.id,
      enfermedadDiagnosticadaId: enfFresita.id,
      medicamentoId: oxitetraciclina.id,
      fechaInicio: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      fechaFin: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000),
      dosis: '10 ml',
      viaAdministracion: 'Intramuscular',
      frecuencia: 'Dosis única',
      duracionDias: 1,
      estado: 'COMPLETADO',
      respuestaTratamiento: 'Resolución completa sin complicaciones',
    },
  });

  console.log('Historiales médicos, diagnósticos y tratamientos creados');

  // ----------------------------------------------------------
  // 13. PROGRAMA DE DESPARASITACIÓN (aplicado directo al animal)
  // ----------------------------------------------------------
  const desparasitaciones = [
    { arete: 'ELP-001', tipo: 'ENDOPARASITO', medicamento: fenbendazol25, dosis: '9 ml', via: 'Oral', dias: 10 },
    { arete: 'ELP-009', tipo: 'AMBOS', medicamento: ivermectina315, dosis: '8 ml', via: 'Subcutánea', dias: 25 },
    { arete: 'CAL-001', tipo: 'ENDOPARASITO', medicamento: levamisol15, dosis: '14 ml', via: 'Intramuscular', dias: 15 },
    { arete: 'CAL-007', tipo: 'AMBOS', medicamento: doramectina1, dosis: '8 ml', via: 'Subcutánea', dias: 60 },
    { arete: 'LPN-001', tipo: 'ENDOPARASITO', medicamento: lombifarm, dosis: '29 ml', via: 'Oral', dias: 5 },
    { arete: 'LPN-009', tipo: 'ENDOPARASITO', medicamento: fenbendazol25, dosis: '6 ml', via: 'Oral', dias: 90 },
  ] as const;

  for (const [i, d] of desparasitaciones.entries()) {
    await prisma.programaDesparasitacion.upsert({
      where: { id: `desp-${d.arete.toLowerCase()}-${i}` },
      update: {},
      create: {
        id: `desp-${d.arete.toLowerCase()}-${i}`,
        animalId: animalesPorArete[d.arete].id,
        medicamentoId: d.medicamento.id,
        veterinarioId: tecnico.id,
        tipo: d.tipo,
        fecha: new Date(Date.now() - d.dias * 24 * 60 * 60 * 1000),
        dosis: d.dosis,
        via: d.via,
      },
    });
  }
  console.log('Programa de desparasitación creado');

  // ----------------------------------------------------------
  // 13B. REGISTRO DE VITAMINAS (aplicado directo al animal)
  // ----------------------------------------------------------
  const aplicacionesVitaminas = [
    { arete: 'ELP-001', dosis: '5 ml', via: 'Intramuscular', dias: 30 },
    { arete: 'ELP-008', dosis: '6 ml', via: 'Intramuscular', dias: 5 },
    { arete: 'CAL-002', dosis: '5 ml', via: 'Intramuscular', dias: 45 },
  ] as const;

  for (const [i, v] of aplicacionesVitaminas.entries()) {
    await prisma.registroVitaminas.upsert({
      where: { id: `vit-${v.arete.toLowerCase()}-${i}` },
      update: {},
      create: {
        id: `vit-${v.arete.toLowerCase()}-${i}`,
        animalId: animalesPorArete[v.arete].id,
        medicamentoId: vitaminaADE.id,
        veterinarioId: veterinario.id,
        fecha: new Date(Date.now() - v.dias * 24 * 60 * 60 * 1000),
        dosis: v.dosis,
        via: v.via,
      },
    });
  }
  console.log('Registro de vitaminas creado');

  // ----------------------------------------------------------
  // 14. REGISTROS DE VACUNACIÓN
  // ----------------------------------------------------------
  const registrosVacunacion = [
    { arete: 'ELP-001', cal: 'cal-fiebre-aftosa', dias: 170, proximaEnDias: 10 },
    { arete: 'ELP-002', cal: 'cal-fiebre-aftosa', dias: 175, proximaEnDias: 5 },
    { arete: 'ELP-008', cal: 'cal-triple-carbon', dias: 350, proximaEnDias: 15 },
    { arete: 'ELP-009', cal: 'cal-ibr-dvb-lepto', dias: 300, proximaEnDias: 65 },
    { arete: 'CAL-001', cal: 'cal-brucelosis', dias: 200, proximaEnDias: null },
    { arete: 'CAL-002', cal: 'cal-rabia-bovina', dias: 360, proximaEnDias: 5 },
    { arete: 'CAL-005', cal: 'cal-carbon-bacteridiano', dias: 400, proximaEnDias: -35 }, // vencida
    { arete: 'CAL-009', cal: 'cal-anaplasmosis-babesiosis', dias: 170, proximaEnDias: 10 },
    { arete: 'LPN-001', cal: 'cal-triple-carbon', dias: 40, proximaEnDias: 325 },
    { arete: 'LPN-005', cal: 'cal-fiebre-aftosa', dias: 20, proximaEnDias: 160 },
  ] as const;

  for (const [i, r] of registrosVacunacion.entries()) {
    const fechaAplicacion = new Date(Date.now() - r.dias * 24 * 60 * 60 * 1000);
    await prisma.registroVacunacion.upsert({
      where: { id: `vac-${r.arete.toLowerCase()}-${i}` },
      update: {},
      create: {
        id: `vac-${r.arete.toLowerCase()}-${i}`,
        animalId: animalesPorArete[r.arete].id,
        calendarioVacunacionId: r.cal,
        aplicadoPorId: veterinario.id,
        fechaAplicacion,
        proximaFecha: r.proximaEnDias != null
          ? new Date(Date.now() + r.proximaEnDias * 24 * 60 * 60 * 1000)
          : null,
      },
    });
  }
  console.log('Registros de vacunación creados');

  // ----------------------------------------------------------
  // 15. REPRODUCCIÓN: inseminaciones, diagnósticos, gestaciones y partos
  // ----------------------------------------------------------
  const dosisNegro = await prisma.inventarioSemen.findUniqueOrThrow({ where: { codigoDosis: 'DOS-NEGRO-001' } });
  const dosisMaestro = await prisma.inventarioSemen.findUniqueOrThrow({ where: { codigoDosis: 'DOS-MAESTRO-001' } });

  // ── Inseminación artificial reciente sin diagnóstico todavía ──
  const eventoIA1 = await prisma.eventoReproductivo.upsert({
    where: { id: 'evrep-ia-elp001' },
    update: {},
    create: {
      id: 'evrep-ia-elp001',
      animalId: animalesPorArete['ELP-001'].id,
      registradoPorId: veterinario.id,
      tipo: 'INSEMINACION_ARTIFICIAL',
      fecha: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.inseminacionArtificial.upsert({
    where: { eventoReproductivoId: eventoIA1.id },
    update: {},
    create: {
      eventoReproductivoId: eventoIA1.id,
      inventarioSemenId: dosisNegro.id,
      tipo: 'SEMEN_CONGELADO',
      fechaInseminacion: eventoIA1.fecha,
      numeroIntento: 1,
      clasificacionIA: 'CELO_DETECTADO',
      tecnicaDeposicion: 'INTRAUTERINA_RECTOVAGINAL',
      manejoHato: 'BAJO',
    },
  });

  // ── Inseminación con diagnóstico positivo → gestación en curso ──
  const eventoIA2 = await prisma.eventoReproductivo.upsert({
    where: { id: 'evrep-ia-cal001' },
    update: {},
    create: {
      id: 'evrep-ia-cal001',
      animalId: animalesPorArete['CAL-001'].id,
      registradoPorId: veterinario.id,
      tipo: 'INSEMINACION_ARTIFICIAL',
      fecha: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.inseminacionArtificial.upsert({
    where: { eventoReproductivoId: eventoIA2.id },
    update: {},
    create: {
      eventoReproductivoId: eventoIA2.id,
      inventarioSemenId: dosisMaestro.id,
      tipo: 'SEMEN_CONGELADO',
      fechaInseminacion: eventoIA2.fecha,
      numeroIntento: 1,
      clasificacionIA: 'TIEMPO_FIJO',
      tecnicaDeposicion: 'INTRAUTERINA_PROFUNDA',
      manejoHato: 'MEDIO',
    },
  });

  const eventoDiag1 = await prisma.eventoReproductivo.upsert({
    where: { id: 'evrep-diag-cal001' },
    update: {},
    create: {
      id: 'evrep-diag-cal001',
      animalId: animalesPorArete['CAL-001'].id,
      registradoPorId: veterinario.id,
      tipo: 'DIAGNOSTICO_GESTACION',
      fecha: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
  });

  const gestacionCal001 = await prisma.gestacion.upsert({
    where: { id: 'gest-cal001-1' },
    update: {},
    create: {
      id: 'gest-cal001-1',
      madreId: animalesPorArete['CAL-001'].id,
      eventoReproductivoId: eventoIA2.id,
      fechaInicio: eventoIA2.fecha,
      fechaPartoEsperado: new Date(eventoIA2.fecha.getTime() + 283 * 24 * 60 * 60 * 1000),
      estadoGestacion: 'EN_CURSO',
    },
  });

  await prisma.diagnosticoGestacion.upsert({
    where: { eventoReproductivoId: eventoDiag1.id },
    update: {},
    create: {
      eventoReproductivoId: eventoDiag1.id,
      gestacionId: gestacionCal001.id,
      fechaDiagnostico: eventoDiag1.fecha,
      resultado: 'POSITIVO',
      metodoDiagnostico: 'Ecografía transrectal',
      semanaGestacion: 4,
    },
  });

  // ── Diagnóstico negativo sin gestación asociada ──
  const eventoDiag2 = await prisma.eventoReproductivo.upsert({
    where: { id: 'evrep-diag-lpn009' },
    update: {},
    create: {
      id: 'evrep-diag-lpn009',
      animalId: animalesPorArete['LPN-009'].id,
      registradoPorId: veterinario.id,
      tipo: 'DIAGNOSTICO_GESTACION',
      fecha: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.diagnosticoGestacion.upsert({
    where: { eventoReproductivoId: eventoDiag2.id },
    update: {},
    create: {
      eventoReproductivoId: eventoDiag2.id,
      fechaDiagnostico: eventoDiag2.fecha,
      resultado: 'NEGATIVO',
      metodoDiagnostico: 'Palpación rectal',
      observaciones: 'Repetir servicio en el próximo celo',
    },
  });

  // ── Gestación próxima a parir (para el módulo de alertas) ──
  const gestacionBella = await prisma.gestacion.upsert({
    where: { id: 'gest-cal-bella-1' },
    update: {},
    create: {
      id: 'gest-cal-bella-1',
      madreId: animalesPorArete['CAL-002'].id,
      fechaInicio: new Date(Date.now() - 270 * 24 * 60 * 60 * 1000),
      fechaPartoEsperado: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      estadoGestacion: 'EN_CURSO',
      observaciones: 'Gestación sin complicaciones hasta el momento',
    },
  });

  // ── Gestación ya finalizada, con su parto registrado ──
  const gestacionFinalizada = await prisma.gestacion.upsert({
    where: { id: 'gest-lpn002-1' },
    update: {},
    create: {
      id: 'gest-lpn002-1',
      madreId: animalesPorArete['LPN-002'].id,
      fechaInicio: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000),
      fechaPartoEsperado: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000),
      fechaPartoReal: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
      estadoGestacion: 'FINALIZADA_PARTO',
    },
  });

  await prisma.nacimiento.upsert({
    where: { id: 'nac-lpn002-1' },
    update: {},
    create: {
      id: 'nac-lpn002-1',
      gestacionId: gestacionFinalizada.id,
      fechaNacimiento: gestacionFinalizada.fechaPartoReal!,
      tipoParto: 'NORMAL',
      pesoAlNacer: 32,
      estadoCria: 'VIVO',
      sexoCria: 'HEMBRA',
      observaciones: 'Parto sin asistencia, cría vigorosa desde el primer momento',
    },
  });

  console.log('Eventos reproductivos, gestaciones y partos creados');

  // ----------------------------------------------------------
  // 16. NOTIFICACIONES (derivadas de reglas de alerta ya creadas)
  // ----------------------------------------------------------
  const rauVacunaProxima = await prisma.reglaAlertaUsuario.findFirst({
    where: { reglaAlertaId: 'regla-vacuna-proxima', usuarioId: veterinario.id },
  });
  const rauVacunaVencida = await prisma.reglaAlertaUsuario.findFirst({
    where: { reglaAlertaId: 'regla-vacuna-vencida', usuarioId: administrador.id },
  });
  const rauPartoProximo = await prisma.reglaAlertaUsuario.findFirst({
    where: { reglaAlertaId: 'regla-parto-proximo', usuarioId: tecnico.id },
  });
  const rauEnfermedad = await prisma.reglaAlertaUsuario.findFirst({
    where: { reglaAlertaId: 'regla-enfermedad-activa', usuarioId: veterinario.id },
  });

  const notificaciones = [
    {
      id: 'notif-vacuna-proxima-1',
      titulo: 'Vacuna próxima a vencer',
      mensaje: `El animal #${animalesPorArete['CAL-002'].numeroIdentificacion} tiene la vacuna de Rabia Bovina próxima a vencer en 5 días.`,
      prioridad: 'ALTA' as const,
      estado: 'ENVIADA' as const,
      leida: false,
      reglaUsuarioId: rauVacunaProxima?.id,
      entidadTipo: 'Animal',
      entidadId: animalesPorArete['CAL-002'].id,
    },
    {
      id: 'notif-vacuna-vencida-1',
      titulo: 'Vacuna vencida',
      mensaje: `El animal #${animalesPorArete['CAL-005'].numeroIdentificacion} tiene una vacuna de Carbón Bacteridiano vencida hace 35 días.`,
      prioridad: 'CRITICA' as const,
      estado: 'LEIDA' as const,
      leida: true,
      fechaLeida: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      reglaUsuarioId: rauVacunaVencida?.id,
      entidadTipo: 'Animal',
      entidadId: animalesPorArete['CAL-005'].id,
    },
    {
      id: 'notif-parto-proximo-1',
      titulo: 'Parto próximo (7 días)',
      mensaje: `Se estima el parto del animal #${animalesPorArete['CAL-002'].numeroIdentificacion} dentro de los próximos 5 días.`,
      prioridad: 'ALTA' as const,
      estado: 'PENDIENTE' as const,
      leida: false,
      reglaUsuarioId: rauPartoProximo?.id,
      entidadTipo: 'Gestacion',
      entidadId: gestacionBella.id,
    },
    {
      id: 'notif-enfermedad-activa-1',
      titulo: 'Enfermedad activa sin resolución',
      mensaje: `El animal #${animalesPorArete['ELP-008'].numeroIdentificacion} continúa con mastitis clínica activa desde hace 5 días.`,
      prioridad: 'ALTA' as const,
      estado: 'ENVIADA' as const,
      leida: false,
      reglaUsuarioId: rauEnfermedad?.id,
      entidadTipo: 'EnfermedadDiagnosticada',
      entidadId: enfMorena.id,
    },
    {
      id: 'notif-bienvenida-tecnico',
      titulo: 'Bienvenido al Sistema Campolargo',
      mensaje: 'Tu cuenta fue creada correctamente. Ya puedes registrar actividad de campo desde la app.',
      prioridad: 'BAJA' as const,
      estado: 'LEIDA' as const,
      leida: true,
      fechaLeida: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      usuarioId: tecnico.id,
    },
  ];

  for (const { usuarioId, reglaUsuarioId, ...notif } of notificaciones) {
    if (!usuarioId && !reglaUsuarioId) continue; // sin destinatario válido, se omite
    await prisma.notificacion.upsert({
      where: { id: notif.id },
      update: {},
      create: {
        ...notif,
        ...(usuarioId ? { usuarioId } : { reglaUsuarioId: reglaUsuarioId! }),
      },
    });
  }
  console.log('Notificaciones creadas');

  // ----------------------------------------------------------
  // 17. PLAN SANITARIO (calendario anual por finca)
  // ----------------------------------------------------------
  const anioActual = new Date().getFullYear();
  const mesActual = new Date().getMonth() + 1;
  // Solo se marcan como completados los meses que ya pasaron (según la fecha
  // de hoy), para que el resumen del dashboard muestre una mezcla realista
  // de "al día" y "pendiente/atrasado" en vez de que todo quede perfecto.
  const completadosHasta = (meses: number[], ultimoMesHecho: number) =>
    meses.filter((m) => m <= ultimoMesHecho);

  const planParaiso = await prisma.planSanitario.upsert({
    where: { fincaId_anio: { fincaId: fincaParaiso.id, anio: anioActual } },
    update: {},
    create: { fincaId: fincaParaiso.id, anio: anioActual },
  });

  const actividadesParaiso = [
    { categoria: 'HIGIENE', nombreControl: 'Higiene general', prevencion: 'Baño con jabón (BPO)', via: 'Tópica', meses: Array.from({ length: 12 }, (_, i) => i + 1), completarHasta: mesActual - 1 },
    { categoria: 'DESINFECCION', nombreControl: 'Desinfección', prevencion: 'Desinfección con yodo (BPO)', via: 'Tópica', meses: Array.from({ length: 12 }, (_, i) => i + 1), completarHasta: mesActual - 1 },
    { categoria: 'VITAMINA', nombreControl: 'Vitaminación general', prevencion: 'ADELER (4-6 ml)', via: 'Intramuscular', meses: [1, 4, 8], completarHasta: 4 },
    { categoria: 'VACUNA', nombreControl: 'Rabia', prevencion: 'Vacuna anual (2 ml)', via: 'Intramuscular', meses: [6], completarHasta: 6 },
    { categoria: 'VACUNA', nombreControl: 'Diarrea Viral Bovina', prevencion: 'Vacuna 2 dosis (2 ml)', via: 'Intramuscular', meses: [6, 7], completarHasta: 7 },
    { categoria: 'VACUNA', nombreControl: 'IBR', prevencion: 'Vacuna anual dosis única (2 ml)', tratamiento: 'Antibióticos', via: 'Intramuscular', meses: [2], completarHasta: 2 },
    { categoria: 'VACUNA', nombreControl: 'Leptospirosis', prevencion: 'Vacuna (2 ml) cuello', via: 'Intramuscular', meses: [11], completarHasta: 0 },
    { categoria: 'VACUNA', nombreControl: 'Cacho Hueco', prevencion: 'Vacuna anual (5 ml)', tratamiento: 'Oxitetraciclina 10mg/kg', via: 'Intramuscular', meses: [7], completarHasta: 7 },
    { categoria: 'VACUNA', nombreControl: 'Pierna Negra', prevencion: 'Vacuna anual, cada 5 años con bacterina', tratamiento: 'Penicilina 10.000 U/kg I.V.', via: 'Intramuscular', meses: [9], completarHasta: 9 },
    { categoria: 'VACUNA', nombreControl: 'Clostridiales', prevencion: 'Vacuna anual (5 ml)', tratamiento: 'Antibióticos, suero antitoxina', via: 'Intramuscular', meses: [3], completarHasta: 3 },
    { categoria: 'CONTROL_ECTOPARASITO', nombreControl: 'Control de garrapata', prevencion: 'Cipermetrina (baños 20ml/L agua)', via: 'Tópica', meses: Array.from({ length: 12 }, (_, i) => i + 1), completarHasta: mesActual - 1 },
    { categoria: 'CONTROL_ENDOPARASITO', nombreControl: 'Control de endoparásito', prevencion: 'Albendazol (5mg/kg)', via: 'Oral', meses: [3, 7, 10], completarHasta: 7 },
    { categoria: 'CONTROL_MOSCA', nombreControl: 'Control de mosca', prevencion: 'Bayofly (baños)', via: 'Tópica', meses: [5, 6], completarHasta: 6 },
    { categoria: 'CONTROL_PLAGAS', nombreControl: 'Control de plagas', prevencion: 'Tratamiento de instalaciones', meses: [1, 2, 10, 11], completarHasta: 2 },
  ] as const;

  for (const [i, act] of actividadesParaiso.entries()) {
    await prisma.actividadPlanSanitario.upsert({
      where: { id: `plan-paraiso-act-${i}` },
      update: {},
      create: {
        id: `plan-paraiso-act-${i}`,
        planId: planParaiso.id,
        categoria: act.categoria,
        nombreControl: act.nombreControl,
        unidadReferencia: '20 vacas',
        prevencion: act.prevencion,
        tratamiento: 'tratamiento' in act ? act.tratamiento : undefined,
        via: 'via' in act ? act.via : undefined,
        mesesProgramados: [...act.meses],
        mesesCompletados: completadosHasta([...act.meses], act.completarHasta),
      },
    });
  }

  // Plan más chico en Campo Alegre, para ver que cada finca lleva el suyo.
  const planCampoAlegre = await prisma.planSanitario.upsert({
    where: { fincaId_anio: { fincaId: fincaCampoAlegre.id, anio: anioActual } },
    update: {},
    create: { fincaId: fincaCampoAlegre.id, anio: anioActual },
  });

  const actividadesCampoAlegre = [
    { categoria: 'HIGIENE', nombreControl: 'Higiene general', prevencion: 'Baño con jabón (BPO)', via: 'Tópica', meses: Array.from({ length: 12 }, (_, i) => i + 1), completarHasta: mesActual - 1 },
    { categoria: 'CONTROL_ECTOPARASITO', nombreControl: 'Control de garrapata', prevencion: 'Cipermetrina (baños 20ml/L agua)', via: 'Tópica', meses: Array.from({ length: 12 }, (_, i) => i + 1), completarHasta: mesActual - 2 },
    { categoria: 'VACUNA', nombreControl: 'Rabia', prevencion: 'Vacuna anual (2 ml)', via: 'Intramuscular', meses: [6], completarHasta: 6 },
  ] as const;

  for (const [i, act] of actividadesCampoAlegre.entries()) {
    await prisma.actividadPlanSanitario.upsert({
      where: { id: `plan-campoalegre-act-${i}` },
      update: {},
      create: {
        id: `plan-campoalegre-act-${i}`,
        planId: planCampoAlegre.id,
        categoria: act.categoria,
        nombreControl: act.nombreControl,
        unidadReferencia: '15 vacas',
        prevencion: act.prevencion,
        via: act.via,
        mesesProgramados: [...act.meses],
        mesesCompletados: completadosHasta([...act.meses], act.completarHasta),
      },
    });
  }
  console.log('Plan sanitario creado');

  // ----------------------------------------------------------
  // RESUMEN FINAL
  // ----------------------------------------------------------
  const conteoAnimales = await prisma.animal.count();
  const conteoFincas = await prisma.finca.count();
  const conteoUsuarios = await prisma.usuario.count();

  console.log('\n✓ Seed completado exitosamente');
  console.log(`  Fincas: ${conteoFincas}`);
  console.log(`  Animales: ${conteoAnimales}`);
  console.log(`  Usuarios: ${conteoUsuarios}`);
  console.log('\nCredenciales de acceso:');
  console.log('  Administrador: admin@campolargo.com / Campolargo2026!');
  console.log('  Veterinario:   veterinario@campolargo.com / Campolargo2026!');
  console.log('  Técnico:       tecnico@campolargo.com / Campolargo2026!');
}

main()
  .catch((error) => {
    console.error('Error en el seed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
