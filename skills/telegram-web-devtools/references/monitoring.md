# Monitoring reference

Monitoring answers three questions for the user at any moment: where each conversation stands, which replies need an answer, and whether anything stopped. The records are plain files, so Codex, Claude Code, or another agent can pick up the same state.

## Records

All files live in `TG_DATA_DIR` (default `<state dir>/telegram`) with owner-only permissions. They contain other people's messages; keep them private and out of repositories.

| File | Written by | Content |
| --- | --- | --- |
| `log.jsonl` | `send-tg.mjs` | One line per send attempt: time, username, status, reason, peer id, text |
| `replies-state.json` | `check-replies.mjs` | Incoming message ids already reported, per username |
| `contacts.json` | `track.mjs` | Current status and free fields per contact |
| `batch.log`, `replies.log` | the agent, by redirecting output | Live output of `run-batch.sh` and `watch-replies.sh` |

## Contact statuses

| Status | Meaning | Set when |
| --- | --- | --- |
| `planned` | Approved recipient, not contacted yet | The user approves the recipient list |
| `sent` | First message delivered | `send-tg.mjs` confirms delivery; `track.mjs list` derives it from `log.jsonl` |
| `replied` | The recipient answered without concrete terms | A reply arrives |
| `quoted` | The recipient named a price or terms | Record them in fields, for example `price=90 terms="24h post"` |
| `agreed` | Terms accepted; payment is due | The terms fit the approved limits or the user accepted them |
| `paid` | The user paid | Only after the user confirms the payment |
| `published` | The paid result is delivered | After checking it, for example the post at `https://t.me/s/<channel>`, or on the user's confirmation |
| `declined` | The recipient refused or the user rejected the terms | Either side says no |
| `skipped` | Not contacted | Paid chat, unresolved username, or another reason; add `note=` |

```sh
node track.mjs set @example_user status=quoted price=90 note="24h post, reach about 3k"
node track.mjs list           # counts per status, then one line per contact
node track.mjs list --json    # rows for a report or a dashboard
```

## Run and watch

Start long-running scripts detached, write their output to a log in the data directory, and save the pid so they can be stopped by pid:

```sh
B=~/.local/share/cdp-bridge; D=~/.local/state/cdp-bridge/telegram
setsid nohup bash "$B/run-batch.sh" "$D/batch.tsv" > "$D/batch.log" 2>&1 < /dev/null & echo $! > "$D/batch.pid"
tail -n 20 "$D/batch.log"
```

After `BATCH DONE`, start the reply watcher the same way (`watch-replies.sh`, output to `replies.log`). Do not run the watcher while a batch runs; the batch already checks replies.

| Line | Meaning | Action |
| --- | --- | --- |
| `RESULT @user code=0` | Sent and confirmed | Nothing; `track.mjs list` shows it as `sent` |
| `RESULT @user code=3`, `4`, or `5` | Skipped | Mark `skipped` with a note unless the contact will be retried |
| `REPLY @user: ...` | New incoming message | Read the recent history, update the tracker, answer within the approved limits or show the user a draft |
| `CHECK-ERROR ...` | A reply check failed | A single one can pass; if it repeats, check the bridge with `bctl tabs` |
| `STOP: ...` | The script stopped on a problem | Do not restart; tell the user what stopped and why |
| `BATCH DONE` | The batch finished | Start the reply watcher and send the user a summary |

Tell the user about each reply and each stop in one line when it happens, and give a short summary from `track.mjs list` at checkpoints.

## Agent notes

- At the start of any session, read `track.mjs list` and the tails of the logs before acting. They show what previous sessions or other agents already did.
- If the agent cannot be woken by process output, check the logs at each checkpoint and at least every few minutes while conversations are active.
- Claude Code, at the time of writing, can start these scripts as background commands and attach its Monitor tool to a filtered log, for example `tail -f replies.log | grep --line-buffered -E 'REPLY|STOP|CHECK-ERROR'`, so events wake the agent.
- Claude can also publish a private artifact page with a shared database as a live tracker for the user: write rows from `track.mjs list --json`, let the user mark payments on the page, and read those changes back into `contacts.json` before the next report. Load the artifact skills before building it. The page mirrors the local files; it does not replace them.
- Codex and other agents without live pages report the tracker summary in chat, or render a local page when the user asks for one.
