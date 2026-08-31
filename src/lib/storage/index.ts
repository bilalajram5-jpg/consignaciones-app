import type { StorageProvider } from './StorageProvider';
import { LocalDiskStorageProvider } from './LocalDiskStorageProvider';

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  const provider = process.env.STORAGE_PROVIDER || 'local';
  if (provider === 's3') {
    // Import dinámico (require): evita cargar el módulo S3 (y su dependencia
    // opcional del SDK de AWS) cuando no se usa. Next.js soporta require()
    // en código server-only sin problema.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3StorageProvider } = require('./S3StorageProvider');
    instance = new S3StorageProvider();
  } else {
    instance = new LocalDiskStorageProvider();
  }
  return instance;
}

export type { StorageProvider, StoredFileRef } from './StorageProvider';
