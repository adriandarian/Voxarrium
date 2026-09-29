import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { repoRoot, validateManifest } from './references.mjs';

const required = ['AGENTS.md', 'STATUS.md', 'README.md', 'docs/CODEX_START_HERE.md',
  'docs/VISION.md', 'docs/ARCHITECTURE.md', 'docs/ART_DIRECTION.md', 'docs/WORLD_SCALE.md',
  'docs/ASSET_PIPELINE.md', 'docs/PERFORMANCE_BUDGETS.md', 'docs/TESTING.md', 'docs/DECISIONS.md',
  'docs/SOURCES.md', 'docs/prompts/00-local-preflight.md', '.codex/config.toml',
  'tools/import-references.ps1', 'tools/blender/scale_fixture.py'];
try {
  for (const path of required) {
    if (!existsSync(resolve(repoRoot, path))) throw new Error(`Missing ${path}`);
  }
  validateManifest(JSON.parse(readFileSync(resolve(repoRoot, 'docs/reference/manifest.json'), 'utf8')));
  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(repoRoot, 'package-lock.json'), 'utf8'));
  if (pkg.name !== lock.name || pkg.version !== lock.version) throw new Error('Package/lock identity mismatch');
  const assets = JSON.parse(readFileSync(resolve(repoRoot, 'assets/manifest.json'), 'utf8'));
  for (const asset of assets.assets) {
    if (!asset.path.startsWith('public/assets/') || asset.path.includes('..')) throw new Error(`Unsafe runtime asset path: ${asset.path}`);
    const digest = createHash('sha256').update(readFileSync(resolve(repoRoot, asset.path))).digest('hex');
    if (digest !== asset.sha256) throw new Error(`Runtime asset checksum mismatch: ${asset.id}`);
  }
  const config = readFileSync(resolve(repoRoot, '.codex/config.toml'), 'utf8');
  if (!/^max_threads\s*=\s*2\s*$/m.test(config)) throw new Error('Review the bounded subagent default');
  for (const filename of readdirSync(resolve(repoRoot, 'tools')).filter((p) => p.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', resolve(repoRoot, 'tools', filename)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || `Syntax check failed: ${filename}`);
  }
  console.log('Repository contracts, runtime asset checksums and tool syntax: PASS (not a game build or GPU test)');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
