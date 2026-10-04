import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateManifest, verifyReferences, repoRoot } from '../tools/references.mjs';
import { installTransitionCapture } from '../tools/transition-capture.mjs';

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
test('permissive mode explicitly reports missing images', () => inTemp((dir) => {
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

test('bounded transition chunks preserve every ordered Unicode chronology row', () => {
  const target = {}; installTransitionCapture(target);
  const records = Array.from({ length: 219 }, (_, sequence) => ({
    sequence, detail: sequence % 7 === 0 ? '水🌧'.repeat(3100) : `request ${sequence}`,
  }));
  const headers = target.__transitionCapture.stage([{ id: 'civic:1', endedAtMs: 120, pendingSpans: 0, records }]);
  assert.equal(headers[0].recordCount, records.length); assert.equal('records' in headers[0], false);
  const restored = []; let chunks = 0;
  for (;;) {
    const chunk = target.__transitionCapture.read('civic:1'); chunks++;
    assert.equal(chunk.offset, restored.length); assert(chunk.records.length <= 64);
    assert(Buffer.byteLength(JSON.stringify(chunk)) <= 32768);
    restored.push(...chunk.records); if (chunk.done) break;
  }
  assert(chunks > 4); assert.deepEqual(restored, records);
  assert.equal(target.__transitionCapture.status().pendingReports, 0);
  assert.throws(() => target.__transitionCapture.read('civic:1'), /already exported/);
});

test('transition capture rejects unsettled, duplicate and oversized evidence', () => {
  const target = {}; installTransitionCapture(target); const queue = target.__transitionCapture;
  const report = { id: 'garden:1', endedAtMs: 120, pendingSpans: 0, records: [] };
  assert.throws(() => queue.stage([{ ...report, endedAtMs: null }]), /settled/);
  assert.throws(() => queue.stage([{ ...report, pendingSpans: 1 }]), /settled/);
  assert.throws(() => queue.stage([{ ...report, records: Array(8193).fill({}) }]), /original capture cap/);
  queue.stage([report]); assert.throws(() => queue.stage([report]), /twice/);
  assert.deepEqual(queue.read(report.id), { id: report.id, offset: 0, records: [], done: true });
  queue.stage([{ ...report, records: [{ detail: '🌧'.repeat(9000) }] }]);
  assert.throws(() => queue.read(report.id), /One chronology row/);
  assert.equal(queue.status().pendingReports, 1); queue.clear();
  assert.equal(queue.status().pendingReports, 0);
});

test('transition capture enforces its 48-report bound without discarding pending reports', () => {
  const target = {}; installTransitionCapture(target); const queue = target.__transitionCapture;
  queue.stage(Array.from({ length: 48 }, (_, index) => ({
    id: `request:${index}`, endedAtMs: 120, pendingSpans: 0, records: [{ sequence: index }],
  })));
  assert.throws(() => queue.stage([{ id: 'overflow', endedAtMs: 120, pendingSpans: 0, records: [] }]), /48 reports/);
  for (let index = 0; index < 48; index++) assert.deepEqual(queue.read(`request:${index}`).records, [{ sequence: index }]);
  assert.equal(queue.status().pendingReports, 0);
});
