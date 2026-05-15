// R3b — lists API. Registered against the Express app by
// registerListsRoutes(app, deps). All routes require Supabase auth via
// the requireUserAuth middleware passed in deps; user identity comes
// from req.authUserId.
//
// The row shape returned by GET endpoints matches frontend
// fixtures.js exactly so the R3c swap from in-memory state to fetch
// calls is mechanical.

const LIST_KIND = new Set(["shopping", "routine", "compare", "custom"]);
const LISTS_TTL_S = 60;
const ALSO_IN_CAP = 5;

// Server-side mirror of frontend lists/fixtures.js TEMPLATES. Keys
// match the frontend's template.id ("tpl_newborn" etc) so a POST
// /lists body with template: "tpl_newborn" lands the right starter.
const TEMPLATES = {
  tpl_newborn: {
    name: "Newborn essentials",
    items: ["Diapers", "Baby wash", "Nursing pads", "Swaddles", "Pacifiers", "Baby wipes", "Formula"],
  },
  tpl_vacation: {
    name: "Family vacation",
    items: ["Sunscreen", "Bug spray", "Travel snacks", "Hand sanitizer", "Kid Tylenol", "First aid spray"],
  },
  tpl_lunches: {
    name: "Back to school lunches",
    items: ["Yogurt pouches", "Fruit pouches", "Granola bars", "Juice boxes", "Sandwich bread", "Deli turkey"],
  },
  tpl_pantry: {
    name: "Pantry restock",
    items: ["Olive oil", "Pasta", "Canned tomatoes", "Rice", "Peanut butter", "Cereal"],
  },
};

// ── Helpers ────────────────────────────────────────────────────────
const summaryCacheKey = (uid) => `lists:user:${uid}:summary`;
const detailCacheKey  = (uid, listId) => `lists:user:${uid}:detail:${listId}`;
const userKeysPattern = (uid) => `lists:user:${uid}:*`;

function rowToList(row, { itemCount = 0, itemsPreview = [] } = {}) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at || null,
    item_count: itemCount,
    items_preview: itemsPreview,
  };
}

function rowToItem(row) {
  const anchor = row.scan_id
    ? "scan"
    : row.calibration_key
    ? "calibration"
    : "name";
  const out = {
    id: row.id,
    anchor,
    product_name: row.product_name,
    purchased: !!row.purchased,
    position: row.position,
    added_at: row.created_at,
    flags: Array.isArray(row.flags) ? row.flags : [],
  };
  if (row.scan_id) out.scan_id = row.scan_id;
  if (row.calibration_key) out.calibration_key = row.calibration_key;
  if (row.product_name_normalized) out.product_name_normalized = row.product_name_normalized;
  if (row.category) out.category = row.category;
  if (row.score != null) out.score = row.score;
  if (row.kid_score != null) out.kid_score = row.kid_score;
  if (row.note) out.note = row.note;
  return out;
}

// Compare items by (purchased ASC, position ASC, created_at ASC).
function compareItems(a, b) {
  const ap = a.purchased ? 1 : 0;
  const bp = b.purchased ? 1 : 0;
  if (ap !== bp) return ap - bp;
  if ((a.position ?? 0) !== (b.position ?? 0)) return (a.position ?? 0) - (b.position ?? 0);
  return new Date(a.created_at) - new Date(b.created_at);
}

// ── Validation ────────────────────────────────────────────────────
function validateListInput(body, { partial = false } = {}) {
  const errors = [];
  const out = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") errors.push("name must be a string");
    else {
      const trimmed = body.name.trim();
      if (trimmed.length < 1) errors.push("name required");
      else if (trimmed.length > 100) errors.push("name too long (max 100)");
      else out.name = trimmed;
    }
  } else if (!partial) {
    errors.push("name required");
  }
  if (body.kind !== undefined) {
    if (typeof body.kind !== "string" || !LIST_KIND.has(body.kind)) {
      errors.push("kind must be one of: shopping, routine, compare, custom");
    } else out.kind = body.kind;
  }
  if (partial && body.archived_at !== undefined) {
    if (body.archived_at !== null && typeof body.archived_at !== "string") {
      errors.push("archived_at must be null or ISO string");
    } else {
      out.archived_at = body.archived_at;
    }
  }
  return { out, errors };
}

function validateItemInput(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial) {
    const anchors = ["scan_id", "product_name_normalized", "calibration_key"];
    const provided = anchors.filter(k => body[k] != null && body[k] !== "");
    if (provided.length !== 1) {
      errors.push("exactly one of scan_id, product_name_normalized, calibration_key required");
    } else {
      const k = provided[0];
      if (k === "scan_id" && !/^[0-9a-f-]{30,40}$/i.test(String(body.scan_id))) {
        errors.push("scan_id must be a UUID");
      } else {
        out[k] = String(body[k]).trim();
      }
    }
  }

  if (body.product_name !== undefined) {
    if (typeof body.product_name !== "string") errors.push("product_name must be a string");
    else {
      const trimmed = body.product_name.trim();
      if (trimmed.length < 1) errors.push("product_name required");
      else if (trimmed.length > 200) errors.push("product_name too long (max 200)");
      else out.product_name = trimmed;
    }
  } else if (!partial) {
    // Allowed to be omitted on POST if the anchor will hydrate it.
    out.product_name = undefined;
  }

  if (body.category !== undefined) {
    if (body.category !== null && (typeof body.category !== "string" || body.category.length > 50)) {
      errors.push("category must be a string up to 50 chars");
    } else {
      out.category = body.category || null;
    }
  }

  for (const k of ["score", "kid_score"]) {
    if (body[k] !== undefined) {
      if (body[k] === null) {
        out[k] = null;
      } else if (!Number.isInteger(body[k]) || body[k] < 1 || body[k] > 10) {
        errors.push(`${k} must be integer 1-10 or null`);
      } else {
        out[k] = body[k];
      }
    }
  }

  if (body.flags !== undefined) {
    if (!Array.isArray(body.flags)) errors.push("flags must be an array");
    else if (body.flags.length > 20) errors.push("flags max 20 entries");
    else if (body.flags.some(f => typeof f !== "string" || f.length < 1 || f.length > 50)) {
      errors.push("each flag must be a string 1-50 chars");
    } else {
      out.flags = body.flags;
    }
  }

  if (body.note !== undefined) {
    if (body.note === null) out.note = null;
    else if (typeof body.note !== "string") errors.push("note must be string or null");
    else if (body.note.length > 300) errors.push("note too long (max 300)");
    else out.note = body.note.trim() || null;
  }

  if (body.purchased !== undefined) {
    if (typeof body.purchased !== "boolean") errors.push("purchased must be boolean");
    else out.purchased = body.purchased;
  }

  if (body.position !== undefined) {
    if (!Number.isInteger(body.position) || body.position < 0) {
      errors.push("position must be a non-negative integer");
    } else {
      out.position = body.position;
    }
  }

  return { out, errors };
}

// ── Hydration: pull display fields from the anchor source ─────────
async function hydrateFromScan(supabaseAdmin, scanId, userId) {
  const { data, error } = await supabaseAdmin
    .from("scans")
    .select("id, user_id, product_name, category, score, result_json")
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Anchor only to scans the user owns. RLS would normally enforce this
  // but we run as service role here.
  if (data.user_id !== userId) return null;
  const rj = data.result_json || {};
  return {
    product_name: data.product_name,
    category: data.category || null,
    score: data.score ?? null,
    kid_score: rj.child_score ?? rj.kid_score ?? data.score ?? null,
    flags: Array.isArray(rj.flagged_substances)
      ? rj.flagged_substances.filter(f => typeof f === "string").slice(0, 20)
      : [],
  };
}

function hydrateFromCalibration(CALIBRATION, toTitleCase, key) {
  if (!CALIBRATION) return null;
  const entry = CALIBRATION.get(key);
  if (!entry) return null;
  const mid = Math.round(((entry.floor || 1) + (entry.ceiling || 10)) / 2);
  return {
    product_name: typeof toTitleCase === "function" ? toTitleCase(key) : key,
    category: entry.category || "other",
    score: mid,
    kid_score: entry.kidsFloor ?? mid,
    flags: [],
  };
}

// Default position for a new item — append at the end of the
// unpurchased segment.
async function nextPositionForList(supabaseAdmin, listId) {
  const { data } = await supabaseAdmin
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

// ── Cache invalidation ────────────────────────────────────────────
function makeCacheHelpers(deps) {
  const { hasRedis, redisGet, redisSetEx, redisDel, redisKeys } = deps;
  return {
    async readSummary(uid) {
      if (!hasRedis) return null;
      return await redisGet(summaryCacheKey(uid));
    },
    async writeSummary(uid, payload) {
      if (!hasRedis) return;
      await redisSetEx(summaryCacheKey(uid), payload, LISTS_TTL_S).catch(() => {});
    },
    async readDetail(uid, listId) {
      if (!hasRedis) return null;
      return await redisGet(detailCacheKey(uid, listId));
    },
    async writeDetail(uid, listId, payload) {
      if (!hasRedis) return;
      await redisSetEx(detailCacheKey(uid, listId), payload, LISTS_TTL_S).catch(() => {});
    },
    async invalidateUser(uid) {
      if (!hasRedis) return;
      try {
        const keys = await redisKeys(userKeysPattern(uid));
        await Promise.all((keys || []).map(k => redisDel(k)));
      } catch (e) {
        console.warn("[lists cache] invalidate failed:", e?.message);
      }
    },
  };
}

// ── Ownership guard ───────────────────────────────────────────────
async function fetchListForUser(supabaseAdmin, listId, userId) {
  const { data, error } = await supabaseAdmin
    .from("lists")
    .select("*")
    .eq("id", listId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// ── Route registration ────────────────────────────────────────────
function registerListsRoutes(app, deps) {
  const {
    supabaseAdmin,
    requireUserAuth,
    hasRedis,
    redisGet,
    redisSetEx,
    redisDel,
    redisKeys,
    normalise,
    CALIBRATION,
    toTitleCase,
  } = deps;

  const cache = makeCacheHelpers({ hasRedis, redisGet, redisSetEx, redisDel, redisKeys });

  const requireSupabase = (req, res) => {
    if (!supabaseAdmin) {
      res.status(503).json({ error: "supabase_unavailable" });
      return false;
    }
    return true;
  };

  // ── GET /lists ──────────────────────────────────────────────────
  app.get("/lists", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;

    const cached = await cache.readSummary(uid);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const { data: lists, error: lerr } = await supabaseAdmin
        .from("lists")
        .select("*")
        .eq("user_id", uid)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (lerr) throw lerr;

      const listIds = (lists || []).map(l => l.id);
      let items = [];
      if (listIds.length) {
        const { data, error: ierr } = await supabaseAdmin
          .from("list_items")
          .select("*")
          .in("list_id", listIds);
        if (ierr) throw ierr;
        items = data || [];
      }

      const byList = new Map();
      for (const i of items) {
        if (!byList.has(i.list_id)) byList.set(i.list_id, []);
        byList.get(i.list_id).push(i);
      }
      for (const arr of byList.values()) arr.sort(compareItems);

      const result = (lists || []).map(l => {
        const arr = byList.get(l.id) || [];
        return rowToList(l, {
          itemCount: arr.length,
          itemsPreview: arr.slice(0, 3).map(rowToItem),
        });
      });

      const payload = { lists: result };
      await cache.writeSummary(uid, payload);
      return res.json({ ...payload, cached: false });
    } catch (e) {
      console.error("[lists GET]", e?.message);
      return res.status(500).json({ error: "lists_read_failed" });
    }
  });

  // ── GET /lists/:id ──────────────────────────────────────────────
  app.get("/lists/:id", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId)) {
      return res.status(400).json({ error: "invalid_list_id" });
    }

    const cached = await cache.readDetail(uid, listId);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      const { data: items, error: ierr } = await supabaseAdmin
        .from("list_items")
        .select("*")
        .eq("list_id", listId);
      if (ierr) throw ierr;
      const sorted = (items || []).slice().sort(compareItems);

      // Cross-list intel — fetch all of the user's items in one query
      // and build a map keyed by product_name. Cap each entry at five
      // other lists.
      const { data: allUserItems, error: aerr } = await supabaseAdmin
        .from("list_items")
        .select("list_id, product_name")
        .eq("user_id", uid);
      if (aerr) throw aerr;

      const namesInThisList = new Set();
      for (const i of sorted) {
        const norm = (i.product_name || "").toLowerCase().trim();
        if (norm) namesInThisList.add(norm);
      }
      const byName = new Map();
      for (const i of allUserItems || []) {
        if (i.list_id === listId) continue;
        const norm = (i.product_name || "").toLowerCase().trim();
        if (!norm || !namesInThisList.has(norm)) continue;
        if (!byName.has(norm)) byName.set(norm, new Set());
        byName.get(norm).add(i.list_id);
      }
      const otherListIds = new Set();
      for (const ids of byName.values()) for (const id of ids) otherListIds.add(id);

      let otherListNames = new Map();
      if (otherListIds.size) {
        const { data: namesData } = await supabaseAdmin
          .from("lists")
          .select("id, name")
          .in("id", [...otherListIds])
          .eq("user_id", uid);
        otherListNames = new Map((namesData || []).map(r => [r.id, r.name]));
      }

      const also_in_map = {};
      for (const item of sorted) {
        const norm = (item.product_name || "").toLowerCase().trim();
        const ids = byName.get(norm);
        if (!ids || !ids.size) continue;
        const entries = [];
        for (const id of ids) {
          if (!otherListNames.has(id)) continue;
          entries.push({ list_id: id, list_name: otherListNames.get(id) });
          if (entries.length >= ALSO_IN_CAP) break;
        }
        if (entries.length) also_in_map[item.product_name] = entries;
      }

      const payload = {
        list: {
          ...rowToList(list, { itemCount: sorted.length }),
          items: sorted.map(rowToItem),
          also_in_map,
        },
      };
      await cache.writeDetail(uid, listId, payload);
      return res.json({ ...payload, cached: false });
    } catch (e) {
      console.error("[lists GET :id]", e?.message);
      return res.status(500).json({ error: "list_read_failed" });
    }
  });

  // ── POST /lists ─────────────────────────────────────────────────
  app.post("/lists", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const body = req.body || {};

    // Resolve template first so a template-only body (no name supplied)
    // can default to the template's name before validation requires one.
    let templateItems = null;
    let templateName = null;
    if (body.template) {
      const tpl = TEMPLATES[String(body.template)];
      if (!tpl) return res.status(422).json({ error: "unknown_template" });
      templateItems = tpl.items;
      templateName = tpl.name;
    }
    const effectiveBody = (!body.name && templateName)
      ? { ...body, name: templateName }
      : body;

    const { out, errors } = validateListInput(effectiveBody, { partial: false });
    if (errors.length) return res.status(422).json({ error: "validation_failed", details: errors });

    try {
      const { data: list, error: lerr } = await supabaseAdmin
        .from("lists")
        .insert({
          user_id: uid,
          name: out.name,
          kind: out.kind || "shopping",
        })
        .select()
        .single();
      if (lerr) throw lerr;

      let items = [];
      if (templateItems && templateItems.length) {
        const rows = templateItems.map((name, i) => ({
          list_id: list.id,
          user_id: uid,
          product_name: name,
          product_name_normalized: typeof normalise === "function" ? normalise(name) : name.toLowerCase().trim(),
          flags: [],
          position: i,
        }));
        const { data: inserted, error: ierr } = await supabaseAdmin
          .from("list_items")
          .insert(rows)
          .select();
        if (ierr) throw ierr;
        items = (inserted || []).slice().sort(compareItems);
      }

      await cache.invalidateUser(uid);
      return res.status(201).json({
        list: {
          ...rowToList(list, { itemCount: items.length }),
          items: items.map(rowToItem),
          also_in_map: {},
        },
      });
    } catch (e) {
      console.error("[lists POST]", e?.message);
      return res.status(500).json({ error: "list_create_failed" });
    }
  });

  // ── PATCH /lists/:id ────────────────────────────────────────────
  app.patch("/lists/:id", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId)) {
      return res.status(400).json({ error: "invalid_list_id" });
    }
    const { out, errors } = validateListInput(req.body || {}, { partial: true });
    if (errors.length) return res.status(422).json({ error: "validation_failed", details: errors });
    if (!Object.keys(out).length) return res.status(422).json({ error: "no_updates" });

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      const updates = { ...out, updated_at: new Date().toISOString() };
      const { data, error } = await supabaseAdmin
        .from("lists")
        .update(updates)
        .eq("id", listId)
        .select()
        .single();
      if (error) throw error;

      await cache.invalidateUser(uid);
      return res.json({ list: rowToList(data) });
    } catch (e) {
      console.error("[lists PATCH]", e?.message);
      return res.status(500).json({ error: "list_update_failed" });
    }
  });

  // ── DELETE /lists/:id ───────────────────────────────────────────
  app.delete("/lists/:id", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId)) {
      return res.status(400).json({ error: "invalid_list_id" });
    }

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      const { error } = await supabaseAdmin
        .from("lists")
        .delete()
        .eq("id", listId);
      if (error) throw error;
      // FK ON DELETE CASCADE removes list_items.

      await cache.invalidateUser(uid);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[lists DELETE]", e?.message);
      return res.status(500).json({ error: "list_delete_failed" });
    }
  });

  // ── POST /lists/:id/items ───────────────────────────────────────
  app.post("/lists/:id/items", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId)) {
      return res.status(400).json({ error: "invalid_list_id" });
    }
    const { out, errors } = validateItemInput(req.body || {}, { partial: false });
    if (errors.length) return res.status(422).json({ error: "validation_failed", details: errors });

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      // Hydrate display data from the anchor when not already supplied.
      let hydrated = null;
      if (out.scan_id) {
        hydrated = await hydrateFromScan(supabaseAdmin, out.scan_id, uid);
        if (!hydrated) return res.status(404).json({ error: "scan_not_found" });
      } else if (out.calibration_key) {
        hydrated = hydrateFromCalibration(CALIBRATION, toTitleCase, out.calibration_key);
        if (!hydrated) return res.status(404).json({ error: "calibration_not_found" });
      }
      const product_name = (out.product_name || hydrated?.product_name || out.product_name_normalized || "").toString().trim();
      if (!product_name) return res.status(422).json({ error: "product_name required" });
      if (product_name.length > 200) return res.status(422).json({ error: "product_name too long" });

      const position = Number.isInteger(out.position)
        ? out.position
        : await nextPositionForList(supabaseAdmin, listId);

      const row = {
        list_id: listId,
        user_id: uid,
        scan_id:                out.scan_id || null,
        product_name_normalized: out.product_name_normalized
          || (out.scan_id || out.calibration_key
            ? null
            : (typeof normalise === "function" ? normalise(product_name) : product_name.toLowerCase().trim())),
        calibration_key:        out.calibration_key || null,
        product_name,
        category:   out.category   ?? hydrated?.category   ?? null,
        score:      out.score      ?? hydrated?.score      ?? null,
        kid_score:  out.kid_score  ?? hydrated?.kid_score  ?? null,
        flags:      out.flags      ?? hydrated?.flags      ?? [],
        note:       out.note       ?? null,
        position,
      };

      const { data: insertedItem, error } = await supabaseAdmin
        .from("list_items")
        .insert(row)
        .select()
        .single();
      if (error) throw error;

      // Touch the list's updated_at so the summary order reflects the
      // most-recently-edited list at the top.
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("lists")
        .update({ updated_at: nowIso })
        .eq("id", listId);

      await cache.invalidateUser(uid);
      return res.status(201).json({ item: rowToItem(insertedItem), list_updated_at: nowIso });
    } catch (e) {
      console.error("[lists items POST]", e?.message);
      return res.status(500).json({ error: "item_create_failed" });
    }
  });

  // ── PATCH /lists/:id/items/:itemId ──────────────────────────────
  app.patch("/lists/:id/items/:itemId", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    const itemId = req.params.itemId;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId) || !/^[0-9a-f-]{30,40}$/i.test(itemId)) {
      return res.status(400).json({ error: "invalid_id" });
    }
    const { out, errors } = validateItemInput(req.body || {}, { partial: true });
    if (errors.length) return res.status(422).json({ error: "validation_failed", details: errors });
    if (!Object.keys(out).length) return res.status(422).json({ error: "no_updates" });

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      const { data: item, error: ierr } = await supabaseAdmin
        .from("list_items")
        .select("*")
        .eq("id", itemId)
        .eq("list_id", listId)
        .maybeSingle();
      if (ierr) throw ierr;
      if (!item) return res.status(404).json({ error: "item_not_found" });

      const { data: updated, error } = await supabaseAdmin
        .from("list_items")
        .update(out)
        .eq("id", itemId)
        .select()
        .single();
      if (error) throw error;

      await supabaseAdmin
        .from("lists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", listId);

      await cache.invalidateUser(uid);
      return res.json({ item: rowToItem(updated) });
    } catch (e) {
      console.error("[lists items PATCH]", e?.message);
      return res.status(500).json({ error: "item_update_failed" });
    }
  });

  // ── POST /lists/:id/reorder ─────────────────────────────────────
  // R3g — batch reorder endpoint. The per-item PATCH path on position
  // was firing N×Redis-cache-invalidations + N×ownership-checks for a
  // single drag motion. Seven-item reorders 504'd in production. This
  // batch endpoint does one ownership check, one membership check, N
  // serial UPDATEs on a single connection, one updated_at touch, and
  // one cache invalidation.
  //
  // Per-item PATCH /lists/:id/items/:itemId still accepts position for
  // any single-position use case; this is purely additive.
  app.post("/lists/:id/reorder", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId)) {
      return res.status(400).json({ error: "invalid_list_id" });
    }
    const positions = req.body && Array.isArray(req.body.positions) ? req.body.positions : null;
    if (!positions) return res.status(422).json({ error: "positions array required" });
    if (positions.length === 0) return res.status(422).json({ error: "positions empty" });
    if (positions.length > 500) return res.status(422).json({ error: "positions too large" });
    for (const p of positions) {
      if (!p || typeof p !== "object") return res.status(422).json({ error: "invalid position entry" });
      if (typeof p.id !== "string" || !/^[0-9a-f-]{30,40}$/i.test(p.id)) {
        return res.status(422).json({ error: "invalid item id" });
      }
      if (!Number.isInteger(p.position) || p.position < 0) {
        return res.status(422).json({ error: "invalid position value" });
      }
    }

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      // Membership check: every id must belong to this list AND this user.
      const ids = positions.map(p => p.id);
      const { data: existing, error: serr } = await supabaseAdmin
        .from("list_items")
        .select("id")
        .eq("list_id", listId)
        .eq("user_id", uid)
        .in("id", ids);
      if (serr) throw serr;
      if (!existing || existing.length !== ids.length) {
        return res.status(422).json({ error: "items_not_in_list" });
      }

      // Sequential UPDATEs. Supabase has no native batched UPDATE-with-
      // different-values; we serialize on a single client. N small writes
      // beat N×network-round-trip-cache-invalidations in the per-PATCH
      // path.
      for (const p of positions) {
        const { error } = await supabaseAdmin
          .from("list_items")
          .update({ position: p.position })
          .eq("id", p.id)
          .eq("list_id", listId);
        if (error) throw error;
      }

      // Touch list updated_at once, not per item.
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("lists")
        .update({ updated_at: nowIso })
        .eq("id", listId);

      // Single cache invalidation, not per item.
      await cache.invalidateUser(uid);

      const { data: updated, error: uerr } = await supabaseAdmin
        .from("list_items")
        .select("*")
        .eq("list_id", listId)
        .order("position", { ascending: true });
      if (uerr) throw uerr;
      return res.json({
        ok: true,
        items: (updated || []).map(rowToItem),
        list_updated_at: nowIso,
      });
    } catch (e) {
      console.error("[lists reorder]", e?.message);
      return res.status(500).json({ error: "reorder_failed" });
    }
  });

  // ── DELETE /lists/:id/items/:itemId ─────────────────────────────
  app.delete("/lists/:id/items/:itemId", requireUserAuth, async (req, res) => {
    if (!requireSupabase(req, res)) return;
    const uid = req.authUserId;
    const listId = req.params.id;
    const itemId = req.params.itemId;
    if (!/^[0-9a-f-]{30,40}$/i.test(listId) || !/^[0-9a-f-]{30,40}$/i.test(itemId)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    try {
      const list = await fetchListForUser(supabaseAdmin, listId, uid);
      if (!list) return res.status(404).json({ error: "list_not_found" });
      if (list.user_id !== uid) return res.status(403).json({ error: "forbidden" });

      const { data: existing, error: serr } = await supabaseAdmin
        .from("list_items")
        .select("id")
        .eq("id", itemId)
        .eq("list_id", listId)
        .maybeSingle();
      if (serr) throw serr;
      if (!existing) return res.status(404).json({ error: "item_not_found" });

      const { error } = await supabaseAdmin
        .from("list_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;

      await supabaseAdmin
        .from("lists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", listId);

      await cache.invalidateUser(uid);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[lists items DELETE]", e?.message);
      return res.status(500).json({ error: "item_delete_failed" });
    }
  });
}

module.exports = {
  registerListsRoutes,
  TEMPLATES,
};
