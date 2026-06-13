#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${ATHENA_CODE_REPOSITORY:-luckeyfaraday/athena-code}"
VERSION="${ATHENA_CODE_VERSION:-latest}"
INSTALL_ROOT="${ATHENA_CODE_INSTALL_ROOT:-$HOME/.local/share/athena-code}"
BIN_DIR="${ATHENA_CODE_BIN_DIR:-$HOME/.local/bin}"
SOURCE_FILE=""

usage() {
  cat <<'EOF'
Install Athena Code for the current user.

Usage:
  install.sh [--version VERSION]
  install.sh --from-file PATH

Environment:
  ATHENA_CODE_REPOSITORY    GitHub owner/repository
  ATHENA_CODE_INSTALL_ROOT  Versioned binary directory
  ATHENA_CODE_BIN_DIR       Launcher directory (must be on PATH)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || { echo "error: --version requires a value" >&2; exit 2; }
      VERSION="$2"
      shift 2
      ;;
    --from-file)
      [[ $# -ge 2 ]] || { echo "error: --from-file requires a path" >&2; exit 2; }
      SOURCE_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

platform="$(uname -s)"
architecture="$(uname -m)"
case "$platform" in
  Linux) platform="linux" ;;
  Darwin) platform="darwin" ;;
  *)
    echo "error: use install.ps1 on Windows; unsupported platform: $platform" >&2
    exit 1
    ;;
esac
case "$architecture" in
  x86_64|amd64) architecture="x64" ;;
  arm64|aarch64) architecture="arm64" ;;
  *)
    echo "error: unsupported architecture: $architecture" >&2
    exit 1
    ;;
esac

mkdir -p "$INSTALL_ROOT/bin" "$BIN_DIR"
target="$INSTALL_ROOT/bin/athena-code"

# Stage next to the target and rename: the in-app updater replaces the binary
# of the running athena-code process, and rename never fails with ETXTBSY.
install_binary() {
  install -m 0755 "$1" "$target.new"
  mv -f "$target.new" "$target"
}

if [[ -n "$SOURCE_FILE" ]]; then
  [[ -f "$SOURCE_FILE" ]] || { echo "error: binary not found: $SOURCE_FILE" >&2; exit 1; }
  install_binary "$SOURCE_FILE"
else
  command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
  command -v tar >/dev/null || { echo "error: tar is required" >&2; exit 1; }
  if command -v sha256sum >/dev/null; then
    checksum() { sha256sum --check "$1"; }
  elif command -v shasum >/dev/null; then
    checksum() { shasum -a 256 --check "$1"; }
  else
    echo "error: sha256sum or shasum is required" >&2
    exit 1
  fi

  if [[ "$VERSION" == "latest" ]]; then
    release_path="latest/download"
  else
    release_path="download/$VERSION"
  fi

  asset="athena-code-$platform-$architecture.tar.gz"
  base_url="https://github.com/$REPOSITORY/releases/$release_path"
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT

  echo "Downloading Athena Code ${VERSION}..."
  curl --fail --location --show-error --silent "$base_url/$asset" -o "$temp_dir/$asset"
  curl --fail --location --show-error --silent "$base_url/$asset.sha256" -o "$temp_dir/$asset.sha256"
  (
    cd "$temp_dir"
    checksum "$asset.sha256"
    tar -xzf "$asset"
  )
  install_binary "$temp_dir/athena-code"
fi

ln -sfn "$target" "$BIN_DIR/athena-code"

echo "Installed Athena Code:"
echo "  binary: $target"
echo "  command: $BIN_DIR/athena-code"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo
  echo "Add $BIN_DIR to PATH, then restart your shell:"
  echo "  export PATH=\"$BIN_DIR:\$PATH\""
else
  echo
  echo "Run: athena-code"
fi
