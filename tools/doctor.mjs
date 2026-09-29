import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBlender, probe } from './local.mjs';
import { repoRoot, verifyReferences } from './references.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
const base = resolve(repoRoot, 'docs/reference');
const manifest = JSON.parse(readFileSync(resolve(base, 'manifest.json'), 'utf8'));
const blender = findBlender();
const report = {
  timestamp: new Date().toISOString(), platform: process.platform,
  node: process.version, nodeSupported: major > 22 || (major === 22 && minor >= 12),
  git: probe('git'), blender: blender?.version ?? null,
  references: verifyReferences(base, manifest),
  browserGpu: 'NOT TESTED by doctor: run npm run test:browser or npm run capture; see STATUS.md for recorded browser evidence',
  runtime: existsSync(resolve(repoRoot, 'src/main.ts')) ? 'M1 source present; doctor does not launch or validate gameplay' : 'NOT IMPLEMENTED: bootstrap only',
};
mkdirSync(resolve(repoRoot, '.local'), { recursive: true });
writeFileSync(resolve(repoRoot, '.local/doctor.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!blender) console.error('Blender not found. Set BLENDER_PATH to the executable; no install was attempted.');
if (!report.nodeSupported || !report.git || !blender || !report.references.ok) process.exitCode = 1;
