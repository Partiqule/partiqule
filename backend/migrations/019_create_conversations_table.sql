-- Migration 019: conversations table for R5b.3 Phase 2a refinement loop.
--
-- The conversations table holds the multi-turn state for Ask queries that
-- needed refinement. Each row is one conversation thread spanning the
-- initial query, the refinement question/answer round, and the eventual
-- bundle. The `turns` jsonb array carries the sequence of intent +
-- refinement + bundle objects so Phase 3 (multi-turn memory) can scan
-- the full history when composing follow-up bundles.
--
-- Auth model:
--   - Authed users: user_id is set, session_id is null. Conversations
--     scoped to the user.
--   - Anonymous users: user_id is null, session_id is the client-managed
--     identifier (likely localStorage UUID or similar). Conversations
--     scoped to the session.
--
-- TTL (auto-expire and delete at boundary; cron implementation deferred):
--   - Anonymous: 7 days from last_active_at (privacy posture; no archive).
--   - Authed:    30 days from last_active_at.
--
--   The cron job to enforce TTL is NOT included in this migration.
--   When implemented, it should DELETE FROM conversations WHERE
--   (user_id IS NULL AND last_active_at < NOW() - INTERVAL '7 days')
--   OR (user_id IS NOT NULL AND last_active_at < NOW() - INTERVAL '30 days').
--   Run hourly via Railway cron or pg_cron extension.

CREATE TABLE conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      TEXT,
  turns           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user conversation lookup. Partial index keeps it small —
-- anonymous conversations don't have user_id set.
CREATE INDEX idx_conversations_user
  ON conversations(user_id, last_active_at DESC)
  WHERE user_id IS NOT NULL;

-- Per-session conversation lookup for anonymous users. Partial index
-- mirrors the user_id one.
CREATE INDEX idx_conversations_session
  ON conversations(session_id, last_active_at DESC)
  WHERE session_id IS NOT NULL;

-- TTL sweep index. Cron job will scan this when enforcing expiration.
CREATE INDEX idx_conversations_ttl
  ON conversations(last_active_at);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Authed users read their own conversations. Anonymous conversations
-- are not exposed through RLS — the backend service-role key reads
-- them directly via session_id lookup.
CREATE POLICY "conversations_user_read" ON conversations
  FOR SELECT
  USING (user_id = auth.uid());
