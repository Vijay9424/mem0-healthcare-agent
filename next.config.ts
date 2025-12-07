import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
    },
    serverSourceMaps: false, // 🔥 fixes "Invalid source map" spam in dev mode
  },

  productionBrowserSourceMaps: false, // 🔥 prevents sourcemap warnings in prod too
};

export default nextConfig;
