const HQ_API_ORIGIN = process.env.HQ_API_ORIGIN ?? "http://localhost:4100";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls through the Next origin so the refresh-token cookie is
  // first-party and no CORS preflights are needed in the browser. Mirrors
  // apps/web/next.config.mjs.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${HQ_API_ORIGIN}/api/:path*` },
      { source: "/healthz", destination: `${HQ_API_ORIGIN}/healthz` },
    ];
  },
};

export default nextConfig;
