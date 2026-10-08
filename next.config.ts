import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  // The Kafka client resolves its own files through import.meta.url, which only works unbundled.
  serverExternalPackages: ['@platformatic/kafka'],
}

export default nextConfig
