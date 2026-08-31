/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Facturas/comprobantes pueden ser PDFs/imágenes de varios MB
      bodySizeLimit: '15mb',
    },
  },
  images: {
    remotePatterns: [
      // Ajustar según el STORAGE_PROVIDER usado en producción (ver .env.example)
      { protocol: 'https', hostname: '**.s3.amazonaws.com' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },
};

export default nextConfig;
