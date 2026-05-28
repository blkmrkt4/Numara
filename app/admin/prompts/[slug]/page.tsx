import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSystemAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import type { PickerModel } from "../_components/model-picker";
import { PromptFields } from "./edit-prompt";
import { BindingFields, type Binding } from "./edit-binding";
import { revertToVersion, runTest, saveAll, setStatus } from "./actions";

type Purpose = "extraction" | "classification" | "summary" | "other";

export default async function PromptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string; test_output?: string }>;
}) {
  await requireSystemAdmin();
  const { slug } = await params;
  const { ok, error, test_output } = await searchParams;

  const admin = createAdminClient();
  const { data: prompt } = await admin
    .from("prompts")
    .select("id, slug, name, description, purpose, status, current_version_id, updated_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!prompt) notFound();

  const [currentVersionResult, allVersionsResult, bindingResult, modelsResult] = await Promise.all([
    prompt.current_version_id
      ? admin
          .from("prompt_versions")
          .select("id, version_number, body, available_slugs, notes, created_at")
          .eq("id", prompt.current_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("prompt_versions")
      .select("id, version_number, body, notes, created_at")
      .eq("prompt_id", prompt.id)
      .order("version_number", { ascending: false }),
    admin
      .from("prompt_bindings")
      .select(
        "primary_model_slug, fallback_1_model_slug, fallback_2_model_slug, temperature, max_tokens, response_format, json_schema"
      )
      .eq("prompt_id", prompt.id)
      .maybeSingle(),
    admin
      .from("openrouter_models")
      .select(
        "slug, name, provider, context_length, input_cost_per_mtoken, output_cost_per_mtoken, supports_vision, supports_tools, supports_json_mode, is_coding_specialist, is_reasoning_specialist, is_available"
      ),
  ]);

  const currentVersion = currentVersionResult.data;
  const allVersions = allVersionsResult.data ?? [];
  const models = (modelsResult.data ?? []) as PickerModel[];

  const binding: Binding = bindingResult.data
    ? {
        primary_model_slug: bindingResult.data.primary_model_slug,
        fallback_1_model_slug: bindingResult.data.fallback_1_model_slug,
        fallback_2_model_slug: bindingResult.data.fallback_2_model_slug,
        temperature: Number(bindingResult.data.temperature),
        max_tokens: bindingResult.data.max_tokens,
        response_format: (bindingResult.data.response_format ?? "text") as "text" | "json",
        json_schema: bindingResult.data.json_schema,
      }
    : {
        primary_model_slug: null,
        fallback_1_model_slug: null,
        fallback_2_model_slug: null,
        temperature: 0.2,
        max_tokens: 2048,
        response_format: "text",
        json_schema: null,
      };

  const declaredSlugs: string[] = Array.isArray(currentVersion?.available_slugs)
    ? currentVersion.available_slugs
    : [];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/prompts"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Prompts
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium tracking-tight">
              <code className="tabular">{prompt.slug}</code>
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {prompt.description ?? "No description."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={
                "rounded px-2 py-0.5 text-xs font-medium " +
                (prompt.status === "active"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300")
              }
            >
              {prompt.status === "active" ? "Active" : "Disabled"}
            </span>
            <form action={setStatus}>
              <input type="hidden" name="slug" value={prompt.slug} />
              <input
                type="hidden"
                name="status"
                value={prompt.status === "active" ? "disabled" : "active"}
              />
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                {prompt.status === "active" ? "Disable" : "Enable"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {ok ? <Banner kind="ok" message={ok} /> : null}
      {error ? <Banner kind="error" message={error} /> : null}

      <form action={saveAll}>
        <input type="hidden" name="slug" value={prompt.slug} />
        <div className="grid gap-10 lg:grid-cols-2">
          <section>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Prompt body
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Current version: v{currentVersion?.version_number ?? "—"} ·
              {currentVersion?.created_at
                ? ` saved ${formatDate(currentVersion.created_at.slice(0, 10))}`
                : " never saved"}
            </p>
            <div className="mt-3">
              <PromptFields
                initial={{
                  name: prompt.name,
                  description: prompt.description ?? null,
                  purpose: prompt.purpose as Purpose,
                  body: currentVersion?.body ?? "",
                  available_slugs: declaredSlugs,
                }}
              />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Model binding
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              Primary + 2 fallbacks. <code>llmCall</code> walks the chain in
              order and logs every attempt.
            </p>
            <div className="mt-3">
              <BindingFields models={models} binding={binding} />
            </div>
          </section>
        </div>

        <div className="mt-8 flex items-center gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
          >
            Save
          </button>
          <p className="text-xs text-neutral-500">
            Body changes create a new version; if only the binding changed, the
            binding is updated without bumping the version.
          </p>
        </div>
      </form>

      <section>
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Test panel
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Runs the current body against the primary model. Limited to 10 calls
          per minute (PRD §14.8).
        </p>
        {prompt.status !== "active" ? (
          <p className="mt-3 text-xs text-neutral-500">
            Enable the prompt above to run tests.
          </p>
        ) : declaredSlugs.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-500">
            Declare some available slugs first.
          </p>
        ) : (
          <form action={runTest} className="mt-3 space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <input type="hidden" name="slug" value={prompt.slug} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {declaredSlugs.map((s) => (
                <label key={s} className="block text-xs text-neutral-600 dark:text-neutral-400">
                  <code className="tabular">{`{{${s}}}`}</code>
                  <textarea
                    name={`var_${s}`}
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 font-mono text-xs outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Run test
            </button>
          </form>
        )}
        {test_output ? (
          <div className="mt-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">Last test output:</p>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
              {test_output}
            </pre>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Version history
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Every save adds a new row. Revert creates a fresh version copying an
          older body — history is never overwritten.
        </p>
        <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {allVersions.map((v) => {
            const isCurrent = v.id === prompt.current_version_id;
            return (
              <li key={v.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 px-4 py-3">
                <p className="tabular text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  v{v.version_number}
                  {isCurrent ? (
                    <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      current
                    </span>
                  ) : null}
                </p>
                <div className="text-xs text-neutral-500">
                  <p>
                    {formatDate(v.created_at.slice(0, 10))}
                    {v.notes ? <span className="ml-2">· {v.notes}</span> : null}
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                      Show body
                    </summary>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {v.body}
                    </pre>
                  </details>
                </div>
                {!isCurrent ? (
                  <form action={revertToVersion}>
                    <input type="hidden" name="slug" value={prompt.slug} />
                    <input type="hidden" name="version_id" value={v.id} />
                    <button
                      type="submit"
                      className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      Make current
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Banner({ kind, message }: { kind: "ok" | "error"; message: string }) {
  const cls =
    kind === "ok"
      ? "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
      : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200";
  return <div className={`rounded-md border px-4 py-2.5 text-sm ${cls}`}>{message}</div>;
}
