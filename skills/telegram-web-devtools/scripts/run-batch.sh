#!/usr/bin/env bash
# Send an approved batch one message at a time with random pauses; check replies during pauses;
# stop on any unexpected result or a possible rate limit.
# usage: run-batch.sh <batch.tsv> [skip-first-n]
# batch.tsv: one "username<TAB>message-file" per line; relative message paths resolve from the batch file's directory.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
batch="${1:?usage: run-batch.sh <batch.tsv> [skip-first-n]}"
skip_first="${2:-0}"
batch_dir="$(cd "$(dirname "$batch")" && pwd)"
pause_min="${TG_PAUSE_MIN:-150}"
pause_jitter="${TG_PAUSE_JITTER:-150}"

check() {
  node "$here/check-replies.mjs" --lines </dev/null 2>/dev/null || echo "CHECK-ERROR: check-replies failed"
}

resolve_msg() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$batch_dir/$1" ;; esac; }

# Validate the whole batch before the first send.
while IFS=$'\t' read -r user msg || [ -n "$user" ]; do
  case "$user" in ''|'#'*) continue ;; esac
  if [ -z "$msg" ] || [ ! -f "$(resolve_msg "$msg")" ]; then echo "STOP: message file not found for @$user: ${msg:-<empty>}"; exit 1; fi
done < "$batch"

n=0
while IFS=$'\t' read -r user msg || [ -n "$user" ]; do
  case "$user" in ''|'#'*) continue ;; esac
  n=$((n + 1)); [ "$n" -le "$skip_first" ] && continue
  msg="$(resolve_msg "$msg")"
  pause=$((pause_min + RANDOM % (pause_jitter + 1)))
  echo "wait ${pause}s before @$user"
  sleep $((pause / 2)); check; sleep $((pause - pause / 2))
  out=$(node "$here/send-tg.mjs" "$user" "$msg" </dev/null 2>&1); code=$?
  echo "RESULT @$user code=$code $(printf '%s' "$out" | head -c 300)"
  case $code in
    0|3|4|5) ;;
    *) echo "STOP: unexpected result for @$user"; exit 1 ;;
  esac
  if printf '%s' "$out" | grep -qiE 'flood|too many|слишком много'; then echo "STOP: possible rate limit"; exit 2; fi
done < "$batch"
check
echo "BATCH DONE"
