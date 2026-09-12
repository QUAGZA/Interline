import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  transpilePackages: ["@interline/api-types"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    optimizePackageImports: ["gsap", "lucide-react", "framer-motion", "lenis"],
  },
};

export default nextConfig;
