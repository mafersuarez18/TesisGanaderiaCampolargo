/**
 * Datos de prueba para los indicadores del dashboard (reproductivos y
 * clínicos), agregados SOBRE los datos existentes — no borra ni modifica
 * nada que no haya creado este mismo script.
 *
 *   npm run db:datos-indicadores            → (re)crea los datos de prueba
 *   npm run db:datos-indicadores -- --limpiar → solo los elimina
 *
 * Todo lo que crea queda marcado con MARCA en su campo de observaciones,
 * así que volver a ejecutarlo primero elimina la tanda anterior y no
 * duplica nada.
 *
 * Qué mueve cada bloque (ver analytics.servicio.ts):
 *   - Tasa de preñez     = gestaciones EN_CURSO / hembras activas
 *   - Tasa de natalidad  = nacimientos (desde el 1/1 del año anterior) / hembras activas
 *   - Mortalidad crías   = animales MUERTO nacidos en los últimos 365 días / nacimientos
 *   - Días abiertos      = promedio de días desde el parto de las gestaciones FINALIZADA_PARTO
 *   - Animales tratados  = animales con tratamiento iniciado este año / animales activos
 *   - Recurrencia        = animales con la misma enfermedad ≥ 2 veces / animales con diagnóstico
 */
import { PrismaClient, EstadoAnimal, Sexo, TipoPropositoAnimal, EstadoCria, NivelGravedad } from '@prisma/client';

const prisma = new PrismaClient();
const MARCA = '[datos de prueba de indicadores]';
const DIA_MS = 24 * 60 * 60 * 1000;
const DURACION_GESTACION_DIAS = 283;

const haceDias = (dias: number) => new Date(Date.now() - dias * DIA_MS);

async function limpiar() {
  // Orden inverso a las dependencias: nacimiento → gestación (Restrict),
  // y el historial médico arrastra sus enfermedades y tratamientos (Cascade).
  const nacimientos = await prisma.nacimiento.deleteMany({ where: { observaciones: MARCA } });
  const gestaciones = await prisma.gestacion.deleteMany({ where: { observaciones: MARCA } });
  const eventos = await prisma.eventoReproductivo.deleteMany({ where: { observaciones: MARCA } });
  const consultas = await prisma.historialMedico.deleteMany({ where: { observaciones: MARCA } });
  const animales = await prisma.animal.deleteMany({ where: { observaciones: MARCA } });
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
        tipo: 'DIAGNOSTICO_GESTACION',
        fecha: new Date(inicio.getTime() + 45 * DIA_MS),
        descripcion: 'Diagnóstico de gestación positivo por ecografía',
        observaciones: MARCA,
        animalId: madre.id,
        registradoPorId: veterinario.id,
      },
    });
    const gestacion = await prisma.gestacion.create({
      data: {
        fechaInicio: inicio,
        fechaPartoEsperado: new Date(inicio.getTime() + DURACION_GESTACION_DIAS * DIA_MS),
        estadoGestacion: 'EN_CURSO',
        observaciones: MARCA,
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
        fechaInicio: new Date(fechaParto.getTime() - DURACION_GESTACION_DIAS * DIA_MS),
        fechaPartoEsperado: fechaParto,
        fechaPartoReal: fechaParto,
        estadoGestacion: 'FINALIZADA_PARTO',
        observaciones: MARCA,
        madreId: madre.id,
      },
    });
    await prisma.eventoReproductivo.create({
      data: {
        tipo: 'PARTO',
        fecha: fechaParto,
        descripcion: `Parto normal, cría ${numeroCria}`,
        observaciones: MARCA,
        animalId: madre.id,
        registradoPorId: veterinario.id,
      },
    });
    const cria = await prisma.animal.create({
      data: {
        numeroIdentificacion: numeroCria,
        sexo: parto.sexo,
        fechaNacimiento: fechaParto,
        pesoNacimiento: parto.sexo === Sexo.MACHO ? 32 : 29,
        proposito: TipoPropositoAnimal.CARNE,
        estado: parto.viva ? EstadoAnimal.ACTIVO : EstadoAnimal.MUERTO,
        fechaIngreso: fechaParto,
        ...(!parto.viva && { fechaEgreso: new Date(fechaParto.getTime() + 4 * DIA_MS), motivoEgreso: 'Muerte neonatal (diarrea)' }),
        observaciones: MARCA,
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
        estadoCria: parto.viva ? EstadoCria.VIVO : EstadoCria.MUERTO_NEONATAL,
        sexoCria: parto.sexo,
        observaciones: MARCA,
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
        fechaConsulta: fecha,
        motivoConsulta: `Revisión por signos compatibles con ${caso.enfermedad.toLowerCase()}`,
        diagnosticoDefinitivo: caso.enfermedad,
        temperatura: 39.4 + (i % 3) * 0.4,
        observaciones: MARCA,
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
