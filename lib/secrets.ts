import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";

export const SECRET_KEYS = {
  OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
} as const;
export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

export type SecretMeta = {
  key: string;
  value_masked: string;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Store or replace a secret. Encrypts at write time; the cleartext never
 * touches the DB. Updates the masked preview for the admin UI.
 */
export async function putSecret(
  key: SecretKey,
  plaintext: string,
  updatedBy: string | null,
  description?: string
): Promise<void> {
  const admin = createAdminClient();
  const value_encrypted = encryptSecret(plaintext);
  const value_masked = maskSecret(plaintext);

  const { error } = await admin
    .from("system_secrets")
    .upsert(
      {
        key,
        value_encrypted,
        value_masked,
        description: description ?? null,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (error) throw new Error(`Could not save secret ${key}: ${error.message}`);
}

/**
 * Decrypt and return the raw secret. Server-side only, never exposed to
 * the client. Returns null if the secret has never been set.
 */
export async function readSecret(key: SecretKey): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_secrets")
    .select("value_encrypted")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`Could not read secret ${key}: ${error.message}`);
  if (!data) return null;
  return decryptSecret(data.value_encrypted);
}

export async function getSecretMeta(key: SecretKey): Promise<SecretMeta | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_secrets")
    .select("key, value_masked, updated_at, updated_by")
    .eq("key", key)
    .maybeSingle();
  return data ?? null;
}
