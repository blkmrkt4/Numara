import Link from "next/link";
import { requireSystemAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export default async function AdminPromptsListPage() {
  await requireSystemAdmin();
  const admin = createAdminClient();

  const { data: prompts } = await admin
    .from("prompts")
    .select("id, slug, name, purpose, status, updated_at, current_version_id")
    .order("slug", { ascending: true });

  const promptIds = (prompts ?? []).map((p) => p.id);
  const versionIds = (prompts ?? []).map((p) => p.current_version_id).filter((v): v is string => !!v);

  const [bindingsResult, versionsResult] = await Promise.all([
    admin
      .from("prompt_bindings")
      .select("prompt_id, primary_model_slug, fallback_1_model_slug, fallback_2_model_slug")
      .in("prompt_id", promptIds.length > 0 ? promptIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("prompt_versions")
      .select("id, available_slugs")
      .in("id", versionIds.length > 0 ? versionIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const bindingsByPrompt = new Map<string, NonNullable<typeof bindingsResult.data>[number]>();
  for (const b of bindingsResult.data ?? []) bindingsByPrompt.set(b.prompt_id, b);
  const slugsByVersion = new Map<string, string[]>();
  for (const v of versionsResult.data ?? []) {
    slugsByVersion.set(v.id, Array.isArray(v.available_slugs) ? v.available_slugs : []);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium tracking-tight">Prompts</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Every prompt the app can call via <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-900">llmCall(slug, vars)</code>.
          Click any row to edit its body, slugs, and model binding.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Available slugs</th>
              <th className="px-3 py-2">Primary model</th>
              <th className="px-3 py-2">Fallbacks</th>
              <th className="px-3 py-2">Last edited</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {(prompts ?? []).map((p) => {
              const binding = bindingsByPrompt.get(p.id);
              const fallbacks = [binding?.fallback_1_model_slug, binding?.fallback_2_model_slug].filter(
                (v): v is string => !!v
              );
              const declaredSlugs = p.current_version_id
                ? slugsByVersion.get(p.current_version_id) ?? []
                : [];
              return (
                <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="px-3 py-2 tabular">
                    <Link href={`/admin/prompts/${p.slug}`} className="underline">
                      {p.slug}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{p.purpose}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {declaredSlugs.length === 0 ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : (
                        declaredSlugs.map((s) => (
                          <code
                            key={s}
                            className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-900"
                          >
                            {s}
                          </code>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular text-xs">
                    {binding?.primary_model_slug ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs" title={fallbacks.join(", ")}>
                    {fallbacks.length}/2
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500 tabular">
                    {formatDate(p.updated_at.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        New prompts are added by code (and the migration that ships them).
        Editing here updates body + binding without redeploying.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300">
        active
      </span>
    );
  }
  return (
    <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {status}
    </span>
  );
}
