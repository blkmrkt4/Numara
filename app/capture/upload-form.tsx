"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACCEPT_ATTRIBUTE } from "@/lib/document-constants";
import { enqueueUpload } from "@/lib/upload-queue";
import { uploadFromCapture } from "./actions";

export function UploadForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "queued"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSubmit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setStatus({ kind: "error", message: "Pick a file to upload." });
      return;
    }

    // Offline → queue and stop. Banner picks up the count + drain.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueUpload(file);
        setStatus({
          kind: "queued",
          message:
            "Saved for later — it will upload automatically when you reconnect.",
        });
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not queue upload.",
        });
      }
      return;
    }

    // Online → try the REST endpoint first (so the offline path is the
    // same code on both sides). Falling back to the redirecting server
    // action would feel jankier here.
    setStatus({ kind: "uploading" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        setStatus({ kind: "error", message: text });
        return;
      }
      const body = (await res.json()) as {
        ok: boolean;
        document_id?: string;
        extract_error?: string | null;
        error?: string;
      };
      if (!body.ok || !body.document_id) {
        setStatus({ kind: "error", message: body.error ?? "Upload failed." });
        return;
      }
      const url = body.extract_error
        ? `/capture/${body.document_id}?extract_error=${encodeURIComponent(
            body.extract_error
          )}`
        : `/capture/${body.document_id}`;
      router.push(url);
    } catch (err) {
      // Network failure mid-flight → queue and tell the user.
      try {
        await enqueueUpload(file);
        setStatus({
          kind: "queued",
          message:
            "Connection dropped — saved for later and will upload when you reconnect.",
        });
      } catch (qerr) {
        setStatus({
          kind: "error",
          message:
            "Upload failed and could not be queued: " +
            (qerr instanceof Error ? qerr.message : String(qerr)),
        });
      }
    }
  }

  return (
    <>
      <form action={handleSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className="block text-sm text-neutral-600 dark:text-neutral-400">File</span>
          <input
            type="file"
            name="file"
            required
            accept={ACCEPT_ATTRIBUTE}
            capture="environment"
            className="mt-2 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:file:bg-white dark:file:text-neutral-900"
          />
        </label>

        <p className="text-xs text-neutral-500">
          PDF, JPEG, PNG, HEIC, XLS, XLSX, or CSV. Up to 25 MB.
        </p>

        {status.kind === "error" ? (
          <p className="text-sm text-red-600 dark:text-red-400">{status.message}</p>
        ) : null}
        {initialError && status.kind === "idle" ? (
          <p className="text-sm text-red-600 dark:text-red-400">{initialError}</p>
        ) : null}
        {status.kind === "queued" ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{status.message}</p>
        ) : null}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={status.kind === "uploading"}
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {status.kind === "uploading" ? "Uploading…" : "Upload"}
          </button>
          <a
            href="/dashboard"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            {status.kind === "queued" ? "Back to dashboard" : "Cancel"}
          </a>
        </div>
      </form>

      {/* No-JS fallback: an invisible parallel form that posts to the
          redirecting Server Action. JS-disabled browsers see only this
          one (display:none above hides the JS form? actually we always
          render both — JS just intercepts. This second form is for the
          extreme edge case where the script fails). */}
      <noscript>
        <form action={uploadFromCapture} className="mt-4">
          <input
            type="file"
            name="file"
            required
            accept={ACCEPT_ATTRIBUTE}
            capture="environment"
          />
          <button type="submit">Upload</button>
        </form>
      </noscript>
    </>
  );
}
