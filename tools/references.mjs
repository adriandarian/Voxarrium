import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.images) || !manifest.images.length) {
    throw new Error('Invalid or empty reference manifest');
  }
  const seen = new Set();
  for (const image of manifest.images) {
    if (!/^(?:experiments\/)?[a-z0-9-]+\.png$/.test(image.path) || seen.has(image.path)) {
      throw new Error(`Unsafe or duplicate reference path: ${image.path}`);
    }
    seen.add(image.path);
    if (!/^[a-f0-9]{64}$/.test(image.sha256) ||
        ![image.bytes, image.width, image.height].every((v) => Number.isSafeInteger(v) && v > 0)) {
      throw new Error(`Invalid reference metadata: ${image.path}`);
    }
  }
  return manifest.images;
}

export function verifyReferences(base, manifest, { allowMissing = false } = {}) {
  const images = validateManifest(manifest);
  const report = { ok: true, verified: [], missing: [], errors: [] };
  for (const image of images) {
    const path = resolve(base, image.path);
    if (!existsSync(path)) {
      report.missing.push(image.path);
      continue;
    }
    try {
      const bytes = readFileSync(path);
      if (bytes.length !== image.bytes || bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) {
        throw new Error('size or PNG signature mismatch');
      }
      if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error('SHA-256 mismatch');
      if (bytes.readUInt32BE(16) !== image.width || bytes.readUInt32BE(20) !== image.height) {
        throw new Error('PNG dimensions mismatch');
      }
      report.verified.push(image.path);
    } catch (error) {
      report.errors.push(`${image.path}: ${error.message}`);
    }
  }
  report.ok = report.errors.length === 0 && (allowMissing || report.missing.length === 0);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const base = resolve(repoRoot, 'docs/reference');
    const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8'));
    const allowMissing = process.argv.includes('--allow-missing');
    const report = verifyReferences(base, manifest, { allowMissing });
    console.log(JSON.stringify(report, null, 2));
    if (report.missing.length) console.error('REFERENCE GATE NOT PASSED: original PNGs still need local import.');
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
