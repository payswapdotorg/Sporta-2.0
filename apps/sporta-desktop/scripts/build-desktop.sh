#!/usr/bin/env bash
# Sporta Desktop — release build (TL station + release runners).
#
# Stages the REAL product bundle (packages/web vite build — the /sporta route
# product surface) into this app, then packages Ubuntu artifacts (.deb +
# AppImage) with electron-builder.
#
# Usage:
#   bash scripts/build-desktop.sh              # full: web build + stage + package deb + AppImage
#   bash scripts/build-desktop.sh --stage-only # web build + stage renderer only (dev smoke)
#   bash scripts/build-desktop.sh --deb-only   # package the deb target only
#   bash scripts/build-desktop.sh --skip-web   # package from the already-staged renderer/
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STAGE_ONLY=0
DEB_ONLY=0
SKIP_WEB=0
for arg in "$@"; do
  case "$arg" in
    --stage-only) STAGE_ONLY=1 ;;
    --deb-only) DEB_ONLY=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

log() { printf '[sporta-desktop] %s\n' "$*"; }

if [ "$SKIP_WEB" -ne 1 ]; then
  log "1/4 building the product web bundle (packages/web — the /sporta product surface)"
  (cd "$ROOT/packages/web" && "$ROOT/node_modules/.bin/vite" build)
else
  log "1/4 skipping web build (--skip-web; using staged renderer/)"
fi

log "2/4 staging renderer bundle"
rm -rf "$HERE/renderer"
if [ ! -d "$ROOT/packages/web/dist" ]; then
  echo "packages/web/dist missing — run without --skip-web first." >&2
  exit 1
fi
cp -R "$ROOT/packages/web/dist" "$HERE/renderer"
log "staged $(find "$HERE/renderer" -type f | wc -l) files ($(du -sh "$HERE/renderer" | cut -f1))"

if [ "$STAGE_ONLY" -eq 1 ]; then
  log "stage-only: done (smoke with: cd $HERE && npm install && npx electron .)"
  exit 0
fi

log "3/4 installing the packaging toolchain (electron + electron-builder; cached)"
(cd "$HERE" && npm install --no-fund --no-audit)

log "4/4 packaging (electron-builder: deb + AppImage for linux x64)"
if [ "$DEB_ONLY" -eq 1 ]; then
  (cd "$HERE" && npx electron-builder --linux deb --x64)
else
  (cd "$HERE" && npx electron-builder --linux deb AppImage --x64)
fi

log "artifacts:"
ls -la "$HERE/release"

log "verify (this station): xvfb-run -a npx electron . --no-sandbox"
