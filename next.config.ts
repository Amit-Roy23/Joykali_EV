import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge out of client demos and screenshots.
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
