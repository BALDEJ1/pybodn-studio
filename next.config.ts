import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // server.ts checks every request first; no other site may load development files.
  allowedDevOrigins: [],
  agentRules: false,
  poweredByHeader: false,
}

export default nextConfig
