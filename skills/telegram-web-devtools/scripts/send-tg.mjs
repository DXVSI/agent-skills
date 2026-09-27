// Send one message: node send-tg.mjs <username> <text-file> [--dry] [--reply]
// Exit codes: 0 sent or dry-ok, 3 skipped (not resolved, not ready, lock timeout), 4 paid messages,
// 5 existing history without --reply, 6 typed text mismatch, 7 delivery not confirmed, 8 bridge or Telegram tab unavailable,
// 9 peer changed before Enter.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { call, js, ensureBridge, resolve, history, logEntry, sleep } from './tg-lib.mjs';

const [username, textFile] = process.argv.slice(2);
if (!username || !textFile) { console.error('usage: node send-tg.mjs <username> <text-file> [--dry] [--reply]'); process.exit(64); }
const dry = process.argv.includes('--dry');
const replyMode = process.argv.includes('--reply');
const text = readFileSync(textFile, 'utf8').trim();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
function finish(status, extra = {}, code = 0) {
  logEntry({ username, status, ...extra });
  console.log(JSON.stringify({ status, ...extra }));
  process.exit(code);
}

// One send at a time: the open chat in Telegram Web is shared by every run.
const LOCK = process.env.TG_SEND_LOCK ?? join(process.env.XDG_RUNTIME_DIR ?? tmpdir(), 'telegram-web-devtools-send.lock');
for (let i = 0; ; i++) {
  try { mkdirSync(LOCK); writeFileSync(join(LOCK, 'pid'), String(process.pid)); break; } catch {
    const pidFile = join(LOCK, 'pid');
    const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0;
    let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
    if (!alive && i > 2) rmSync(LOCK, { recursive: true, force: true });
    if (i > 240) { console.log(JSON.stringify({ status: 'skip', reason: 'lock timeout' })); process.exit(3); }
    await sleep(1000);
  }
}
process.on('exit', () => { try { if (readFileSync(join(LOCK, 'pid'), 'utf8') === String(process.pid)) rmSync(LOCK, { recursive: true, force: true }); } catch {} });

await ensureBridge().catch((e) => finish('abort', { reason: 'bridge or Telegram tab unavailable', error: String(e?.message ?? e) }, 8));
const peerId = await resolve(username).catch(() => null);
if (!peerId) finish('skip', { reason: 'username not resolved' }, 3);

const before = await history(peerId, 5).catch((e) => ({ error: String(e) }));
if (before.error) finish('skip', { reason: 'history unavailable', peerId, error: before.error }, 3);
if (!replyMode && before.count > 0) finish('skip', { reason: 'existing history', peerId, count: before.count }, 5);

const opened = await js(`return await Promise.race([window.appImManager.openUsername({ userName: ${JSON.stringify(username)} }).then(() => 'ok', (e) => 'err:' + (e?.type || e?.message || e)), new Promise((r) => setTimeout(() => r('timeout'), 30000))])`).catch((e) => String(e));
if (opened !== 'ok') finish('skip', { reason: 'openUsername ' + opened, peerId }, 3);

// Several .chat containers can exist at once; only the active one in the center column is the open chat.
const ACTIVE = `document.querySelector('#column-center .chat.active')`;
const ON_PEER = `String(window.appImManager.chat?.peerId) === ${JSON.stringify(peerId)} && ${ACTIVE}?.querySelector('.chat-info [data-peer-id]')?.dataset.peerId === ${JSON.stringify(peerId)}`;
let ready = null;
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  ready = await js(`const c = ${ACTIVE};
    const input = c && [...c.querySelectorAll('.input-message-input[contenteditable="true"]')].find((e) => e.offsetParent);
    return { onPeer: ${ON_PEER}, hasInput: Boolean(input), header: (c?.querySelector('.chat-info .peer-title')?.textContent || '').trim(), inputText: (c?.querySelector('.chat-input')?.innerText || '').slice(0, 200), centerText: (c?.innerText || '').slice(0, 300) };`).catch(() => null);
  if (ready?.onPeer && ready.hasInput) break;
}
if (!ready?.onPeer || !ready.hasInput) finish('skip', { reason: 'chat not ready', peerId, ready }, 3);
// Some accounts charge Telegram Stars per message; never send there without the user's explicit consent.
if (/Message for|Сообщение за|charges|★/i.test(ready.inputText + ' ' + ready.centerText)) finish('skip', { reason: 'paid messages', peerId, header: ready.header, inputText: norm(ready.inputText) }, 4);
if (dry) finish('dry-ok', { peerId, header: ready.header });

const INPUT = '#column-center .chat.active .input-message-input[contenteditable="true"]:visible';
await call({ cmd: 'click', selector: INPUT });
// Enter sends the message in Telegram, so lines are separated with Shift+Enter.
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i]) await call({ cmd: 'type', selector: INPUT, text: lines[i], delay: 12 });
  if (i < lines.length - 1) await call({ cmd: 'press', selector: INPUT, key: 'Shift+Enter' });
}
await sleep(400);
const typed = await js(`const c = ${ACTIVE}; return [...c.querySelectorAll('.input-message-input[contenteditable="true"]')].find((e) => e.offsetParent)?.innerText || ''`);
if (norm(typed) !== norm(text)) finish('abort', { reason: 'typed text mismatch', peerId, typed }, 6);
if (!(await js(`return ${ON_PEER}`))) finish('abort', { reason: 'peer changed before Enter', peerId }, 9);
await call({ cmd: 'press', selector: INPUT, key: 'Enter' });

for (let i = 0; i < 15; i++) {
  await sleep(1000);
  const after = await history(peerId, 5).catch(() => null);
  if (after?.messages.some((m) => m.out && norm(m.text) === norm(text))) finish('sent', { peerId, header: ready.header, text });
}
finish('unverified', { peerId, header: ready.header, text }, 7);
