import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // 1. Aquí le decimos a Turbopack cómo resolver el alias '@'
    resolveAlias: {
      '@': './',
    },
    // 2. Mantenemos tu configuración para cargar los CSS de Tailwind
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;