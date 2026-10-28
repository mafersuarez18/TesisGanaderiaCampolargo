/**
 * Datos de prueba para los indicadores del dashboard (reproductivos y
 * clínicos), agregados SOBRE los datos existentes — no borra ni modifica
 * nada que no haya creado este mismo script.
 *
 *   npm run db:datos-indicadores            → (re)crea los datos de prueba
 *   npm run db:datos-indicadores -- --limpiar → solo los elimina
 *
 * Los registros se ven como datos reales (sin ninguna marca visible, para
 * que la demostración no parezca de prueba): el script los reconoce por su
 * id, que empieza con PREFIJO_ID. Volver a ejecutarlo primero elimina la
 * tanda anterior y no duplica nada.
 *
 * Qué mueve cada bloque (ver analytics.servicio.ts):
 *   - Tasa de preñez     = gestaciones EN_CURSO / hembras activas
 *   - Tasa de natalidad  = nacimientos (desde el 1/1 del año anterior) / hembras activas
 *   - Mortalidad crías   = crías muertas en los últimos 365 días / nacimientos
 *   - Días abiertos      = promedio de días desde el parto de las gestaciones FINALIZADA_PARTO
 *   - Animales tratados  = animales con tratamiento iniciado este año / animales activos
 *   - Recurrencia        = animales con la misma enfermedad ≥ 2 veces / animales con diagnóstico
 */
import { PrismaClient, EstadoAnimal, Sexo, TipoPropositoAnimal, EstadoCria, NivelGravedad } from '@prisma/client';

const prisma = new PrismaClient();
const PREFIJO_ID = 'ind-';
// Marca visible que usaban las versiones anteriores del script; solo se usa
// para limpiar los registros que todavía la tengan.
const MARCA_ANTERIOR = '[datos de prueba de indicadores]';
const DIA_MS = 24 * 60 * 60 * 1000;
const DURACION_GESTACION_DIAS = 283;

const haceDias = (dias: number) => new Date(Date.now() - dias * DIA_MS);

const deEsteScript = (campo: 'observaciones') => ({
  OR: [{ id: { startsWith: PREFIJO_ID } }, { [campo]: MARCA_ANTERIOR }],
});

async function limpiar() {
  // Alertas que apunten a gestaciones o eventos que se van a borrar.
  const [gestacionesIds, eventosIds] = await Promise.all([
    prisma.gestacion.findMany({ where: deEsteScript('observaciones'), select: { id: true } }),
    prisma.eventoReproductivo.findMany({ where: deEsteScript('observaciones'), select: { id: true } }),
  ]);
  await prisma.notificacion.deleteMany({
    where: { entidadId: { in: [...gestacionesIds, ...eventosIds].map((r) => r.id) } },
  });
  // Orden inverso a las dependencias: nacimiento → gestación (Restrict),
  // y el historial médico arrastra sus enfermedades y tratamientos (Cascade).
  const nacimientos = await prisma.nacimiento.deleteMany({ where: deEsteScript('observaciones') });
  const gestaciones = await prisma.gestacion.deleteMany({ where: deEsteScript('observaciones') });
  const eventos = await prisma.eventoReproductivo.deleteMany({ where: deEsteScript('observaciones') });
  const consultas = await prisma.historialMedico.deleteMany({ where: deEsteScript('observaciones') });
  const animales = await prisma.animal.deleteMany({ where: deEsteScript('observaciones') });
  console.log(
    `Eliminados: ${animales.count} crías, ${nacimientos.count} nacimientos, ${gestaciones.count} gestaciones, `
    + `${eventos.count} eventos reproductivos, ${consultas.count} consultas médicas`,
  );
}

async function crear() {
  const veterinario = await prisma.usuario.findFirst({
    where: { rol: { nombre: 'VETERINARIO' } },
    select: { id: true },
  }) ?? await prisma.usuario.findFirstOrThrow({ select: { id: true } });

  const hembras = await prisma.animal.findMany({
    where: { sexo: Sexo.HEMBRA, estado: EstadoAnimal.ACTIVO },
    select: { id: true, numeroIdentificacion: true, loteId: true, razaId: true },
    orderBy: { numeroIdentificacion: 'asc' },
  });
  const activos = await prisma.animal.findMany({
    where: { estado: EstadoAnimal.ACTIVO },
    select: { id: true, numeroIdentificacion: true },
    orderBy: { numeroIdentificacion: 'desc' },
  });
  const medicamentos = await prisma.medicamento.findMany({ select: { id: true, nombre: true }, take: 3 });
  if (hembras.length < 8 || activos.length < 6 || medicamentos.length === 0) {
    throw new Error('Faltan datos base (hembras activas, animales o medicamentos): ejecute primero npm run db:seed');
  }

  // ── Gestaciones en curso (tasa de preñez, partos próximos) ────────────────
  // Hembras sin gestación en curso; una con parto en ~18 días para que
  // también aparezca en "Partos próximos".
  const preniadas = await prisma.gestacion.findMany({
    where: { estadoGestacion: 'EN_CURSO' },
    select: { madreId: true },
  });
  const libres = hembras.filter((h) => !preniadas.some((g) => g.madreId === h.id));
  const diasDeGestacion = [40, 75, 110, 150, 190, 230, 265];
  for (const [i, madre] of libres.slice(0, diasDeGestacion.length).entries()) {
    const inicio = haceDias(diasDeGestacion[i]!);
    const evento = await prisma.eventoReproductivo.create({
      data: {
        id: `${PREFIJO_ID}diag-${i + 1}`,
        tipo: 'DIAGNOSTICO_GESTACION',
        fecha: new Date(inicio.getTime() + 45 * DIA_MS),
        descripcion: 'Diagnóstico de gestación positivo por ecografía',
        observaciones: 'Vesícula embrionaria y latido fetal visibles',
        animalId: madre.id,
        registradoPorId: veterinario.id,
      },
    });
    const gestacion = await prisma.gestacion.create({
      data: {
        id: `${PREFIJO_ID}gest-${i + 1}`,
        fechaInicio: inicio,
        fechaPartoEsperado: new Date(inicio.getTime() + DURACION_GESTACION_DIAS * DIA_MS),
        estadoGestacion: 'EN_CURSO',
        observaciones: 'Gestación confirmada por ecografía',
        madreId: madre.id,
        eventoReproductivoId: evento.id,
      },
    });
    await prisma.diagnosticoGestacion.create({
      data: {
        fechaDiagnostico: evento.fecha,
        resultado: 'POSITIVO',
        metodoDiagnostico: 'Ecografía',
        semanaGestacion: 6,
        eventoReproductivoId: evento.id,
        gestacionId: gestacion.id,
      },
    });
  }

  // ── Partos del último año (natalidad, mortalidad de crías, días abiertos) ─
  // Cada parto: gestación FINALIZADA_PARTO + evento PARTO + nacimiento + la
  // cría registrada como animal. Una de las crías muere a los pocos días.
  const partos: Array<{ diasAtras: number; sexo: Sexo; viva: boolean }> = [
    { diasAtras: 35,  sexo: Sexo.HEMBRA, viva: true },
    { diasAtras: 60,  sexo: Sexo.MACHO,  viva: true },
    { diasAtras: 85,  sexo: Sexo.MACHO,  viva: false },
    { diasAtras: 110, sexo: Sexo.HEMBRA, viva: true },
    { diasAtras: 140, sexo: Sexo.MACHO,  viva: true },
    { diasAtras: 170, sexo: Sexo.HEMBRA, viva: true },
    { diasAtras: 210, sexo: Sexo.MACHO,  viva: true },
    { diasAtras: 260, sexo: Sexo.HEMBRA, viva: true },
  ];
  const anio = String(new Date().getFullYear()).slice(-2);
  for (const [i, parto] of partos.entries()) {
    const madre = hembras[hembras.length - 1 - i]!; // las del final de la lista
    const fechaParto = haceDias(parto.diasAtras);
    const numeroCria = `CR-${anio}-${String(i + 1).padStart(3, '0')}`;

    const gestacion = await prisma.gestacion.create({
      data: {
        id: `${PREFIJO_ID}parto-${i + 1}`,
        fechaInicio: new Date(fechaParto.getTime() - DURACION_GESTACION_DIAS * DIA_MS),
        fechaPartoEsperado: fechaParto,
        fechaPartoReal: fechaParto,
        estadoGestacion: 'FINALIZADA_PARTO',
        observaciones: 'Parto a término',
        madreId: madre.id,
      },
    });
    await prisma.eventoReproductivo.create({
      data: {
        id: `${PREFIJO_ID}ev-parto-${i + 1}`,
        tipo: 'PARTO',
        fecha: fechaParto,
        descripcion: `Parto normal, cría ${numeroCria}`,
        animalId: madre.id,
        registradoPorId: veterinario.id,
      },
    });
    const cria = await prisma.animal.create({
      data: {
        id: `${PREFIJO_ID}cria-${i + 1}`,
        numeroIdentificacion: numeroCria,
        sexo: parto.sexo,
        fechaNacimiento: fechaParto,
        pesoNacimiento: parto.sexo === Sexo.MACHO ? 32 : 29,
        proposito: TipoPropositoAnimal.CARNE,
        estado: parto.viva ? EstadoAnimal.ACTIVO : EstadoAnimal.MUERTO,
        fechaIngreso: fechaParto,
        ...(!parto.viva && { fechaEgreso: new Date(fechaParto.getTime() + 4 * DIA_MS), motivoEgreso: 'Muerte neonatal (diarrea)' }),
        procedencia: 'Nacida en la finca',
        loteId: madre.loteId,
        razaId: madre.razaId,
        madreId: madre.id,
      },
    });
    await prisma.nacimiento.create({
      data: {
        fechaNacimiento: fechaParto,
        tipoParto: 'NORMAL',
        pesoAlNacer: cria.pesoNacimiento,
        id: `${PREFIJO_ID}nac-${i + 1}`,
        estadoCria: parto.viva ? EstadoCria.VIVO : EstadoCria.MUERTO_NEONATAL,
        sexoCria: parto.sexo,
        observaciones: parto.viva
          ? 'Cría vigorosa, mamó calostro en la primera hora'
          : 'Diarrea neonatal; murió a los 4 días pese al tratamiento',
        gestacionId: gestacion.id,
        criaId: cria.id,
      },
    });
  }

  // ── Consultas, diagnósticos y tratamientos de este año ────────────────────
  // (animales tratados y recurrencia). Los dos primeros animales repiten la
  // misma enfermedad en dos consultas distintas → recurrencia. Todo queda
  // resuelto/completado para no alterar el estado sanitario actual. El
  // primer paciente (mastitis) tiene que ser una hembra.
  const pacientes = [hembras[0]!, ...activos.filter((a) => a.id !== hembras[0]!.id)];
  const casos: Array<{ animal: number; diasAtras: number; enfermedad: string; gravedad: NivelGravedad }> = [
    { animal: 0, diasAtras: 150, enfermedad: 'Mastitis clínica',     gravedad: NivelGravedad.MODERADA },
    { animal: 0, diasAtras: 45,  enfermedad: 'Mastitis clínica',     gravedad: NivelGravedad.LEVE },
    { animal: 1, diasAtras: 100, enfermedad: 'Anaplasmosis',         gravedad: NivelGravedad.GRAVE },
    { animal: 1, diasAtras: 25,  enfermedad: 'Anaplasmosis',         gravedad: NivelGravedad.MODERADA },
    { animal: 2, diasAtras: 70,  enfermedad: 'Neumonía',             gravedad: NivelGravedad.MODERADA },
    { animal: 3, diasAtras: 55,  enfermedad: 'Pododermatitis',       gravedad: NivelGravedad.LEVE },
    { animal: 4, diasAtras: 30,  enfermedad: 'Babesiosis',           gravedad: NivelGravedad.GRAVE },
    { animal: 5, diasAtras: 10,  enfermedad: 'Queratoconjuntivitis', gravedad: NivelGravedad.LEVE },
  ];
  for (const [i, caso] of casos.entries()) {
    const fecha = haceDias(caso.diasAtras);
    const medicamento = medicamentos[i % medicamentos.length]!;
    await prisma.historialMedico.create({
      data: {
        id: `${PREFIJO_ID}consulta-${i + 1}`,
        fechaConsulta: fecha,
        motivoConsulta: `Revisión por signos compatibles con ${caso.enfermedad.toLowerCase()}`,
        diagnosticoDefinitivo: caso.enfermedad,
        temperatura: 39.4 + (i % 3) * 0.4,
        observaciones: 'Evolución favorable; se indica control al finalizar el tratamiento',
        animalId: pacientes[caso.animal]!.id,
        veterinarioId: veterinario.id,
        enfermedades: {
          create: {
            nombreEnfermedad: caso.enfermedad,
            nivelGravedad: caso.gravedad,
            fechaInicio: fecha,
            fechaResolucion: new Date(fecha.getTime() + 7 * DIA_MS),
            activa: false,
            diagnosticoDefinitivo: caso.enfermedad,
          },
        },
        tratamientos: {
          create: {
            fechaInicio: fecha,
            fechaFin: new Date(fecha.getTime() + 5 * DIA_MS),
            dosis: '10 ml',
            viaAdministracion: 'Intramuscular',
            frecuencia: 'Cada 24 horas',
            duracionDias: 5,
            estado: 'COMPLETADO',
            respuestaTratamiento: 'El animal se recuperó',
            medicamentoId: medicamento.id,
          },
        },
      },
    });
  }

  console.log(
    `Creados: ${Math.min(libres.length, diasDeGestacion.length)} gestaciones en curso, ${partos.length} partos con su cría `
    + `(1 muerta), ${casos.length} consultas con diagnóstico y tratamiento`,
  );
}

async function main() {
  await limpiar();
  if (!process.argv.includes('--limpiar')) await crear();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
