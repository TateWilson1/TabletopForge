import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  basePath,
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
};

export default nextConfig;
