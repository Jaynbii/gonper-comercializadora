import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

<<<<<<< HEAD
  //  ESTA ES LA ÚNICA LÍNEA NUEVA AÑADIDA 
=======
>>>>>>> c07f084fcb50d02cf561eac5b731e3872e9f66ea
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
<<<<<<< HEAD
  //  FIN DEL CAMBIO 
=======
>>>>>>> c07f084fcb50d02cf561eac5b731e3872e9f66ea

  turbopack: {
    resolveAlias: {
      "@": "./",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;