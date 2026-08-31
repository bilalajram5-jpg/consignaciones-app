import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * Utilidades compartidas de layout para los generadores de PDF (secciones
 * 11, 27 y 28 del prompt maestro). Se extrajeron aquí porque el Estado de
 * Cuenta, el Historial del Cliente y el Inventario Actual pueden tener
 * muchas más filas que un Corte de Consignación y necesitan paginar
 * correctamente en vez de cortar la tabla en seco cuando se acaba la hoja
 * (limitación que sí tenía la primera versión de `generateCutPdf.ts`).
 */
export interface PdfLayout {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const PDF_MARGIN = 50;
export const CONTENT_RIGHT = PAGE_WIDTH - PDF_MARGIN;

export async function createPdfLayout(): Promise<PdfLayout> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, font, bold, y: PAGE_HEIGHT - PDF_MARGIN };
}

/**
 * Agrega una página nueva si no queda suficiente espacio vertical para la
 * próxima fila. Devuelve `true` cuando paginó (para que el llamador pueda
 * volver a dibujar el encabezado de la tabla en la página nueva).
 */
export function ensureSpace(layout: PdfLayout, minY = 90): boolean {
  if (layout.y >= minY) return false;
  layout.page = layout.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  layout.y = PAGE_HEIGHT - PDF_MARGIN;
  return true;
}

export function drawLine(layout: PdfLayout) {
  layout.page.drawLine({
    start: { x: PDF_MARGIN, y: layout.y },
    end: { x: CONTENT_RIGHT, y: layout.y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
