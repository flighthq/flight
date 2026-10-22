#!/usr/bin/env bash
set -euo pipefail

# Stamps every crate in the workspace to a single version — the Rust counterpart
# of `npm run version:packages`. Rewrites [workspace.package].version and every
# version = "..." in [workspace.dependencies], then updates Cargo.lock.
#
# Usage: scripts/version-crates.sh <version>   (e.g. 0.7.0 or 0.7.0-next.42.gabc1234)

VERSION="${1:?usage: version-crates.sh <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ROOT_TOML="$REPO_ROOT/Cargo.toml"

# Stamp [workspace.package].version
sed -i "s/^version = \"[^\"]*\"/version = \"$VERSION\"/" "$ROOT_TOML"

# Stamp every version = "..." in [workspace.dependencies] (the publish version
# that cargo publish substitutes for path deps). These lines all look like:
#   flight-foo = { path = "crates/flight-foo", version = "0.6.0" }
sed -i -E "s/(flight-[a-z0-9-]+ = \{[^}]*version = \")[^\"]*(\")/\1$VERSION\2/g" "$ROOT_TOML"

# Update Cargo.lock to reflect the new version
cargo generate-lockfile --quiet 2>/dev/null || cargo check --quiet 2>/dev/null || true

echo "Stamped workspace to $VERSION"
