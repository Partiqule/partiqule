-- Migration 001: regulatory_flags table for lab / regulator / incident-backed findings
--
-- NOTE: An older regulatory_flags table exists for intelligence-card-derived
-- regulatory actions (compound_name, regulatory_body, jurisdiction, etc.).
-- This new schema is product/brand-oriented and will collide with the old
-- table if run against the same database. Rename or drop the old table
-- (or apply this migration to a different name) before running this file.

CREATE TABLE regulatory_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  product_name TEXT,
  product_sku TEXT,
  category TEXT NOT NULL,
  substance TEXT NOT NULL,
  concern_level TEXT NOT NULL CHECK (concern_level IN
    ('detected', 'elevated', 'exceeds_threshold', 'banned')),
  source TEXT NOT NULL,
  source_url TEXT,
  tested_date DATE,
  reported_date DATE,
  test_method TEXT,
  measurement TEXT,
  score_impact INTEGER NOT NULL CHECK (score_impact BETWEEN 1 AND 3),
  flag_reason TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  incomplete_data BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at DATE
);

CREATE INDEX idx_regulatory_flags_brand ON regulatory_flags(brand);
CREATE INDEX idx_regulatory_flags_category ON regulatory_flags(category);
CREATE INDEX idx_regulatory_flags_substance ON regulatory_flags(substance);

-- Upsert key for idempotency. NULLS NOT DISTINCT so brand-only entries
-- (product_name IS NULL) are treated as unique per (brand, substance, source).
-- Requires Postgres 15+. Supabase projects on 15+ support this syntax.
CREATE UNIQUE INDEX uniq_regulatory_flags_key
  ON regulatory_flags (brand, product_name, substance, source)
  NULLS NOT DISTINCT;
