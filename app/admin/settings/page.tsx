import { requireSystemAdmin } from "@/lib/admin";
import { getSecretMeta, SECRET_KEYS } from "@/lib/secrets";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import {
  saveOpenRouterKey,
  saveDefaultModels,
  refreshModelCatalogue,
} from "./actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSystemAdmin();
  const { ok, error } = await searchParams;

  const admin = createAdminClient();
  const [openrouterMeta, settingsResult, modelStatsResult, recentCallsResult] =
    await Promise.all([
      getSecretMeta(SECRET_KEYS.OPENROUTER_API_KEY),
      admin
        .from("system_settings")
        .select(
          "default_primary_model_slug, default_fallback_1_model_slug, default_fallback_2_model_slug, updated_at"
        )
        .eq("id", true)
        .maybeSingle(),
      admin
        .from("openrouter_models")
        .select("slug, is_available, last_synced_at", { count: "exact", head: false })
        .order("last_synced_at", { ascending: false })
        .limit(1),
      admin
        .from("llm_call_logs")
        .select(
          "id, prompt_slug, model_used, was_fallback, latency_ms, input_tokens, output_tokens, cost_usd, success, error_message, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const settings = settingsResult.data;
  const lastSync = modelStatsResult.data?.[0]?.last_synced_at ?? null;
  const modelsAvailableCount = await admin
    .from("openrouter_models")
    .select("slug", { count: "exact", head: true })
    .eq("is_available", true);

  const recentCalls = recentCallsResult.data ?? [];

  return (
    <div className="space-y-10">
      {ok ? <Banner kind="ok" message={ok} /> : null}
      {error ? <Banner kind="error" message={error} /> : null}

      <section>
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          OpenRouter API key
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Used by every LLM call through{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-900">
            lib/llm.ts
          </code>
          . Stored encrypted at rest with AES-256-GCM (PRD §8).
        </p>
        <div className="mt-3 rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-xs text-neutral-500">
            Currently:{" "}
            {openrouterMeta ? (
              <>
                <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs dark:bg-neutral-900">
                  {openrouterMeta.value_masked}
                </code>{" "}
                · updated {formatDate(openrouterMeta.updated_at.slice(0, 10))}
              </>
            ) : (
              <span className="text-amber-700 dark:text-amber-500">not set</span>
            )}
          </p>
          <form action={saveOpenRouterKey} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block text-sm text-neutral-600 dark:text-neutral-400">
              {openrouterMeta ? "Replace with new key" : "Paste key"}
              <input
                type="password"
                name="api_key"
                required
                placeholder="sk-or-v1-…"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 block w-full min-w-80 rounded-md border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Save
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Default model bindings
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          New prompts inherit these unless overridden in their binding. Per PRD §14.3.
        </p>
        <form
          action={saveDefaultModels}
          className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800"
        >
          <ModelInput
            label="Primary"
            name="primary"
            defaultValue={settings?.default_primary_model_slug ?? ""}
          />
          <ModelInput
            label="Fallback 1"
            name="fallback1"
            defaultValue={settings?.default_fallback_1_model_slug ?? ""}
          />
          <ModelInput
            label="Fallback 2"
            name="fallback2"
            defaultValue={settings?.default_fallback_2_model_slug ?? ""}
          />
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-900"
            >
              Save defaults
            </button>
            <span className="ml-3 text-xs text-neutral-500">
              The proper model picker (with search and capability badges) lands in step 6.
            </span>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Model catalogue
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Cached from{" "}
          <a
            href="https://openrouter.ai/api/v1/models"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            openrouter.ai/api/v1/models
          </a>{" "}
          and used by the model picker.
        </p>
        <div className="mt-3 flex items-center gap-4 rounded-md border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="text-sm">
            <p className="text-neutral-900 dark:text-neutral-100 tabular">
              {modelsAvailableCount.count ?? 0} available models
            </p>
            <p className="text-xs text-neutral-500">
              {lastSync
                ? `last synced ${formatDate(lastSync.slice(0, 10))}`
                : "never synced — paste an API key above first"}
            </p>
          </div>
          <form action={refreshModelCatalogue} className="ml-auto">
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              Refresh now
            </button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Recent LLM calls
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Last 50 attempts across every prompt. Failures show the error inline.
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          {recentCalls.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">
              No calls yet. The first prompt is wired up in step 7.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Prompt</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Tokens in/out</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {recentCalls.map((c) => (
                  <tr key={c.id} className="text-neutral-700 dark:text-neutral-300">
                    <td className="px-3 py-2 text-xs text-neutral-500 tabular">
                      {new Date(c.created_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-3 py-2 tabular">{c.prompt_slug}</td>
                    <td className="px-3 py-2 tabular">{c.model_used}</td>
                    <td className="px-3 py-2 tabular">
                      {c.was_fallback === 0
                        ? "primary"
                        : c.was_fallback === 1
                          ? "fallback 1"
                          : "fallback 2"}
                    </td>
                    <td className="px-3 py-2 tabular">{c.latency_ms ?? "—"}ms</td>
                    <td className="px-3 py-2 tabular">
                      {c.input_tokens ?? "—"} / {c.output_tokens ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.success ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          ok
                        </span>
                      ) : (
                        <span
                          className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-300"
                          title={c.error_message ?? ""}
                        >
                          fail
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function ModelInput({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block text-sm text-neutral-600 dark:text-neutral-400">
      {label}
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder="provider/model"
        spellCheck={false}
        className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 tabular outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus:border-neutral-100"
      />
    </label>
  );
}

function Banner({ kind, message }: { kind: "ok" | "error"; message: string }) {
  const cls =
    kind === "ok"
      ? "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
      : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200";
  return (
    <div className={`rounded-md border px-4 py-2.5 text-sm ${cls}`}>{message}</div>
  );
}
