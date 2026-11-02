import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Two root layouts (the site's [locale] and the admin): unmatched addresses get app/global-not-found.tsx.
    globalNotFound: true,
    // Proposing an AI theme waits on Muse Spark, Muse Image and five sample renders (~1–2 min);
    // the proxy's default 30 s cut it off with a 500 while the API kept working.
    proxyTimeout: 300_000,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser talks to one origin; Next proxies the API and generated files.
  rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/files/:path*", destination: `${API_URL}/files/:path*` },
      // The IndexNow key file at the site's root (/<key>.txt): the API answers for its INDEXNOW_KEY
      // only, 404 otherwise. Files in public/ and robots.txt come first (rewrites run after them).
      { source: "/:key([A-Za-z0-9-]{8,128}).txt", destination: `${API_URL}/api/seo/indexnow/:key` },
    ];
  },
};

export default nextConfig;
