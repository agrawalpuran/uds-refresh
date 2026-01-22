/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Turbopack for production builds to avoid PostCSS/Tailwind resolution issues
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Disable TypeScript errors during build (we handle these separately)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.med-armour.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'med-armour.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.goindigo.in',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'goindigo.in',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig
