import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
    experimental: {
    serverActions: true,
    turbo: false,
  },
};

export default nextConfig;
