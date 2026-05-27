import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server actions handle file uploads up to 25 MB (matches the documents
    // bucket cap in supabase/migrations/20260527191119_documents.sql).
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
