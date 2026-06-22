import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.paxtech.net"],
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
