import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
