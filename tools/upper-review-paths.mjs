import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';

// Select exact source-labelled evidence without overwriting earlier captures.
export function upperReviewPaths(){
  const root='artifacts/m9',absoluteRoot=resolve(root);
  const defaults={browser:'browser',motion:'motion-final',waterfront:'waterfront-final',
    sightlines:'sightlines-final',audit:'checks/six-circuit-audit.json',output:'review.html',verification:'viewer-check'};
  const manifest=process.env.VOXARRIUM_UPPER_REVIEW_INPUTS
    ?JSON.parse(readFileSync(process.env.VOXARRIUM_UPPER_REVIEW_INPUTS,'utf8')):null;
  const paths={...(manifest?.paths??defaults)};
  for(const key of Object.keys(defaults)){
    assert(typeof paths[key]==='string'&&paths[key].length>0,`Missing review path ${key}`);
    const local=relative(absoluteRoot,resolve(root,paths[key]));
    assert(local&&local!=='..'&&!local.startsWith(`..${sep}`)&&!isAbsolute(local),`Review path outside M9 evidence: ${key}`);
    paths[key]=local.split(sep).join('/');
  }
  // Keep the standalone file at the established root for reference-image links.
  assert(!paths.output.includes('/'),'Review output must be an M9-root filename.');
  return {root,paths,sourceSha256:manifest?.sourceSha256};
}
