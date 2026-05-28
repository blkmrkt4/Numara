"use client";

import { useMemo, useState } from "react";

export type PickerModel = {
  slug: string;
  name: string;
  provider: string;
  context_length: number | null;
  input_cost_per_mtoken: number | null;
  output_cost_per_mtoken: number | null;
  supports_vision: boolean;
  supports_tools: boolean;
  supports_json_mode: boolean;
  is_coding_specialist: boolean;
  is_reasoning_specialist: boolean;
  is_available: boolean;
};

type SortKey = "name" | "input_cost" | "output_cost" | "context";

export function ModelPicker({
  models,
  name,
  label,
  defaultValue,
  nullable = false,
}: {
  models: PickerModel[];
  name: string;
  label: string;
  defaultValue: string | null;
  nullable?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [groupByProvider, setGroupByProvider] = useState(false);

  const selectedModel = useMemo(
    () => models.find((m) => m.slug === selected) ?? null,
    [models, selected]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models;
    if (q) {
      list = list.filter((m) => {
        const haystack = `${m.slug} ${m.name} ${m.provider}`.toLowerCase();
        if (haystack.includes(q)) return true;
        if (q === "vision" && m.supports_vision) return true;
        if (q === "coding" && m.is_coding_specialist) return true;
        if (q === "reasoning" && m.is_reasoning_specialist) return true;
        if (q === "tools" && m.supports_tools) return true;
        if (q === "json" && m.supports_json_mode) return true;
        return false;
      });
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "input_cost":
          return (a.input_cost_per_mtoken ?? Infinity) - (b.input_cost_per_mtoken ?? Infinity);
        case "output_cost":
          return (a.output_cost_per_mtoken ?? Infinity) - (b.output_cost_per_mtoken ?? Infinity);
        case "context":
          return (b.context_length ?? 0) - (a.context_length ?? 0);
        case "name":
        default:
          return a.slug.localeCompare(b.slug);
      }
    });
    return sorted;
  }, [models, query, sortBy]);

  const groups = useMemo(() => {
    if (!groupByProvider) return null;
    const by = new Map<string, PickerModel[]>();
    for (const m of filtered) {
      const arr = by.get(m.provider) ?? [];
      arr.push(m);
      by.set(m.provider, arr);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupByProvider]);

  function pick(slug: string) {
    setSelected(slug);
    setOpen(false);
    setQuery("");
  }
  function clear() {
    setSelected(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected ?? ""} />
      <p className="text-xs text-neutral-500">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-900"
      >
        {selectedModel ? (
          <span className="flex flex-col">
            <span className="tabular text-neutral-900 dark:text-neutral-100">
              {selectedModel.slug}
            </span>
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <Badges model={selectedModel} />
              <span>· {formatContext(selectedModel.context_length)}</span>
              <span>· {formatCost(selectedModel.input_cost_per_mtoken, selectedModel.output_cost_per_mtoken)}</span>
            </span>
          </span>
        ) : (
          <span className="text-neutral-500">Pick a model…</span>
        )}
        <span className="text-neutral-400">▾</span>
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[420px] overflow-hidden rounded-md border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-950">
            <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search slug, provider, or capability (vision, coding, reasoning…)"
                className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  Sort:
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className="rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    <option value="name">Name</option>
                    <option value="input_cost">Input cost asc</option>
                    <option value="output_cost">Output cost asc</option>
                    <option value="context">Context desc</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={groupByProvider}
                    onChange={(e) => setGroupByProvider(e.target.checked)}
                  />
                  Group by provider
                </label>
                <span className="ml-auto text-neutral-500">
                  {filtered.length} of {models.length}
                </span>
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-neutral-500">
                  No models match.
                </p>
              ) : groups ? (
                groups.map(([provider, list]) => (
                  <div key={provider}>
                    <div className="sticky top-0 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {provider} <span className="text-neutral-500">({list.length})</span>
                    </div>
                    {list.map((m) => (
                      <ModelRow key={m.slug} model={m} onPick={pick} selected={selected === m.slug} />
                    ))}
                  </div>
                ))
              ) : (
                filtered.map((m) => (
                  <ModelRow key={m.slug} model={m} onPick={pick} selected={selected === m.slug} />
                ))
              )}
            </div>

            {nullable ? (
              <div className="border-t border-neutral-200 p-2 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Clear selection
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  onPick,
}: {
  model: PickerModel;
  selected: boolean;
  onPick: (slug: string) => void;
}) {
  const dimmed = !model.is_available;
  return (
    <button
      type="button"
      disabled={dimmed}
      onClick={() => onPick(model.slug)}
      className={
        "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm " +
        (selected
          ? "bg-neutral-100 dark:bg-neutral-900"
          : "hover:bg-neutral-50 dark:hover:bg-neutral-900 ") +
        (dimmed ? "opacity-40 cursor-not-allowed" : "")
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate tabular text-neutral-900 dark:text-neutral-100">
          {model.slug}
          {!model.is_available ? (
            <span className="ml-2 text-xs text-neutral-500">(unavailable)</span>
          ) : null}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <Badges model={model} />
          <span>· {formatContext(model.context_length)}</span>
        </p>
      </div>
      <span className="shrink-0 text-right text-xs tabular text-neutral-500">
        {formatCost(model.input_cost_per_mtoken, model.output_cost_per_mtoken)}
      </span>
    </button>
  );
}

function Badges({ model }: { model: PickerModel }) {
  return (
    <span className="inline-flex gap-1">
      {model.supports_vision ? <Badge title="Vision-capable" letter="V" /> : null}
      {model.is_coding_specialist ? <Badge title="Coding specialist" letter="C" /> : null}
      {model.is_reasoning_specialist ? <Badge title="Reasoning / thinking model" letter="R" /> : null}
      {model.supports_tools ? <Badge title="Tool / function calling" letter="T" /> : null}
      {model.supports_json_mode ? <Badge title="Structured output" letter="J" /> : null}
    </span>
  );
}

function Badge({ letter, title }: { letter: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-200 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
    >
      {letter}
    </span>
  );
}

function formatContext(ctx: number | null): string {
  if (ctx == null) return "—";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ctx`;
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}k ctx`;
  return `${ctx} ctx`;
}

function formatCost(input: number | null, output: number | null): string {
  if (input == null && output == null) return "free";
  const fmt = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
  return `${fmt(input)} / ${fmt(output)} per MTok`;
}
