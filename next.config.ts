import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produces .next/standalone with a minimal Node server +
  // pruned node_modules. The Dockerfile's runtime stage copies only that
  // tree, so the production image stays small (no pnpm, no devDeps, no
  // source). See ADR 010 + frontend deploy plan.
  output: "standalone",
};

export default nextConfig;
