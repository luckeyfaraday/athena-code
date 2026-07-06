#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${ATHENA_OPENCODE_SOURCE:-/tmp/athena-opencode-source}"
REVISION="eb6ff0c1e049e5dfb6f61eb74f925c0a8007490c"
VERSION="${ATHENA_CODE_VERSION:-0.0.0-dev}"
HOST_PLATFORM="$(node -p 'process.platform')"
HOST_ARCH="$(node -p 'process.arch')"

case "$HOST_PLATFORM" in
  linux)
    PLATFORM="linux"
    EXECUTABLE="opencode"
    OUTPUT_NAME="athena-code"
    ;;
  darwin)
    PLATFORM="darwin"
    EXECUTABLE="opencode"
    OUTPUT_NAME="athena-code"
    ;;
  win32)
    PLATFORM="windows"
    EXECUTABLE="opencode.exe"
    OUTPUT_NAME="athena-code.exe"
    ;;
  *)
    echo "error: unsupported build platform: $HOST_PLATFORM" >&2
    exit 1
    ;;
esac

case "$HOST_ARCH" in
  x64|arm64) ;;
  *)
    echo "error: unsupported build architecture: $HOST_ARCH" >&2
    exit 1
    ;;
esac

TARGET="$PLATFORM-$HOST_ARCH"
UPSTREAM_TARGET="$PLATFORM-$HOST_ARCH"
# This build clones a repo and installs node_modules (~3GB) under SOURCE, which
# defaults to /tmp. Leaving it behind is a top contributor to /tmp filling up and
# the resulting ENOSPC/SIGBUS crashes, so clean it on exit unless asked to keep it
# (e.g. for fast incremental rebuilds via ATHENA_TUI_KEEP_SOURCE=1).
KEEP_SOURCE="${ATHENA_TUI_KEEP_SOURCE:-0}"

# Fail fast with a clear message instead of dying mid-install with a cryptic
# ENOSPC once the volume is already exhausted. The clone + install needs ~5GB.
MIN_FREE_MB=5000
free_mb="$(df -Pm "$(dirname "$SOURCE")" | awk 'NR==2 {print $4}')"
if [[ -n "$free_mb" && "$free_mb" -lt "$MIN_FREE_MB" ]]; then
  echo "error: only ${free_mb}MB free near $SOURCE; need ~${MIN_FREE_MB}MB to build Athena Code." >&2
  echo "       Free up space or set ATHENA_OPENCODE_SOURCE to a roomier volume." >&2
  exit 1
fi

cleanup() {
  if [[ "$KEEP_SOURCE" != "1" ]]; then
    rm -rf "$SOURCE"
  fi
}
trap cleanup EXIT

if [[ ! -d "$SOURCE/.git" ]]; then
  git -c core.autocrlf=false clone --no-checkout https://github.com/anomalyco/opencode.git "$SOURCE"
fi

git -C "$SOURCE" config core.autocrlf false
git -C "$SOURCE" fetch origin "$REVISION"
git -C "$SOURCE" checkout --detach --force "$REVISION"
# The outer checkout may use Windows CRLF. Normalize each patch stream because
# its context must match the LF-only pinned upstream checkout byte-for-byte.
# Patches apply in name order and must touch disjoint upstream files.
for patch in "$ROOT"/patches/*.patch; do
  sed 's/\r$//' "$patch" | git -C "$SOURCE" apply -
done

# Overlay Athena-owned native source (memory layer, server plugin, TUI
# additions) on top of the patched checkout. These are maintained as real files
# under overlay/ rather than as patch hunks; the patch only wires them in with
# one-line hunks (e.g. plugin/index.ts registers ./athena as a builtin plugin).
# Copy after the patch so the imported files exist before install/build.
cp -R "$ROOT/overlay/." "$SOURCE/"

cd "$SOURCE"
# bun install resolves git dependencies (e.g. ghostty-web pinned to a branch) by
# fetching tarballs from the GitHub API, which intermittently returns 5xx and
# fails the whole release. Retry with backoff so a transient blip doesn't sink a
# tagged build; a genuinely broken lockfile still fails after the last attempt.
bun_install() {
  local attempt
  for attempt in 1 2 3; do
    if npx --yes bun@1.3.14 install --frozen-lockfile; then
      return 0
    fi
    if [[ "$attempt" -lt 3 ]]; then
      echo "bun install failed (attempt $attempt/3); retrying in $((attempt * 10))s..." >&2
      sleep "$((attempt * 10))"
    fi
  done
  echo "error: bun install failed after 3 attempts." >&2
  return 1
}
bun_install
OPENCODE_VERSION="$VERSION" npx --yes bun@1.3.14 run --cwd packages/opencode script/build.ts --single --skip-install --skip-embed-web-ui
mkdir -p "$ROOT/runtime-bin/$TARGET"
cp "packages/opencode/dist/opencode-$UPSTREAM_TARGET/bin/$EXECUTABLE" "$ROOT/runtime-bin/$TARGET/$OUTPUT_NAME"
chmod +x "$ROOT/runtime-bin/$TARGET/$OUTPUT_NAME" 2>/dev/null || true
