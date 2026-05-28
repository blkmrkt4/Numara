"use client";

import { useState } from "react";
import { ModelPicker, type PickerModel } from "../_components/model-picker";

export type Binding = {
  primary_model_slug: string | null;
  fallback_1_model_slug: string | null;
  fallback_2_model_slug: string | null;
  temperature: number;
  max_tokens: number;
  response_format: "text" | "json";
  json_schema: unknown;
};

export function BindingFields({
  models,
  binding,
}: {
  models: PickerModel[];
  binding: Binding;
}) {
  const [responseFormat, setResponseFormat] = useState(binding.response_format);

  return (
    <div className="space-y-4">
      <ModelPicker
        models={models}
        name="primary_model_slug"
        label="Primary model"
        defaultValue={binding.primary_model_slug}
      />
      <ModelPicker
        models={models}
        name="fallback_1_model_slug"
        label="Fallback 1"
        defaultValue={binding.fallback_1_model_slug}
        nullable
      />
      <ModelPicker
        models={models}
        name="fallback_2_model_slug"
        label="Fallback 2"
        defaultValue={binding.fallback_2_model_slug}
        nullable
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-neutral-600 dark:text-neutral-400">
          Temperature
          <input
            type="number"
            name="temperature"
            min="0"
            max="2"
            step="0.05"
            defaultValue={binding.temperature}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm tabular outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-400">
          Max tokens
          <input
            type="number"
            name="max_tokens"
            min="1"
            max="200000"
            step="1"
            defaultValue={binding.max_tokens}
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm tabular outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-neutral-600 dark:text-neutral-400">
          Response format
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["text", "json"] as const).map((rf) => (
            <label
              key={rf}
              className="flex cursor-pointer items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm has-[:checked]:border-neutral-900 has-[:checked]:bg-neutral-900 has-[:checked]:text-white dark:border-neutral-700 dark:has-[:checked]:border-white dark:has-[:checked]:bg-white dark:has-[:checked]:text-neutral-900"
            >
              <input
                type="radio"
                name="response_format"
                value={rf}
                defaultChecked={responseFormat === rf}
                onChange={() => setResponseFormat(rf)}
                className="sr-only"
              />
              {rf === "text" ? "Plain text" : "JSON"}
            </label>
          ))}
        </div>
      </fieldset>

      {responseFormat === "json" ? (
        <label className="block text-sm text-neutral-600 dark:text-neutral-400">
          JSON schema <span className="text-neutral-400">(optional)</span>
          <textarea
            name="json_schema"
            rows={6}
            defaultValue={binding.json_schema ? JSON.stringify(binding.json_schema, null, 2) : ""}
            spellCheck={false}
            placeholder='{"type":"object","properties":{...}}'
            className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs tabular outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-100"
          />
        </label>
      ) : null}
    </div>
  );
}
