-- Numara — documents table, storage bucket, and storage RLS.
-- Implements PRD §8 Document entity, §5.1 ingestion, §6.1 storage security.
-- Step 4 of §13: linkage between balance entries and source documents
-- (AI extraction itself lands in step 7).

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- documents — one row per uploaded file.
-- 25 MB hard cap (also enforced at the storage bucket level).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null
    check (size_bytes > 0 and size_bytes <= 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  extracted_json jsonb,
  status text not null default 'uploaded'
    check (status in ('uploaded','processing','extracted','failed'))
);

create index documents_household_recent_idx
  on public.documents (household_id, uploaded_at desc);

alter table public.documents enable row level security;

create policy documents_member_all on public.documents
  for all to authenticated
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

-- Finalise the FK from balance_entries.source_document_id reserved in
-- migration 20260527162711_assets_balances. Set null on document delete so
-- a missing audit trail never deletes the user's financial data.
alter table public.balance_entries
  add constraint balance_entries_source_document_id_fkey
  foreign key (source_document_id)
  references public.documents(id)
  on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket: private, 25 MB cap, PRD §5.1 mime types.
-- Re-runnable: on conflict updates the bucket config.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage RLS: objects in the `documents` bucket must live under a top-level
-- folder that matches the caller's household_id. Object keys are written
-- as `<household_id>/<doc_id>.<ext>` by the upload helper.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "documents_household_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );

create policy "documents_household_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );

create policy "documents_household_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );

create policy "documents_household_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.current_household_id()::text
  );
