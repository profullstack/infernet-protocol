/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@infernet/config",
    "@infernet/payments",
    "@infernet/deploy-providers",
    "@infernet/db",
    "@infernet/gpu",
    "@infernet/auth",
    "@infernet/logger",
    "@infernet/inference"
  ],
  experimental: {
    typedRoutes: false
  }
};

export default nextConfig;
