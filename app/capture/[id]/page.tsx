import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedDocumentUrl } from "@/lib/documents";
import { formatDate, todayIso } from "@/lib/format";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CURRENCIES,
  type AssetCategory,
  type Currency,
} from "@/lib/types";
import { linkDocumentToBalance } from "../actions";

type AssetOption = {
  id: string;
  name: string;
  category: AssetCategory;
  native_currency: Currency;
};

export default async function CaptureLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: errorParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, mime_type, size_bytes, storage_path, uploaded_at")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const signedUrl = await getSignedDocumentUrl(supabase, doc.storage_path);

  const { data: assetsRaw } = await supabase
    .from("assets")
    .select("id, name, category, native_currency")
    .eq("archived", false)
    .order("name", { ascending: true });
  const assets: AssetOption[] = (assetsRaw ?? []) as AssetOption[];

  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-medium tracking-tight">Link to asset</h1>
          <span className="w-20" />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-12 lg:grid-cols-[1fr_360px]">
        <section>
          <p className="text-xs text-neutral-500">{doc.file_name}</p>
          <p className="mt-1 text-xs text-neutral-400">
            Uploaded {formatDate(doc.uploaded_at.slice(0, 10))} · {formatBytes(doc.size_bytes)}
          </p>
          <div className="mt-4 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
            {signedUrl ? (
              isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signedUrl} alt={doc.file_name} className="w-full" />
              ) : isPdf ? (
                <iframe
                  src={signedUrl}
                  title={doc.file_name}
                  className="h-[640px] w-full"
                />
              ) : (
                <div className="px-4 py-6 text-sm text-neutral-500">
                  No inline preview for this file type.{" "}
                  <a href={signedUrl} className="underline" target="_blank" rel="noopener noreferrer">
                    Open in a new tab
                  </a>
                </div>
              )
            ) : (
              <div className="px-4 py-6 text-sm text-red-600 dark:text-red-400">
                Could not generate a preview link.
              </div>
            )}
          </div>
        </section>

        <section>
          <form action={linkDocumentToBalance} className="space-y-5">
            <input type="hidden" name="document_id" value={doc.id} />

            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400">
                Asset
                <select
                  name="asset_id"
                  required
                  defaultValue=""
                  className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                >
                  <option value="" disabled>
                    Pick an asset…
                  </option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.native_currency})
                    </option>
                  ))}
                  <option value="__new__">+ Create new asset</option>
                </select>
              </label>
            </div>

            <details className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              <summary className="cursor-pointer text-xs text-neutral-500">
                Fields for a new asset (only used if you picked “Create new asset”)
              </summary>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="block text-xs">Name</span>
                  <input
                    type="text"
                    name="new_asset_name"
                    maxLength={100}
                    placeholder="e.g. HSBC current account"
                    className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs">Category</span>
                  <select
                    name="new_asset_category"
                    defaultValue="cash"
                    className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                  >
                    {CATEGORY_ORDER.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs">Currency</span>
                  <select
                    name="new_asset_currency"
                    defaultValue="GBP"
                    className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>

            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400">
                Amount
                <input
                  type="text"
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 tabular outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                />
              </label>
            </div>

            <div>
              <label className="block text-sm text-neutral-600 dark:text-neutral-400">
                As of
                <input
                  type="date"
                  name="as_of_date"
                  required
                  defaultValue={todayIso()}
                  max={todayIso()}
                  className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
                />
              </label>
            </div>

            {errorParam ? (
              <p className="text-sm text-red-600 dark:text-red-400">{errorParam}</p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Save balance
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
