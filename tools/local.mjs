import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function probe(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 10000, windowsHide: true });
  return result.status === 0 ? (result.stdout || result.stderr).trim().split(/\r?\n/)[0] : null;
}

export function findBlender() {
  if (process.env.BLENDER_PATH) {
    const version = probe(process.env.BLENDER_PATH);
    return version ? { executable: process.env.BLENDER_PATH, version } : null;
  }
  const candidates = ['blender'];
  if (process.platform === 'darwin') candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  if (process.platform === 'win32') {
    const base = join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation');
    if (existsSync(base)) {
      for (const name of readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
        candidates.push(join(base, name, 'blender.exe'));
      }
    }
  }
  for (const executable of candidates) {
    const version = probe(executable);
    if (version) return { executable, version };
  }
  return null;
}
