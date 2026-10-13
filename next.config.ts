import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Only for scripts/seed-dev.mts, which uses placeholder photos.
      ...(process.env.NODE_ENV === "development" ? [{ protocol: "https" as const, hostname: "picsum.photos" }] : []),
    ],
  },
};

export default nextConfig;
