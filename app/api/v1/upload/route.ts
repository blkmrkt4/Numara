import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadDocument } from "@/lib/documents";
import { extractStatement } from "@/lib/extraction";
import type { Currency } from "@/lib/types";

// Mirror of app/capture/actions.ts uploadFromCapture(), but JSON-in /
// JSON-out so the offline upload queue (lib/upload-queue.ts) can replay
// it later. The redirecting Server Action is still the online happy
// path from the /capture form; this endpoint is what the queue drainer
// hits.

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No file provided." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("users")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.household_id) {
    return NextResponse.json(
      { ok: false, error: "Account is not yet provisioned." },
      { status: 400 }
    );
  }

  const { data: household } = await supabase
    .from("households")
    .select("default_currency")
    .eq("id", profile.household_id)
    .maybeSingle();
  const defaultCurrency = (household?.default_currency as Currency) ?? "GBP";

  const uploaded = await uploadDocument(supabase, profile.household_id, user.id, file);
  if (!uploaded.ok) {
    return NextResponse.json({ ok: false, error: uploaded.error }, { status: 400 });
  }

  const extraction = await extractStatement(
    supabase,
    uploaded.documentId,
    profile.household_id,
    defaultCurrency
  );

  return NextResponse.json({
    ok: true,
    document_id: uploaded.documentId,
    extracted: extraction.ok ? extraction.extracted : null,
    extract_error: extraction.ok ? null : extraction.error,
  });
}
