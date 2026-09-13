import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

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
