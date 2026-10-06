#!/bin/sh
set -eu

usage() { echo "Usage: activate-web-release.sh <release-id> [artifact-directory]" >&2; exit 2; }
[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
release_id=$1
case "$release_id" in *[!a-f0-9]*|'') usage ;; esac
[ "${#release_id}" -ge 7 ] && [ "${#release_id}" -le 40 ] || usage

root=${SERVEOS_WEB_ROOT:-/var/www/serveos}
case "$root" in /var/www/serveos|/var/www/serveos/*) ;; *) echo "SERVEOS_WEB_ROOT must remain under /var/www/serveos." >&2; exit 2 ;; esac
release_dir="$root/releases/$release_id"
manifest_name=release-manifest.json

verify_release() {
  directory=$1
  manifest="$directory/$manifest_name"
  [ -f "$directory/index.html" ] && [ -f "$directory/sw.js" ] && [ -f "$manifest" ] || { echo "Release is incomplete." >&2; exit 1; }
  manifest_id=$(jq -er '.releaseId' "$manifest")
  [ "$manifest_id" = "$release_id" ] || { echo "Release manifest ID does not match requested release." >&2; exit 1; }
  jq -e '.files | length > 0' "$manifest" >/dev/null || { echo "Release manifest has no files." >&2; exit 1; }
  jq -er '.files[] | [.sha256, .path] | @tsv' "$manifest" | while IFS="$(printf '\t')" read -r expected relative; do
    case "$relative" in ''|/*|../*|*/../*|*/..|*\\*) echo "Invalid manifest path." >&2; exit 1 ;; esac
    file="$directory/$relative"
    [ -f "$file" ] || { echo "Release file missing: $relative" >&2; exit 1; }
    actual=$(sha256sum "$file" | cut -d ' ' -f 1)
    [ "$actual" = "$expected" ] || { echo "Release hash mismatch: $relative" >&2; exit 1; }
  done
}

if [ -n "${2:-}" ]; then
  [ ! -e "$release_dir" ] || { echo "Release already exists; refusing to overwrite it." >&2; exit 1; }
  source_dir=$(cd "$2" && pwd -P)
  verify_release "$source_dir"
  mkdir -p "$root/releases"
  staging="$root/releases/.$release_id.tmp-$$"
  trap 'rm -rf "$staging"' EXIT HUP INT TERM
  cp -a "$source_dir/." "$staging"
  verify_release "$staging"
  mv "$staging" "$release_dir"
  trap - EXIT HUP INT TERM
else
  [ -d "$release_dir" ] || { echo "Release does not exist locally; supply its artifact directory." >&2; exit 1; }
  verify_release "$release_dir"
fi

current="$root/current"
next="$root/.current.next-$$"
ln -s "$release_dir" "$next"
mv -Tf "$next" "$current"
echo "Activated ServOS PWA release $release_id."
