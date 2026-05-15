-- Migration 013: lists + list_items tables for the R3b API shipping
-- in support of /lists-prototype going live (R3c) on Vercel.
--
-- The schema mirrors fixtures.js exactly so the R3c frontend swap is
-- mechanical: replace the in-memory state with /lists fetches and the
-- row shape lines up without translation.
--
-- Anchor model: each list_items row links to one of three things —
--   scan_id              — an existing scan the user owns
--   calibration_key      — a calibration map key
--   product_name_normalized — typed-in name with no score yet
-- Exactly one must be non-null (enforced in the API; we don't add a
-- CHECK constraint here so future anchor types can slot in cleanly).
--
-- Display fields are denormalized onto list_items so the GET /lists
-- and GET /lists/:id reads don't have to join through scans or look
-- up calibration. If the underlying scan or calibration entry changes
-- after the item was added, the list row keeps its frozen snapshot
-- of product_name + score until the user re-anchors.
--
-- Position drives drag-to-reorder. We sort by purchased ASC, position
-- ASC, created_at ASC in the API so the unpurchased items lead, the
-- purchased items tail, and order within each group respects the
-- user's last drag.
--
-- RLS: enable on both tables. user_id = auth.uid() is the only rule
-- needed because we never share lists between users at the data layer.
-- Backend uses the service role key and bypasses RLS for reads and
-- writes; ownership is enforced explicitly in the route handlers.

CREATE TABLE lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  kind        TEXT        NOT NULL DEFAULT 'shopping',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- Partial index — the GET /lists read filters out archived rows.
CREATE INDEX idx_lists_user_active
  ON lists(user_id)
  WHERE archived_at IS NULL;

CREATE TABLE list_items (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID    NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Anchor: API validates exactly one of these three is non-null.
  scan_id                  UUID  REFERENCES scans(id) ON DELETE SET NULL,
  product_name_normalized  TEXT,
  calibration_key          TEXT,

  -- Denormalized display data — frozen at insert time.
  product_name TEXT    NOT NULL,
  category     TEXT,
  score        INTEGER,
  kid_score    INTEGER,
  flags        JSONB   NOT NULL DEFAULT '[]'::jsonb,

  -- User state.
  note      TEXT,
  purchased BOOLEAN NOT NULL DEFAULT FALSE,
  position  INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_list_items_list
  ON list_items(list_id);

-- Cross-list intel ("Also in: ...") on the detail view scans the
-- user's items by product_name. Index speeds that join.
CREATE INDEX idx_list_items_user_product
  ON list_items(user_id, product_name);

ALTER TABLE lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_user_owns" ON lists
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "list_items_user_owns" ON list_items
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
