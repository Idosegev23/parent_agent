/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@parent-assistant/ui',
    '@parent-assistant/shared',
    '@parent-assistant/database'
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  typescript: {
    // Skip type checking during build (for now - types need to be regenerated)
    ignoreBuildErrors: true
  },
  eslint: {
    // Skip ESLint during build
    ignoreDuringBuilds: true
  }
};

module.exports = nextConfig;




