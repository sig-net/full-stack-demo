import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  // The Kafka client resolves its own files through import.meta.url, which only works unbundled.
  serverExternalPackages: ['@platformatic/kafka'],
  // Every action takes the caller secret as its first argument, which the invocation log would print.
  logging: { serverFunctions: false },
}

export default nextConfig
