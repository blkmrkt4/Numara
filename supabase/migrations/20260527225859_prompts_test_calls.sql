-- Numara — track LLM test calls separately so the prompt editor's test
-- panel has its own rate limit (PRD §14.8).
-- actor_id is who triggered the call (test calls only); production calls
-- continue to leave it null.

set search_path = public;

alter table public.llm_call_logs
  add column was_test boolean not null default false,
  add column actor_id uuid references auth.users(id) on delete set null;

-- Index supporting the per-actor sliding-window rate limit lookup
-- ("how many test calls did this admin make in the last minute?").
create index llm_call_logs_actor_test_recent_idx
  on public.llm_call_logs (actor_id, created_at desc)
  where was_test = true;
