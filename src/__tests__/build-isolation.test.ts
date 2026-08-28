import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import nextConfig from "../../next.config";

describe("Build & Deployment Isolation", () => {
  const rootDir = resolve(__dirname, "../..");

  describe("tsconfig.build.json", () => {
    const tsconfigBuildPath = resolve(rootDir, "tsconfig.build.json");

    it("exists at repository root", () => {
      expect(existsSync(tsconfigBuildPath)).toBe(true);
    });

    it("extends root tsconfig.json and isolates test files", () => {
      const content = JSON.parse(readFileSync(tsconfigBuildPath, "utf-8"));

      expect(content.extends).toBe("./tsconfig.json");
      expect(Array.isArray(content.exclude)).toBe(true);

      const requiredExclusions = [
        "node_modules",
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        "vitest.config.ts",
      ];

      for (const exclusion of requiredExclusions) {
        expect(content.exclude).toContain(exclusion);
      }
    });
  });

  describe("next.config.ts", () => {
    it("configures tsconfigPath to tsconfig.build.json", () => {
      expect(nextConfig.typescript?.tsconfigPath).toBe("tsconfig.build.json");
    });

    it("configures outputFileTracingExcludes for test files and coverage", () => {
      const tracingExcludes = nextConfig.outputFileTracingExcludes?.["*"] || [];

      expect(tracingExcludes).toContain("./src/**/__tests__/**");
      expect(tracingExcludes).toContain("./src/**/*.test.{ts,tsx}");
      expect(tracingExcludes).toContain("./coverage/**");
      expect(tracingExcludes).toContain("./vitest.config.ts");
    });
  });

  describe("public/.assetsignore", () => {
    const assetsIgnorePath = resolve(rootDir, "public/.assetsignore");

    it("exists in public directory", () => {
      expect(existsSync(assetsIgnorePath)).toBe(true);
    });

    it("contains exclusion rules for test files, coverage, markdown, and maps", () => {
      const content = readFileSync(assetsIgnorePath, "utf-8");
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const requiredPatterns = [
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "coverage/**",
        "*.md",
        "*.map",
      ];

      for (const pattern of requiredPatterns) {
        expect(lines).toContain(pattern);
      }
    });
  });
});
