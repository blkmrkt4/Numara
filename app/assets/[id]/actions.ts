"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/documents";

function failBalance(assetId: string, message: string): never {
  redirect(`/assets/${assetId}?error=${encodeURIComponent(message)}`);
}

export async function addBalance(formData: FormData) {
  const assetId = String(formData.get("asset_id") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const asOfDate = String(formData.get("as_of_date") ?? "").trim();
  const file = formData.get("file");

  if (!assetId) redirect("/dashboard");
  if (!amountRaw) failBalance(assetId, "Amount is required.");
  if (!asOfDate) failBalance(assetId, "Date is required.");

  // Allow negatives (overdrafts, credit cards modelled as cash etc); reject NaN.
  const amount = Number(amountRaw.replace(/,/g, ""));
  if (!Number.isFinite(amount)) failBalance(assetId, "Amount must be a number.");

  // Date validation: must be a valid YYYY-MM-DD, not in the future.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) failBalance(assetId, "Invalid date.");
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (new Date(asOfDate) > today) failBalance(assetId, "Date cannot be in the future.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Optional document attachment. We upload first so the document row exists
  // before the balance row references it; if balance insert fails we keep the
  // doc (the user can still re-link it from /capture/<id>).
  let sourceDocumentId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const { data: profile } = await supabase
      .from("users")
      .select("household_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.household_id) failBalance(assetId, "Account is not yet provisioned.");

    const uploaded = await uploadDocument(supabase, profile.household_id, user.id, file);
    if (!uploaded.ok) failBalance(assetId, uploaded.error);
    sourceDocumentId = uploaded.documentId;
  }

  const { error } = await supabase.from("balance_entries").insert({
    asset_id: assetId,
    amount: amount.toFixed(4),
    as_of_date: asOfDate,
    source: "manual",
    source_document_id: sourceDocumentId,
  });

  if (error) failBalance(assetId, `Could not save: ${error.message}`);

  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/dashboard");
  redirect(`/assets/${assetId}`);
}

export async function archiveAsset(formData: FormData) {
  const assetId = String(formData.get("asset_id") ?? "");
  if (!assetId) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("assets")
    .update({ archived: true })
    .eq("id", assetId);

  if (error) failBalance(assetId, `Could not archive: ${error.message}`);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function unarchiveAsset(formData: FormData) {
  const assetId = String(formData.get("asset_id") ?? "");
  if (!assetId) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("assets")
    .update({ archived: false })
    .eq("id", assetId);

  if (error) failBalance(assetId, `Could not restore: ${error.message}`);

  revalidatePath("/dashboard");
  revalidatePath(`/assets/${assetId}`);
  redirect(`/assets/${assetId}`);
}
