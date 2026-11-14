#!/usr/bin/env bash
# Smoke check of the live dashboard right after a deploy (ADR 0016): what a reader's browser needs,
# fetched from the public URL, not from the build directory.
#   usage: smoke-check.sh <site url> <local aggregates.json of this build>
set -euo pipefail

site="${1:?site url}"
built="${2:?aggregates.json of this build}"
deploy_wait_attempts=12 # x 10 s: the CDN may serve the previous build for a short while
min_audio_bytes=10000

fail() {
  echo "SMOKE FAIL: $*"
  exit 1
}

# path, expected content type (an extended regex)
expect_type() {
  local type
  type=$(curl -fsS -o /dev/null -w '%{content_type}' "$site/$1") || fail "$1 is unreachable"
  [[ "$type" =~ ^($2) ]] || fail "$1 is served as '$type', expected $2"
}

wait_for_this_build() {
  local expected live
  expected=$(jq -r .generatedAt "$built")
  for _ in $(seq "$deploy_wait_attempts"); do
    live=$(curl -fsS -H 'Cache-Control: no-cache' "$site/aggregates.json" | jq -r .generatedAt || true)
    [ "$live" = "$expected" ] && return 0
    sleep 10
  done
  fail "the live aggregates.json is '$live', not this build's '$expected'"
}

check_page() {
  expect_type '' 'text/html'
  local script
  script=$(curl -fsS "$site/" | grep -oE 'assets/[^"]+\.js' | head -1)
  [ -n "$script" ] || fail "index.html loads no script bundle"
  expect_type "$script" 'text/javascript|application/javascript'
  # The Ukrainian page (ADR 0019): a missing uk.html would fall back to the English one.
  expect_type 'uk' 'text/html'
  curl -fsS "$site/uk" | grep -q '<html lang="uk"' || fail "/uk is not the Ukrainian page"
}

check_aggregates() {
  expect_type 'aggregates.json' 'application/json'
  curl -fsS "$site/aggregates.json" | jq -e '.totals and .freshness and .distributions' >/dev/null ||
    fail 'aggregates.json lacks totals, freshness or distributions'
}

# The audio must be a real mp3 served as audio: iOS Safari will not play anything else.
check_digest_audio() {
  jq -e '.digest != null' "$built" >/dev/null || return 0
  local lang bytes
  for lang in uk en; do
    expect_type "digest/digest-$lang.mp3" 'audio/mpeg'
    bytes=$(curl -fsS -o /dev/null -w '%{size_download}' "$site/digest/digest-$lang.mp3")
    [ "$bytes" -ge "$min_audio_bytes" ] || fail "digest-$lang.mp3 is only $bytes bytes"
  done
}

wait_for_this_build
check_page
check_aggregates
check_digest_audio
echo "smoke ok: $site"
