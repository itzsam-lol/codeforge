// Baked in at build time (Docker ENV, see apps/marketing/Dockerfile) — Next
// bakes rewrites() into the build, runtime env arrives too late. Falls back
// to the local apps/api dev port for `next dev`.
const ARENA_API_ORIGIN = process.env.ARENA_API_ORIGIN ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // camera/microphone allowed same-origin (self) for Arena's
          // proctoring demo/practice/compete pages, which genuinely need
          // getUserMedia — cross-origin embedding stays denied, which is
          // this header's actual security purpose (stopping this site's
          // frames from being camera-hijacked by an embedder) and is
          // unaffected by allowing same-origin use.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Scoped, not a blanket /api/:path* — this app already owns real
      // route handlers at /api/chat and /api/contact.
      { source: "/api/arena/:path*", destination: `${ARENA_API_ORIGIN}/api/arena/:path*` },
    ];
  },
};

export default nextConfig;
