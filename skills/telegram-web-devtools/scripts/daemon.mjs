// Bridge to the user's already running Chrome over the DevTools Protocol.
// It connects once (Chrome asks the user to allow the connection) and then accepts
// commands over HTTP on 127.0.0.1 only, authenticated by the token in the state file.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { STATE_DIR, STATE_FILE, readState } from './state.mjs';

const HOME = homedir();
const SHOTS_DIR = join(STATE_DIR, 'shots');
const PROFILE_DIR = process.env.CHROME_PROFILE_DIR ?? join(HOME, '.config/google-chrome');
const TEXT_LIMIT = 60_000;

mkdirSync(SHOTS_DIR, { recursive: true, mode: 0o700 });

// A second bridge would open a second connection and trigger another approval prompt in Chrome.
async function runningBridgePid() {
  try {
    const { port, token, pid } = readState();
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', headers: { 'x-token': token }, body: '{"cmd":"tabs"}', signal: AbortSignal.timeout(3000) });
    return res.ok ? pid : null;
  } catch {
    return null;
  }
}
const runningPid = await runningBridgePid();
if (runningPid) {
  console.error(`bridge already running (pid ${runningPid}); state: ${STATE_FILE}`);
  process.exit(1);
}

function wsEndpoint() {
  const file = join(PROFILE_DIR, 'DevToolsActivePort');
  let content = '';
  try { content = readFileSync(file, 'utf8'); } catch {}
  const [port, path] = content.trim().split('\n');
  if (!port || !path) {
    console.error(`${file} is missing or has no port and path: enable remote debugging at chrome://inspect/#remote-debugging, or set CHROME_PROFILE_DIR to the Chrome user data directory`);
    process.exit(1);
  }
  return `ws://127.0.0.1:${port}${path}`;
}

const endpoint = wsEndpoint();
console.log(`connecting ${endpoint} (approve the prompt in Chrome if it appears)`);
// A person approves the connection in Chrome, so by default wait without a limit (CONNECT_TIMEOUT_MS=0).
const browser = await chromium.connectOverCDP(endpoint, { timeout: Number(process.env.CONNECT_TIMEOUT_MS ?? 0) });
console.log('connected');
browser.on('disconnected', () => {
  console.log('browser disconnected');
  rmSync(STATE_FILE, { force: true });
  process.exit(2);
});

const ids = new WeakMap();
const pagesById = new Map();
const ours = new Set();
let nextId = 1;

function allPages() {
  return browser.contexts().flatMap((c) => c.pages());
}

function idOf(page) {
  let id = ids.get(page);
  if (!id) {
    id = `t${nextId++}`;
    ids.set(page, id);
    pagesById.set(id, page);
    page.on('close', () => { pagesById.delete(id); ours.delete(id); });
    page.on('dialog', (d) => { console.log(`dialog ${id}: ${d.type()} ${d.message()}`); d.dismiss().catch(() => {}); });
  }
  return id;
}

function pageFor(id) {
  allPages().forEach(idOf);
  const page = pagesById.get(id);
  if (!page) throw new Error(`no tab ${id}; run tabs`);
  return page;
}

function target(page, a) {
  if (a.ref) return page.locator(`aria-ref=${a.ref}`);
  if (a.selector) return page.locator(a.selector).first();
  return null;
}

function clip(text) {
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}\n...[truncated, ${text.length} characters total]` : text;
}

const commands = {
  async tabs() {
    return Promise.all(allPages().map(async (p) => {
      const id = idOf(p);
      return { id, ours: ours.has(id), url: p.url(), title: await p.title().catch(() => '') };
    }));
  },
  async new(a) {
    const context = browser.contexts()[0];
    const page = await context.newPage();
    const id = idOf(page);
    ours.add(id);
    if (a.url) await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return { id, url: page.url() };
  },
  async goto(a) {
    const page = pageFor(a.id);
    await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return { url: page.url(), title: await page.title() };
  },
  async back(a) { await pageFor(a.id).goBack(); return { url: pageFor(a.id).url() }; },
  async front(a) { await pageFor(a.id).bringToFront(); return { ok: true }; },
  async close(a) {
    if (!ours.has(a.id) && !a.force) throw new Error('tab was not opened by the bridge; pass force=true to close it');
    await pageFor(a.id).close();
    return { ok: true };
  },
  async shot(a) {
    const page = pageFor(a.id);
    const path = join(SHOTS_DIR, `${a.id}-${Date.now()}.png`);
    const loc = target(page, a);
    if (loc) await loc.screenshot({ path, timeout: 15_000 });
    else await page.screenshot({ path, fullPage: Boolean(a.full), timeout: 20_000 });
    return { path };
  },
  async text(a) {
    const page = pageFor(a.id);
    const loc = target(page, a) ?? page.locator('body');
    return { url: page.url(), text: clip(await loc.innerText({ timeout: 15_000 })) };
  },
  async snap(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    const snapshot = loc
      ? await loc.ariaSnapshot({ mode: 'ai', timeout: 20_000 })
      : await page.ariaSnapshot({ mode: 'ai', depth: a.depth, timeout: 20_000 });
    return { url: page.url(), snapshot: clip(snapshot) };
  },
  async click(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    if (loc) await loc.click({ timeout: 15_000, button: a.button ?? 'left', clickCount: a.count ?? 1 });
    else if (a.x !== undefined) await page.mouse.click(a.x, a.y, { button: a.button ?? 'left', clickCount: a.count ?? 1 });
    else throw new Error('pass ref, selector, or x and y');
    return { ok: true, url: page.url() };
  },
  async hover(a) { await target(pageFor(a.id), a).hover({ timeout: 15_000 }); return { ok: true }; },
  async fill(a) {
    await target(pageFor(a.id), a).fill(a.value, { timeout: 15_000 });
    return { ok: true };
  },
  async type(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    if (loc) await loc.pressSequentially(a.text, { delay: a.delay ?? 30, timeout: 60_000 });
    else await page.keyboard.type(a.text, { delay: a.delay ?? 30 });
    return { ok: true };
  },
  async press(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    if (loc) await loc.press(a.key, { timeout: 15_000 });
    else await page.keyboard.press(a.key);
    return { ok: true };
  },
  async select(a) { return { values: await target(pageFor(a.id), a).selectOption(a.value, { timeout: 15_000 }) }; },
  async upload(a) { await target(pageFor(a.id), a).setInputFiles(a.files, { timeout: 15_000 }); return { ok: true }; },
  async scroll(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    if (loc) await loc.scrollIntoViewIfNeeded({ timeout: 15_000 });
    else await page.mouse.wheel(a.dx ?? 0, a.dy ?? 800);
    return { ok: true };
  },
  async wait(a) {
    const page = pageFor(a.id);
    const loc = target(page, a);
    if (loc) await loc.waitFor({ state: a.state ?? 'visible', timeout: a.ms ?? 30_000 });
    else await page.waitForTimeout(Math.min(a.ms ?? 1000, 30_000));
    return { ok: true, url: page.url() };
  },
  async eval(a) {
    const page = pageFor(a.id);
    const value = await page.evaluate(`(async () => { ${a.js} })()`);
    return { value };
  },
};

const token = randomBytes(24).toString('hex');
const server = createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.headers['x-token'] !== token) return send(403, { error: 'forbidden' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    const a = JSON.parse(raw || '{}');
    const fn = commands[a.cmd];
    if (!fn) return send(400, { error: `unknown command ${a.cmd}`, commands: Object.keys(commands) });
    send(200, await fn(a));
  } catch (error) {
    send(500, { error: String(error?.message ?? error).split('\n').slice(0, 6).join('\n') });
  }
});
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  writeFileSync(STATE_FILE, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  console.log(`ready on 127.0.0.1:${port}; state: ${STATE_FILE}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  // browser.close() is never called: the process only disconnects and the user's Chrome stays open.
  process.on(sig, () => { rmSync(STATE_FILE, { force: true }); process.exit(0); });
}
