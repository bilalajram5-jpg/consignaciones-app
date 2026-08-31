import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { REPORT_TYPES, type ReportType } from '@/services/reportService';
import { buildExcelWorkbook, buildCsv } from '@/reports/excel/exportToExcel';
import { ForbiddenError } from '@/auth/permissions';

/**
 * GET /api/reports/:type?format=xlsx|csv (sección 28). Protegido por
 * permiso 'reports.export' (sección 22: nunca solo ocultar el botón en el
 * frontend — esta ruta revalida el permiso server-side).
 */
export async function GET(request: NextRequest, { params }: { params: { type: string } }) {
  try {
    await requireUser('reports.export');
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const type = params.type as ReportType;
  const config = REPORT_TYPES[type];
  if (!config) {
    return NextResponse.json({ error: `Reporte desconocido: ${type}` }, { status: 404 });
  }

  const { columns, rows } = await config.fn();
  const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'xlsx';

  if (format === 'csv') {
    const csv = buildCsv(columns, rows as Record<string, unknown>[]);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${type}.csv"`,
      },
    });
  }

  const buffer = await buildExcelWorkbook({ sheetName: config.label, columns, rows: rows as Record<string, unknown>[] });
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${type}.xlsx"`,
    },
  });
}
