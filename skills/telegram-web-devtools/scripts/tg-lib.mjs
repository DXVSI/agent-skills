// Shared helpers for Telegram Web K through the bridge (daemon.mjs).
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR, STATE_FILE, readState } from './state.mjs';

export const DIR = process.env.TG_DATA_DIR ?? join(STATE_DIR, 'telegram');
export const LOG = join(DIR, 'log.jsonl');
mkdirSync(DIR, { recursive: true, mode: 0o700 });
let state;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(body) {
  if (!state) {
    try { state = readState(); } catch { throw new Error(`bridge is not running (no ${STATE_FILE})`); }
  }
  const res = await fetch(`http://127.0.0.1:${state.port}/`, { method: 'POST', headers: { 'x-token': state.token }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(`${body.cmd}: ${out.error}`);
  return out;
}

// Telegram Web must live in exactly one tab. TG_TAB pins a bridge tab id; otherwise the single web.telegram.org/k/ tab is used.
async function findTab() {
  if (process.env.TG_TAB) return process.env.TG_TAB;
  const tabs = (await request({ cmd: 'tabs' })).filter((t) => t.url.startsWith('https://web.telegram.org/k/'));
  if (tabs.length !== 1) throw new Error(`expected one Telegram Web K tab, found ${tabs.length}; open exactly one or set TG_TAB`);
  return tabs[0].id;
}
let tab;

export async function call(body) {
  tab ??= await findTab();
  return request({ id: tab, ...body });
}
// Fails when the bridge is down or the Telegram tab is missing or ambiguous; call before the first real action.
export async function ensureBridge() {
  await call({ cmd: 'tabs' });
}
export const js = async (code) => (await call({ cmd: 'eval', js: code })).value;
const withTimeout = (expr, ms) => `await Promise.race([${expr}, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ${ms}))])`;

// Exact user id for a username; null when the username is not found or does not match.
export async function resolve(username) {
  return js(`const u = ${withTimeout(`window.rootScope.managers.appUsersManager.resolveUsername(${JSON.stringify(username)})`, 20000)};
    if (!u) return null;
    const names = [u.username, ...(u.usernames || []).map((x) => x.username)].filter(Boolean).map((x) => x.toLowerCase());
    return names.includes(${JSON.stringify(username.toLowerCase())}) ? String(u.id) : null;`);
}

// Latest messages of a conversation through the client API, without opening the chat.
export async function history(peerId, limit = 20) {
  if (!/^-?\d+$/.test(String(peerId)) || !Number.isInteger(limit)) throw new Error('history: peerId and limit must be integers');
  return js(`const m = window.rootScope.managers.appMessagesManager;
    const h = ${withTimeout(`m.getHistory({ peerId: ${peerId}, limit: ${limit} })`, 20000)};
    const out = [];
    for (const mid of (h.history || []).slice(0, ${limit})) {
      const x = await m.getMessageByPeer(${peerId}, mid);
      if (x) out.push({ mid: x.mid, out: Boolean(x.pFlags?.out), date: x.date, text: x.message || '', media: x.media ? (x.media._ || 'media') : null });
    }
    return { count: h.count ?? out.length, messages: out };`);
}

export function logEntry(entry) {
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 });
}
export function readLog() {
  try {
    return readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
