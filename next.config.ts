import type { NextConfig } from "next";

const additionalDevOrigins = (process.env.PAX_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "ws.lakeward.net",
    "*.console-dev.lakeward.net",
    ...additionalDevOrigins,
  ],
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/connect.html",
        destination: "/connect",
      },
      {
        source: "/paxl-login.html",
        destination: "/paxl-login",
      },
    ];
  },
  async headers() {
    return [
      {
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
        source: "/_next/:path*",
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
