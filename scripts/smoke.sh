#!/bin/sh
# Smoke test of a running deployment: key pages, the API and its database, security headers.
#   scripts/smoke.sh https://autopoint.example.kz
#   CURL_OPTS=-k scripts/smoke.sh https://localhost      # Caddy's local certificate
# Exits non-zero if any check fails. Read-only: creates no bookings or messages.
set -u
BASE=${1:?usage: scripts/smoke.sh <base url>}
BASE=${BASE%/}
CURL="curl -sS --max-time 60 ${CURL_OPTS:-}"
failed=0

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok    $1"; else echo "FAIL  $1: expected $2, got $3"; failed=1; fi
}
status() { $CURL -o /dev/null -w '%{http_code}' "$BASE$1"; }

for path in / /kk /en /services /booking /gallery /contacts /admin/login /robots.txt /sitemap.xml; do
  check "GET $path" 200 "$(status "$path")"
done
check "API and database ready" 200 "$(status /api/v1/public/site)"
check "admin API needs login" 401 "$(status /api/v1/admin/bookings)"
check "unknown page" 404 "$(status /this-page-does-not-exist)"

headers=$($CURL -D - -o /dev/null "$BASE/")
for header in content-security-policy x-content-type-options referrer-policy x-frame-options; do
  printf '%s' "$headers" | grep -qi "^$header:" && check "header $header" yes yes || check "header $header" present missing
done
case $BASE in https://*)
  printf '%s' "$headers" | grep -qi '^strict-transport-security:' && check "HSTS" yes yes || check "HSTS" present missing
  http=$(curl -sS ${CURL_OPTS:-} -o /dev/null -w '%{http_code}' "http://${BASE#https://}/")
  case $http in 301|302|307|308) check "http redirects to https" yes yes ;; *) check "http redirects to https" 3xx "$http" ;; esac
esac

[ $failed = 0 ] && echo "All smoke checks passed: $BASE" || echo "Smoke test FAILED: $BASE"
exit $failed
