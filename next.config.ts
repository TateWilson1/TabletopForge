import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;
const isServerBuild = process.env.TABLETOPFORGE_SERVER_BUILD === "true";

const nextConfig: NextConfig = {
  basePath,
  reactStrictMode: true,
  ...(isServerBuild
    ? {}
    : {
        output: "export" as const,
        trailingSlash: true,
      }),
};

export default nextConfig;
