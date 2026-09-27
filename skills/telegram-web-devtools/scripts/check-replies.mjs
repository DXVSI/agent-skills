// New incoming messages from contacts we have written to; API only, no chat is opened.
// usage: node check-replies.mjs [--lines] [username...]   (default: every username with a "sent" entry in the log)
// --lines prints one "REPLY @user: text" or "CHECK-ERROR @user: error" line per event instead of JSON.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, ensureBridge, resolve, history, readLog } from './tg-lib.mjs';

await ensureBridge();
const seenPath = join(DIR, 'replies-state.json');
const seen = existsSync(seenPath) ? JSON.parse(readFileSync(seenPath, 'utf8')) : {};
const log = readLog();
const lines = process.argv.includes('--lines');
let users = process.argv.slice(2).filter((a) => a !== '--lines');
if (!users.length) users = [...new Set(log.filter((e) => e.status === 'sent').map((e) => e.username))];
const result = [];
for (const u of users) {
  const peerId = log.find((e) => e.username === u && e.peerId)?.peerId || (await resolve(u).catch(() => null));
  if (!peerId) { result.push({ username: u, error: 'not resolved', fresh: [] }); continue; }
  const h = await history(peerId, 20).catch((e) => ({ error: String(e) }));
  if (h.error) { result.push({ username: u, peerId, error: h.error, fresh: [] }); continue; }
  const incoming = h.messages.filter((m) => !m.out);
  const known = new Set(seen[u] || []);
  const fresh = incoming.filter((m) => !known.has(m.mid)).sort((a, b) => a.date - b.date);
  seen[u] = [...new Set([...(seen[u] || []), ...incoming.map((m) => m.mid)])];
  const last = h.messages.reduce((a, b) => (!a || b.date > a.date || (b.date === a.date && b.mid > a.mid) ? b : a), null);
  result.push({ username: u, peerId, fresh, lastIsOurs: last ? last.out : null, lastText: last?.text.slice(0, 160) });
}
writeFileSync(seenPath, JSON.stringify(seen, null, 1), { mode: 0o600 });
if (!lines) console.log(JSON.stringify(result, null, 1));
else for (const r of result) {
  if (r.error) console.log(`CHECK-ERROR @${r.username}: ${r.error}`);
  for (const m of r.fresh) console.log(`REPLY @${r.username}: ${m.text.replace(/\n/g, ' / ').slice(0, 500)}${m.media ? ' [media]' : ''}`);
}
