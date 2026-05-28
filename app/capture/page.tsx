import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

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
          Upload a statement, balance, or bill. The AI extracts the fields; you
          confirm or edit them before anything saves. When offline, captures
          queue and sync automatically once you reconnect.
        </p>
        <UploadForm initialError={error} />
      </main>
    </div>
  );
}
