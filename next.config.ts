import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FalkorDB uses the Redis client; keep it on the Node side, not in the Turbopack graph.
  serverExternalPackages: ["falkordb", "redis", "@redis/client"],
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
