import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Response } from 'express';
import path from 'path';
import { prisma } from '../../compartido/prisma/clientePrisma';
import { obtenerMovilidadAnimal } from '../geolocalizacion/geolocalizacion.servicio';

// Generación de reportes descargables (PDF con PDFKit, Excel con ExcelJS)
// con una plantilla visual compartida: banda de encabezado con el logo,
// paleta corporativa y pie de página con numeración.

const RUTA_LOGO = path.join(__dirname, '../../assets/logo-campolargo.png');

// ── Paleta corporativa ─────────────────────────────────────────────────────────
const VERDE      = '#1a6b28';   // verde corporativo principal
const VERDE_BG   = '#f0f7f1';   // verde muy claro para filas alternas
const GRIS_TEXTO = '#2c2c2c';   // texto principal
const GRIS_SUAVE = '#6b7280';   // texto secundario
const GRIS_LINEA = '#d1d5db';   // bordes de tabla
const BLANCO     = '#ffffff';

// Márgenes de página
const ML = 45;   // margen izquierdo
const MR = 45;   // margen derecho
const MT = 50;   // margen superior (contenido tras encabezado)

// ── Utilidades de fecha ────────────────────────────────────────────────────────
const fmtFecha = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtFechaLarga = (d: Date | string | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

// Convierte un valor de enum (p. ej. "EN_TRATAMIENTO", "FINALIZADA_PARTO") en
// una etiqueta legible ("En tratamiento", "Finalizada parto") para que los
// reportes no muestren el nombre técnico tal cual viene de la base de datos.
const etiquetaEnum = (valor: string | null | undefined): string => {
  if (!valor) return '—';
  const palabras = valor.toLowerCase().split('_');
  return palabras.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' ');
};

// ── Encabezado de página ───────────────────────────────────────────────────────
function encabezadoPDF(
  doc: PDFKit.PDFDocument,
  titulo: string,
  subtitulo: string,
): void {
  const W = doc.page.width;

  // Banda superior verde
  doc.rect(0, 0, W, 78).fill(VERDE);

  // Logo
  try {
    doc.image(RUTA_LOGO, ML, 10, { width: 56, height: 56 });
  } catch { /* sin logo */ }

  // Empresa y fecha
  doc.fillColor(BLANCO)
     .font('Helvetica-Bold').fontSize(15)
     .text('Sucesión Joao Campolargo', ML + 66, 16, { lineBreak: false });

  doc.font('Helvetica').fontSize(8.5).fillColor('rgba(255,255,255,0.82)')
     .text('Sistema de Gestión Veterinaria  ·  Yaracuy, Venezuela', ML + 66, 35, { lineBreak: false });

  const hoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.fontSize(7.5).fillColor('rgba(255,255,255,0.62)')
     .text(`Generado el ${hoy}`, ML + 66, 52, { lineBreak: false });

  // Título del reporte — debajo de la banda
  doc.y = 92;
  doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(14)
     .text(titulo, ML, doc.y, { lineBreak: false });

  doc.y = doc.y + 20;
  doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(9)
     .text(subtitulo, ML, doc.y);

  doc.y = doc.y + 10;

  // Línea divisoria
  doc.moveTo(ML, doc.y).lineTo(W - MR, doc.y)
     .strokeColor(VERDE).lineWidth(1.2).stroke();

  doc.y = doc.y + 10;
}

// ── Pie de página ──────────────────────────────────────────────────────────────
function piePaginaPDF(doc: PDFKit.PDFDocument): void {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const W = doc.page.width;
    const y = doc.page.height - 32;

    // El pie va a propósito dentro del margen inferior de la página; con ese
    // margen activo, PDFKit interpreta el y explícito como que el contenido
    // "no cabe" y agrega una página en blanco extra solo para el pie. Se
    // desactiva momentáneamente para dibujarlo en la página que le
    // corresponde de verdad.
    const margenInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.moveTo(ML, y).lineTo(W - MR, y)
       .strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();
    doc.fontSize(7.5).fillColor(GRIS_SUAVE)
       .text(
         `Página ${i - rango.start + 1} de ${rango.count}   ·   Sistema Campolargo — Confidencial`,
         ML, y + 6, { align: 'center', width: W - ML - MR, lineBreak: false },
       );

    doc.page.margins.bottom = margenInferiorOriginal;
  }
}

// ── Encabezado de sección ──────────────────────────────────────────────────────
function seccionPDF(doc: PDFKit.PDFDocument, texto: string): void {
  const y = doc.y;
  doc.rect(ML, y, doc.page.width - ML - MR, 18).fill(VERDE);
  doc.fillColor(BLANCO).font('Helvetica-Bold').fontSize(9)
     .text(texto.toUpperCase(), ML + 6, y + 5, {
       width: doc.page.width - ML - MR - 12,
       lineBreak: false,
     });
  doc.y = y + 22;
}

// ── Guardia de salto de página ─────────────────────────────────────────────────
function guardarEspacio(doc: PDFKit.PDFDocument, px: number): void {
  if (doc.y + px > doc.page.height - 60) {
    doc.addPage();
    doc.y = MT;
  }
}

// ── Tabla PDF ─────────────────────────────────────────────────────────────────
// `anchos` son pesos relativos entre columnas, no píxeles exactos: la función
// siempre los reescala para que la tabla ocupe exactamente el ancho útil de
// la página (evita que quede más ancha que el margen, como pasaba antes). La
// altura de cada fila se calcula según el contenido más largo que le toque
// envolver, así ninguna fila queda más baja que su propio texto.
function tablaPDF(
  doc: PDFKit.PDFDocument,
  cabecera: string[],
  filas: string[][],   // filas[i] = array de celdas de esa fila
  anchosBase: number[],
  alturaMinima = 20,
): void {
  const anchoDisponible = doc.page.width - ML - MR;
  const anchoTotalBase  = anchosBase.reduce((a, b) => a + b, 0);
  const factor          = anchoDisponible / anchoTotalBase;
  const anchos          = anchosBase.map((a) => a * factor);
  const anchoTotal      = anchos.reduce((a, b) => a + b, 0);

  const calcularAltura = (celdas: string[], esHeader: boolean): number => {
    doc.font(esHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(esHeader ? 8 : 7.8);
    const alturas = celdas.map((c, i) =>
      doc.heightOfString(String(c ?? '—'), { width: anchos[i] - 8, lineBreak: true }),
    );
    return Math.max(alturaMinima, Math.max(...alturas) + 8);
  };

  const dibujarFila = (
    celdas: string[],
    esHeader: boolean,
    esImpar: boolean,
  ) => {
    const altura = calcularAltura(celdas, esHeader);
    guardarEspacio(doc, altura);

    // Si el salto de página cayó justo antes de esta fila, se repite la
    // cabecera al inicio de la página nueva para que la tabla siga siendo
    // legible sin tener que volver atrás.
    if (!esHeader && doc.y === MT) {
      dibujarFila(cabecera, true, false);
    }

    const y = doc.y;

    // Fondo
    if (esHeader) {
      doc.rect(ML, y, anchoTotal, altura).fill(VERDE);
    } else if (esImpar) {
      doc.rect(ML, y, anchoTotal, altura).fill(VERDE_BG);
    } else {
      doc.rect(ML, y, anchoTotal, altura).fill(BLANCO);
    }

    // Texto de cada celda, centrado verticalmente dentro de la altura real
    let x = ML;
    celdas.forEach((celda, i) => {
      const alturaTexto = doc.heightOfString(String(celda ?? '—'), { width: anchos[i] - 8, lineBreak: true });
      doc.fillColor(esHeader ? BLANCO : GRIS_TEXTO)
         .font(esHeader ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(esHeader ? 8 : 7.8)
         .text(String(celda ?? '—'), x + 4, y + Math.max(4, (altura - alturaTexto) / 2), {
           width: anchos[i] - 8,
           lineBreak: true,
         });
      x += anchos[i];
    });

    // Borde inferior
    doc.rect(ML, y, anchoTotal, altura)
       .strokeColor(GRIS_LINEA).lineWidth(0.4).stroke();

    doc.y = y + altura;
  };

  // Cabecera
  dibujarFila(cabecera, true, false);

  // Filas de datos
  filas.forEach((f, idx) => {
    dibujarFila(f, false, idx % 2 === 0);
  });

  doc.moveDown(0.4);
}

// ── Tarjetas de indicadores (KPI) ────────────────────────────────────────────
// La cuadrícula se calcula toda de una vez a partir de un punto Y fijo,
// capturado ANTES de dibujar nada: si en vez de eso se usara doc.y dentro
// del mismo ciclo que también dibuja texto, cada texto desplaza doc.y y las
// tarjetas se van desalineando fila tras fila (así se veía roto antes).
function tarjetasKPI(
  doc: PDFKit.PDFDocument,
  items: [string, string][],
  columnas = 2,
): void {
  const anchoDisponible = doc.page.width - ML - MR;
  const espacio      = 8;
  const anchoTarjeta = (anchoDisponible - espacio * (columnas - 1)) / columnas;
  const altoTarjeta  = 42;
  const filas        = Math.ceil(items.length / columnas);

  guardarEspacio(doc, filas * (altoTarjeta + espacio));
  const baseY = doc.y;

  items.forEach(([etiqueta, valor], i) => {
    const col  = i % columnas;
    const fila = Math.floor(i / columnas);
    const x = ML + col * (anchoTarjeta + espacio);
    const y = baseY + fila * (altoTarjeta + espacio);

    doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 4).fill(VERDE_BG);
    doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 4)
       .strokeColor(GRIS_LINEA).lineWidth(0.5).stroke();

    doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(7)
       .text(etiqueta.toUpperCase(), x + 10, y + 10, {
         width: anchoTarjeta - 20, lineBreak: false, ellipsis: true, characterSpacing: 0.2,
       });
    doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(16)
       .text(valor, x + 10, y + 21, { width: anchoTarjeta - 20, lineBreak: false, ellipsis: true });
  });

  doc.y = baseY + filas * (altoTarjeta + espacio) + 6;
}

// ── Bloque de par clave / valor (dos columnas) ─────────────────────────────────
// Evita el continued:true de PDFKit que superpone texto cuando el valor es largo
function parKV(
  doc: PDFKit.PDFDocument,
  clave: string,
  valor: string | null | undefined,
  impar = false,
): void {
  if (!valor) return;
  const W = doc.page.width;
  const anchoTotal = W - ML - MR;
  const anchoClv = 155;
  const anchoVal = anchoTotal - anchoClv;
  const alturaMin = 16;

  // Calcular altura necesaria para el valor (puede ser multilínea)
  const alturaVal = doc.heightOfString(valor, { width: anchoVal - 8, lineBreak: true });
  const altura = Math.max(alturaMin, alturaVal + 6);

  guardarEspacio(doc, altura);
  const y = doc.y;

  // Fondo alterno
  doc.rect(ML, y, anchoTotal, altura).fill(impar ? VERDE_BG : BLANCO);

  // Clave (negrita, izquierda)
  doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8)
     .text(clave, ML + 4, y + 4, { width: anchoClv - 8, lineBreak: false, ellipsis: true });

  // Valor (normal, derecha)
  doc.fillColor(GRIS_TEXTO).font('Helvetica').fontSize(8.5)
     .text(valor, ML + anchoClv, y + 4, { width: anchoVal - 8, lineBreak: true });

  doc.rect(ML, y, anchoTotal, altura)
     .strokeColor(GRIS_LINEA).lineWidth(0.3).stroke();

  doc.y = y + altura;
}

// ── Estilos Excel ──────────────────────────────────────────────────────────────
function estiloEncabezadoExcel(fila: ExcelJS.Row): void {
  fila.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A6B28' } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
  });
  fila.height = 22;
}

function estiloFilaExcel(fila: ExcelJS.Row, impar: boolean): void {
  fila.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: impar ? 'FFF0F7F1' : 'FFFFFFFF' } };
    c.font = { size: 9.5, name: 'Calibri' };
    c.alignment = { vertical: 'middle', wrapText: false };
    c.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
  });
  fila.height = 18;
}

function anchoAutoExcel(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: false }, (c) => {
      max = Math.max(max, String(c.value ?? '').length + 3);
    });
    col.width = Math.min(max, 42);
  });
}

function agregarMetaExcel(wb: ExcelJS.Workbook, titulo: string): void {
  wb.creator = 'Sistema Campolargo';
  wb.created = new Date();
  wb.title   = titulo;
  wb.subject = 'Sucesión Joao Campolargo — Sistema de Gestión Veterinaria';
}

// =============================================================================
// REPORTE 1 — INVENTARIO DE ANIMALES
// =============================================================================
export async function generarInventario(
  res: Response,
  formato: 'pdf' | 'excel',
  filtros: { anio: number; fincaId?: string; estado?: string },
) {
  const animales = await prisma.animal.findMany({
    where: {
      ...(filtros.fincaId && { lote: { fincaId: filtros.fincaId } }),
      ...(filtros.estado  && { estado: filtros.estado as any }),
    },
    include: {
      raza: { select: { nombre: true } },
      lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
    },
    orderBy: [{ lote: { finca: { nombre: 'asc' } } }, { numeroIdentificacion: 'asc' }],
  });

  const totalMachos  = animales.filter((a) => a.sexo === 'MACHO').length;
  const totalHembras = animales.filter((a) => a.sexo === 'HEMBRA').length;
  const subtitulo    = `${animales.length} animales  ·  ${totalMachos} machos  ·  ${totalHembras} hembras${filtros.fincaId ? '' : '  ·  Todas las fincas'}`;

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="inventario_animales_${filtros.anio}.pdf"`);
    doc.pipe(res);

    encabezadoPDF(doc, 'Inventario de Animales', subtitulo);

    const W = doc.page.width - ML - MR;
    const anchos = [62, 88, 46, 80, 92, 80, 56, 52];  // suma = ~556 ≈ A4 útil
    tablaPDF(
      doc,
      ['N.° Identificación', 'Nombre', 'Sexo', 'Raza', 'Finca', 'Lote', 'Estado', 'Peso kg'],
      animales.map((a) => [
        a.numeroIdentificacion,
        a.nombre ?? '—',
        a.sexo === 'MACHO' ? 'Macho' : 'Hembra',
        a.raza?.nombre  ?? '—',
        a.lote?.finca?.nombre ?? '—',
        a.lote?.nombre  ?? '—',
        etiquetaEnum(a.estado),
        a.pesoActual != null ? String(a.pesoActual) : '—',
      ]),
      anchos,
    );

    // Resumen por finca al final
    const porFinca = animales.reduce<Record<string, { m: number; h: number }>>((acc, a) => {
      const n = a.lote?.finca?.nombre ?? 'Sin finca';
      if (!acc[n]) acc[n] = { m: 0, h: 0 };
      a.sexo === 'MACHO' ? acc[n].m++ : acc[n].h++;
      return acc;
    }, {});

    if (Object.keys(porFinca).length > 1) {
      doc.moveDown(1);
      guardarEspacio(doc, 60);
      seccionPDF(doc, 'Resumen por finca');
      tablaPDF(
        doc,
        ['Finca', 'Total', 'Machos', 'Hembras'],
        Object.entries(porFinca).map(([finca, c]) => [finca, String(c.m + c.h), String(c.m), String(c.h)]),
        [280, 90, 90, 90],
      );
    }

    piePaginaPDF(doc);
    doc.end();

  } else {
    const wb = new ExcelJS.Workbook();
    agregarMetaExcel(wb, 'Inventario de Animales');

    const ws = wb.addWorksheet('Inventario');
    ws.columns = [
      { header: 'N.° Identificación',         key: 'arete'      },
      { header: 'Nombre',            key: 'nombre'     },
      { header: 'Sexo',              key: 'sexo'       },
      { header: 'Raza',              key: 'raza'       },
      { header: 'Finca',             key: 'finca'      },
      { header: 'Lote',              key: 'lote'       },
      { header: 'Estado',            key: 'estado'     },
      { header: 'Est. Sanitario',    key: 'sanitario'  },
      { header: 'Peso (kg)',         key: 'peso'       },
      { header: 'F. Nacimiento',     key: 'nacimiento' },
      { header: 'Color',             key: 'color'      },
      { header: 'Propósito',         key: 'proposito'  },
    ];
    estiloEncabezadoExcel(ws.getRow(1));

    animales.forEach((a, i) => {
      estiloFilaExcel(ws.addRow({
        arete:       a.numeroIdentificacion,
        nombre:      a.nombre ?? '',
        sexo:        a.sexo === 'MACHO' ? 'Macho' : 'Hembra',
        raza:        a.raza?.nombre ?? '',
        finca:       a.lote?.finca?.nombre ?? '',
        lote:        a.lote?.nombre  ?? '',
        estado:      etiquetaEnum(a.estado),
        sanitario:   etiquetaEnum(a.estadoSanitario),
        peso:        a.pesoActual ?? '',
        nacimiento:  fmtFecha(a.fechaNacimiento),
        color:       a.color ?? '',
        proposito:   a.proposito ? etiquetaEnum(a.proposito) : '',
      }), i % 2 === 0);
    });

    const wsR = wb.addWorksheet('Resumen por finca');
    wsR.columns = [
      { header: 'Finca',    key: 'finca'  },
      { header: 'Total',    key: 'total'  },
      { header: 'Machos',   key: 'machos' },
      { header: 'Hembras',  key: 'hembras'},
    ];
    estiloEncabezadoExcel(wsR.getRow(1));
    const pF = animales.reduce<Record<string, { m: number; h: number }>>((acc, a) => {
      const n = a.lote?.finca?.nombre ?? 'Sin finca';
      if (!acc[n]) acc[n] = { m: 0, h: 0 };
      a.sexo === 'MACHO' ? acc[n].m++ : acc[n].h++;
      return acc;
    }, {});
    Object.entries(pF).forEach(([finca, c], i) => {
      estiloFilaExcel(wsR.addRow({ finca, total: c.m + c.h, machos: c.m, hembras: c.h }), i % 2 === 0);
    });

    anchoAutoExcel(ws);
    anchoAutoExcel(wsR);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="inventario_animales_${filtros.anio}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

// =============================================================================
// REPORTE 2 — REPORTE SANITARIO
// =============================================================================
export async function generarSanitario(
  res: Response,
  formato: 'pdf' | 'excel',
  filtros: { anio: number; fincaId?: string },
) {
  const desde = new Date(filtros.anio, 0, 1);
  const hasta = new Date(filtros.anio, 11, 31, 23, 59, 59);

  const [consultas, vacunaciones] = await Promise.all([
    prisma.historialMedico.findMany({
      where: {
        fechaConsulta: { gte: desde, lte: hasta },
        ...(filtros.fincaId ? { animal: { lote: { fincaId: filtros.fincaId } } } : {}),
      },
      include: {
        animal: {
          select: {
            numeroIdentificacion: true, nombre: true,
            lote: { select: { finca: { select: { nombre: true } } } },
          },
        },
        veterinario: { select: { nombre: true, apellido: true } },
        enfermedades: { select: { nombreEnfermedad: true, activa: true, diagnosticoDefinitivo: true, pronostico: true } },
      },
      orderBy: { fechaConsulta: 'desc' },
    }),
    prisma.registroVacunacion.findMany({
      where: {
        fechaAplicacion: { gte: desde, lte: hasta },
        ...(filtros.fincaId ? { animal: { lote: { fincaId: filtros.fincaId } } } : {}),
      },
      include: {
        animal: {
          select: {
            numeroIdentificacion: true, nombre: true,
            lote: { select: { finca: { select: { nombre: true } } } },
          },
        },
        calendarioVacunacion: { select: { nombreVacuna: true } },
        aplicadoPor: { select: { nombre: true, apellido: true } },
      },
      orderBy: { fechaAplicacion: 'desc' },
    }),
  ]);

  const subtitulo = `Año ${filtros.anio}  ·  ${consultas.length} consultas  ·  ${vacunaciones.length} vacunaciones`;

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_sanitario_${filtros.anio}.pdf"`);
    doc.pipe(res);

    encabezadoPDF(doc, `Reporte Sanitario ${filtros.anio}`, subtitulo);

    // ── Consultas ──
    seccionPDF(doc, 'Consultas y Diagnósticos');
    if (consultas.length === 0) {
      doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(9)
         .text('Sin consultas en el período.', ML, doc.y).moveDown(0.5);
    } else {
      tablaPDF(
        doc,
        ['Fecha', 'Animal', 'Finca', 'Motivo consulta', 'Diagnóstico', 'Veterinario'],
        consultas.map((c) => [
          fmtFecha(c.fechaConsulta),
          `${c.animal.nombre ? c.animal.nombre + ' ' : ''}#${c.animal.numeroIdentificacion}`,
          c.animal.lote?.finca?.nombre ?? '—',
          c.motivoConsulta,
          c.enfermedades.map((e) => e.diagnosticoDefinitivo).filter(Boolean).join('; ') || '—',
          `${c.veterinario.nombre} ${c.veterinario.apellido}`,
        ]),
        [56, 95, 80, 105, 105, 95],
      );
    }

    // ── Vacunaciones ──
    doc.moveDown(0.8);
    guardarEspacio(doc, 40);
    seccionPDF(doc, 'Vacunaciones Aplicadas');
    if (vacunaciones.length === 0) {
      doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(9)
         .text('Sin vacunaciones en el período.', ML, doc.y).moveDown(0.5);
    } else {
      tablaPDF(
        doc,
        ['Fecha', 'Animal', 'Finca', 'Vacuna / Protocolo', 'Próxima cita', 'Dosis', 'Aplicó'],
        vacunaciones.map((v) => {
          const a = v.animal;
          return [
            fmtFecha(v.fechaAplicacion),
            `${a?.nombre ? a.nombre + ' ' : ''}#${a?.numeroIdentificacion ?? ''}`,
            a?.lote?.finca?.nombre ?? '—',
            v.calendarioVacunacion.nombreVacuna,
            fmtFecha(v.proximaFecha),
            v.dosis ?? '—',
            `${v.aplicadoPor.nombre} ${v.aplicadoPor.apellido}`,
          ];
        }),
        [52, 88, 72, 115, 64, 42, 95],
      );
    }

    piePaginaPDF(doc);
    doc.end();

  } else {
    const wb = new ExcelJS.Workbook();
    agregarMetaExcel(wb, `Reporte Sanitario ${filtros.anio}`);

    const wsC = wb.addWorksheet('Consultas médicas');
    wsC.columns = [
      { header: 'Fecha',          key: 'fecha'       },
      { header: 'Identificación',          key: 'arete'       },
      { header: 'Animal',         key: 'animal'      },
      { header: 'Finca',          key: 'finca'       },
      { header: 'Motivo',         key: 'motivo'      },
      { header: 'Diagnóstico',    key: 'diagnostico' },
      { header: 'Pronóstico',     key: 'pronostico'  },
      { header: 'Veterinario',    key: 'vet'         },
      { header: 'Enfermedades',   key: 'enfermedades'},
    ];
    estiloEncabezadoExcel(wsC.getRow(1));
    consultas.forEach((c, i) => {
      estiloFilaExcel(wsC.addRow({
        fecha:        fmtFecha(c.fechaConsulta),
        arete:        c.animal.numeroIdentificacion,
        animal:       c.animal.nombre ?? '',
        finca:        c.animal.lote?.finca?.nombre ?? '',
        motivo:       c.motivoConsulta,
        diagnostico:  c.enfermedades.map((e) => e.diagnosticoDefinitivo).filter(Boolean).join('; '),
        pronostico:   c.enfermedades.map((e) => e.pronostico).filter(Boolean).join('; '),
        vet:          `${c.veterinario.nombre} ${c.veterinario.apellido}`,
        enfermedades: c.enfermedades.map((e) => e.nombreEnfermedad).join('; '),
      }), i % 2 === 0);
    });

    const wsV = wb.addWorksheet('Vacunaciones');
    wsV.columns = [
      { header: 'Fecha aplicación', key: 'fecha'   },
      { header: 'Identificación',            key: 'arete'   },
      { header: 'Animal',           key: 'animal'  },
      { header: 'Finca',            key: 'finca'   },
      { header: 'Vacuna',           key: 'vacuna'  },
      { header: 'Dosis',            key: 'dosis'   },
      { header: 'Próxima cita',     key: 'proxima' },
      { header: 'Aplicó',           key: 'aplico'  },
    ];
    estiloEncabezadoExcel(wsV.getRow(1));
    vacunaciones.forEach((v, i) => {
      const a = v.animal;
      estiloFilaExcel(wsV.addRow({
        fecha:   fmtFecha(v.fechaAplicacion),
        arete:   a?.numeroIdentificacion ?? '',
        animal:  a?.nombre ?? '',
        finca:   a?.lote?.finca?.nombre ?? '',
        vacuna:  v.calendarioVacunacion.nombreVacuna,
        dosis:   v.dosis ?? '',
        proxima: fmtFecha(v.proximaFecha),
        aplico:  `${v.aplicadoPor.nombre} ${v.aplicadoPor.apellido}`,
      }), i % 2 === 0);
    });

    anchoAutoExcel(wsC);
    anchoAutoExcel(wsV);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_sanitario_${filtros.anio}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

// =============================================================================
// REPORTE 3 — CUMPLIMIENTO DE VACUNACIÓN Y DESPARASITACIÓN
// =============================================================================
export async function generarVacunacion(
  res: Response,
  formato: 'pdf' | 'excel',
  filtros: { anio: number; fincaId?: string },
) {
  const hoy  = new Date();
  const en30 = new Date(hoy.getTime() + 30 * 86_400_000);

  const registros = await prisma.registroVacunacion.findMany({
    where: {
      animal: {
        estado: 'ACTIVO',
        ...(filtros.fincaId ? { lote: { fincaId: filtros.fincaId } } : {}),
      },
    },
    include: {
      animal: {
        select: {
          numeroIdentificacion: true, nombre: true,
          lote: { select: { finca: { select: { nombre: true } } } },
        },
      },
      calendarioVacunacion: { select: { nombreVacuna: true, intervaloDias: true } },
      aplicadoPor: { select: { nombre: true, apellido: true } },
    },
    orderBy: { proximaFecha: 'asc' },
  });

  const estadoVacuna = (proxima: Date | null | undefined): string => {
    if (!proxima) return 'Sin fecha';
    const p = new Date(proxima);
    if (p < hoy)   return 'VENCIDA';
    if (p <= en30) return 'PRÓXIMA';
    return 'AL DÍA';
  };

  const datos = registros.map((r) => ({
    arete:     r.animal.numeroIdentificacion,
    nombre:    r.animal.nombre ?? '—',
    finca:     r.animal.lote?.finca?.nombre ?? '—',
    vacuna:    r.calendarioVacunacion.nombreVacuna,
    intervalo: `${r.calendarioVacunacion.intervaloDias}d`,
    ultima:    fmtFecha(r.fechaAplicacion),
    proxima:   fmtFecha(r.proximaFecha),
    estado:    estadoVacuna(r.proximaFecha),
    aplico:    `${r.aplicadoPor.nombre} ${r.aplicadoPor.apellido}`,
  }));

  const vencidas = datos.filter((d) => d.estado === 'VENCIDA').length;
  const proximas = datos.filter((d) => d.estado === 'PRÓXIMA').length;
  const alDia    = datos.filter((d) => d.estado === 'AL DÍA').length;
  const subtitulo = `${datos.length} registros  ·  ${vencidas} vencidas  ·  ${proximas} próximas (30d)  ·  ${alDia} al día`;

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="vacunacion_cumplimiento_${filtros.anio}.pdf"`);
    doc.pipe(res);

    encabezadoPDF(doc, 'Cumplimiento de Vacunación y Desparasitación', subtitulo);

    // KPIs de resumen en dos columnas
    const kpis: [string, string][] = [
      ['Total registros activos', String(datos.length)],
      ['Vacunas vencidas',        String(vencidas)],
      ['Próximas en 30 días',     String(proximas)],
      ['Al día',                  String(alDia)],
    ];
    tarjetasKPI(doc, kpis);

    // Tabla
    seccionPDF(doc, 'Detalle por Animal');
    tablaPDF(
      doc,
      ['Identificación', 'Animal', 'Finca', 'Vacuna / Protocolo', 'Intervalo', 'Última aplic.', 'Próxima', 'Estado'],
      datos.map((d) => [d.arete, d.nombre, d.finca, d.vacuna, d.intervalo, d.ultima, d.proxima, d.estado]),
      [52, 80, 68, 115, 48, 60, 60, 53],
    );

    piePaginaPDF(doc);
    doc.end();

  } else {
    const wb = new ExcelJS.Workbook();
    agregarMetaExcel(wb, 'Cumplimiento de Vacunación');

    const ws = wb.addWorksheet('Cumplimiento');
    ws.columns = [
      { header: 'Identificación',             key: 'arete'    },
      { header: 'Nombre',            key: 'nombre'   },
      { header: 'Finca',             key: 'finca'    },
      { header: 'Vacuna',            key: 'vacuna'   },
      { header: 'Intervalo',         key: 'intervalo'},
      { header: 'Última aplicación', key: 'ultima'   },
      { header: 'Próxima cita',      key: 'proxima'  },
      { header: 'Estado',            key: 'estado'   },
      { header: 'Aplicó',            key: 'aplico'   },
    ];
    estiloEncabezadoExcel(ws.getRow(1));

    datos.forEach((d, i) => {
      const fila = ws.addRow(d);
      estiloFilaExcel(fila, i % 2 === 0);
      const ce = fila.getCell('estado');
      if (d.estado === 'VENCIDA') {
        ce.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
        ce.font = { bold: true, color: { argb: 'FFB71C1C' }, size: 9.5, name: 'Calibri' };
      } else if (d.estado === 'PRÓXIMA') {
        ce.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
        ce.font = { bold: true, color: { argb: 'FFF57F17' }, size: 9.5, name: 'Calibri' };
      } else if (d.estado === 'AL DÍA') {
        ce.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E6C9' } };
        ce.font = { bold: true, color: { argb: 'FF1B5E20' }, size: 9.5, name: 'Calibri' };
      }
    });

    anchoAutoExcel(ws);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="vacunacion_cumplimiento_${filtros.anio}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

// =============================================================================
// REPORTE 4 — INDICADORES REPRODUCTIVOS
// =============================================================================
export async function generarReproductivo(
  res: Response,
  formato: 'pdf' | 'excel',
  filtros: { anio: number; fincaId?: string },
) {
  const desde = new Date(filtros.anio, 0, 1);
  const hasta = new Date(filtros.anio, 11, 31, 23, 59, 59);
  const dF    = filtros.fincaId ? { lote: { fincaId: filtros.fincaId } } : {};

  const [gestaciones, gestacionesFinalizadasEnAnio, nacimientos, totalHembras] = await Promise.all([
    prisma.gestacion.findMany({
      where: { fechaInicio: { gte: desde, lte: hasta }, madre: { ...dF } },
      include: {
        madre: {
          select: {
            numeroIdentificacion: true, nombre: true,
            lote: { select: { finca: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: { fechaInicio: 'desc' },
    }),
    // A diferencia de "gestaciones" (cohorte que INICIÓ en el año), este
    // conteo usa fechaPartoReal: la gestación dura ~9 meses, así que casi
    // ninguna que inicia en el año también termina en el año — de ahí que
    // se necesite esta consulta aparte, igual que hace el indicador en vivo
    // (obtenerIndicadoresReproductivos), para no reportar "0 partos" cuando
    // en realidad sí hubo nacimientos ese año.
    prisma.gestacion.count({
      where: {
        estadoGestacion: 'FINALIZADA_PARTO',
        fechaPartoReal: { gte: desde, lte: hasta },
        madre: { ...dF },
      },
    }),
    prisma.nacimiento.findMany({
      where: {
        fechaNacimiento: { gte: desde, lte: hasta },
        gestacion: { madre: { ...dF } },
      },
      include: {
        gestacion: {
          include: {
            madre: {
              select: {
                numeroIdentificacion: true, nombre: true,
                lote: { select: { finca: { select: { nombre: true } } } },
              },
            },
          },
        },
        cria: { select: { numeroIdentificacion: true, nombre: true, sexo: true } },
      },
      orderBy: { fechaNacimiento: 'desc' },
    }),
    prisma.animal.count({ where: { sexo: 'HEMBRA', estado: 'ACTIVO', ...dF } }),
  ]);

  const enCurso      = gestaciones.filter((g) => g.estadoGestacion === 'EN_CURSO').length;
  const finalizadas  = gestacionesFinalizadasEnAnio;
  const tasaPrenez   = totalHembras > 0
    ? ((gestaciones.length / totalHembras) * 100).toFixed(1) + '%'
    : '—';
  // El sexo de la cría se registra directo en el nacimiento (sexoCria); la
  // relación `cria` (el animal ya dado de alta en el sistema a partir de ese
  // nacimiento) es un paso posterior y manual que casi nunca existe todavía,
  // así que no puede ser la fuente principal para este conteo.
  const sexoDeCria    = (n: (typeof nacimientos)[number]) => n.sexoCria ?? n.cria?.sexo ?? null;
  const machosCrias   = nacimientos.filter((n) => sexoDeCria(n) === 'MACHO').length;
  const hembrasCrias  = nacimientos.filter((n) => sexoDeCria(n) === 'HEMBRA').length;

  const kpis: [string, string][] = [
    ['Total hembras activas',           String(totalHembras)],
    ['Gestaciones en el período',       String(gestaciones.length)],
    ['Gestaciones en curso',            String(enCurso)],
    ['Gestaciones finalizadas (parto)', String(finalizadas)],
    ['Tasa de preñez estimada',         tasaPrenez],
    ['Total nacimientos',               String(nacimientos.length)],
    ['Crías macho',                     String(machosCrias)],
    ['Crías hembra',                    String(hembrasCrias)],
  ];

  const subtitulo = `Año ${filtros.anio}  ·  ${gestaciones.length} gestaciones  ·  ${nacimientos.length} nacimientos  ·  Tasa preñez ${tasaPrenez}`;

  if (formato === 'pdf') {
    const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="indicadores_reproductivos_${filtros.anio}.pdf"`);
    doc.pipe(res);

    encabezadoPDF(doc, `Indicadores Reproductivos ${filtros.anio}`, subtitulo);

    // KPIs en cuadrícula 2×4
    seccionPDF(doc, 'Indicadores Clave');
    tarjetasKPI(doc, kpis);

    // Gestaciones
    doc.moveDown(0.5);
    guardarEspacio(doc, 50);
    seccionPDF(doc, 'Gestaciones');
    if (!gestaciones.length) {
      doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(9)
         .text('Sin gestaciones en el período.', ML, doc.y).moveDown(0.5);
    } else {
      tablaPDF(
        doc,
        ['Identificación', 'Madre', 'Finca', 'Inicio', 'Parto esperado', 'Parto real', 'Estado'],
        gestaciones.map((g) => [
          g.madre.numeroIdentificacion,
          g.madre.nombre ?? '—',
          g.madre.lote?.finca?.nombre ?? '—',
          fmtFecha(g.fechaInicio),
          fmtFecha(g.fechaPartoEsperado),
          fmtFecha(g.fechaPartoReal),
          etiquetaEnum(g.estadoGestacion),
        ]),
        [52, 90, 80, 58, 72, 62, 122],
      );
    }

    // Nacimientos
    if (nacimientos.length) {
      doc.moveDown(0.8);
      guardarEspacio(doc, 50);
      seccionPDF(doc, 'Nacimientos');
      tablaPDF(
        doc,
        ['Identificación cría', 'Nombre cría', 'Sexo', 'Madre', 'Finca', 'Fecha nacim.', 'Tipo parto'],
        nacimientos.map((n) => [
          n.cria?.numeroIdentificacion ?? '—',
          n.cria?.nombre      ?? '—',
          sexoDeCria(n) === 'MACHO' ? 'Macho' : sexoDeCria(n) === 'HEMBRA' ? 'Hembra' : '—',
          n.gestacion.madre.nombre ?? n.gestacion.madre.numeroIdentificacion,
          n.gestacion.madre.lote?.finca?.nombre ?? '—',
          fmtFecha(n.fechaNacimiento),
          etiquetaEnum(n.tipoParto),
        ]),
        [60, 90, 46, 90, 76, 62, 112],
      );
    }

    piePaginaPDF(doc);
    doc.end();

  } else {
    const wb = new ExcelJS.Workbook();
    agregarMetaExcel(wb, `Indicadores Reproductivos ${filtros.anio}`);

    const wsR = wb.addWorksheet('Indicadores');
    wsR.getCell('A1').value = `Indicadores Reproductivos ${filtros.anio}`;
    wsR.getCell('A1').font  = { bold: true, size: 13, color: { argb: 'FF1A6B28' }, name: 'Calibri' };
    wsR.getCell('A1').alignment = { horizontal: 'left' };
    wsR.addRow([]);
    kpis.forEach(([k, v], i) => {
      const fila = wsR.addRow([k, v]);
      estiloFilaExcel(fila, i % 2 === 0);
      fila.getCell(2).font = { bold: true, size: 10, name: 'Calibri' };
      fila.getCell(2).alignment = { horizontal: 'center' };
    });
    wsR.getColumn(1).width = 40;
    wsR.getColumn(2).width = 20;

    const wsG = wb.addWorksheet('Gestaciones');
    wsG.columns = [
      { header: 'Identificación madre',      key: 'arete'  },
      { header: 'Nombre madre',     key: 'nombre' },
      { header: 'Finca',            key: 'finca'  },
      { header: 'Inicio gestación', key: 'inicio' },
      { header: 'Parto esperado',   key: 'parto'  },
      { header: 'Parto real',       key: 'partoR' },
      { header: 'Estado',           key: 'estado' },
    ];
    estiloEncabezadoExcel(wsG.getRow(1));
    gestaciones.forEach((g, i) => {
      estiloFilaExcel(wsG.addRow({
        arete:  g.madre.numeroIdentificacion,
        nombre: g.madre.nombre ?? '',
        finca:  g.madre.lote?.finca?.nombre ?? '',
        inicio: fmtFecha(g.fechaInicio),
        parto:  fmtFecha(g.fechaPartoEsperado),
        partoR: fmtFecha(g.fechaPartoReal),
        estado: etiquetaEnum(g.estadoGestacion),
      }), i % 2 === 0);
    });

    const wsN = wb.addWorksheet('Nacimientos');
    wsN.columns = [
      { header: 'Identificación cría',       key: 'arete'  },
      { header: 'Nombre cría',      key: 'nombre' },
      { header: 'Sexo',             key: 'sexo'   },
      { header: 'Madre',            key: 'madre'  },
      { header: 'Finca',            key: 'finca'  },
      { header: 'Fecha nacimiento', key: 'fecha'  },
      { header: 'Tipo parto',       key: 'tipo'   },
      { header: 'Estado cría',      key: 'estadoCria' },
    ];
    estiloEncabezadoExcel(wsN.getRow(1));
    nacimientos.forEach((n, i) => {
      estiloFilaExcel(wsN.addRow({
        arete:     n.cria?.numeroIdentificacion ?? '',
        nombre:    n.cria?.nombre ?? '',
        sexo:      sexoDeCria(n) === 'MACHO' ? 'Macho' : sexoDeCria(n) === 'HEMBRA' ? 'Hembra' : '',
        madre:     n.gestacion.madre.nombre ?? n.gestacion.madre.numeroIdentificacion,
        finca:     n.gestacion.madre.lote?.finca?.nombre ?? '',
        fecha:     fmtFecha(n.fechaNacimiento),
        tipo:      n.tipoParto ? etiquetaEnum(n.tipoParto) : '',
        estadoCria: n.estadoCria ? etiquetaEnum(n.estadoCria) : '',
      }), i % 2 === 0);
    });

    anchoAutoExcel(wsG);
    anchoAutoExcel(wsN);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="indicadores_reproductivos_${filtros.anio}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}

// =============================================================================
// REPORTE 5 — HISTORIAL MÉDICO COMPLETO DE UN ANIMAL (PDF)
// =============================================================================
export async function generarHistorialAnimal(res: Response, animalId: string) {
  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: {
      numeroIdentificacion: true, nombre: true, sexo: true, fechaNacimiento: true,
      pesoActual: true, color: true, estadoSanitario: true,
      raza: { select: { nombre: true } },
      lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
    },
  });

  if (!animal) {
    res.status(404).json({ error: 'Animal no encontrado' });
    return;
  }

  const [consultas, desparasitacionesAnimal] = await Promise.all([
    prisma.historialMedico.findMany({
      where: { animalId },
      include: {
        veterinario:             { select: { nombre: true, apellido: true } },
        enfermedades:            true,
        tratamientos:            { include: { medicamento: { select: { nombre: true } } } },
        informacionEpidemiologica: true,
      },
      orderBy: { fechaConsulta: 'desc' },
    }),
    // Las desparasitaciones se identifican por el animal directamente (no
    // por una consulta puntual), así que se listan aparte.
    prisma.programaDesparasitacion.findMany({
      where: { animalId },
      include: { medicamento: { select: { nombre: true, principioActivo: true } } },
      orderBy: { fecha: 'desc' },
    }),
  ]);

  const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="historial_${animal.numeroIdentificacion}.pdf"`);
  doc.pipe(res);

  const nombreAnimal = animal.nombre ? `${animal.nombre}  —  #${animal.numeroIdentificacion}` : `#${animal.numeroIdentificacion}`;
  encabezadoPDF(
    doc,
    `Historial Médico`,
    `${nombreAnimal}  ·  ${animal.raza?.nombre ?? '—'}  ·  ${animal.lote?.finca?.nombre ?? '—'}  ·  ${consultas.length} consulta(s)`,
  );

  // ── Ficha del animal ──
  seccionPDF(doc, 'Datos del Animal');
  const ficha: [string, string][] = [
    ['N.° Identificación',        animal.numeroIdentificacion],
    ['Nombre',           animal.nombre ?? '—'],
    ['Sexo',             animal.sexo === 'MACHO' ? 'Macho' : 'Hembra'],
    ['Raza',             animal.raza?.nombre ?? '—'],
    ['Finca',            animal.lote?.finca?.nombre ?? '—'],
    ['Lote',             animal.lote?.nombre  ?? '—'],
    ['Fecha nacimiento', fmtFechaLarga(animal.fechaNacimiento)],
    ['Peso actual',      animal.pesoActual != null ? `${animal.pesoActual} kg` : '—'],
    ['Color',            animal.color ?? '—'],
    ['Estado sanitario', etiquetaEnum(animal.estadoSanitario)],
  ];
  ficha.forEach(([k, v], i) => parKV(doc, k, v, i % 2 === 0));

  doc.moveDown(1);

  if (consultas.length === 0) {
    guardarEspacio(doc, 40);
    doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(10)
       .text('Este animal no tiene consultas veterinarias registradas.', ML, doc.y);
    piePaginaPDF(doc);
    doc.end();
    return;
  }

  // ── Una sección por consulta ──
  consultas.forEach((c, idx) => {
    guardarEspacio(doc, 120);

    // Barra de consulta
    const titleY = doc.y;
    doc.rect(ML, titleY, doc.page.width - ML - MR, 22).fill(VERDE);
    doc.fillColor(BLANCO).font('Helvetica-Bold').fontSize(9)
       .text(
         `CONSULTA ${idx + 1}  ·  ${fmtFechaLarga(c.fechaConsulta)}  ·  Dr(a). ${c.veterinario.nombre} ${c.veterinario.apellido}`,
         ML + 6, titleY + 7, { width: doc.page.width - ML - MR - 12, lineBreak: false },
       );
    doc.y = titleY + 26;

    let par = 0;
    const campo = (etq: string, val: string | null | undefined) => {
      if (!val) return;
      parKV(doc, etq, val, par % 2 === 0);
      par++;
    };

    campo('Motivo de consulta',    c.motivoConsulta);
    campo('Síntomas observados',   c.sintomasObservados);
    campo('Tratamientos previos',  c.tratamientosPrevios);
    campo('Diagnóstico definitivo', c.diagnosticoDefinitivo);
    campo('Observaciones',         c.observaciones);

    // Signos vitales
    const vitales: string[] = [];
    if (c.temperatura != null)            vitales.push(`Temperatura: ${c.temperatura} °C`);
    if (c.frecuenciaCardiaca != null)     vitales.push(`FC: ${c.frecuenciaCardiaca} lpm`);
    if (c.frecuenciaRespiratoria != null) vitales.push(`FR: ${c.frecuenciaRespiratoria} rpm`);
    if (c.tiempoLlenadoCapilar != null)   vitales.push(`TLC: ${c.tiempoLlenadoCapilar} s`);
    if (c.movimientosRuminales != null)   vitales.push(`Rum: ${c.movimientosRuminales}/min`);
    if (c.condicionCorporal != null)      vitales.push(`C.C.: ${c.condicionCorporal}/5`);
    if (vitales.length) campo('Signos vitales', vitales.join('   ·   '));

    // Enfermedades (incluye diagnóstico/pronóstico/plan propios de cada condición)
    if (c.enfermedades.length) {
      campo(
        'Enfermedades',
        c.enfermedades.map((e) => {
          const linea = `${e.nombreEnfermedad} — ${e.activa ? 'Activa' : 'Resuelta'}${e.fechaResolucion ? ` (${fmtFecha(e.fechaResolucion)})` : ''}`;
          const detalle = [
            e.diagnosticoDefinitivo && `Dx: ${e.diagnosticoDefinitivo}`,
            e.pronostico && `Pronóstico: ${e.pronostico}`,
            e.planDiagnostico && `Plan: ${e.planDiagnostico}`,
            e.pruebasDiagnostico && `Pruebas: ${e.pruebasDiagnostico}`,
          ].filter(Boolean).join(' · ');
          return detalle ? `${linea}\n  ${detalle}` : linea;
        }).join('\n'),
      );
    }

    // Tratamientos — tabla
    if (c.tratamientos.length) {
      guardarEspacio(doc, 40);
      doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8)
         .text('Tratamientos', ML, doc.y).moveDown(0.3);
      tablaPDF(
        doc,
        ['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración', 'Estado'],
        c.tratamientos.map((t) => [
          t.medicamento.nombre, t.dosis, t.viaAdministracion,
          t.frecuencia,
          t.duracionDias ? `${t.duracionDias} d` : '—',
          t.estado === 'EN_CURSO' ? 'En curso' : t.estado === 'COMPLETADO' ? 'Completado' : t.estado,
        ]),
        [130, 64, 72, 90, 54, 80],
        16,
      );
    }

    // Info epidemiológica
    if (c.informacionEpidemiologica) {
      const ep = c.informacionEpidemiologica as any;
      const vecs = [
        ep.garrapatas && 'Garrapatas', ep.mosquitos && 'Mosquitos',
        ep.murcielagos && 'Murciélagos', ep.moscas && 'Moscas',
        ep.otrosVectores,
      ].filter(Boolean).join(', ');
      if (vecs) campo('Vectores epidemiológicos', vecs);
      if (ep.descripcionEntorno) campo('Descripción epidemiológica', ep.descripcionEntorno);
    }

    doc.moveDown(0.8);
  });

  // ── Desparasitaciones del animal (no atadas a una consulta puntual) ──
  if (desparasitacionesAnimal.length) {
    doc.moveDown(0.5);
    guardarEspacio(doc, 50);
    seccionPDF(doc, 'Desparasitaciones');
    tablaPDF(
      doc,
      ['Producto', 'Principio activo', 'Tipo', 'Fecha', 'Dosis', 'Vía'],
      desparasitacionesAnimal.map((d) => [
        d.medicamento?.nombre ?? '—', d.medicamento?.principioActivo ?? '—',
        etiquetaEnum(d.tipo),
        fmtFecha(d.fecha), d.dosis ?? '—', d.via ?? '—',
      ]),
      [110, 110, 68, 60, 60, 68],
    );
  }

  piePaginaPDF(doc);
  doc.end();
}

// =============================================================================
// REPORTE 6 — PDF DE UNA CONSULTA ESPECÍFICA
// =============================================================================
export async function generarConsulta(res: Response, consultaId: string) {
  const c = await prisma.historialMedico.findUnique({
    where: { id: consultaId },
    include: {
      animal: {
        select: {
          numeroIdentificacion: true, nombre: true, sexo: true, fechaNacimiento: true,
          pesoActual: true, color: true, estadoSanitario: true,
          raza: { select: { nombre: true } },
          lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
        },
      },
      veterinario:              { select: { nombre: true, apellido: true, cargo: true } },
      enfermedades:             true,
      tratamientos:             { include: { medicamento: { select: { nombre: true } } } },
      informacionEpidemiologica: true,
    },
  });

  if (!c) {
    res.status(404).json({ error: 'Consulta no encontrada' });
    return;
  }

  const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="consulta_${c.id.slice(-8)}.pdf"`);
  doc.pipe(res);

  const nombreAnimal = c.animal.nombre
    ? `${c.animal.nombre}  —  #${c.animal.numeroIdentificacion}`
    : `#${c.animal.numeroIdentificacion}`;

  encabezadoPDF(
    doc,
    `Informe de Consulta Veterinaria`,
    `${fmtFechaLarga(c.fechaConsulta)}  ·  ${nombreAnimal}  ·  ${c.animal.lote?.finca?.nombre ?? '—'}`,
  );

  // ── Datos del animal ──
  seccionPDF(doc, 'Datos del Animal');
  const fichaA: [string, string][] = [
    ['N.° Identificación',        c.animal.numeroIdentificacion],
    ['Nombre',           c.animal.nombre ?? '—'],
    ['Sexo',             c.animal.sexo === 'MACHO' ? 'Macho' : 'Hembra'],
    ['Raza',             c.animal.raza?.nombre ?? '—'],
    ['Finca',            c.animal.lote?.finca?.nombre ?? '—'],
    ['Lote',             c.animal.lote?.nombre  ?? '—'],
    ['Fecha nacimiento', fmtFechaLarga(c.animal.fechaNacimiento)],
    ['Peso',             c.animal.pesoActual != null ? `${c.animal.pesoActual} kg` : '—'],
    ['Estado sanitario', etiquetaEnum(c.animal.estadoSanitario)],
  ];
  fichaA.forEach(([k, v], i) => parKV(doc, k, v, i % 2 === 0));

  // ── Datos de la consulta ──
  doc.moveDown(0.8);
  guardarEspacio(doc, 40);
  seccionPDF(doc, 'Datos de la Consulta');

  const info: [string, string][] = [
    ['Fecha de consulta', fmtFechaLarga(c.fechaConsulta)],
    ['Veterinario',       `${c.veterinario.nombre} ${c.veterinario.apellido}${c.veterinario.cargo ? '  —  ' + c.veterinario.cargo : ''}`],
  ];
  info.forEach(([k, v], i) => parKV(doc, k, v, i % 2 === 0));

  let par = info.length;
  const campo = (etq: string, val: string | null | undefined) => {
    if (!val) return;
    parKV(doc, etq, val, par % 2 === 0);
    par++;
  };

  // ── Anamnesis ──
  doc.moveDown(0.6);
  guardarEspacio(doc, 30);
  doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
     .text('ANAMNESIS', ML, doc.y).moveDown(0.3);
  par = 0;
  campo('Motivo de consulta',   c.motivoConsulta);
  campo('Síntomas observados',  c.sintomasObservados);
  campo('Tratamientos previos', c.tratamientosPrevios);
  campo('Cirugías previas',     c.cirugias);

  // ── Exploración física ──
  const vitales: string[] = [];
  if (c.temperatura != null)            vitales.push(`Temperatura: ${c.temperatura} °C`);
  if (c.frecuenciaCardiaca != null)     vitales.push(`FC: ${c.frecuenciaCardiaca} lpm`);
  if (c.frecuenciaRespiratoria != null) vitales.push(`FR: ${c.frecuenciaRespiratoria} rpm`);
  if (c.tiempoLlenadoCapilar != null)   vitales.push(`TLC: ${c.tiempoLlenadoCapilar} s`);
  if (c.movimientosRuminales != null)   vitales.push(`Rum: ${c.movimientosRuminales}/min`);
  if (c.condicionCorporal != null)      vitales.push(`C.C.: ${c.condicionCorporal}/5`);
  if (c.estadoReproductivo)             vitales.push(`Est. reprod.: ${c.estadoReproductivo.replace(/_/g, ' ')}`);
  if (c.litrosLechesDiarios != null)    vitales.push(`Leche/día: ${c.litrosLechesDiarios} L`);
  if (c.gananciaPeso != null)           vitales.push(`Ganancia peso: ${c.gananciaPeso} kg`);

  if (vitales.length) {
    doc.moveDown(0.6);
    guardarEspacio(doc, 30);
    doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
       .text('EXPLORACIÓN FÍSICA', ML, doc.y).moveDown(0.3);
    par = 0;
    // Cada signo vital en su propia fila para legibilidad
    vitales.forEach((v) => campo(v.split(':')[0].trim(), v.split(':').slice(1).join(':').trim()));
  }

  // ── Diagnóstico y plan ──
  doc.moveDown(0.6);
  guardarEspacio(doc, 30);
  doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
     .text('DIAGNÓSTICO Y PLAN', ML, doc.y).moveDown(0.3);
  par = 0;
  campo('Diagnóstico definitivo',        c.diagnosticoDefinitivo);
  campo('Resultados de pruebas',         c.resultadosPruebas);
  campo('Observaciones generales',       c.observaciones);

  // ── Enfermedades ──
  if (c.enfermedades.length) {
    doc.moveDown(0.6);
    guardarEspacio(doc, 50);
    doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
       .text('ENFERMEDADES', ML, doc.y).moveDown(0.3);
    tablaPDF(
      doc,
      ['Enfermedad', 'Fecha inicio', 'Estado', 'Descripción clínica'],
      c.enfermedades.map((e) => [
        e.nombreEnfermedad,
        fmtFecha(e.fechaInicio),
        e.activa ? 'Activa' : 'Resuelta',
        e.descripcionClinica ?? '—',
      ]),
      [130, 68, 68, 220],
      16,
    );
  }

  // ── Tratamientos ──
  if (c.tratamientos.length) {
    doc.moveDown(0.6);
    guardarEspacio(doc, 50);
    doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
       .text('TRATAMIENTOS', ML, doc.y).moveDown(0.3);
    tablaPDF(
      doc,
      ['Medicamento', 'Dosis', 'Vía', 'Frecuencia', 'Duración', 'Estado'],
      c.tratamientos.map((t) => [
        t.medicamento.nombre, t.dosis, t.viaAdministracion,
        t.frecuencia,
        t.duracionDias ? `${t.duracionDias} d` : '—',
        t.estado === 'EN_CURSO' ? 'En curso' : t.estado === 'COMPLETADO' ? 'Completado' : t.estado,
      ]),
      [130, 64, 72, 92, 52, 76],
      16,
    );
  }

  // Las desparasitaciones ya no se atan a una consulta puntual (se
  // identifican solo por el animal), así que no tienen sección aquí — se
  // consultan desde el historial completo del animal.

  // ── Info epidemiológica ──
  if (c.informacionEpidemiologica) {
    const ep = c.informacionEpidemiologica as any;
    const vecs = [
      ep.garrapatas && 'Garrapatas', ep.mosquitos && 'Mosquitos',
      ep.murcielagos && 'Murciélagos', ep.moscas && 'Moscas',
      ep.otrosVectores,
    ].filter(Boolean).join(', ');
    if (vecs || ep.descripcionEntorno) {
      doc.moveDown(0.6);
      guardarEspacio(doc, 30);
      doc.fillColor(GRIS_SUAVE).font('Helvetica-Bold').fontSize(8.5)
         .text('INFORMACIÓN EPIDEMIOLÓGICA', ML, doc.y).moveDown(0.3);
      par = 0;
      if (vecs) campo('Vectores', vecs);
      if (ep.descripcionEntorno) campo('Descripción', ep.descripcionEntorno);
    }
  }

  // ── Firma ──
  doc.moveDown(2);
  guardarEspacio(doc, 60);
  const W = doc.page.width;
  const firmaX = W / 2 + 20;
  const firmaY = doc.y;
  doc.moveTo(firmaX, firmaY).lineTo(W - MR, firmaY)
     .strokeColor(GRIS_LINEA).lineWidth(0.6).stroke();
  doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(8)
     .text(
       `${c.veterinario.nombre} ${c.veterinario.apellido}\n${c.veterinario.cargo ?? 'Médico Veterinario'}`,
       firmaX, firmaY + 4, { align: 'center', width: W - MR - firmaX },
     );

  piePaginaPDF(doc);
  doc.end();
}
// =============================================================================
// REPORTE 7 — MOVILIDAD DE UN ANIMAL (GPS)
// =============================================================================
// Resumen del recorrido (distancia, tiempo, velocidad), desglose por día y el
// registro de posiciones, para imprimir o archivar.
export async function generarMovilidad(
  res: Response,
  animalId: string,
  rango: { desde?: Date; hasta?: Date } = {},
) {
  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: {
      numeroIdentificacion: true, nombre: true, sexo: true,
      raza: { select: { nombre: true } },
      lote: { select: { nombre: true, finca: { select: { nombre: true } } } },
      dispositivoGPS: { select: { codigoDispositivo: true, modelo: true, fabricante: true, nivelBateria: true, ultimaConexion: true } },
    },
  });
  if (!animal) {
    res.status(404).json({ error: 'Animal no encontrado' });
    return;
  }

  const movilidad = await obtenerMovilidadAnimal(animalId, { ...rango, limite: 1000 });
  const puntos = movilidad.puntos;

  const fmtFechaHora = (d: Date) =>
    d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDistancia = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const fmtDuracion = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

  const doc = new PDFDocument({ margin: ML, size: 'A4', bufferPages: true, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="movilidad_${animal.numeroIdentificacion}.pdf"`);
  doc.pipe(res);

  const nombreAnimal = animal.nombre ? `${animal.nombre}  —  #${animal.numeroIdentificacion}` : `#${animal.numeroIdentificacion}`;
  const periodo = puntos.length
    ? `${fmtFecha(rango.desde ?? puntos[0]!.fechaRegistro)} al ${fmtFecha(rango.hasta ?? puntos[puntos.length - 1]!.fechaRegistro)}`
    : rango.desde || rango.hasta ? `${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}` : 'Sin registros';
  encabezadoPDF(doc, 'Reporte de Movilidad', `${nombreAnimal}  ·  ${animal.lote?.finca?.nombre ?? '—'}  ·  Período: ${periodo}`);

  seccionPDF(doc, 'Animal y dispositivo');
  const ficha: [string, string | null | undefined][] = [
    ['Animal', nombreAnimal],
    ['Raza / sexo', `${animal.raza?.nombre ?? '—'}  ·  ${animal.sexo === 'MACHO' ? 'Macho' : 'Hembra'}`],
    ['Finca / lote', `${animal.lote?.finca?.nombre ?? '—'}  ·  ${animal.lote?.nombre ?? '—'}`],
    ['Collar GPS', animal.dispositivoGPS
      ? [animal.dispositivoGPS.codigoDispositivo, animal.dispositivoGPS.fabricante, animal.dispositivoGPS.modelo].filter(Boolean).join('  ·  ')
      : 'Sin collar asignado'],
    ['Batería', animal.dispositivoGPS?.nivelBateria != null ? `${animal.dispositivoGPS.nivelBateria}%` : '—'],
    ['Última señal', animal.dispositivoGPS?.ultimaConexion ? fmtFechaHora(animal.dispositivoGPS.ultimaConexion) : '—'],
  ];
  ficha.forEach(([k, v], i) => parKV(doc, k, v, i % 2 === 0));
  doc.moveDown(0.8);

  seccionPDF(doc, 'Resumen del recorrido');
  tarjetasKPI(doc, [
    ['Distancia recorrida', fmtDistancia(movilidad.distanciaMetros)],
    ['Tiempo registrado', fmtDuracion(movilidad.duracionMinutos)],
    ['Velocidad promedio', `${movilidad.velocidadPromedioKmH} km/h`],
    ['Posiciones', String(movilidad.cantidadRegistros)],
  ], 4);

  if (!puntos.length) {
    doc.fillColor(GRIS_SUAVE).font('Helvetica').fontSize(9)
       .text('No hay posiciones registradas para este animal en el período indicado.', ML, doc.y);
    piePaginaPDF(doc);
    doc.end();
    return;
  }

  // Desglose por día: distancia entre posiciones consecutivas del mismo día
  const porDia = new Map<string, { fecha: Date; posiciones: number; distancia: number; velMax: number }>();
  puntos.forEach((p, i) => {
    const clave = p.fechaRegistro.toLocaleDateString('es-VE');
    const dia = porDia.get(clave) ?? { fecha: p.fechaRegistro, posiciones: 0, distancia: 0, velMax: 0 };
    dia.posiciones += 1;
    dia.velMax = Math.max(dia.velMax, p.velocidad ?? 0);
    const previo = puntos[i - 1];
    if (previo && previo.fechaRegistro.toLocaleDateString('es-VE') === clave) {
      const dLat = (p.latitud - previo.latitud) * Math.PI / 180;
      const dLng = (p.longitud - previo.longitud) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(previo.latitud * Math.PI / 180) * Math.cos(p.latitud * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      dia.distancia += 2 * 6_371_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    porDia.set(clave, dia);
  });

  doc.moveDown(0.4);
  seccionPDF(doc, 'Movilidad por día');
  tablaPDF(
    doc,
    ['Fecha', 'Posiciones', 'Distancia', 'Velocidad máx.'],
    [...porDia.values()].map((d) => [
      fmtFecha(d.fecha), String(d.posiciones), fmtDistancia(d.distancia), d.velMax ? `${d.velMax} km/h` : '—',
    ]),
    [120, 80, 100, 100],
  );

  doc.moveDown(0.6);
  guardarEspacio(doc, 60);
  seccionPDF(doc, `Registro de posiciones (${puntos.length})`);
  tablaPDF(
    doc,
    ['#', 'Fecha / hora', 'Latitud', 'Longitud', 'Velocidad'],
    puntos.map((p, i) => [
      String(i + 1), fmtFechaHora(p.fechaRegistro), p.latitud.toFixed(6), p.longitud.toFixed(6),
      p.velocidad == null ? '—' : p.velocidad > 0 ? `${p.velocidad} km/h` : 'Detenido',
    ]),
    [30, 120, 90, 90, 80],
    16,
  );

  piePaginaPDF(doc);
  doc.end();
}
