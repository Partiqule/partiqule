-- Migration 006: recreate regulatory_flags with the intel cards schema
--
-- This restores the original regulatory_flags table used by the intelligence
-- card approval flow. Each row is a compound-level regulatory finding extracted
-- from an approved intel card and injected into the AI scoring prompt.
--
-- Apply via Supabase SQL Editor AFTER 005_rename_pfas_table.sql (which frees up
-- the regulatory_flags name). Requires the intelligence_cards table to exist.

CREATE TABLE regulatory_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intelligence_card_id UUID REFERENCES intelligence_cards(id) ON DELETE CASCADE,
  compound_name TEXT NOT NULL,
  regulatory_body TEXT NOT NULL,
  action_type TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  effective_date DATE,
  health_concern TEXT,
  applies_to_categories TEXT[] DEFAULT '{}',
  scoring_context TEXT,
  active BOOLEAN DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regulatory_flags_active ON regulatory_flags(active);
CREATE INDEX idx_regulatory_flags_card_id ON regulatory_flags(intelligence_card_id);
CREATE INDEX idx_regulatory_flags_category ON regulatory_flags USING gin(applies_to_categories);
