// backend/productFamilies.js
// classifyProductFamily(productName, ingredients, category) -> family string | null
//
// CANONICAL_FAMILIES is the single source of truth for every family the
// classifier can return and the only families the AI intel-card prompt is
// allowed to emit. If you add a new case below, add it here too — the
// productFamilies test suite asserts consistency.
const CANONICAL_FAMILIES = [
  "foundation", "concealer", "lipstick", "lip_balm", "mascara", "eyeshadow", "blush",
  "nail_polish", "nail_polish_remover",
  "skincare_face", "skincare_eye", "skincare_body", "sunscreen",
  "hair_shampoo", "hair_conditioner", "hair_styling",
  "body_wash", "bar_soap", "deodorant", "fragrance",
  "oral_toothpaste", "oral_mouthwash",
  "baby_wipe", "baby_lotion", "baby_shampoo", "baby_diaper_cream",
  "wound_care", "shaving_cream", "razor",
];
//
// Returns a canonical product family string used by intel card relevance
// matching. Returns null when no rule matches — callers fall back to
// ingredient-trigger matching only. Non-personal-care products generally
// return null until food/home families are added.
//
// Ordering is significant: the first matching rule wins. More specific rules
// (baby_shampoo) must come before their more general siblings (hair_shampoo).

function classifyProductFamily(productName, ingredients, category) {
  const name = (productName || "").toString();
  if (!name.trim()) return null;
  const has = (re) => re.test(name);

  // ── Makeup: nail ──
  if (has(/\b(?:nail\s*polish\s*remover|polish\s*remover|acetone\s*remover)\b/i)) return "nail_polish_remover";
  if (has(/\b(?:nail\s*polish|nail\s*lacquer|nail\s*enamel)\b/i)) return "nail_polish";

  // ── Makeup: eye ──
  if (has(/\bmascara\b/i)) return "mascara";
  if (has(/\b(?:eyeshadow|eye\s*shadow|eye\s*palette)\b/i)) return "eyeshadow";

  // ── Makeup: face ──
  if (has(/\bconcealer\b/i)) return "concealer";
  if (has(/\b(?:blush|blusher)\b/i)) return "blush";
  if (has(/\b(?:lip\s*balm|lip\s*salve|lip\s*repair|lip\s*treatment|chapstick|carmex)\b/i)) return "lip_balm";
  if (has(/\b(?:lipstick|liquid\s*lip|matte\s*lip|lip\s*color|lip\s*gloss|lip\s*lacquer)\b/i)) return "lipstick";
  if (has(/\b(?:foundation|bb\s*cream|cc\s*cream|tinted\s*moisturi[sz]er|tinted\s*serum)\b/i)) return "foundation";

  // ── Sun ──
  if (has(/\b(?:sunscreen|sun\s*block|sunblock|spf\s*\d+|spf\d+)\b/i)) return "sunscreen";

  // ── Baby (checked before generic hair/skin so "baby shampoo" wins over "shampoo") ──
  if (has(/\bdiaper\s*(?:rash\s*)?(?:cream|ointment|paste)\b/i)) return "baby_diaper_cream";
  const isBaby = has(/\b(?:baby|babies)\b/i);
  if (isBaby && has(/\bdiaper\b/i)) return "baby_diaper_cream";
  if (has(/\bbaby\s*wipes?\b/i)) return "baby_wipe";
  if (isBaby && has(/\bshampoo\b/i)) return "baby_shampoo";
  if (isBaby && has(/\b(?:lotion|cream|moistur|oil)\b/i)) return "baby_lotion";

  // ── Hair (dry shampoo = styling, not shampoo) ──
  if (has(/\bdry\s*shampoo\b/i)) return "hair_styling";
  if (has(/\b(?:hairspray|hair\s*spray|hair\s*gel|pomade|hair\s*mousse|hair\s*wax|hair\s*serum|styling\s*cream|styling\s*gel)\b/i)) return "hair_styling";
  if (has(/\b(?:conditioner|leave[-\s]in\s*conditioner)\b/i)) return "hair_conditioner";
  if (has(/\bshampoo\b/i)) return "hair_shampoo";

  // ── Body wash / soap ──
  if (has(/\b(?:body\s*wash|shower\s*gel|shower\s*cream|body\s*cleanser)\b/i)) return "body_wash";
  if (has(/\b(?:bar\s*soap|soap\s*bar|beauty\s*bar|cleansing\s*bar)\b/i)) return "bar_soap";

  // ── Deodorant / fragrance ──
  if (has(/\b(?:deodorant|anti[-\s]?perspirant)\b/i)) return "deodorant";
  if (has(/\b(?:perfume|cologne|eau\s*de\s*toilette|eau\s*de\s*parfum|edt|edp|body\s*spray|body\s*mist)\b/i)) return "fragrance";

  // ── Oral care ──
  if (has(/\b(?:toothpaste|tooth\s*paste)\b/i)) return "oral_toothpaste";
  if (has(/\b(?:mouthwash|mouth\s*rinse|oral\s*rinse)\b/i)) return "oral_mouthwash";

  // ── Wound care ──
  if (has(/\b(?:antibiotic\s*ointment|healing\s*ointment|first[-\s]aid\s*(?:ointment|cream)|bacitracin|neosporin|polysporin|triple\s*antibiotic)\b/i)) return "wound_care";

  // ── Shaving ──
  if (has(/\b(?:shaving\s*cream|shaving\s*foam|shaving\s*gel|shave\s*cream|shave\s*gel|shave\s*foam)\b/i)) return "shaving_cream";
  if (has(/\b(?:razor|razor\s*blade|shaving\s*razor)\b/i)) return "razor";

  // ── Skincare (eye > face > body for specificity) ──
  if (has(/\beye\b[^,]{0,20}(?:cream|serum|gel|balm|treatment|repair)\b/i) || has(/\bunder[-\s]eye\b/i)) return "skincare_eye";
  if (has(/\b(?:face|facial)\s*(?:serum|moisturi[sz]er|cream|oil|wash|cleanser|toner|balm|mask)\b/i)) return "skincare_face";
  if (has(/\b(?:serum|cleanser|toner|face\s*mask)\b/i)) return "skincare_face";
  if (has(/\b(?:body\s*(?:lotion|cream|butter|oil|balm)|hand\s*(?:cream|lotion)|foot\s*(?:cream|lotion))\b/i)) return "skincare_body";

  // ── Category tiebreakers (only fire when no name keyword matched) ──
  if (category === "baby" && has(/\b(?:lotion|cream|moistur|oil)\b/i)) return "baby_lotion";
  if (category === "personal_care" && has(/\b(?:moisturi[sz]er|lotion)\b/i)) return "skincare_body";

  return null;
}

module.exports = { classifyProductFamily, CANONICAL_FAMILIES };
