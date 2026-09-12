import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const isProd = process.env.NODE_ENV === "production";
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline';"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval';";

const cspHeader = `
  default-src 'self';
  ${scriptSrc}
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co ${!isProd ? "http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*" : ""};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isProd ? "upgrade-insecure-requests;" : ""}
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  typescript: {
    tsconfigPath: "tsconfig.build.json",
  },
  env: {
    APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  outputFileTracingExcludes: {
    '*': [
      './src/**/__tests__/**',
      './src/**/*.test.{ts,tsx}',
      './coverage/**',
      './vitest.config.ts',
      './playwright.config.ts',
      './e2e/**',
      './test-results/**',
      './playwright-report/**',
    ],
  },
};

export default nextConfig;
