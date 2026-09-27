# Bridge reference

The bridge (`scripts/daemon.mjs`) holds one CDP connection to the user's Chrome through `playwright-core` (`chromium.connectOverCDP`). Clients send JSON commands over HTTP to `127.0.0.1` with the token from the state file. `scripts/bctl.mjs` is the command-line client; `scripts/tg-lib.mjs` uses the same API.

## Files and environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `CDP_BRIDGE_STATE_DIR` | `$XDG_STATE_HOME/cdp-bridge`, or `~/.local/state/cdp-bridge` | `state.json` (port, token, pid) and `shots/` |
| `CHROME_PROFILE_DIR` | `~/.config/google-chrome` | Chrome user data directory that contains `DevToolsActivePort` |
| `CONNECT_TIMEOUT_MS` | `0` (no limit) | How long to wait for the user to approve the connection |
| `TG_DATA_DIR` | `<state dir>/telegram` | `log.jsonl` and `replies-state.json` for the Telegram scripts |
| `TG_TAB` | the only `web.telegram.org/k/` tab | Bridge tab id to use when more than one Telegram tab exists |
| `TG_SEND_LOCK` | `$XDG_RUNTIME_DIR/telegram-web-devtools-send.lock`, or the OS temp directory | Lock directory that serializes sends |
| `TG_PAUSE_MIN`, `TG_PAUSE_JITTER` | `150`, `150` | Batch pause in seconds: minimum plus a random extra |
| `TG_REPLY_INTERVAL` | `180` | Seconds between checks in `watch-replies.sh` |

For another Chrome channel or platform, set `CHROME_PROFILE_DIR` to the user data directory. `chrome://version` shows the profile path; the user data directory is its parent.

## Start, check, stop

Start the bridge detached, with output in a log file, as shown in `SKILL.md`, and read the log. It prints `connecting ...`, then `connected` after the user approves, then `ready on 127.0.0.1:<port>`. A second copy exits with `bridge already running` instead of opening another connection.

```sh
setsid nohup node daemon.mjs > daemon.log 2>&1 < /dev/null &    # then read daemon.log until "ready"
node bctl.mjs tabs                  # list tabs with bridge ids t1, t2, ...
kill "$(node -p "require(process.env.HOME + '/.local/state/cdp-bridge/state.json').pid")"
```

Adjust the path in the last command if `CDP_BRIDGE_STATE_DIR` or `XDG_STATE_HOME` is set. Stop the bridge by its pid. Do not use `pkill -f <pattern>` when the pattern also appears in the command line of the shell that runs it: the shell matches and gets killed too.

When the browser disconnects, the bridge deletes its state file and exits with code 2. Starting it again requires a new approval in Chrome.

## bctl commands

Usage: `bctl <cmd> key=value ...`. Numeric strings and `true`/`false` are converted to numbers and booleans, so pass text that looks like a number through `json='{"text":"123"}'`. Output is JSON; `text` and `snap` print metadata on the first line and the content after it (truncated at 60,000 characters).

| Command | Arguments | Notes |
| --- | --- | --- |
| `tabs` | | All tabs with bridge ids, URL, title, and whether the bridge opened them |
| `new` | `url=` | Opens a tab owned by the bridge |
| `goto`, `back`, `front` | `id=`, `url=` | Navigate or bring a tab to the front |
| `close` | `id=`, `force=true` | Closes only bridge-owned tabs unless `force=true`; ask the user first |
| `text` | `id=`, optional `ref=` or `selector=` | Visible text |
| `snap` | `id=`, optional `ref=`, `selector=`, `depth=` | Accessibility snapshot with refs for later commands |
| `shot` | `id=`, optional `ref=`, `selector=`, `full=true` | PNG in `shots/`; can hang on a background tab |
| `click`, `hover` | `id=`, `ref=` or `selector=` or `x=` `y=` | |
| `fill`, `type`, `press`, `select`, `upload` | `id=`, target, `value=` / `text=` / `key=` / `files=` | `type` sends key presses; `fill` replaces the value |
| `scroll`, `wait` | `id=`, target or `dy=` / `ms=` | |
| `eval` | `id=`, `js=` | Runs the body of an async function in the page and returns its value |

Browser dialogs (`alert`, `confirm`) are dismissed automatically and logged by the bridge.

## Security notes

- The HTTP server listens only on `127.0.0.1`, and every request needs the token. `eval` runs arbitrary code in the page, so keep the state file private and do not print the token.
- The bridge can see every tab in the user's browser. Use only the tabs the task needs.
- Stopping the bridge disconnects it without closing Chrome.
