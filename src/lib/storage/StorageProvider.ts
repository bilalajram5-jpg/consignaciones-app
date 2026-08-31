/**
 * Abstracción de almacenamiento de archivos (facturas subidas, comprobantes
 * de pago). Nunca se guardan en `public/` (quedarían accesibles sin
 * autenticación). Dos implementaciones:
 *
 *  - LocalDiskStorageProvider: para desarrollo, escribe en ./storage
 *    (fuera de public/, servido por una ruta protegida — ver
 *    src/app/api/uploads/[...path]/route.ts).
 *  - S3StorageProvider: para producción, cualquier servicio compatible con
 *    S3 (AWS S3, Cloudflare R2, Supabase Storage, MinIO).
 *
 * Se elige con la variable de entorno STORAGE_PROVIDER (ver .env.example).
 * Ningún código de negocio debe importar `fs` o un SDK de S3 directamente:
 * siempre pasa por esta interfaz.
 */

export interface StoredFileRef {
  /** Clave/ruta interna, para volver a leer el archivo (no es una URL pública). */
  key: string;
  /** Tamaño en bytes */
  size: number;
  /** Content-Type detectado/declarado */
  contentType: string;
}

export interface StorageProvider {
  /** Guarda un archivo y devuelve su referencia interna. */
  save(params: { folder: 'invoices' | 'payments'; filename: string; data: Buffer; contentType: string }): Promise<StoredFileRef>;
  /** Lee un archivo previamente guardado. */
  read(key: string): Promise<Buffer>;
  /** Genera una URL temporal firmada (S3) o una ruta protegida (local) para servir el archivo. */
  getServableUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}
