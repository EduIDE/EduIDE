#!/usr/bin/env bash
# Usage: ./scripts/generate-image-lockfile.sh <image-name>
# Example: ./scripts/generate-image-lockfile.sh ai-ide
#
# Applies an image's package.json patches, runs yarn install to resolve all
# dependencies (including image-specific ones), saves the resulting lockfile
# to images/<image>/yarn.lock, then restores the workspace to its original state.
#
# Commit the generated images/<image>/yarn.lock alongside any patch changes.

set -euo pipefail

IMAGE="${1:-}"
if [[ -z "$IMAGE" ]]; then
  echo "Usage: $0 <image-name>" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_DIR="$REPO_ROOT/images/$IMAGE"

if [[ ! -d "$IMAGE_DIR" ]]; then
  echo "Error: image directory not found: $IMAGE_DIR" >&2
  exit 1
fi

PATCH="$IMAGE_DIR/package.json.patch"
BROWSER_PATCH="$IMAGE_DIR/browser-package.json.patch"

echo "==> Generating yarn.lock for $IMAGE..."

# --- backup originals ---
cp "$REPO_ROOT/package.json"  "$REPO_ROOT/package.json.bak"
cp "$REPO_ROOT/yarn.lock"     "$REPO_ROOT/yarn.lock.bak"
BROWSER_PKG="$REPO_ROOT/applications/browser/package.json"
[[ -f "$BROWSER_PATCH" ]] && cp "$BROWSER_PKG" "$BROWSER_PKG.bak"

# --- always restore on exit (success or error) ---
restore() {
  echo "==> Restoring workspace files..."
  mv "$REPO_ROOT/package.json.bak" "$REPO_ROOT/package.json"
  mv "$REPO_ROOT/yarn.lock.bak"    "$REPO_ROOT/yarn.lock"
  [[ -f "$BROWSER_PKG.bak" ]] && mv "$BROWSER_PKG.bak" "$BROWSER_PKG"
}
trap restore EXIT

# --- apply patches ---
if [[ -f "$PATCH" ]]; then
  echo "==> Applying $IMAGE/package.json.patch..."
  node "$REPO_ROOT/scripts/merge-package-json.js" --replace-keys theiaPlugins \
    "$REPO_ROOT/package.json.bak" "$PATCH" "$REPO_ROOT/package.json"
fi

if [[ -f "$BROWSER_PATCH" ]]; then
  echo "==> Applying $IMAGE/browser-package.json.patch..."
  node "$REPO_ROOT/scripts/merge-package-json.js" \
    "$BROWSER_PKG.bak" "$BROWSER_PATCH" "$BROWSER_PKG"
fi

# --- resolve and lock dependencies ---
echo "==> Running yarn install..."
(cd "$REPO_ROOT" && yarn install --network-timeout 600000)

# --- capture lockfile before restore cleans up ---
cp "$REPO_ROOT/yarn.lock" "$IMAGE_DIR/yarn.lock"
echo "==> Saved images/$IMAGE/yarn.lock — commit this file."
