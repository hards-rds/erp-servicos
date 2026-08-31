import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/fiscal/nfse/danfse": ["./node_modules/pdfkit/js/data/*.afm"],
    "/api/fiscal/nfse/emitir": ["./node_modules/pdfkit/js/data/*.afm"],
    "/api/fiscal/nfse/enviar-email": ["./node_modules/pdfkit/js/data/*.afm"]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : [])
        ]
      }
    ];
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.symlinks = false;
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
