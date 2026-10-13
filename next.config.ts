import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Only this project's Blob store (store_WBFamYrARYlwkdDo), and only the shown images
    // under items/, so /_next/image can't be used to proxy other stores.
    remotePatterns: [
      { protocol: "https", hostname: "wbfamyrarylwkddo.public.blob.vercel-storage.com", pathname: "/items/**" },
    ],
  },
};

export default nextConfig;
