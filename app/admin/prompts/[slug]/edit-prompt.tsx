"use client";

import { useMemo, useState } from "react";

type Purpose = "extraction" | "classification" | "summary" | "other";

export function PromptFields({
  initial,
}: {
  initial: {
    name: string;
    description: string | null;
    purpose: Purpose;
    body: string;
    available_slugs: string[];
  };
}) {
  const [body, setBody] = useState(initial.body);
  const [slugsText, setSlugsText] = useState(initial.available_slugs.join(", "));

  const declared = useMemo(
    () =>
      new Set(
        slugsText
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      ),
    [slugsText]
  );

  const referenced = useMemo(() => {
    const result = new Set<string>();
    const re = /{{\s*([a-z_][a-z0-9_]*)\s*}}/gi;
    let m;
    while ((m = re.exec(body)) !== null) {
      result.add(m[1]);
    }
    return result;
  }, [body]);

  const undeclared = useMemo(
    () => [...referenced].filter((s) => !declared.has(s)),
    [referenced, declared]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-neutral-600 dark:text-neutral-400">
          Name
          <input
            type="text"
            name="name"
            required
            defaultValue={initial.name}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-400">
          Purpose
          <select
            name="purpose"
            defaultValue={initial.purpose}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
          >
            <option value="extraction">Extraction</option>
            <option value="classification">Classification</option>
            <option value="summary">Summary</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <label className="block text-sm text-neutral-600 dark:text-neutral-400">
        Description
        <input
          type="text"
          name="description"
          defaultValue={initial.description ?? ""}
          placeholder="Short human label shown in the list view"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
        />
      </label>

      <label className="block text-sm text-neutral-600 dark:text-neutral-400">
        Available slugs <span className="text-neutral-400">(comma-separated)</span>
        <input
          type="text"
          name="available_slugs"
          value={slugsText}
          onChange={(e) => setSlugsText(e.target.value)}
          placeholder="document_image, known_institutions, user_currency"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Variables you reference in the body as <code>{`{{slug}}`}</code> should
          appear here.
        </span>
      </label>

      <label className="block text-sm text-neutral-600 dark:text-neutral-400">
        Body
        <textarea
          name="body"
          rows={16}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          spellCheck={false}
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
        />
      </label>

      {undeclared.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The body uses{" "}
          {undeclared.map((s) => (
            <code key={s} className="mx-0.5 rounded bg-amber-100 px-1 dark:bg-amber-900">
              {`{{${s}}}`}
            </code>
          ))}{" "}
          which {undeclared.length === 1 ? "is" : "are"} not in the available
          slugs list above.
        </div>
      ) : null}

      <label className="block text-sm text-neutral-600 dark:text-neutral-400">
        Version notes <span className="text-neutral-400">(optional — only used if body changed)</span>
        <input
          type="text"
          name="notes"
          placeholder="What changed in this revision?"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
        />
      </label>
    </div>
  );
}
