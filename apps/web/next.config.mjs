/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@infernet/sdk', '@infernet/shared', '@infernet/core'],
  experimental: {
    serverComponentsExternalPackages: ['libp2p', '@chainsafe/libp2p-noise'],
  },
};

export default nextConfig;
