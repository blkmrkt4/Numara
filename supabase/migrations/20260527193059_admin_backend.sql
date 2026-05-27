-- Numara — admin backend foundation.
-- Implements PRD §13 step 5 and §14 (system_secrets, prompts, bindings,
-- model catalogue, LLM call logs, admin audit log).
-- All tables are GLOBAL (not household-scoped) and are only readable or
-- writable by users with is_system_admin = true. The service role
-- bypasses RLS for background jobs (model sync, call logging).

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is the caller a system admin?
-- Defined SECURITY DEFINER so the policy expression can be tested cheaply
-- on every row without granting select on auth.uid() lookups to the user
-- (which they already implicitly have).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_current_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_system_admin from public.users where id = auth.uid()),
    false
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- system_secrets — encrypted at the application layer (AES-256-GCM).
-- The DB only ever sees the ciphertext + an unprivileged metadata blob.
-- value_encrypted format: "<iv-hex>:<authtag-hex>:<ciphertext-hex>" per
-- lib/crypto.ts. value_masked is what the UI displays in read mode.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.system_secrets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value_encrypted text not null,
  value_masked text not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.system_secrets enable row level security;

-- system_secrets is server-side only. No authenticated client policy means
-- only the service role can read or write the table from the application.
-- The admin UI talks to it exclusively through SECURITY DEFINER server actions
-- that gate on is_current_system_admin() before touching the table.

-- ─────────────────────────────────────────────────────────────────────────────
-- system_settings — singleton row holding global defaults.
-- We model it as a plain table with a fixed primary key value so future
-- settings can be added as columns without a migration to a new shape.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.system_settings (
  id boolean primary key default true check (id = true), -- singleton guard
  default_primary_model_slug text,
  default_fallback_1_model_slug text,
  default_fallback_2_model_slug text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.system_settings (id) values (true);

alter table public.system_settings enable row level security;

create policy system_settings_admin_select on public.system_settings
  for select to authenticated
  using (public.is_current_system_admin());

-- Updates flow through SECURITY DEFINER server actions; no client write policy.

-- ─────────────────────────────────────────────────────────────────────────────
-- openrouter_models — cache of /v1/models, refreshed by a server job.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.openrouter_models (
  slug text primary key, -- e.g. anthropic/claude-opus-4
  name text not null,
  provider text not null, -- first segment of slug
  context_length integer,
  input_cost_per_mtoken numeric(12, 4),
  output_cost_per_mtoken numeric(12, 4),
  supports_vision boolean not null default false,
  supports_tools boolean not null default false,
  supports_json_mode boolean not null default false,
  is_coding_specialist boolean not null default false,
  is_reasoning_specialist boolean not null default false,
  is_available boolean not null default true,
  last_synced_at timestamptz not null default now(),
  raw jsonb -- full provider response for forensics
);

create index openrouter_models_provider_idx
  on public.openrouter_models (provider, slug);

alter table public.openrouter_models enable row level security;

create policy openrouter_models_admin_select on public.openrouter_models
  for select to authenticated
  using (public.is_current_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- prompts and versions — PRD §8 admin entities.
-- Editing a prompt creates a new PromptVersion; old versions are retained.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  purpose text not null
    check (purpose in ('extraction','classification','summary','other')),
  current_version_id uuid, -- set after first version inserted; FK added below
  status text not null default 'active'
    check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts(id) on delete cascade,
  version_number integer not null,
  body text not null,
  available_slugs jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (prompt_id, version_number)
);

alter table public.prompts
  add constraint prompts_current_version_fkey
  foreign key (current_version_id)
  references public.prompt_versions(id)
  on delete set null
  deferrable initially deferred;

create trigger prompts_set_updated_at
  before update on public.prompts
  for each row execute function public.set_updated_at();

alter table public.prompts enable row level security;
alter table public.prompt_versions enable row level security;

create policy prompts_admin_select on public.prompts
  for select to authenticated
  using (public.is_current_system_admin());

create policy prompt_versions_admin_select on public.prompt_versions
  for select to authenticated
  using (public.is_current_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- prompt_bindings — 1:1 with prompts. Primary + 2 fallback model slugs,
-- plus generation params. JSON schema is optional for structured output.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.prompt_bindings (
  prompt_id uuid primary key references public.prompts(id) on delete cascade,
  primary_model_slug text not null,
  fallback_1_model_slug text,
  fallback_2_model_slug text,
  temperature numeric(3, 2) not null default 0.2
    check (temperature >= 0 and temperature <= 2),
  max_tokens integer not null default 2048
    check (max_tokens > 0 and max_tokens <= 200000),
  response_format text not null default 'text'
    check (response_format in ('text','json')),
  json_schema jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger prompt_bindings_set_updated_at
  before update on public.prompt_bindings
  for each row execute function public.set_updated_at();

alter table public.prompt_bindings enable row level security;

create policy prompt_bindings_admin_select on public.prompt_bindings
  for select to authenticated
  using (public.is_current_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- llm_call_logs — every attempt, primary or fallback, success or failure.
-- Powers the cost dashboard and fallback-rate metric on the Settings page.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.llm_call_logs (
  id uuid primary key default gen_random_uuid(),
  prompt_slug text not null,
  model_used text not null,
  was_fallback smallint not null check (was_fallback in (0, 1, 2)),
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index llm_call_logs_recent_idx
  on public.llm_call_logs (created_at desc);
create index llm_call_logs_prompt_recent_idx
  on public.llm_call_logs (prompt_slug, created_at desc);

alter table public.llm_call_logs enable row level security;

create policy llm_call_logs_admin_select on public.llm_call_logs
  for select to authenticated
  using (public.is_current_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_audit_log — every admin action (PRD §14.8).
-- "secret updated" rather than the value is recorded for secrets.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null, -- e.g. 'system_secret', 'prompt', 'prompt_binding'
  entity_id text,
  action text not null, -- e.g. 'create', 'update', 'delete'
  diff jsonb, -- before/after for non-secret fields; "secret updated" sentinel for secrets
  created_at timestamptz not null default now()
);

create index admin_audit_log_recent_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy admin_audit_log_admin_select on public.admin_audit_log
  for select to authenticated
  using (public.is_current_system_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: the five prompts called out in PRD §14.7. Each starts disabled
-- with a placeholder body so the admin can fill them in via the step-6
-- Prompts UI. Bindings come pre-pointed at the empty global defaults;
-- the admin sets real defaults in /admin/settings.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  p record;
  new_version_id uuid;
  seed_prompts constant text[][] := array[
    array['extract_statement',     'Extract statement',                  'Read a financial document and return structured fields.',                  'extraction'],
    array['classify_new_vs_update','Classify new vs update',             'Decide whether an extracted statement matches an existing asset.',         'classification'],
    array['normalise_institution_name','Normalise institution name',     'Map a raw institution name to a canonical one.',                            'other'],
    array['summarise_property_valuation','Summarise property valuation', 'Generate a one-line summary of a property valuation report.',              'summary'],
    array['suggest_outgoing_category','Suggest outgoing category',       'Pick the most likely category for a recurring bill.',                       'other']
  ];
  seed_slugs constant jsonb[] := array[
    '["document_image_or_text","known_institutions","user_default_currency"]'::jsonb,
    '["extracted","candidate_assets"]'::jsonb,
    '["raw_name","known_institutions"]'::jsonb,
    '["document_text"]'::jsonb,
    '["vendor_name","amount","currency"]'::jsonb
  ];
  i integer;
  new_prompt_id uuid;
begin
  for i in 1 .. array_length(seed_prompts, 1) loop
    insert into public.prompts (slug, name, description, purpose, status)
    values (
      seed_prompts[i][1],
      seed_prompts[i][2],
      seed_prompts[i][3],
      seed_prompts[i][4],
      'disabled' -- enabled by the admin once a body is written
    )
    returning id into new_prompt_id;

    insert into public.prompt_versions (prompt_id, version_number, body, available_slugs, notes)
    values (
      new_prompt_id,
      1,
      '-- placeholder; edit in /admin/prompts',
      seed_slugs[i],
      'Seeded from PRD §14.7'
    )
    returning id into new_version_id;

    update public.prompts
      set current_version_id = new_version_id
      where id = new_prompt_id;

    insert into public.prompt_bindings (
      prompt_id,
      primary_model_slug,
      fallback_1_model_slug,
      fallback_2_model_slug
    )
    values (
      new_prompt_id,
      'anthropic/claude-opus-4',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o'
    );
  end loop;
end $$;
