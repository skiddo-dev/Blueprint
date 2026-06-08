#!/usr/bin/env bash
# Health-gate a Container Apps rollout, rolling back on failure.
#
# Usage: health-gate.sh <APP> <RG> <IMG> [PREV_IMAGE]
#   APP        Container App name
#   RG         resource group
#   IMG        the image (by sha) this deploy rolled out — we gate on the revision
#              actually running THIS image, not just "latest"
#   PREV_IMAGE the image that was serving before the rollout; on gate failure we
#              restore it so a bad deploy never lingers in front of users. Omit/blank
#              to skip rollback (e.g. first-ever deploy).
#
# Why probe sign-in and not just /readyz: the 2026-06-08 outage deployed with
# /readyz=200 the whole time (the container was healthy) while every Entra
# sign-in 500'd (immutable-header TypeError). A /readyz-only gate reported the
# deploy SUCCESS and never rolled back. So we ALSO probe the real sign-in entry
# point and require a non-5xx response (a 3xx redirect = the auth handler ran;
# a 5xx or unreachable = it crashed). No full Entra round-trip — CI has no creds,
# and catching the 5xx crash class is what would have stopped that outage.
set -uo pipefail

APP="${1:?APP required}"
RG="${2:?RG required}"
IMG="${3:?IMG required}"
PREV_IMAGE="${4:-}"

FQDN=$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
AUTH_PROBE="https://$FQDN/auth/signin/microsoft-entra-id"

rollback() {
  if [ -n "$PREV_IMAGE" ] && [ "$PREV_IMAGE" != "$IMG" ]; then
    echo "::warning::[$APP] gate failed — rolling back to $PREV_IMAGE"
    az containerapp update -n "$APP" -g "$RG" --image "$PREV_IMAGE" >/dev/null 2>&1 \
      || echo "::error::[$APP] rollback command failed"
  else
    echo "::warning::[$APP] no distinct previous image to roll back to"
  fi
}

echo "Gating [$APP] on revision $IMG via /readyz AND $AUTH_PROBE"
for i in $(seq 1 30); do
  REV=$(az containerapp revision list -n "$APP" -g "$RG" \
    --query "[?properties.template.containers[0].image=='$IMG'] | [0].name" -o tsv 2>/dev/null || true)
  STATE=""
  if [ -n "$REV" ]; then
    STATE=$(az containerapp revision show -n "$APP" -g "$RG" --revision "$REV" \
      --query properties.runningState -o tsv 2>/dev/null || true)
  fi
  CODE=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "https://$FQDN/readyz" 2>/dev/null || echo 000)
  echo "attempt $i/30: revision=${REV:-<none>} state=${STATE:-?} /readyz=$CODE"
  if { [ "$STATE" = "Running" ] || [ "$STATE" = "RunningAtMaxScale" ]; } && [ "$CODE" = "200" ]; then
    # /readyz is up; now confirm the auth entry point isn't 5xx'ing. Retry a few
    # times so a single boot-race blip doesn't trigger a false rollback. No -f (we
    # want the status, not a curl failure) and no -L (don't follow the redirect —
    # the 3xx itself is the signal).
    AUTH_OK=0; AUTH_CODE=000
    for j in 1 2 3; do
      AUTH_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$AUTH_PROBE" 2>/dev/null || echo 000)
      echo "  auth probe $j/3: /auth/signin/microsoft-entra-id=$AUTH_CODE"
      if [ "$AUTH_CODE" -ge 200 ] && [ "$AUTH_CODE" -lt 500 ]; then AUTH_OK=1; break; fi
      sleep 5
    done
    if [ "$AUTH_OK" = "1" ]; then
      echo "✅ [$APP] healthy: /readyz=200 and sign-in entry point=$AUTH_CODE (no 5xx)"; exit 0
    fi
    echo "::error::[$APP] sign-in entry point returned $AUTH_CODE (5xx/unreachable) while /readyz=200 — auth path is broken"
    rollback
    exit 1
  fi
  if [ "$STATE" = "Failed" ]; then echo "::error::[$APP] revision $REV failed to start"; rollback; exit 1; fi
  sleep 10
done
echo "::error::[$APP] new revision did not become healthy within ~5 min — gate failed"
rollback
exit 1
