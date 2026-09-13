import type { NextConfig } from "next";
import path from "node:path";

/** Hoisted workspace viem. Use a relative path — Turbopack rejects Windows absolute imports. */
const viemUtils = "../node_modules/viem/_esm/utils/index.js";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  transpilePackages: ["@interline/api-types", "@interline/math", "viem", "wagmi", "@wagmi/core", "@wagmi/connectors"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    optimizePackageImports: ["gsap", "lucide-react", "framer-motion", "lenis"],
  },
  turbopack: {
    resolveAlias: {
      "viem/utils": viemUtils,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "viem/utils": viemUtils,
    };
    return config;
  },
};

export default nextConfig;
