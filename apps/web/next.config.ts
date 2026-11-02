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
    ];
  },
};

export default nextConfig;
