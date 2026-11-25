import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Try Live / desktop Chrome uses 127.0.0.1 while `next dev` advertises localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
