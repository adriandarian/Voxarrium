import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

// Offline only: one bounded graph per subprocess, after traversal measurement.
if(process.argv[2]==='--worker'){
  const file=resolve(process.argv[3]),bytes=statSync(file).size;
  assert(bytes<=512*1024*1024,'Heap graph exceeds the 512 MiB input cap.');
  const graph=JSON.parse(readFileSync(file,'utf8')),meta=graph.snapshot.meta;
  const fields=meta.node_fields,stride=fields.length;
  const typeIndex=fields.indexOf('type'),nameIndex=fields.indexOf('name'),sizeIndex=fields.indexOf('self_size');
  assert(typeIndex>=0&&nameIndex>=0&&sizeIndex>=0,'Unsupported V8 node schema.');
  const kinds=meta.node_types[typeIndex],classes={},allocationTypes={};let shallowBytes=0;
  for(let i=0;i<graph.nodes.length;i+=stride){
    const size=graph.nodes[i+sizeIndex];shallowBytes+=size;
    const kind=kinds[graph.nodes[i+typeIndex]];
    const type=allocationTypes[kind]??={count:0,shallowBytes:0};type.count++;type.shallowBytes+=size;
    if(kind!=='object'&&kind!=='native')continue;
    const name=graph.strings[graph.nodes[i+nameIndex]].replace(/scope @\d+/g,'scope'),key=`${kind}:${name}`;
    const row=classes[key]??={count:0,shallowBytes:0};row.count++;row.shallowBytes+=size;
  }
  console.log(JSON.stringify({file,bytes,nodeCount:graph.nodes.length/stride,edgeCount:graph.edges.length/meta.edge_fields.length,shallowBytes,allocationTypes,classes}));
}else{
  const directory=resolve(process.argv[2]??'artifacts/m8/stress/clear-day');
  const snapshots=['startup','cycle-0','cycle-1','cycle-2'].map(name=>JSON.parse(execFileSync(process.execPath,
    ['--max-old-space-size=2048',fileURLToPath(import.meta.url),'--worker',resolve(directory,`${name}.heapsnapshot`)],
    {encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000})));
  const selected=['object:BindGroup','native:GPUBindGroup','object:NodeUniformsGroup','object:NodeUniform','object:NodeSampledTexture',
    'object:BufferGeometry','object:InstancedMesh','object:MeshStandardMaterial','object:MeshStandardNodeMaterial',
    'object:CanvasTexture','native:GPUTexture','native:GPUBuffer','native:GPURenderPipeline','native:AudioContext','object:PannerNode'];
  const comparison=selected.map(name=>({name,samples:snapshots.map(s=>s.classes[name]??{count:0,shallowBytes:0})}));
  const keys=new Set(snapshots.flatMap(s=>Object.keys(s.classes)));
  const growth=[...keys].map(name=>({name,firstReturn:snapshots[1].classes[name]??{count:0,shallowBytes:0},
    lastReturn:snapshots[3].classes[name]??{count:0,shallowBytes:0}})).map(r=>({...r,
      countDelta:r.lastReturn.count-r.firstReturn.count,shallowDelta:r.lastReturn.shallowBytes-r.firstReturn.shallowBytes}))
    .filter(r=>r.countDelta>0||r.shallowDelta>0).sort((a,b)=>b.shallowDelta-a.shallowDelta).slice(0,40);
  const report={generatedAt:new Date().toISOString(),inputs:snapshots.map(s=>s.file),
    method:'Offline V8 graph constructor/native-wrapper counts and summed shallow sizes. One input graph per subprocess, 512 MiB input and 2048 MiB old-space caps. Startup differs from equivalent returns.',
    limits:'Shallow sizes are not retained sizes. Constructor names can be shared or anonymous. Counts alone do not establish leaks, total heap stability, GPU allocations or VRAM. No retainer paths or cross-snapshot object identities are inferred.',
    snapshots:snapshots.map(({classes,...summary})=>summary),selected:comparison,largestPositiveReturnDeltas:growth};
  const output=resolve('artifacts/m8/checks/heap-ownership-summary.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,snapshots:report.snapshots,selected:comparison}));
}
