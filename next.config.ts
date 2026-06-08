import type { NextConfig } from 'next';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const isStatic = process.env.BUILD_MODE === 'static';
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site', '*.agent-sandbox-bj-a2-gw.trae.cn', 'localhost', '127.0.0.1'],
  images: {
    unoptimized: isStatic,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  ...(isStatic && {
    output: 'export',
    basePath: '/gongkao-review',
    trailingSlash: true,
  }),
};

export default nextConfig;
