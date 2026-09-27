// Contact tracker: the shared record of where each conversation stands, readable by any agent.
// usage: node track.mjs set <username> status=<status> [key=value ...]
//        node track.mjs list [--json]
// A "sent" entry in log.jsonl moves a missing or "planned" contact to "sent" when listing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIR, readLog } from './tg-lib.mjs';

const STATUSES = ['planned', 'sent', 'replied', 'quoted', 'agreed', 'paid', 'published', 'declined', 'skipped'];
const FILE = join(DIR, 'contacts.json');
const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {});

const [cmd, username, ...pairs] = process.argv.slice(2);
if (cmd === 'set') {
  if (!username) { console.error('usage: node track.mjs set <username> status=<status> [key=value ...]'); process.exit(64); }
  const fields = {};
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    if (i < 1) { console.error(`expected key=value, got: ${pair}`); process.exit(64); }
    fields[pair.slice(0, i)] = pair.slice(i + 1);
  }
  if (fields.status && !STATUSES.includes(fields.status)) { console.error(`unknown status ${fields.status}; use one of: ${STATUSES.join(', ')}`); process.exit(64); }
  const contacts = load();
  const name = username.replace(/^@/, '');
  contacts[name] = { ...contacts[name], ...fields, updatedAt: new Date().toISOString() };
  writeFileSync(FILE, JSON.stringify(contacts, null, 1), { mode: 0o600 });
  console.log(JSON.stringify({ username: name, ...contacts[name] }));
} else if (cmd === 'list') {
  const contacts = load();
  for (const e of readLog()) {
    if (e.status !== 'sent') continue;
    const c = contacts[e.username];
    if (!c || c.status === 'planned') contacts[e.username] = { ...c, status: 'sent', updatedAt: e.at };
  }
  const rows = Object.entries(contacts)
    .map(([name, c]) => ({ username: name, ...c }))
    .sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || String(a.username).localeCompare(b.username));
  if (username === '--json') console.log(JSON.stringify(rows, null, 1));
  else {
    const counts = STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]).filter(([, n]) => n);
    console.log(counts.map(([s, n]) => `${s}: ${n}`).join(', ') || 'no contacts');
    for (const { username: name, status, updatedAt, ...rest } of rows) {
      const extra = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`@${name}\t${status ?? '-'}\t${updatedAt ?? '-'}\t${extra}`);
    }
  }
} else {
  console.error('usage: node track.mjs set <username> status=<status> [key=value ...] | node track.mjs list [--json]');
  process.exit(64);
}
