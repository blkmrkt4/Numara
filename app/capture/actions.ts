"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/documents";
import { CURRENCIES, type AssetCategory, type Currency } from "@/lib/types";

const VALID_CATEGORIES: AssetCategory[] = ["real_estate", "investment", "cash", "liability"];

function failCapture(message: string): never {
  redirect(`/capture?error=${encodeURIComponent(message)}`);
}

function failLink(docId: string, message: string): never {
  redirect(`/capture/${docId}?error=${encodeURIComponent(message)}`);
}

/**
 * Standalone upload from /capture. After the file is stored, takes the
 * user to /capture/[doc_id] where they link it to an asset and enter a
 * balance (step 4 is pre-AI; step 7 swaps in extraction).
 */
export async function uploadFromCapture(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) failCapture("Pick a file to upload.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.household_id) failCapture("Account is not yet provisioned.");

  const result = await uploadDocument(supabase, profile.household_id, user.id, file);
  if (!result.ok) failCapture(result.error);

  revalidatePath("/dashboard");
  redirect(`/capture/${result.documentId}`);
}

/**
 * Link a captured document to an asset by recording a balance entry.
 * If `asset_id === "__new__"` the action first creates a new asset.
 */
export async function linkDocumentToBalance(formData: FormData) {
  const documentId = String(formData.get("document_id") ?? "");
  const assetIdRaw = String(formData.get("asset_id") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const asOfDate = String(formData.get("as_of_date") ?? "").trim();

  if (!documentId) redirect("/dashboard");
  if (!assetIdRaw) failLink(documentId, "Pick an asset or choose to create one.");
  if (!amountRaw) failLink(documentId, "Amount is required.");
  if (!asOfDate) failLink(documentId, "Date is required.");

  const amount = Number(amountRaw.replace(/,/g, ""));
  if (!Number.isFinite(amount)) failLink(documentId, "Amount must be a number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) failLink(documentId, "Invalid date.");
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (new Date(asOfDate) > today) failLink(documentId, "Date cannot be in the future.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let assetId = assetIdRaw;

  if (assetId === "__new__") {
    const name = String(formData.get("new_asset_name") ?? "").trim();
    const category = String(formData.get("new_asset_category") ?? "") as AssetCategory;
    const currency = String(formData.get("new_asset_currency") ?? "") as Currency;
    if (!name) failLink(documentId, "New asset needs a name.");
    if (!VALID_CATEGORIES.includes(category)) failLink(documentId, "Pick a category for the new asset.");
    if (!CURRENCIES.includes(currency)) failLink(documentId, "Pick a currency for the new asset.");

    const { data: asset, error } = await supabase
      .from("assets")
      .insert({ name, category, native_currency: currency })
      .select("id")
      .single();
    if (error) failLink(documentId, `Could not create asset: ${error.message}`);
    assetId = asset!.id;
  }

  // The balance is being typed in by the user (no AI yet), so source stays
  // 'manual' even with a doc attached — the document is supporting evidence.
  const { error: balErr } = await supabase.from("balance_entries").insert({
    asset_id: assetId,
    amount: amount.toFixed(4),
    as_of_date: asOfDate,
    source: "manual",
    source_document_id: documentId,
  });
  if (balErr) failLink(documentId, `Could not save balance: ${balErr.message}`);

  revalidatePath("/dashboard");
  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
