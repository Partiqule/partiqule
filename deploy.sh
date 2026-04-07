#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Partiqule Deploy Script
# Usage: ./deploy.sh "your commit message"
#        ./deploy.sh          (uses default message with timestamp)
# ─────────────────────────────────────────────────────────────

set -e  # Exit immediately on any error

REPO="$HOME/Downloads/plasticscan"
DOWNLOADS="$HOME/Downloads"
CACHE_CLEAR="https://partiqule-production.up.railway.app/cache-clear"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
MSG="${1:-"Deploy $TIMESTAMP"}"

echo ""
echo "🌿 Partiqule Deploy"
echo "─────────────────────────────────────"

# ── 1. Verify repo exists ──────────────────────────────────
if [ ! -d "$REPO" ]; then
  echo "❌  Repo not found at $REPO"
  exit 1
fi

# ── 2. Verify all three source files exist ─────────────────
MISSING=0
for f in calibration.js server.js App.jsx products.js; do
  if [ ! -f "$DOWNLOADS/$f" ]; then
    echo "⚠️   Missing: $DOWNLOADS/$f (will skip)"
  fi
done

# ── 3. Copy files to repo (only if they exist in Downloads) ──
echo ""
echo "📂 Copying files..."

[ -f "$DOWNLOADS/calibration.js" ] && cp "$DOWNLOADS/calibration.js" "$REPO/backend/calibration.js" && echo "   ✓ calibration.js → backend/"
[ -f "$DOWNLOADS/products.js"    ] && cp "$DOWNLOADS/products.js"    "$REPO/backend/products.js"    && echo "   ✓ products.js → backend/"
[ -f "$DOWNLOADS/server.js"      ] && cp "$DOWNLOADS/server.js"      "$REPO/backend/server.js"      && echo "   ✓ server.js → backend/"
[ -f "$DOWNLOADS/App.jsx"        ] && cp "$DOWNLOADS/App.jsx"        "$REPO/frontend/src/App.jsx"   && echo "   ✓ App.jsx → frontend/src/"

# ── 4. Check for changes ───────────────────────────────────
cd "$REPO"
if git diff --quiet && git diff --cached --quiet; then
  echo ""
  echo "⚠️   No changes detected — nothing to commit."
  echo "    Did you download the files from Claude first?"
  exit 0
fi

# ── 5. Show what's changing ────────────────────────────────
echo ""
echo "📝 Changes:"
git diff --stat
git diff --cached --stat

# ── 6. Commit and push ─────────────────────────────────────
echo ""
echo "🚀 Committing: \"$MSG\""
git add backend/calibration.js backend/products.js backend/server.js frontend/src/App.jsx 2>/dev/null || true
git commit -m "$MSG"
git push

# ── 7. Clear the score cache ───────────────────────────────
echo ""
echo "🗑️  Clearing Railway cache..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$CACHE_CLEAR")
if [ "$RESPONSE" = "200" ]; then
  echo "   ✓ Cache cleared"
else
  echo "   ⚠️  Cache clear returned HTTP $RESPONSE — clear manually at:"
  echo "   $CACHE_CLEAR"
fi

# ── 8. Done ───────────────────────────────────────────────
echo ""
echo "✅  Done. Railway will redeploy in ~60-90 seconds."
echo "    Rescan a product to verify."
echo ""
