import type { NextConfig } from "next";

/**
 * S1-F2 / D21: the browser only ever talks to this Next.js origin. Everything
 * under /api is proxied to the Express API, so the httpOnly auth cookie stays
 * first-party (Safari/Firefox block cross-site cookies).
 */
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:5000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiTarget}/api/:path*` },
      { source: "/health", destination: `${apiTarget}/health` },
    ];
  },
};

export default nextConfig;
