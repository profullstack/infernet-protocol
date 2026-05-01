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
  // Forward old extensionless chapter URLs to the new pandoc-built
  // .html files under /book/<path>.html.
  async redirects() {
    return [
      {
        source: "/book/:section(\\d{2}-[^/.]+)",
        destination: "/book/:section/index.html",
        permanent: true
      },
      {
        // Constrain :page to NOT contain a dot, otherwise the existing
        // /book/<section>/<page>.html files match this rule and redirect
        // back to themselves with another .html appended (loop).
        source: "/book/:section(\\d{2}-[^/.]+)/:page([^/.]+)",
        destination: "/book/:section/:page.html",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
