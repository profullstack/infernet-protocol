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
  typedRoutes: false,
  // Include monorepo doc sources in the deployment bundle so server
  // components in /book can read them at runtime (lib/book.js reads
  // markdown chapters from docs/book/ at runtime).
  outputFileTracingIncludes: {
    "/book": ["../../docs/book/**/*.md"],
    "/book/**": ["../../docs/book/**/*.md"]
  }
};

export default nextConfig;
