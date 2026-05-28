/// <reference lib="webworker" />
// Numara service worker. Compiled by @serwist/next via next.config.ts.
// PRD §6.2: dashboard reads must work offline; uploads queue and sync
// on reconnect (handled by the BackgroundSyncQueue below, paired with
// the IDB upload queue in lib/upload-queue.ts for iOS fallback).

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Default cache strategies from @serwist/next cover:
  // - HTML routes: NetworkFirst with cache fallback (read-offline)
  // - /_next/static and /_next/image: StaleWhileRevalidate / CacheFirst
  // - Images and fonts: CacheFirst
  // - Supabase Storage signed URLs and /auth: NetworkOnly (private/expiring)
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
