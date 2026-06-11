#!/usr/bin/env bash
# Run the iOS unit tests on the first available iPhone simulator.
# Used locally and by .github/workflows/ios.yml — one script so the CI
# invocation can't drift from the one developers actually run.
set -euo pipefail
cd "$(dirname "$0")/.."

xcodegen generate

# Pick the first available iPhone simulator by UDID. Names differ per Xcode
# release (iPhone 16 on Xcode 16, iPhone 17 on 26), so hardcoding one breaks
# somewhere; the UDID form of -destination is version-proof.
UDID=$(xcrun simctl list devices available --json | python3 -c '
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data["devices"].items():
    if "iOS" not in runtime:
        continue
    for d in devices:
        if d["name"].startswith("iPhone"):
            print(d["udid"]); sys.exit(0)
sys.exit("no available iPhone simulator")
')
echo "Using simulator $UDID"

# Boot it (no-op if already booted) and wait until it's actually ready —
# installing the test runner into a cold device fails with "Device not
# configured" otherwise.
xcrun simctl bootstatus "$UDID" -b

LOG=$(mktemp)
set +e
xcodebuild test \
  -project Blueprint.xcodeproj \
  -scheme Blueprint \
  -destination "platform=iOS Simulator,id=$UDID" \
  CODE_SIGNING_ALLOWED=NO \
  >"$LOG" 2>&1
status=$?
set -e
tail -n 40 "$LOG"

# Gate on the explicit marker, not just the exit code: xcodebuild has returned
# 0 on "System Failures" (test runner never launched) — a green that ran zero
# tests is the one outcome this script must never report.
if [ $status -ne 0 ] || ! grep -q "TEST SUCCEEDED" "$LOG"; then
  echo "iOS tests FAILED (xcodebuild exit $status; see log above)"
  exit 1
fi
echo "iOS tests passed."
