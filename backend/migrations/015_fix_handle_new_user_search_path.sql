-- Migration 015: Fix handle_new_user search_path and qualify the
-- profiles reference.
--
-- BUG
-- Between roughly 2026-04-24 and 2026-05-15 the on_auth_user_created
-- trigger silently failed for every new signup. The Postgres log line
-- surfaced as "Database error saving new user" at the client. Root
-- cause: the live handle_new_user function on production was defined
-- with SECURITY DEFINER and an unqualified profiles reference, and
-- without an explicit SET search_path clause. Supabase changed the
-- role that executes auth triggers during the affected window, and
-- the new role's search_path did not resolve the unqualified
-- profiles identifier. Every signup INSERT raised
-- "relation profiles does not exist" inside the trigger, the trigger
-- aborted, and Supabase returned the generic save-user error to the
-- client.
--
-- FIX (applied to production today, captured here so future
-- environments rebuild correctly)
-- 1. Pin search_path on the function itself with
--    SET search_path = public, pg_catalog. SECURITY DEFINER functions
--    must not inherit search_path from the caller.
-- 2. Schema-qualify every table reference (public.profiles). Belt
--    and braces with the search_path pin so a future search_path
--    change cannot break the function silently.
-- 3. Add an explicit column list and ON CONFLICT (id) DO NOTHING so
--    a retried signup or a race against a manual profiles row never
--    raises a unique-violation that would propagate the same way.
--
-- The trigger that calls this function (on_auth_user_created on
-- auth.users) is unchanged. Only the function body is rewritten.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_catalog
AS $function$
  BEGIN
    INSERT INTO public.profiles (id, is_subscribed, scan_count)
    VALUES (NEW.id, false, 0)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
$function$;
