import ExcelJS from 'exceljs';

/**
 * Generador genérico de reportes Excel (sección 28). Todos los reportes
 * (inventario, cuentas por cobrar, ventas, pagos) pasan por esta misma
 * función para mantener un formato consistente.
 */
export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export async function buildExcelWorkbook(params: {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  title?: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Consignaciones';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(params.sheetName);
  sheet.columns = params.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  for (const row of params.rows) {
    sheet.addRow(row);
  }

  for (const col of params.columns) {
    if (col.numFmt) {
      sheet.getColumn(col.key).numFmt = col.numFmt;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Exportación CSV simple (sección 28), sin dependencias adicionales. */
export function buildCsv(columns: ExcelColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsv(String(row[c.key] ?? ''))).join(','));
  return [header, ...lines].join('\n');
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
