/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We run `next start` in Docker, so we keep the default output instead of standalone.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
