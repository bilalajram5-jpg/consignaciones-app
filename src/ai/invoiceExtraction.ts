import Anthropic from '@anthropic-ai/sdk';
import { INVOICE_EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { extractNativePdfText } from '@/ocr/pdfTextExtraction';

/**
 * Integración con la API de Claude (multimodal) para leer facturas
 * (sección 3 y 32 del prompt maestro). Envía el PDF/imagen directamente
 * como `document`/`image` (Claude lo procesa nativamente, incluyendo OCR
 * interno para escaneos), sin necesidad de un motor de OCR separado — tal
 * como pide la sección 32: "Utilizar extracción nativa de PDF cuando sea
 * posible y OCR únicamente cuando sea necesario".
 *
 * Como respaldo adicional (no como sustituto), para PDFs con texto nativo
 * (no escaneados) también se extrae el texto con `pdf-lib`/`pdfjs`
 * (`src/ocr/pdfTextExtraction.ts`) y se agrega al prompt como contexto
 * extra: ayuda a la IA en documentos con texto muy pequeño o baja calidad
 * de imagen.
 *
 * NO EJECUTADO EN EL SANDBOX: requiere ANTHROPIC_API_KEY (variable de
 * entorno) y acceso de red a api.anthropic.com, ninguno disponible en este
 * entorno de desarrollo. El código se escribió cuidadosamente contra la
 * documentación pública de la API de Mensajes de Anthropic, pero DEBE
 * probarse con una factura real antes de confiar en él en producción — ver
 * VERIFICATION_LOG.md.
 */

export interface InvoiceItemConfidence {
  reference?: number;
  description?: number;
  quantity?: number;
  unitPrice?: number;
}

export interface ExtractedInvoiceItem {
  reference: string;
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
  confidence?: InvoiceItemConfidence;
}

export interface ExtractedInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  items: ExtractedInvoiceItem[];
  invoiceTotal: string;
  overallConfidence: number;
  model: string;
  raw: unknown;
}

export class AIExtractionError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AIExtractionError(
      'Falta configurar ANTHROPIC_API_KEY. Agrega tu clave de la API de Anthropic en .env (ver .env.example) para poder usar la lectura automática de facturas.'
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function extractInvoiceData(params: {
  fileBuffer: Buffer;
  contentType: string;
  sourceType: 'PDF' | 'IMAGE';
}): Promise<ExtractedInvoice> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';
  const base64 = params.fileBuffer.toString('base64');

  let nativeText: string | null = null;
  if (params.sourceType === 'PDF') {
    try {
      nativeText = await extractNativePdfText(params.fileBuffer);
    } catch {
      // El PDF puede ser un escaneo sin texto nativo; la IA lo leerá igual
      // por visión. No es un error fatal.
      nativeText = null;
    }
  }

  const documentBlock =
    params.sourceType === 'PDF'
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: normalizeImageMediaType(params.contentType),
            data: base64,
          },
        };

  const userText = nativeText
    ? `${buildUserPrompt()}\n\nTexto extraído nativamente del PDF (puede ser útil como referencia adicional, pero prioriza lo que veas visualmente en el documento):\n"""\n${nativeText.slice(0, 8000)}\n"""`
    : buildUserPrompt();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: INVOICE_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [documentBlock, { type: 'text', text: userText }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new AIExtractionError('La IA no devolvió una respuesta de texto con los datos de la factura.');
  }

  const parsed = parseJsonResponse(textBlock.text);

  return {
    invoiceNumber: String(parsed.invoice_number ?? ''),
    invoiceDate: String(parsed.invoice_date ?? new Date().toISOString().slice(0, 10)),
    customerName: String(parsed.customer_name ?? ''),
    items: (Array.isArray(parsed.items) ? parsed.items : []).map(normalizeItem),
    invoiceTotal: toMoneyString(parsed.invoice_total),
    overallConfidence: clamp01(Number(parsed.overall_confidence ?? 0.5)),
    model,
    raw: parsed,
  };
}

function normalizeItem(raw: any): ExtractedInvoiceItem {
  return {
    reference: String(raw?.reference ?? '').trim() || 'SIN-REF',
    description: String(raw?.description ?? '').trim() || 'Producto sin descripción',
    quantity: Number(raw?.quantity ?? 0),
    unitPrice: toMoneyString(raw?.unit_price),
    total: toMoneyString(raw?.total),
    confidence: raw?.confidence
      ? {
          reference: clamp01(Number(raw.confidence.reference ?? 0.5)),
          description: clamp01(Number(raw.confidence.description ?? 0.5)),
          quantity: clamp01(Number(raw.confidence.quantity ?? 0.5)),
          unitPrice: clamp01(Number(raw.confidence.unit_price ?? 0.5)),
        }
      : undefined,
  };
}

function toMoneyString(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function normalizeImageMediaType(contentType: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (contentType === 'image/png') return 'image/png';
  if (contentType === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * La IA puede, ocasionalmente, envolver el JSON en explicación adicional a
 * pesar del prompt. Se busca el primer bloque `{...}` balanceado como
 * salvaguarda antes de fallar.
 */
function parseJsonResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // sigue al error de abajo
      }
    }
    throw new AIExtractionError('No se pudo interpretar la respuesta de la IA como JSON válido.');
  }
}
