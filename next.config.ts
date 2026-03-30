import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    PREVIEW_TIMELINE_V1: "true",
    RENDER_WATERMARK_ENABLED: "false",
  },
};

export default nextConfig;
