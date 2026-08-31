import { FileSpreadsheet, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { REPORT_TYPES } from '@/services/reportService';

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reportes</h1>
      <p className="text-sm text-muted-foreground">
        Descarga cualquier reporte en Excel o CSV. Los documentos individuales (corte, estado de cuenta, recibo) se
        generan en PDF desde la ficha de cada cliente.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(REPORT_TYPES).map(([key, config]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> {config.label}
              </CardTitle>
              <CardDescription>Exportar como archivo descargable</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <a
                href={`/api/reports/${key}?format=xlsx`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                <FileSpreadsheet className="h-4 w-4" /> Excel
              </a>
              <a
                href={`/api/reports/${key}?format=csv`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="h-4 w-4" /> CSV
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
