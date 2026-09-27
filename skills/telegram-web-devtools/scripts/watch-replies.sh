#!/usr/bin/env bash
# Poll for new replies until stopped and print one timestamped line per event.
# Run it when no batch is running: run-batch.sh already checks replies during its pauses.
# usage: watch-replies.sh [username...]   (interval: TG_REPLY_INTERVAL seconds, default 180)
# Exits after three consecutive failed checks, for example when the bridge is gone.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
interval="${TG_REPLY_INTERVAL:-180}"
failures=0
echo "$(date -Is) WATCH started, every ${interval}s"
while true; do
  if out=$(node "$here/check-replies.mjs" --lines "$@" </dev/null 2>/dev/null); then
    failures=0
    [ -n "$out" ] && printf '%s\n' "$out" | while IFS= read -r line; do echo "$(date -Is) $line"; done
  else
    failures=$((failures + 1))
    echo "$(date -Is) CHECK-ERROR: check-replies failed ($failures in a row)"
    if [ "$failures" -ge 3 ]; then echo "$(date -Is) STOP: replies cannot be checked; is the bridge running?"; exit 1; fi
  fi
  sleep "$interval"
done
