import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    const scriptSource =
      process.env.NODE_ENV === "development"
        ? "'self' 'unsafe-inline' 'unsafe-eval'"
        : "'self' 'unsafe-inline'";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.telegram.org`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
