#!/usr/bin/env bash
set -euo pipefail

for tag in $(git tag --points-at HEAD); do
  pkg_name="${tag%@*}"
  for dir in packages/*/; do
    if [ "$(node -p "require('./$dir/package.json').name")" = "$pkg_name" ]; then
      echo "Creating release for $tag"
      gh release create "$tag" --notes "$(awk '/^## /{if(f)exit;f=1;next}f' "$dir/CHANGELOG.md")"
      break
    fi
  done
done
