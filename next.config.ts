import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // A stray lockfile in a parent directory makes Turbopack guess the wrong
  // workspace root. Pin it to this project.
  //
  // process.cwd() rather than __dirname: the config is loaded as ESM in some
  // build environments, where __dirname is not defined and would throw before
  // the build starts.
  turbopack: {
    root: process.cwd(),
  },

  // three.js and the R3F ecosystem ship large ESM barrels. Telling Next which
  // packages to tree-shake per-import keeps the client bundle from swallowing
  // the entire library when we only touch a handful of symbols.
  experimental: {
    optimizePackageImports: [
      'three',
      '@react-three/drei',
      'framer-motion',
      'lucide-react',
    ],
  },

  // Long-lived immutable caching for the static chunk output, plus the security
  // headers you want on anything that renders user-adjacent content.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

export default nextConfig;
