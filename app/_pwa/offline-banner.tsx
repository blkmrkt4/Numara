"use client";

import { useEffect, useState } from "react";
import { listPendingUploads, drainPendingUploads } from "@/lib/upload-queue";

/**
 * Sticky top-of-page banner that shows offline state and the count of
 * uploads queued in IndexedDB. When the browser fires `online`, we
 * trigger a drain immediately (iOS doesn't support BackgroundSync, so
 * the manual drain is the canonical replay path on Safari).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [pending, setPending] = useState<number>(0);
  const [draining, setDraining] = useState<boolean>(false);

  // Refresh the pending count after any window focus or queue change.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const items = await listPendingUploads();
        if (!cancelled) setPending(items.length);
      } catch {
        // ignore — IDB unavailable on this browser
      }
    }
    refresh();
    const onChange = () => refresh();
    window.addEventListener("focus", onChange);
    window.addEventListener("numara:queue-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onChange);
      window.removeEventListener("numara:queue-changed", onChange);
    };
  }, []);

  useEffect(() => {
    function onOnline() {
      setOnline(true);
      // Auto-drain when we come back online.
      void drain();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function drain() {
    if (draining) return;
    setDraining(true);
    try {
      await drainPendingUploads();
      const items = await listPendingUploads();
      setPending(items.length);
    } finally {
      setDraining(false);
    }
  }

  if (online && pending === 0) return null;

  return (
    <div
      className={
        "sticky top-0 z-50 border-b px-4 py-2 text-center text-xs " +
        (online
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300")
      }
    >
      {!online ? (
        <span>
          Offline — reads work from cache. Captures are queued and will sync
          when you reconnect.
        </span>
      ) : (
        <span>
          {pending} capture{pending === 1 ? "" : "s"} queued.{" "}
          <button
            type="button"
            onClick={drain}
            disabled={draining}
            className="ml-1 underline disabled:opacity-50"
          >
            {draining ? "Syncing…" : "Sync now"}
          </button>
        </span>
      )}
    </div>
  );
}
