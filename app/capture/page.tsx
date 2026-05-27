import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents";
import { uploadFromCapture } from "./actions";

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await searchParams;

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-medium tracking-tight">Capture document</h1>
          <span className="w-20" />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-sm text-neutral-500">
          Upload a statement, balance, or bill. Step 4 stores the file and
          lets you link it to an asset with a balance you type yourself —
          automatic extraction lands later in the build.
        </p>

        <form action={uploadFromCapture} className="mt-8 space-y-5">
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

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Upload
            </button>
            <Link
              href="/dashboard"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
