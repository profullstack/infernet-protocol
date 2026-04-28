/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@infernetprotocol/config",
    "@infernetprotocol/payments",
    "@infernetprotocol/deploy-providers",
    "@infernetprotocol/nim-adapter",
    "@infernetprotocol/db",
    "@infernetprotocol/gpu",
    "@infernetprotocol/auth",
    "@infernetprotocol/logger",
    "@infernetprotocol/inference"
  ],
  // Next.js 16 moved this out of `experimental` to the top level.
  typedRoutes: false
};

export default nextConfig;
