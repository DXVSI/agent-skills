# Telegram Web K client reference

These are internal objects of Telegram Web K at `https://web.telegram.org/k/`. They are not a public API and can change with any client update. Run the snippets through the bridge: `bctl eval id=<tab> js='...'`, or `js()` in `scripts/tg-lib.mjs`. The code runs as the body of an async function, so use `return`.

## Probe before use

Check that the objects exist before the first real action:

```js
return {
  managers: Boolean(window.rootScope?.managers?.appUsersManager && window.rootScope?.managers?.appMessagesManager),
  openUsername: typeof window.appImManager?.openUsername,
  peerId: window.appImManager?.chat?.peerId ?? null,
};
```

If any value is missing, stop and tell the user. Do not fall back to guessing from page text.

## Resolve a username

```js
const u = await window.rootScope.managers.appUsersManager.resolveUsername('example_user');
return u ? { id: String(u.id), username: u.username, usernames: (u.usernames || []).map((x) => x.username) } : null;
```

Accept the id only when `username` or one of `usernames` matches the requested name, ignoring case. Wrap calls in a timeout; `tg-lib.mjs` uses 20 seconds.

## Read history without opening the chat

```js
const m = window.rootScope.managers.appMessagesManager;
const h = await m.getHistory({ peerId: 123456789, limit: 20 });
const out = [];
for (const mid of h.history || []) {
  const x = await m.getMessageByPeer(123456789, mid);
  if (x) out.push({ mid: x.mid, out: Boolean(x.pFlags?.out), date: x.date, text: x.message || '', media: x.media?._ || null });
}
return { count: h.count ?? out.length, messages: out };
```

`h.history` listed message ids newest first when this was written; sort by `date` when order matters. `pFlags.out` marks messages sent by the user. `date` is a Unix timestamp. Use this to check whether a conversation already exists, to confirm delivery, and to find new replies.

## Open a chat

```js
await window.appImManager.openUsername({ userName: 'example_user' });
return String(window.appImManager.chat?.peerId);
```

This switches the chat immediately without a reload. Opening a chat in the interface can mark its messages as read, so open only chats you are about to write to.

Avoid `https://web.telegram.org/k/#@example_user`. The client processes the hash only when it changes. After a page reload it shows "Reconnecting..." or "Updating..." for several seconds and may not open the chat at all.

## The active chat in the DOM

| Element | Selector |
| --- | --- |
| Active chat container | `#column-center .chat.active` |
| Header peer id | `.chat-info [data-peer-id]` inside the active chat |
| Header title | `.chat-info .peer-title` inside the active chat |
| Message input | `.input-message-input[contenteditable="true"]` that is visible (`offsetParent` is not null) |
| Input area | `.chat-input` inside the active chat |

Several `.chat` containers can be present during and after a switch. Never read or type in `.chat` without `.active`. Before pressing Enter, check both `appImManager.chat.peerId` and the header's `data-peer-id` against the expected id; if either differs, abort.

## Typing and sending

Click the input, type each line, and press Shift+Enter between lines; Enter sends immediately. After typing, read the input's `innerText` and compare it with the source text after collapsing whitespace. Custom emoji, automatic formatting, or a draft left in the input can cause a mismatch; abort and investigate instead of sending.

## Paid messages

Some users charge Telegram Stars for each incoming message. The chat then shows an input placeholder such as "Message for ★N" (translated when the interface uses another language) or a notice that the chat charges Stars for each message. `send-tg.mjs` looks for these markers in the input area and the start of the chat and skips the chat. Do not send there without the user's explicit consent, and never buy Stars.

## Connection state

"Reconnecting..." or "Updating..." in the header means the client is not synchronized. Wait for it to clear before reading history or sending. If it persists, ask the user to check the network and the tab rather than reloading the page yourself.
