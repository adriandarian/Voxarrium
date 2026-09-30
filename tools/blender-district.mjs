import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBlender } from './local.mjs';
import { repoRoot } from './references.mjs';

try {
  const blender = findBlender();
  if (!blender) throw new Error('Blender not found. Set BLENDER_PATH. Nothing was installed.');
  const outputDir = resolve(repoRoot, 'public/assets/district');
  const source = resolve(repoRoot, 'assets/source/district-kit.blend');
  const reportPath = resolve(repoRoot, '.local/district-asset-report.json');
  mkdirSync(outputDir, { recursive: true });
  const result = spawnSync(blender.executable, ['--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(repoRoot, 'tools/blender/district_kit.py'), '--',
    '--output-dir', outputDir, '--source', source, '--report', reportPath],
  { stdio: 'inherit', timeout: 240000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.error?.message || `Blender exited ${result.status}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const asset of report.assets) {
    const data = readFileSync(resolve(repoRoot, asset.path));
    if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
      throw new Error('Invalid district GLB header/length');
    }
    if (createHash('sha256').update(data).digest('hex') !== asset.sha256) throw new Error('Export checksum mismatch');
    const json = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    asset.exportedMeshes = json.meshes.length;
    asset.exportedPrimitives = json.meshes.reduce((n, m) => n + m.primitives.length, 0);
    asset.materialCount = json.materials.length;
    const triangles = json.meshes.reduce((n, m) => n + m.primitives.reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0), 0);
    if (triangles !== asset.triangles || (json.textures?.length ?? 0) !== 0) throw new Error('Unexpected district triangles/textures');
    console.log(`${asset.id}: ${data.length} bytes; ${triangles} triangles; ${asset.moduleCount} modules; ${asset.exportedPrimitives} primitives.`);
  }
  report.sourceHashes = Object.fromEntries(['tools/blender/district_kit.py', 'tools/blender-district.mjs',
    'tools/blender/rural_hero.py', 'assets/source/district-kit.blend'].map(path => [path,
    createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex')]));
  report.referenceHashes = Object.fromEntries(JSON.parse(readFileSync(resolve(repoRoot,
    'docs/reference/manifest.json'), 'utf8')).images.map(image => [image.path, image.sha256]));
  report.command = 'node tools/blender-district.mjs';
  const text = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(reportPath, text);
  writeFileSync(resolve(repoRoot, 'assets/source/district-kit.report.json'), text);
  console.log('PASS actual local Blender export/header/hash/module counts. Art review remains a runtime gate.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
