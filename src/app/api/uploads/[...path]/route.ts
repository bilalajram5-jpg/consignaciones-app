import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/auth/session';
import { getStorageProvider } from '@/lib/storage';

/**
 * Sirve archivos guardados por LocalDiskStorageProvider (facturas,
 * comprobantes de pago). NUNCA están en `public/`: esta ruta exige sesión
 * válida antes de devolver cualquier archivo (sección 22: "manejo seguro de
 * archivos"). En producción con STORAGE_PROVIDER="s3", esta ruta no se usa
 * — se sirven URLs firmadas temporales directamente desde S3.
 */
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const key = params.path.join('/');
  const storage = getStorageProvider();

  try {
    const buffer = await storage.read(key);
    const contentType = guessContentType(key);
    return new NextResponse(buffer, { headers: { 'Content-Type': contentType } });
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
  }
}

function guessContentType(key: string): string {
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}
