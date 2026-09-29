import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBlender } from './local.mjs';
import { repoRoot } from './references.mjs';

try {
  const blender = findBlender();
  if (!blender) throw new Error('Blender not found. Set BLENDER_PATH. Nothing was installed or modified.');
  const directory = resolve(repoRoot, '.local/assets');
  mkdirSync(directory, { recursive: true });
  const output = resolve(directory, 'scale-fixture.glb');
  const result = spawnSync(blender.executable, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(repoRoot, 'tools/blender/scale_fixture.py'), '--', '--output', output],
    { stdio: 'inherit', timeout: 120000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.error?.message || `Blender exited ${result.status}`);
  const bytes = readFileSync(output);
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB v2 header/length');
  console.log('GLB calibration export and header: PASS. Verify orientation/bounds/materials in M1 runtime.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
