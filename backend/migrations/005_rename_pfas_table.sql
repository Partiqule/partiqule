-- Migration 005: rename PFAS table out of the way
--
-- This morning's PFAS migration created a `regulatory_flags` table with a
-- product/brand schema. That name was already in use by the intel cards
-- feature, which expects a completely different schema (intelligence_card_id,
-- compound_name, regulatory_body, etc.). Rename the PFAS table so the intel
-- cards table can be recreated under the original name.
--
-- Apply via Supabase SQL Editor. Must run before 006_create_intel_regulatory_flags.sql.

ALTER TABLE regulatory_flags RENAME TO product_safety_findings;

ALTER INDEX idx_regulatory_flags_brand RENAME TO idx_product_safety_findings_brand;
ALTER INDEX idx_regulatory_flags_category RENAME TO idx_product_safety_findings_category;
ALTER INDEX idx_regulatory_flags_substance RENAME TO idx_product_safety_findings_substance;

ALTER INDEX uniq_regulatory_flags_key RENAME TO uniq_product_safety_findings_key;
