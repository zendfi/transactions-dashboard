import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is a Node-only dependency; keep it out of the bundler.
  serverExternalPackages: ["pg"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
