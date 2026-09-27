# Troubleshooting

## Connection

| Symptom | Cause | Action |
| --- | --- | --- |
| `DevToolsActivePort is missing` | Remote debugging is off, Chrome is not running, or `CHROME_PROFILE_DIR` points to another user data directory | Ask the user to enable it at `chrome://inspect/#remote-debugging`; check the directory in `chrome://version` |
| `/json/version` returns 404 | Expected in this mode | Use the WebSocket endpoint from `DevToolsActivePort` |
| The bridge prints `connecting` and waits | Chrome is showing the approval prompt | Ask the user to click Allow; the bridge waits without a timeout |
| The prompt cannot be approved | The screen is locked | Ask the user to unlock it. Never unlock it yourself. On systemd, `loginctl show-session <id> -p LockedHint` shows the lock state |
| `browser disconnected`, exit code 2 | Chrome closed, restarted, or dropped the connection | Start the bridge again; the user approves a new prompt |
| `bridge already running` | A bridge is already connected | Use it; do not start a second connection |
| Scripts cannot reach `127.0.0.1` or write the state directory | The agent's shell runs in a sandbox, for example Codex `workspace-write` without network access | Run these commands with approval outside the sandbox, or allow local network access and writes to the state directory |
| The bridge or a batch dies when the agent's command ends | It was started in the foreground of a tool call | Start it detached with `setsid nohup ... &` and a log file |
| A screenshot hangs | Chrome does not render a background tab | Use `text`, `snap`, or `eval`, or ask before bringing the tab to the front |
| A browser extension for agent control reports it is not connected | The extension and the agent session did not pair | Use this bridge instead of retrying the extension |

On Linux Wayland, desktop automation tools may be unable to take screenshots of other windows. A full-screen capture tool of the desktop environment, run with the user's knowledge, can show whether the screen is locked or a prompt is visible.

## Telegram Web

| Symptom | Cause | Action |
| --- | --- | --- |
| The script read or typed in the wrong chat | The chat did not switch and an inactive `.chat` container was read | Read only `#column-center .chat.active` and compare `appImManager.chat.peerId` and the header's `data-peer-id` with the resolved id before every action |
| `#@username` opened nothing | The hash is processed only when it changes; after a reload the client is still reconnecting | Use `appImManager.openUsername` |
| A first message was skipped although no conversation existed | The check relied on the URL hash or the "No messages here yet" text | Check history through `getHistory` |
| Exit code 8, `bridge or Telegram tab unavailable` | The bridge is down, or there is no Telegram Web K tab or more than one | Check `bctl tabs`; restart the bridge or set `TG_TAB` |
| `username not resolved` | Typo, deleted account, or a channel username instead of a user | Check the username with the user; do not guess alternatives |
| `chat not ready` | The chat or its input did not appear in 20 seconds | Check for "Reconnecting..." or a restriction; retry once later |
| `typed text mismatch` | Emoji, formatting, or a leftover draft changed the input | Clear the draft manually with the user's knowledge or adjust the text; do not press Enter |
| `unverified` | The message did not appear in the history within 15 seconds | Read the history again before reporting; do not resend blindly |
| `paid messages` | The recipient charges Stars per message | Report it to the user and skip |
| `PEER_FLOOD`, `FLOOD_WAIT`, a notice from @SpamBot | Telegram limited the account | Stop all sending and tell the user; do not work around the limit |

## Processes

- `pkill -f <pattern>` matches full command lines, including the shell that runs it when the pattern appears there. Stop processes by pid.
- `run-batch.sh` checks that every message file exists before the first send and stops on exit codes other than 0, 3, 4, and 5.
- `watch-replies.sh` exits with `STOP` after three failed checks in a row, so a dead bridge shows up in its log.
- A stale send lock from a dead process is removed automatically after a few seconds; a live lock makes other sends wait up to four minutes.
