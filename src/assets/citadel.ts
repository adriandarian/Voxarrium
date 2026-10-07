import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Object3D } from 'three';
import { preparedGlbScene } from './abortable-glb';
import type { PreparationResources } from '../render/preparation-cache';
import { finishPreparation } from '../render/preparation-scheduler';
import type { PreparationScheduler } from '../render/preparation-scheduler';

export const CITADEL_HERO_URL='/assets/citadel/citadel-hero.glb';
export const CITADEL_SKYLINE_URL='/assets/citadel/citadel-skyline.glb';
/** Bounded additive keep-pavilion inventory; existing architecture is retained.
 * These asset ceilings do not relax native cadence or streaming limits.
 */
export const CITADEL_HERO_TRIANGLE_LIMIT=95_680;
export const CITADEL_SKYLINE_TRIANGLE_LIMIT=11_250;
export const CITADEL_PRINCIPAL_PARTS=['great-keep.walls','watch-tower.walls','west-beacon.walls',
  'east-beacon.walls','court-bell.walls','west-front-tower.walls','east-front-tower.walls',
  'west-court-hall.walls','east-court-hall.walls','east-hall.walls','outer-gate.vault',
  'rear-curtain.body','west-curtain.body','east-curtain.body'] as const;

function* inspectionJobs(root:Object3D,assetId:'citadel.hero'|'citadel.skyline'='citadel.hero'){
  root.updateMatrixWorld(true);
  const bounds=new Box3(),materials=new Set<string>(),parts=new Map<string,{min:number[];max:number[]}>();
  const meshes:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
  let triangles=0;
  for(const mesh of meshes){
    if(mesh.userData.asset_id!==assetId||mesh.userData.units!=='meters')throw new Error('Citadel export identity/units drift.');
    if(!(mesh.material instanceof MeshStandardMaterial))throw new Error('Citadel requires one standard material per merged primitive.');
    materials.add(mesh.material.name);
    triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3;
    bounds.union(new Box3().setFromObject(mesh,true));
    const metadata=JSON.parse(mesh.userData.part_bounds_m as string) as Record<string,{min:number[];max:number[]}>;
    for(const part of mesh.userData.parts as string[]) {
      const source=metadata[part];if(!source)throw new Error(`Missing citadel semantic bounds: ${part}`);
      parts.set(part,source);
    }
    yield 'citadel.asset-inventory';
  }
  for(const part of CITADEL_PRINCIPAL_PARTS)if(!parts.has(part))throw new Error(`Missing citadel structural part: ${part}`);
  const dimensions=bounds.getSize(new Vector3()).toArray();
  // The accepted body floor remains world 44m. Crown presentation may reach
  // the former M6.1 proxy's 106.45m extent, without enlarging body envelopes.
  if(dimensions[0]!<200||dimensions[0]!>220||dimensions[1]!<54||dimensions[1]!>62.451||dimensions[2]!<80||dimensions[2]!>100
    ||bounds.min.y< -6.001||bounds.max.y>56.451)
    throw new Error('Citadel meter-axis/bounds contract drift.');
  const expectedBatches=assetId==='citadel.hero'?17:6;
  if(meshes.length!==expectedBatches||materials.size!==expectedBatches)throw new Error('Citadel material-batch contract drift.');
  if(triangles>(assetId==='citadel.hero'?CITADEL_HERO_TRIANGLE_LIMIT:CITADEL_SKYLINE_TRIANGLE_LIMIT))
    throw new Error('Citadel architecture triangle budget drift.');
  return {id:assetId,meshes:meshes.length,triangles,materials:[...materials].sort(),
    dimensions,min:bounds.min.toArray(),max:bounds.max.toArray(),parts:Object.fromEntries(parts),
    units:'meters',pivot:'accepted world (150,50,-605)',materialTreatment:root.userData.materialTreatment??'Original GLB materials'};
}

/** Uses actual imported geometry and glTF semantic bounds, independent of Blender report. */
export function inspectCitadelHero(root:Object3D){return finishPreparation(inspectionJobs(root));}
export function inspectCitadelSkyline(root:Object3D){return finishPreparation(inspectionJobs(root,'citadel.skyline'));}

export async function loadCitadelHero(signal:AbortSignal,scheduler:PreparationScheduler,scope:PreparationResources){
  const root=await preparedGlbScene(CITADEL_HERO_URL,'citadel.hero',signal,scheduler,scope);
  const facts=await scheduler.run('citadel.asset-inventory',inspectionJobs(root));
  return {root,facts};
}

/** Parent keeps this bounded primary architecture resident, hiding it on detail activation. */
export async function loadCitadelSkyline(signal:AbortSignal,scheduler:PreparationScheduler,scope:PreparationResources){
  const root=await preparedGlbScene(CITADEL_SKYLINE_URL,'citadel.skyline',signal,scheduler,scope);
  root.name='citadel.skyline.architecture';
  const facts=await scheduler.run('citadel.skyline-inventory',inspectionJobs(root,'citadel.skyline'));
  return {root,facts:{...facts,materialTreatment:'Six original color materials with primary architecture and selected identifying crown/clock features; no close-range pigment maps.'}};
}
