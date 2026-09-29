import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateManifest, verifyReferences, repoRoot } from '../tools/references.mjs';

function fixture() {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(2, 16); bytes.writeUInt32BE(3, 20);
  const image = { path: 'sample.png', bytes: bytes.length, width: 2, height: 3,
    sha256: createHash('sha256').update(bytes).digest('hex') };
  return { bytes, manifest: { schemaVersion: 1, images: [image] } };
}
function inTemp(run) {
  const dir = mkdtempSync(join(tmpdir(), 'voxarrium-test-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('valid reference metadata and bytes pass', () => inTemp((dir) => {
  const { bytes, manifest } = fixture(); writeFileSync(join(dir, 'sample.png'), bytes);
  assert.equal(verifyReferences(dir, manifest).ok, true);
}));
test('strict mode fails missing reference images', () => inTemp((dir) => {
  assert.equal(verifyReferences(dir, fixture().manifest).ok, false);
}));
test('CI mode explicitly reports missing images', () => inTemp((dir) => {
  const report = verifyReferences(dir, fixture().manifest, { allowMissing: true });
  assert.equal(report.ok, true); assert.deepEqual(report.missing, ['sample.png']);
}));
test('corrupt content fails even when missing images are allowed', () => inTemp((dir) => {
  const { bytes, manifest } = fixture(); bytes[10] = 1; writeFileSync(join(dir, 'sample.png'), bytes);
  assert.equal(verifyReferences(dir, manifest, { allowMissing: true }).ok, false);
}));
test('dimension mismatch fails', () => inTemp((dir) => {
  const { bytes, manifest } = fixture(); manifest.images[0].width = 4;
  writeFileSync(join(dir, 'sample.png'), bytes); assert.equal(verifyReferences(dir, manifest).ok, false);
}));
test('path traversal is rejected', () => {
  const { manifest } = fixture(); manifest.images[0].path = '../sample.png';
  assert.throws(() => validateManifest(manifest), /Unsafe/);
});
test('duplicate paths are rejected', () => {
  const { manifest } = fixture(); manifest.images.push(manifest.images[0]);
  assert.throws(() => validateManifest(manifest), /duplicate/);
});
test('actual reference manifest contains four known source roles', () => {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, 'docs/reference/manifest.json'), 'utf8'));
  assert.equal(validateManifest(manifest).length, 4);
  assert.equal(manifest.images[0].path, 'city-master.png');
});
test('repository contract checker succeeds', () => {
  const result = spawnSync(process.execPath, [resolve(repoRoot, 'tools/check.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
