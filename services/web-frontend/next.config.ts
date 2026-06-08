import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // NOTE: Do NOT use 'output: standalone' on Vercel — it conflicts with Vercel's build adapter.
  // 'standalone' is only for Docker/self-hosted deployments.
};

export default nextConfig;
