import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findBlender } from './local.mjs';
import { repoRoot } from './references.mjs';

// Dedicated factory session only: no open scene, network service or third-party content.
try {
  const blender=findBlender();
  if(!blender)throw new Error('Blender not found. Set BLENDER_PATH; nothing was installed.');
  const outputDir=resolve(repoRoot,'public/assets/citadel'),source=resolve(repoRoot,'assets/source/citadel-hero.blend');
  const reportPath=resolve(repoRoot,'assets/source/citadel-hero.report.json');
  const skylineOnly=process.argv.includes('--skyline-only');
  const previousHero=skylineOnly?createHash('sha256').update(readFileSync(resolve(outputDir,'citadel-hero.glb'))).digest('hex'):null;
  mkdirSync(outputDir,{recursive:true});
  const result=spawnSync(blender.executable,['--background','--factory-startup','--python-exit-code','1',
    '--python',resolve(repoRoot,'tools/blender/citadel_hero.py'),'--','--output-dir',outputDir,'--source',source,'--report',reportPath,
    ...(skylineOnly?['--skyline-only']:[])],
    {stdio:'inherit',timeout:240000,windowsHide:true});
  if(result.status!==0)throw new Error(result.error?.message||`Blender exited ${result.status}`);
  if(previousHero&&createHash('sha256').update(readFileSync(resolve(outputDir,'citadel-hero.glb'))).digest('hex')!==previousHero)
    throw new Error('Skyline-only export modified the preserved hero GLB.');
  const report=JSON.parse(readFileSync(reportPath,'utf8'));
  for(const asset of report.assets){
    const bytes=readFileSync(resolve(repoRoot,asset.path));
    if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid citadel GLB v2 header.');
    if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('Citadel export checksum mismatch.');
    const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    asset.exportedMeshes=json.meshes.length;
    asset.exportedPrimitives=json.meshes.reduce((n,m)=>n+m.primitives.length,0);
    const triangles=json.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+json.accessors[p.indices].count/3,0),0);
    if(triangles!==asset.triangles||(json.textures?.length??0)!==0)throw new Error('Citadel export inventory mismatch.');
    console.log(`${asset.id}: ${asset.bytes} bytes; ${triangles} triangles; ${asset.materialCount} materials; ${asset.exportedMeshes} merged meshes.`);
  }
  report.sourceHashes={};
  for(const path of ['tools/blender/citadel_hero.py','tools/blender-citadel.mjs','assets/source/citadel-hero.blend'])
    report.sourceHashes[path]=createHash('sha256').update(readFileSync(resolve(repoRoot,path))).digest('hex');
  report.referenceHashes=Object.fromEntries(JSON.parse(readFileSync(resolve(repoRoot,'docs/reference/manifest.json'),'utf8')).images.map(i=>[i.path,i.sha256]));
  report.command=`node tools/blender-citadel.mjs${skylineOnly?' --skyline-only':''}`;
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('PASS export/header/checksum/triangle inventory. Runtime visual review remains separate.');
}catch(error){console.error(error.message);process.exitCode=1;}
