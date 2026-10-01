import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Move external packages to the correct key for Next.js 16
  serverExternalPackages: ['pdfjs-dist', 'mammoth', 'canvas'],

  // Use empty turbopack config to silence the webpack/turbopack conflict warning
  turbopack: {},
};

export default nextConfig;
