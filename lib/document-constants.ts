// Shared client-safe constants for document handling.
// Kept separate from lib/documents.ts (which is server-only and pulls in
// node:crypto and the supabase client) so client components can import
// these without dragging server code into their bundle.

export const MAX_BYTES = 26_214_400; // 25 MB

export const ACCEPTED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
};

export const ACCEPT_ATTRIBUTE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  ".heif",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
].join(",");
