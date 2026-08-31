/**
 * Extracción de texto NATIVO de un PDF (sección 32: "Utilizar extracción
 * nativa de PDF cuando sea posible y OCR únicamente cuando sea necesario").
 *
 * Esto NO es un sustituto de la lectura por IA: es un complemento. Un PDF
 * generado digitalmente (no escaneado) ya tiene el texto embebido; extraerlo
 * aquí y pasarlo como contexto adicional al prompt de la IA (ver
 * src/ai/invoiceExtraction.ts) mejora la precisión, especialmente en tablas
 * con letra pequeña. Si el PDF es un escaneo (imagen dentro de PDF, sin
 * capa de texto), esta función puede devolver texto vacío o fallar —  el
 * llamador debe tratar ese caso como normal y confiar en la lectura visual
 * de la IA (Claude procesa el PDF completo como documento, no solo el texto
 * que aquí se extrae).
 *
 * PENDIENTE DE VERIFICAR FUERA DEL SANDBOX: usa el paquete "pdf-parse", que
 * no se pudo instalar aquí (sin acceso a npm).
 */
export async function extractNativePdfText(fileBuffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(fileBuffer);
  return (result.text || '').trim();
}
