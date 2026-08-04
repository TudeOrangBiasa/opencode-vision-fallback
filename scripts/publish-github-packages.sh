#!/usr/bin/env bash
set -euo pipefail

GH_REGISTRY="https://npm.pkg.github.com"
SCOPED_NAME="@tudeorangbiasa/opencode-vision-fallback"
TOKEN="${GH_PACKAGES_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "GH_PACKAGES_TOKEN env var required (token must have write:packages scope)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$ROOT"

node - "$TMP" <<'EOF'
const fs = require("fs");
const path = require("path");
const dest = process.argv[2];
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.name = "@tudeorangbiasa/opencode-vision-fallback";
pkg.publishConfig = { registry: "https://npm.pkg.github.com" };
fs.writeFileSync(path.join(dest, "package.json"), JSON.stringify(pkg, null, 2));
EOF

cp -r src "$TMP/src"
cp README.md LICENSE "$TMP/"
printf '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n' > "$TMP/.npmrc"

cd "$TMP"
NODE_AUTH_TOKEN="$TOKEN" npm publish --registry "$GH_REGISTRY"
echo "Published $SCOPED_NAME to GitHub Packages"
