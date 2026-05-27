import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard

function loadKey(): Buffer {
  const hex = process.env.SECRET_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY missing or wrong length (must be 64 hex chars = 32 bytes)."
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Output format:
 *   "<iv-hex>:<authtag-hex>:<ciphertext-hex>"
 * Each component is hex-encoded so the whole value is safe to store
 * verbatim in a TEXT column.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(envelope: string): string {
  const key = loadKey();
  const parts = envelope.split(":");
  if (parts.length !== 3) throw new Error("Malformed secret envelope.");
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Build a masked preview safe to show in the admin UI.
 * Shows first 7 + last 4 chars; everything else becomes "…".
 *   `sk-or-v1-abcdef0123...wxyz`  →  `sk-or-v…wxyz`
 */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  if (plaintext.length <= 11) return "…" + plaintext.slice(-2);
  return `${plaintext.slice(0, 7)}…${plaintext.slice(-4)}`;
}
