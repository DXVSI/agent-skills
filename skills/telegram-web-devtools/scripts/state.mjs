// Location of the bridge state file (port, token, pid) shared by the bridge and its clients.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const STATE_DIR = process.env.CDP_BRIDGE_STATE_DIR ?? join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'cdp-bridge');
export const STATE_FILE = join(STATE_DIR, 'state.json');

export function readState() {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}
