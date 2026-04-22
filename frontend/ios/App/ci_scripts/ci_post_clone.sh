#!/bin/sh
# Xcode Cloud post-clone hook.
#
# Xcode Cloud checks out the Git repo fresh on every build. Our iOS project's
# Swift Package Manager config (ios/App/CapApp-SPM/Package.swift) references
# each Capacitor plugin via a relative path into frontend/node_modules/, so
# those dependencies must be installed before xcodebuild resolves SPM packages.
# Without this script the Archive phase fails with:
#
#   xcodebuild: error: Could not resolve package dependencies: the package at
#   '.../node_modules/@capgo/native-purchases' doesn't exist in file system
#
# The script also runs vite build + cap sync so the iOS app bundle includes
# the latest web assets and a current plugin list.
#
# Location: Xcode Cloud resolves ci_scripts/ci_post_clone.sh relative to the
# Xcode project directory — so this script must live at
# frontend/ios/App/ci_scripts/ci_post_clone.sh (adjacent to App.xcodeproj),
# not at the repo root. Build 7 confirmed the repo-root fallback documented
# by Apple is not checked in practice.

set -euxo pipefail

# Xcode Cloud exposes the cloned repo root via CI_PRIMARY_REPOSITORY_PATH.
# Local-invocation fallback: the script lives four directories deep under
# the repo root (frontend/ios/App/ci_scripts/), so walk up four levels.
REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$REPO_ROOT/frontend"

# Xcode Cloud images don't ship Node.js. Install via Homebrew (already present
# on the image). Pin to node@22 because Capacitor 8 CLI hard-requires
# NodeJS >=22.0.0 — build 8 on Xcode Cloud used node@20 and cap sync bailed
# with "[fatal] The Capacitor CLI requires NodeJS >=22.0.0".
# If Node is already on PATH (future image update, or local invocation),
# `brew install` is a no-op.
if ! command -v node >/dev/null 2>&1; then
  brew install node@22
  # node@22 is keg-only, needs to be added to PATH explicitly.
  export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
fi

# Reproducible install from package-lock.json.
npm ci

# Produce the web bundle and copy it into ios/App/App/public/ so the wrapped
# WebView loads the latest JS. cap sync also regenerates CapApp-SPM/Package.swift
# with whatever plugins are currently declared in package.json.
npx vite build
npx cap sync ios
