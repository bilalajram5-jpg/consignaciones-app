import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { StorageProvider, StoredFileRef } from './StorageProvider';

const BASE_PATH = process.env.STORAGE_LOCAL_PATH || './storage';

export class LocalDiskStorageProvider implements StorageProvider {
  async save(params: {
    folder: 'invoices' | 'payments';
    filename: string;
    data: Buffer;
    contentType: string;
  }): Promise<StoredFileRef> {
    const ext = path.extname(params.filename) || '';
    const safeName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const key = `${params.folder}/${safeName}`;
    const fullPath = path.join(BASE_PATH, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.data);
    return { key, size: params.data.length, contentType: params.contentType };
  }

  async read(key: string): Promise<Buffer> {
    assertSafeKey(key);
    return fs.readFile(path.join(BASE_PATH, key));
  }

  async getServableUrl(key: string): Promise<string> {
    assertSafeKey(key);
    // Ruta protegida: valida sesión antes de servir el archivo (ver route.ts)
    return `/api/uploads/${key}`;
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await fs.rm(path.join(BASE_PATH, key), { force: true });
  }
}

/** Evita path traversal (../../etc/passwd) en cualquier key que venga de la DB o de un request. */
function assertSafeKey(key: string): void {
  const normalized = path.normalize(key);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Clave de almacenamiento inválida: ${key}`);
  }
}
