-- Migration 012: reviews table for the Reviews MVP shipping 2026-05-12.
--
-- Product anchor: product_name_normalized (lowercase + trim, mirroring
-- the normalise() helper in calibration.js). One review per user per
-- product, enforced by the unique index below — re-submit acts as edit
-- via upsert in the POST /reviews handler.
--
-- Identity surface: user_id is required because anonymous scans are
-- blocked server-side as of dee214c, so every reviewer has a user. The
-- public display layer renders first_name when set or the literal string
-- "Anonymous" otherwise; the data layer always knows who wrote the row
-- for moderation purposes.
--
-- Moderation model: status defaults to 'published'. A single report
-- flips the row to 'flagged' (single-report threshold acceptable at
-- the current 26-active-user scale; re-evaluate if griefing surfaces).
-- A flagged row drops out of the public aggregate immediately. Admin
-- resolves flagged rows via /admin/reviews/:id/resolve which sets
-- status back to 'published' (publish) or to 'removed' (hard hide).
-- 'removed' rows never re-surface in the public aggregate.
--
-- Cache: GET /reviews caches per product_name_normalized at
-- agg:reviews:<normalized> with 300s TTL. Invalidation fires on every
-- POST /reviews, POST /reviews/:id/report, and admin resolve.
--
-- RLS: enable separately in Supabase dashboard. Backend uses the
-- service role key and bypasses RLS for all reads and writes.

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name_normalized TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'flagged', 'removed')),
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public read path: aggregate query filters status='published' and
-- groups by product. The (product_name_normalized, status) ordering
-- matches that access pattern.
CREATE INDEX idx_reviews_product
  ON reviews(product_name_normalized, status);

-- Admin moderation queue: list flagged rows newest first.
CREATE INDEX idx_reviews_status
  ON reviews(status, created_at DESC);

-- One review per user per product. Upsert key for the POST /reviews
-- edit-as-resubmit pattern.
CREATE UNIQUE INDEX uniq_reviews_user_product
  ON reviews(product_name_normalized, user_id);
