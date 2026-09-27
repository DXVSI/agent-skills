#!/usr/bin/env node
// Bridge client: bctl <cmd> key=value ... (numbers and true/false are converted; json='{...}' merges a whole object)
import { readState, STATE_FILE } from './state.mjs';

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) { console.error('usage: bctl <cmd> key=value ...'); process.exit(64); }
let state;
try { state = readState(); }
catch { console.error(`bridge is not running (no ${STATE_FILE}); start it with: node daemon.mjs`); process.exit(69); }
const body = { cmd };
for (const arg of rest) {
  const i = arg.indexOf('=');
  if (i < 1) { console.error(`expected key=value, got: ${arg}`); process.exit(64); }
  const key = arg.slice(0, i);
  const raw = arg.slice(i + 1);
  if (key === 'json') Object.assign(body, JSON.parse(raw));
  else body[key] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw === 'true' ? true : raw === 'false' ? false : raw;
}
const res = await fetch(`http://127.0.0.1:${state.port}/`, { method: 'POST', headers: { 'x-token': state.token }, body: JSON.stringify(body) });
const out = await res.json();
if (typeof out.text === 'string' || typeof out.snapshot === 'string') {
  const { text, snapshot, ...meta } = out;
  console.log(JSON.stringify(meta));
  console.log(text ?? snapshot);
} else console.log(JSON.stringify(out, null, 1));
process.exit(res.ok ? 0 : 1);
