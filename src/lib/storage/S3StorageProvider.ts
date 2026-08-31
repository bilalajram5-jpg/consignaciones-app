import type { StorageProvider, StoredFileRef } from './StorageProvider';

/**
 * Implementación S3 (o compatible: Cloudflare R2, Supabase Storage, MinIO).
 *
 * PENDIENTE DE VERIFICAR FUERA DEL SANDBOX: requiere el paquete
 * "@aws-sdk/client-s3" y "@aws-sdk/s3-request-presigner" (agrégalos a
 * package.json si vas a usar STORAGE_PROVIDER="s3"; se omitieron de las
 * dependencias por defecto porque el proveedor local es el que se usa en
 * desarrollo). Variables de entorno requeridas: S3_BUCKET, S3_REGION,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT (opcional, para R2/MinIO).
 */
export class S3StorageProvider implements StorageProvider {
  private bucket: string;
  private client: unknown; // instancia de S3Client, tipada como unknown para no forzar la dependencia en tiempo de compilación si no se usa

  constructor() {
    this.bucket = requireEnv('S3_BUCKET');
    // La inicialización real de S3Client se hace de forma perezosa (lazy)
    // en cada método, para no romper el build si el SDK no está instalado
    // y STORAGE_PROVIDER nunca se puso en "s3".
    this.client = null;
  }

  private async getClient() {
    if (!this.client) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: requireEnv('S3_REGION'),
        endpoint: process.env.S3_ENDPOINT || undefined,
        credentials: {
          accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
          secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
        },
      });
    }
    return this.client as import('@aws-sdk/client-s3').S3Client;
  }

  async save(params: {
    folder: 'invoices' | 'payments';
    filename: string;
    data: Buffer;
    contentType: string;
  }): Promise<StoredFileRef> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const key = `${params.folder}/${Date.now()}-${sanitize(params.filename)}`;
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: params.data,
        ContentType: params.contentType,
      })
    );
    return { key, size: params.data.length, contentType: params.contentType };
  }

  async read(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getServableUrl(key: string): Promise<string> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await this.getClient();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 900, // 15 minutos
    });
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} (requerida por S3StorageProvider)`);
  }
  return value;
}
