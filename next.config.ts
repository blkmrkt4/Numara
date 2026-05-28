import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Reload everything when the SW updates, so a fresh deploy never gets
  // a half-stale page from an old cache.
  reloadOnOnline: true,
  // Disable in dev — the SW caches everything and confuses HMR. We still
  // register manually in prod and on a single explicit dev override env.
  disable: process.env.NODE_ENV === "development",
});

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

export default withSerwist(nextConfig);
