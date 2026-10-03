import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Identifies an uncommitted runtime exactly without requiring a publication or Git mutation. */
export function runtimeSourceSnapshot(){
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src','public','index.html','package.json','package-lock.json','vite.config.ts'],{encoding:'utf8'})
    .trim().split(/\r?\n/).filter(Boolean).sort();
  const records=files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
  return {sha256:createHash('sha256').update(JSON.stringify(records)).digest('hex'),files:records,
    scope:'All tracked and nonignored runtime source/public assets, HTML, pinned dependency files and Vite configuration. Documentation/test drivers are not runtime source.'};
}
