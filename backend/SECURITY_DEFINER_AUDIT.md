# SECURITY DEFINER audit — 2026-05-15

Triggered by the signup outage that ran roughly 2026-04-24 to
2026-05-15. Root cause was a SECURITY DEFINER function
(`public.handle_new_user`) with no `SET search_path` clause and an
unqualified `profiles` reference inside the body. Supabase rotated
the role that executes auth triggers during the window, the new
role's search_path no longer resolved `profiles`, and every signup
INSERT failed inside the trigger. Migration 015 canonicalizes the
fix.

This audit walks every database function the repo knows about and
flags any with the same shape: SECURITY DEFINER plus missing
search_path plus an unqualified table reference. SECURITY INVOKER
functions are noted for completeness because the same unqualified
reference pattern can still break if the caller's search_path is
empty or unexpected, but the failure surface is narrower.

## Scope of source

- `backend/migrations/*.sql` — every committed migration. Zero
  CREATE FUNCTION statements present. The committed schema has no
  function definitions at all today.
- `backend/server.js` — every `supabaseAdmin.rpc(...)` call and any
  inline SQL fragment in a comment that documents an out-of-tree
  function.
- The production Supabase database — referenced by name only here,
  because the audit cannot read production from this environment
  without credentials and a function-introspection RPC. Each
  out-of-tree function is flagged with a follow-up so the live
  definition can be cross-checked against the same checklist.

## Findings

### 1. `public.handle_new_user()`

- **Source of truth before today:** production database only. Not in
  any migration file.
- **SECURITY DEFINER:** yes.
- **Explicit `SET search_path`:** missing on the production
  definition before today. Present in migration 015 as
  `SET search_path = public, pg_catalog`.
- **Schema-qualified table references:** missing on the production
  definition before today (referenced `profiles`). Present in
  migration 015 (`public.profiles`).
- **Status:** FIXED in production today and canonicalized in
  migration 015. No further action.

### 2. `increment_scan_count(uid uuid)`

- **Source of truth:** inline comment at
  `backend/server.js:6382-6385`. Not in any migration file.
- **Called from:** `backend/server.js:6391` and
  `backend/server.js:11444`. A non-atomic select-plus-upsert
  fallback runs when the RPC returns an error, so the function is
  not strictly load-bearing, but it is the intended atomic path.
- **SECURITY DEFINER:** unknown on production. The comment
  documents `LANGUAGE sql` with no `SECURITY` clause, which would
  default to SECURITY INVOKER. The live definition was created by
  hand in Supabase Studio and may diverge.
- **Explicit `SET search_path`:** absent in the documented form.
  Unknown on production.
- **Schema-qualified table references:** the documented form
  references `profiles` unqualified. Unknown on production.
- **Risk:** lower than `handle_new_user` because the function is
  called by `supabaseAdmin` (service role) on a non-critical path
  and the fallback masks failures. Still vulnerable to the same
  role-rotation failure mode if the live definition is SECURITY
  DEFINER or runs with an empty search_path.
- **Status:** FLAG. Action items below.

### 3. `scans_trigram_search(q, threshold, user_id_arg, lim)`

- **Source of truth:** production database only. Referenced by
  CLAUDE.md as a `pg_trgm`-backed RPC required for scan-trigram
  fallback. Not in any migration file. Not documented as an inline
  comment anywhere in `backend/`.
- **Called from:** `backend/server.js:6225`.
- **SECURITY DEFINER:** unknown.
- **Explicit `SET search_path`:** unknown.
- **Schema-qualified table references:** unknown.
- **Risk:** unknown without production introspection. Function is
  on the user-facing text-search path so any failure surfaces
  directly to the user.
- **Status:** FLAG. Action items below.

## Summary

| Function | SECURITY DEFINER | SET search_path | Qualified refs | Status |
|---|---|---|---|---|
| `public.handle_new_user` | yes | yes (migration 015) | yes (migration 015) | fixed |
| `increment_scan_count` | unknown | unknown | no in comment | flag |
| `scans_trigram_search` | unknown | unknown | unknown | flag |

## Follow-up actions

1. Introspect the two flagged functions on production with the
   admin client. The query that returns everything this audit
   needs:

   ```sql
   SELECT n.nspname || '.' || p.proname AS fn,
          p.prosecdef                     AS security_definer,
          p.proconfig                     AS settings,
          pg_get_functiondef(p.oid)       AS definition
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('increment_scan_count', 'scans_trigram_search', 'handle_new_user');
   ```

2. For each row returned, confirm: `security_definer` is the
   expected value, `settings` contains `search_path=public,pg_catalog`
   when `security_definer` is true, and the definition body
   schema-qualifies every table reference.

3. If either flagged function fails the checklist, write a follow-up
   migration in the same shape as 015 to canonicalize the corrected
   form and apply it to production.

4. Future database functions, regardless of who writes them or
   where they originate, land in `backend/migrations/` first.
   In-Studio-only function definitions caused this outage; they
   are now an exception that requires a follow-up migration on the
   same day, not an indefinite norm.

## Audit method note

This audit could not read live function definitions from production
in the environment it ran in. The two flagged functions are flagged
on grounds that they exist outside source control and therefore
cannot be verified against the rule. The follow-up actions are how
to close that gap.
