"use client";

import { useEffect } from "react";

/**
 * Register the Numara service worker. Built by @serwist/next and emitted
 * at /sw.js. Disabled in development by the next.config.ts Serwist wrapper.
 */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // SW registration failures are non-fatal — the app still works,
        // just without offline support.
        console.warn("[sw] registration failed:", err);
      });
  }, []);

  return null;
}
