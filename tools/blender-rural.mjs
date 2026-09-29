import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBlender } from './local.mjs';
import { repoRoot } from './references.mjs';

// Own dedicated outputs only. Never opens an existing Blender application/scene.
try {
  const blender = findBlender();
  if (!blender) throw new Error('Blender not found. Set BLENDER_PATH. Nothing was installed.');
  const outputDir = resolve(repoRoot, 'public/assets/rural');
  const source = resolve(repoRoot, 'assets/source/rural-hero.blend');
  const reportPath = resolve(repoRoot, '.local/rural-asset-report.json');
  mkdirSync(outputDir, { recursive: true });
  const result = spawnSync(blender.executable, [
    '--background', '--factory-startup', '--python-exit-code', '1',
    '--python', resolve(repoRoot, 'tools/blender/rural_hero.py'), '--',
    '--output-dir', outputDir, '--source', source, '--report', reportPath,
  ], { stdio: 'inherit', timeout: 240000, windowsHide: true });
  if (result.status !== 0) throw new Error(result.error?.message || `Blender exited ${result.status}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const asset of report.assets) {
    const bytes = readFileSync(resolve(repoRoot, asset.path));
    if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' ||
        bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
      throw new Error(`Invalid GLB v2 header/length: ${asset.id}`);
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== asset.sha256) throw new Error(`Export checksum mismatch: ${asset.id}`);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    const triangles = json.meshes.reduce((n, mesh) => n + mesh.primitives.reduce(
      (sum, primitive) => sum + (json.accessors[primitive.indices].count / 3), 0), 0);
    if (triangles !== asset.triangles) throw new Error(`Export triangle mismatch: ${asset.id}`);
    if ((json.textures?.length || 0) !== 0) throw new Error(`Unexpected texture dependency: ${asset.id}`);
    asset.exportedMeshes = json.meshes.length;
    asset.exportedPrimitives = json.meshes.reduce((n, mesh) => n + mesh.primitives.length, 0);
    console.log(`${asset.id}: ${asset.bytes} bytes; ${triangles} triangles; ${asset.materialCount} materials; ${asset.exportedMeshes} meshes; valid GLB v2.`);
  }
  for (const path of ['tools/blender/rural_hero.py', 'tools/blender-rural.mjs', 'assets/source/rural-hero.blend']) {
    report.sourceHashes ??= {};
    report.sourceHashes[path] = createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
  }
  report.referenceHashes = Object.fromEntries(JSON.parse(readFileSync(
    resolve(repoRoot, 'docs/reference/manifest.json'), 'utf8')).images.map(image => [image.path, image.sha256]));
  report.command = 'node tools/blender-rural.mjs';
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS export/header/checksum/triangles. Runtime material and art validation remain separate.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
