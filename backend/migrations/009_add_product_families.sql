-- Adds narrower product-family matching fields to intelligence_cards.
-- category_triggers remains in the schema for backward compatibility but is
-- deprecated by the new matching logic in attachIntelCards.
--
-- product_families: canonical product family strings (e.g. "foundation",
--   "nail_polish_remover") used by the pattern-level relevance matcher.
-- specific_products: optional SKU-level recall targets, matched by fuzzy
--   substring against scan product_name.

ALTER TABLE intelligence_cards
  ADD COLUMN IF NOT EXISTS product_families TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specific_products TEXT[] DEFAULT '{}';
