import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Box3, DirectionalLight, Group, HemisphereLight, LineSegments, Mesh, MeshStandardMaterial, Raycaster, Scene, Texture, Vector2, Vector3 } from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { inspectCitadelHero, inspectCitadelSkyline, loadCitadelSkyline, CITADEL_HERO_TRIANGLE_LIMIT, CITADEL_SKYLINE_TRIANGLE_LIMIT } from '../src/assets/citadel';
import { glbSceneResources } from '../src/assets/abortable-glb';
import { ResourceReferences } from '../src/assets/resource-references';
import type { DisposableResource } from '../src/assets/resource-references';
import { createCitadelPresentation } from '../src/render/citadel';
import { PreparationCache } from '../src/render/preparation-cache';
import type { PreparationResources } from '../src/render/preparation-cache';
import { PreparationScheduler } from '../src/render/preparation-scheduler';
import { createEnvironmentPresentation } from '../src/render/environment';
import { createEnvironment, setEnvironment } from '../src/simulation/environment';
import { createPhysics } from '../src/physics/physics';
import { createCameraRig } from '../src/cameras/cameras';
import { createCitadel, CITADEL_ROUTE, CITADEL_SHELTERS, CITADEL_FORECOURT_SPAN, CITADEL_RETURN_APRON, CITADEL_KEEP_PAVILION_ROOF } from '../src/simulation/citadel';
import { createCityBlueprint, cityRoadSurfaces } from '../src/simulation/city-blueprint';
import { cityUpperRetainingSurface, cityUpperRoadCoping } from '../src/simulation/city-terrain';
import { FIXED_DT, IDLE_INPUT, PLAYER } from '../src/simulation/types';
import type { CourseSpec, GameState, Vec3 } from '../src/simulation/types';

const blueprint=createCityBlueprint(),spec=createCitadel(blueprint);
async function asset(name='citadel-hero'){
  const bytes=await readFile(`public/assets/citadel/${name}.glb`);
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'')).scene;
  root.updateMatrixWorld(true);return {root,bytes};
}
const course:CourseSpec={...spec.course,boxes:spec.course.boxes,
  spawn:{...CITADEL_ROUTE[0]!,y:CITADEL_ROUTE[0]!.y+.04},surfaces:[...blueprint.terrain,cityUpperRetainingSurface(blueprint),
    cityUpperRoadCoping(blueprint),...cityRoadSurfaces(blueprint.roads),...spec.course.surfaces!]};
function stateFor(mode:'third-person'|'first-person'):GameState{
  return {sceneId:course.id,seed:course.seed,tick:0,elapsed:0,paused:false,resets:0,environment:null,population:[],interaction:null,
    player:{position:{...course.spawn},velocity:{x:0,y:0,z:0},grounded:false,heading:0},
    camera:{mode,yaw:0,pitch:.1,debugPosition:{x:0,y:0,z:0}}};
}

// Exact normalized face/attribute/winding fingerprints of the preserved9ae
// imports. New pavilion faces append to the old material batches; no ignored
// baseline binary is needed for these reproducible regression checks.
const KEEP_PAVILION_BASELINE:{[name:string]:{parts:number;bounds:string;geometry:string;counts:Record<string,number>}}={
  'citadel-hero':{parts:321,bounds:'fe213ef0ae7f546fe0f1c0f87147018f666c2ee6eb39d16a2d26eb5e2daf2549',
    geometry:'4be107c67740666e389120f1dffc81b7109bfeda974081e5b06a838a85d9999a',counts:{
      brass_citadel:380,door_oak_citadel:384,iron_citadel:292,plaster_citadel:12456,plaster_citadel_warm:7344,
      recess_citadel:5596,stone_citadel:2840,stone_citadel_light:36256,stone_citadel_shadow:12572,
      teal_citadel:336,teal_citadel_light:576,terracotta_citadel:1662,terracotta_citadel_aged:3288,
      terracotta_citadel_light:2508,timber_citadel:674,window_citadel:4652,window_warm:864}},
  'citadel-skyline':{parts:152,bounds:'0c6fdef8637d6e5ef157adf783c577659bd7b75e61c051192e7a5706d8f9e458',
    geometry:'65ea21242904977e8d65f83075082e9d2328f9ffc52245aeaffa0e9350114664',
    counts:{skyline_clay:1938,skyline_lime:132,skyline_shadow:436,skyline_stone:6488,skyline_teal:336,skyline_timber:674}},
};
function oldFaceHash(mesh:Mesh,triangles:number){
  const g=mesh.geometry,faces:string[]=[];
  expect(Object.keys(g.attributes).sort()).toEqual(['normal','position']);
  for(let i=0;i<triangles;i++){
    const vertices=Array.from({length:3},(_,j)=>{
      const v=g.index?g.index.getX(i*3+j):i*3+j;
      return ['normal','position'].map(n=>{const a=g.getAttribute(n);return [a.getX(v),a.getY(v),a.getZ(v)].join(',');}).join('|');
    });
    // Cyclic rotation retains winding; sort permits index-buffer ordering
    // within the old prefix while checking every original position/normal.
    faces.push([0,1,2].map(k=>[vertices[k],vertices[(k+1)%3],vertices[(k+2)%3]].join(';')).sort()[0]!);
  }
  return createHash('sha256').update(faces.sort().join('\n')).digest('hex');
}
function pavilionSection(root:Group,name:string,material:string,offset:number,count:number){
  let source:Mesh|undefined;root.traverse(o=>{if(o instanceof Mesh&&(o.material as MeshStandardMaterial).name===material)source=o;});
  expect(source,`${name} ${material}`).toBeTruthy();
  const geometry=source!.geometry.clone(),start=(KEEP_PAVILION_BASELINE[name]!.counts[material]!+offset)*3;
  geometry.setDrawRange(start,count*3);
  const mesh=new Mesh(geometry,source!.material);mesh.updateMatrixWorld(true);return mesh;
}

test('additive pavilion preserves every previous imported triangle, normal, winding and semantic bound',async()=>{
  for(const name of ['citadel-hero','citadel-skyline']){
    const {root}=await asset(name),baseline=KEEP_PAVILION_BASELINE[name]!;
    const parts:Record<string,unknown>={},batches:{material:string;triangles:number;sha256:string}[]=[];
    root.traverse(o=>{if(!(o instanceof Mesh))return;
      Object.assign(parts,JSON.parse(o.userData.part_bounds_m));
      const material=(o.material as MeshStandardMaterial).name,triangles=baseline.counts[material]!;
      expect(triangles,`${name} retained material`).toBeGreaterThan(0);
      expect((o.geometry.index?.count??o.geometry.getAttribute('position').count)/3).toBeGreaterThanOrEqual(triangles);
      batches.push({material,triangles,sha256:oldFaceHash(o,triangles)});
    });
    const kept=Object.fromEntries(Object.entries(parts).filter(([n])=>!n.startsWith('keep-pavilion.')).sort(([a],[b])=>a.localeCompare(b)));
    expect(Object.keys(kept)).toHaveLength(baseline.parts);
    expect(createHash('sha256').update(JSON.stringify(kept)).digest('hex')).toBe(baseline.bounds);
    expect(createHash('sha256').update(JSON.stringify(batches.sort((a,b)=>a.material.localeCompare(b.material)))).digest('hex')).toBe(baseline.geometry);
  }
});

test('actual keep pavilion has eight open arched elevations, a closed bearing core and fitted roof clearance',async()=>{
  const x=185,z=-631.8,r=9.4,width=4.4,apothem=r*Math.cos(Math.PI/8),pier=(2*r*Math.sin(Math.PI/8)-width)/2;
  for(const name of ['citadel-hero','citadel-skyline']){
    const {root}=await asset(name),facts=name==='citadel-hero'?inspectCitadelHero(root):inspectCitadelSkyline(root);
    for(const suffix of ['bearing-core','roof-collar','corbel','gallery-floor','parapet','belfry.pier','belfry.spandrel','upper-band','ceiling','cornice','roof','finial','bell','bell-carrier'])
      expect(facts.parts[`keep-pavilion.${suffix}`],`${name} ${suffix}`).toBeTruthy();
    const rayAt=(a:number,u:number,y:number)=>new Raycaster(new Vector3(
      x-spec.position.x+Math.cos(a)*(apothem+1.2)+Math.sin(a)*u,y-spec.position.y,
      z-spec.position.z+Math.sin(a)*(apothem+1.2)-Math.cos(a)*u),new Vector3(-Math.cos(a),0,-Math.sin(a)),0,2);
    for(let i=0;i<8;i++){
      const a=(i+1)*Math.PI/4;
      expect(rayAt(a,0,97).intersectObject(root,true),`${name} genuine side${i} opening`).toHaveLength(0);
      for(const side of [-1,1])expect(rayAt(a,side*(width/2+pier/2),97).intersectObject(root,true)[0]!.distance,`${name} side${i} full-depth pier`).toBeLessThan(1.3);
      expect(rayAt(a,0,94.9).intersectObject(root,true).length,`${name} side${i} substantial floor`).toBeGreaterThan(0);
      expect(rayAt(a,0,100.52).intersectObject(root,true).length,`${name} side${i} cornice`).toBeGreaterThan(0);
    }
    const stone=name==='citadel-hero'?'stone_citadel':'skyline_stone';
    const light=name==='citadel-hero'?'stone_citadel_light':'skyline_stone';
    const core=pavilionSection(root,name,stone,0,28),collar=pavilionSection(root,name,light,name==='citadel-hero'?0:28,64);
    const rim=pavilionSection(root,name,stone,name==='citadel-hero'?124:216,64);
    try{
      const top=new Raycaster(new Vector3(35,45,-26.8),new Vector3(0,-1,0),0,2).intersectObject(core)[0];
      const base=new Raycaster(new Vector3(35,-.3,-26.8),new Vector3(0,1,0),0,1).intersectObject(core)[0];
      expect(top!.point.y+50).toBeCloseTo(94.6,3);expect(base!.point.y+50).toBeCloseTo(50,3);
      const collarPoints:Vector3[]=[];const g=collar.geometry;
      for(let i=g.drawRange.start;i<g.drawRange.start+g.drawRange.count;i++){
        const index=g.index!.getX(i),p=new Vector3().fromBufferAttribute(g.getAttribute('position'),index);
        collarPoints.push(p);expect(Math.hypot(p.x-35,p.z+26.8)).toBeLessThanOrEqual(6.30001);
        const roof=84.1+6.7*(1-(p.z+spec.position.z+638)/17.95),lift=p.y+50-roof;
        expect(Math.min(Math.abs(lift-.04),Math.abs(lift-.24)),`${name} actual fitted roof vertex`).toBeLessThan(.00001);
      }
      const actualCollar=new Box3().setFromPoints(collarPoints),lantern=facts.parts['keep-roof-lantern.hip-cap']!;
      // The combined lantern metadata spans both roofs. Their immutable
      // individual nearest extrema follow the exact18m translation.
      expect(actualCollar.min.x-(lantern.max[0]!-18),`${name} left retained cap clearance`).toBeGreaterThan(.08563);
      expect((lantern.min[0]!+18)-actualCollar.max.x,`${name} right retained cap clearance`).toBeGreaterThan(.08563);
      const corbel=facts.parts['keep-pavilion.corbel']!,attachments=Math.max(facts.parts['keep.chimney-cap']!.max[1]!,facts.parts['keep-roof-lantern.hip-cap']!.max[1]!);
      expect(corbel.min[1]!+50).toBeCloseTo(92.05,3);expect(corbel.min[1]!-attachments).toBeGreaterThanOrEqual(.275-.00001);
      expect(corbel.max[1]).toBeCloseTo(facts.parts['keep-pavilion.gallery-floor']!.min[1]!,3);
      expect(facts.parts['keep-pavilion.belfry.pier']!.max[1]).toBeCloseTo(facts.parts['keep-pavilion.ceiling']!.min[1]!,3);
      expect(facts.parts['keep-pavilion.cornice']!.max[1]).toBeCloseTo(facts.parts['keep-pavilion.roof']!.min[1]!,3);
      // Scope rays to the actual load-bearing rim. The double-sided GLB pier
      // underside would otherwise mask a gap when probing the whole asset.
      // Every pier receives bearing across its full depth and width, with
      // 3cm edge margins; touching only its outer toe cannot satisfy this.
      for(let i=0;i<8;i++)for(const side of [-1,1])for(const off of [-.29,0,.29])for(const du of [-pier/2+.03,0,pier/2-.03]){
        const a=(i+1)*Math.PI/4,nx=Math.cos(a),nz=Math.sin(a),u=side*(width/2+pier/2)+du;
        const support=new Raycaster(new Vector3(35+nx*(apothem+off)+nz*u,45.73,-26.8+nz*(apothem+off)-nx*u),new Vector3(0,-1,0),0,.1).intersectObject(rim)[0];
        expect(support,`${name} side${i}/${side} full-foot bearing offset${off}/${du}`).toBeTruthy();
        expect(support!.point.y+50).toBeCloseTo(95.7,3);
      }
    }finally{core.geometry.dispose();collar.geometry.dispose();rim.geometry.dispose();}
  }
});

test('pavilion stays inside the retained keep footprint and its separate fifteenth rain envelope',async()=>{
  expect(CITADEL_KEEP_PAVILION_ROOF).toEqual({min:[174.25,100.35,-642.55],max:[195.75,105.85,-621.05]});
  expect(spec.roofEnvelopes).toHaveLength(15);expect(spec.roofEnvelopes[14]).toEqual(CITADEL_KEEP_PAVILION_ROOF);
  const report=JSON.parse(await readFile('assets/source/citadel-hero.report.json','utf8'));
  expect(report.keepPavilion.rainEnvelope).toEqual(CITADEL_KEEP_PAVILION_ROOF);
  expect(report.triangleBudgetHistory).toEqual(expect.arrayContaining([
    expect.objectContaining({stage:'return-apron',previous:10000,current:10004}),
    expect.objectContaining({stage:'keep-pavilion',previous:10004,current:11250}),
  ]));
  for(const name of ['citadel-hero','citadel-skyline']){
    const {root}=await asset(name),facts=name==='citadel-hero'?inspectCitadelHero(root):inspectCitadelSkyline(root);
    const parts=Object.entries(facts.parts).filter(([n])=>n.startsWith('keep-pavilion.'));
    for(const [part,b] of parts){
      expect(b.min[0]!+150,`${name} ${part} keep west`).toBeGreaterThan(160);
      expect(b.max[0]!+150,`${name} ${part} keep east`).toBeLessThan(210);
      expect(b.min[2]!-605,`${name} ${part} keep rear`).toBeGreaterThan(-655);
      expect(b.max[2]!-605,`${name} ${part} keep front`).toBeLessThan(-621);
      expect(b.max[1]!+50,`${name} ${part} bounded height`).toBeLessThanOrEqual(105.80001);
      if(/\.(roof|roof-rib|finial|cornice|ceiling)$/.test(part))for(let axis=0;axis<3;axis++){
        const anchor=[150,50,-605][axis]!;
        expect(b.min[axis]!+anchor,`${name} ${part} rain min${axis}`).toBeGreaterThanOrEqual(CITADEL_KEEP_PAVILION_ROOF.min[axis]!-.00001);
        expect(b.max[axis]!+anchor,`${name} ${part} rain max${axis}`).toBeLessThanOrEqual(CITADEL_KEEP_PAVILION_ROOF.max[axis]!+.00001);
      }
    }
    expect(facts.parts['keep-pavilion.finial']!.max[1]!+50).toBeCloseTo(105.8,3);
    expect(facts.max[1]!+50).toBeCloseTo(106.4,3);
  }
});

test('citadel data preserves accepted landmark envelopes and serializable topology',()=>{
  expect(JSON.parse(JSON.stringify(spec))).toEqual(createCitadel(createCityBlueprint()));
  expect(spec.replacedLandmarks).toHaveLength(17);
  expect(spec.course.boxes).toHaveLength(77);
  expect(spec.course.boxes.filter(b=>!b.id.startsWith('citadel.forecourt-span.'))).toHaveLength(72);
  expect(spec.course.surfaces).toEqual([CITADEL_RETURN_APRON]);
  for(const source of blueprint.landmarks.filter(b=>spec.replacedLandmarks.includes(b.id))){
    const imported=spec.course.boxes.find(b=>b.id===source.id)!;
    expect(imported.position).toEqual(source.position);expect(imported.size).toEqual(source.size);
    expect(imported.visible).toBe(false);expect(imported.collides).toBe(true);
  }
  expect(new Set(spec.course.boxes.map(b=>b.id)).size).toBe(spec.course.boxes.length);
  expect(spec.course.boxes.every(b=>b.visible===false)).toBe(true);
  expect(spec.assumptions.length).toBeGreaterThan(1);
  expect(blueprint.roads.find(r=>r.id==='citadel-ascent')!.width).toBe(9);
});

test('actual GLTFLoader inventory agrees with Blender report, meters, axes and bounded material batches',async()=>{
  const {root,bytes}=await asset(),facts=inspectCitadelHero(root);
  const report=JSON.parse(await readFile('assets/source/citadel-hero.report.json','utf8')).assets[0];
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(report.sha256);
  expect(facts.triangles).toBe(report.triangles);expect(facts.triangles).toBeGreaterThan(70_000);
  expect(facts.triangles).toBeLessThanOrEqual(CITADEL_HERO_TRIANGLE_LIMIT);
  expect(facts.meshes).toBe(17);expect(facts.materials).toHaveLength(report.materialCount);
  for(let i=0;i<3;i++){expect(facts.min[i]).toBeCloseTo(report.min[i],3);expect(facts.max[i]).toBeCloseTo(report.max[i],3);}
  expect(facts.parts['great-keep.walls']).toEqual({min:[10,0,-50],max:[60,34,-16]});
  expect(facts.parts['watch-tower.walls']).toEqual({min:[-27,0,-42],max:[-9,42,-24]});
  expect(facts.materials.some(n=>n.startsWith('teal_'))).toBe(true);
  const actual=new Box3().setFromObject(root,true);expect(actual.max.y).toBeGreaterThan(50);
});

test('keep is solid on all four elevations and the vaulted gate leaves a real human-scale void',async()=>{
  const {root}=await asset();
  const keepMeshes:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh&&(o.userData.parts as string[]).includes('great-keep.walls'))keepMeshes.push(o);});
  for(const [x,z,dx,dz] of [[35,20,0,-1],[35,-90,0,1],[85,-33,-1,0],[-20,-33,1,0]]){
    const hits=new Raycaster(new Vector3(x!,10,z!),new Vector3(dx!,0,dz!)).intersectObjects(keepMeshes,true);
    expect(hits.length,`keep elevation ${x},${z}`).toBeGreaterThan(0);
    expect(hits[0]!.distance).toBeLessThan(50);
  }
  // The gate extends through world z-577.9, then the accepted ascent turns
  // northwest. Inspect the full gate depth plus0.5m, rather than declaring an
  // arbitrary12m straight continuation clear through an outside stair abutment.
  const passage=new Raycaster(new Vector3(21,-3.6,35),new Vector3(0,0,-1),0,8.4).intersectObject(root,true);
  expect(passage).toHaveLength(0);
  const continuation=new Raycaster(new Vector3(21,-3.6,35),new Vector3(0,0,-1),0,12).intersectObject(root,true)[0];
  expect(continuation!.point.z).toBeCloseTo(CITADEL_FORECOURT_SPAN.abutmentFront-spec.position.z,3);
  const pier=new Raycaster(new Vector3(13.9,-2.5,35),new Vector3(0,0,-1),0,12).intersectObject(root,true);
  expect(pier.length).toBeGreaterThan(0);
  const crown=new Raycaster(new Vector3(21,10,29),new Vector3(0,-1,0),0,10).intersectObject(root,true);
  expect(crown.length).toBeGreaterThan(0);
});

test('hero and resident skyline have genuine eight-sided belfry openings and bounded varied crowns',async()=>{
  const tops:{[key:string]:number}={'watch-tower.finial':106.4,'east-beacon.finial':96.35,
    'west-beacon.finial':93.55,'court-bell.finial':87.05,'west-front-tower.finial':79.4,'east-front-tower.finial':75.5};
  for(const name of ['citadel-hero','citadel-skyline']){
    const {root}=await asset(name),facts=name==='citadel-hero'?inspectCitadelHero(root):inspectCitadelSkyline(root);
    expect(facts.max[1]!+spec.position.y,name).toBeCloseTo(106.4,3);
    expect(facts.max[1]!+spec.position.y,name).toBeLessThanOrEqual(106.45);
    for(const [part,y] of Object.entries(tops))expect(facts.parts[part]!.max[1]!+spec.position.y,`${name} ${part}`).toBeCloseTo(y,3);
    for(const [part,x,z,bodyTop,r,width,openY] of [
      ['watch-tower',132,-638,92,18*.435,3.4,93.7],
      ['east-beacon',245,-648,84,12*.435,2.2,85.1],
    ] as const){
      for(const suffix of ['belfry.gallery','belfry.pier','belfry.spandrel','belfry.band','belfry.cornice','belfry.bell'])
        expect(facts.parts[`${part}.${suffix}`],`${name} ${part}.${suffix}`).toBeTruthy();
      const apothem=r*Math.cos(Math.PI/8),pier=(2*r*Math.sin(Math.PI/8)-width)/2;
      for(let i=0;i<8;i++){
        const a=(i+1)*Math.PI/4,nx=Math.cos(a),nz=Math.sin(a);
        const rayAt=(u:number,y:number)=>new Raycaster(new Vector3(
          x-spec.position.x+nx*(apothem+1.2)+nz*u,y-spec.position.y,
          z-spec.position.z+nz*(apothem+1.2)-nx*u),new Vector3(-nx,0,-nz),0,2);
        // Every side opens into the gallery; a short ray stops before its
        // opposite facade or interior bell, so a painted recess cannot pass.
        expect(rayAt(0,openY).intersectObject(root,true),`${name} ${part} opening ${i}`).toHaveLength(0);
        for(const side of [-1,1]){
          const hit=rayAt(side*(width/2+pier/2),openY).intersectObject(root,true)[0];
          expect(hit,`${name} ${part} supporting pier ${i}/${side}`).toBeTruthy();
          expect(hit!.distance).toBeLessThan(1.3);
        }
        expect(rayAt(0,bodyTop+.30).intersectObject(root,true).length,`${name} ${part} gallery floor ${i}`).toBeGreaterThan(0);
      }
    }
    expect(facts.parts['court-bell.clock.dial']).toBeTruthy();
  }
});

test('explicit roof envelopes enclose actual authored crowns and keep roof attachments',async()=>{
  const facts=inspectCitadelHero((await asset()).root);
  const bodies=blueprint.landmarks.filter(b=>spec.replacedLandmarks.includes(b.id)&&!/wall|pier/.test(b.id));
  const names:{[key:string]:string}={
    'city.landmark.citadel-keep':'great-keep','city.landmark.citadel-tower':'watch-tower',
    'city.landmark.citadel-west-tower':'west-beacon','city.landmark.citadel-east-tower':'east-beacon',
    'city.landmark.citadel-court-tower':'court-bell','city.landmark.citadel-front-west-tower':'west-front-tower',
    'city.landmark.citadel-front-east-tower':'east-front-tower','city.landmark.citadel-wing':'east-hall',
    'city.landmark.citadel-court-west':'west-court-hall','city.landmark.citadel-court-east':'east-court-hall',
  };
  expect(spec.roofEnvelopes).toHaveLength(15);
  for(let index=0;index<bodies.length;index++){
    const b=bodies[index]!,stem=names[b.id];expect(stem,b.id).toBeTruthy();
    const envelope=spec.roofEnvelopes[index]!;
    const roofParts=Object.entries(facts.parts).filter(([n])=>(n.startsWith(`${stem}.`)&&/\.(cap|finial|roof|hip-cap|eaves|drum)$/.test(n))
      ||(stem==='great-keep'&&(/^(keep-corner-turret|keep-roof-lantern)\./.test(n)&&/\.(cap|finial|roof|hip-cap|eaves)$/.test(n)||/^keep\.chimney/.test(n))));
    expect(roofParts.length,b.id).toBeGreaterThan(0);
    for(const [name,bounds] of roofParts)for(let axis=0;axis<3;axis++){
      expect(bounds.min[axis]!+[spec.position.x,spec.position.y,spec.position.z][axis]!,`${b.id} ${name} min${axis}`).toBeGreaterThanOrEqual(envelope.min[axis]!-.001);
      expect(bounds.max[axis]!+[spec.position.x,spec.position.y,spec.position.z][axis]!,`${b.id} ${name} max${axis}`).toBeLessThanOrEqual(envelope.max[axis]!+.001);
    }
  }
});

test('actual forecourt vault is closed, fitted and protects the full-depth skew stair opening in both asset levels',async()=>{
  const span=CITADEL_FORECOURT_SPAN,normalX=55/Math.hypot(35,55);
  const parts=['left-deck','right-deck','vault','left-abutment','right-abutment'];
  const road=cityRoadSurfaces(blueprint.roads.filter(r=>r.id==='citadel-forecourt')).find(s=>s.id==='city.road.citadel-forecourt.3.1')!;
  expect(Math.min(...road.vertices.filter((_,i)=>i%3===0))).toBe(95);expect(Math.max(...road.vertices.filter((_,i)=>i%3===0))).toBe(175);
  expect(road.vertices.filter((_,i)=>i%3===1).every(y=>y===span.top)).toBe(true);
  for(const name of ['citadel-hero','citadel-skyline']){
    const {root}=await asset(name),facts=name==='citadel-hero'?inspectCitadelHero(root):inspectCitadelSkyline(root);
    for(const part of parts){
      const bounds=facts.parts[`forecourt-span.${part}`];expect(bounds,`${name} ${part}`).toBeTruthy();
      const proxy=spec.course.boxes.find(b=>b.id===`citadel.forecourt-span.${part}`)!;
      for(let axis=0;axis<3;axis++){
        const key=(['x','y','z'] as const)[axis]!;
        expect(bounds!.min[axis]!+spec.position[key],`${name} ${part} proxy min${axis}`).toBeCloseTo(proxy.position[key]-proxy.size[key]/2,3);
        expect(bounds!.max[axis]!+spec.position[key],`${name} ${part} proxy max${axis}`).toBeCloseTo(proxy.position[key]+proxy.size[key]/2,3);
      }
    }
    const left=facts.parts['forecourt-span.left-abutment']!,right=facts.parts['forecourt-span.right-abutment']!;
    for(const z of [span.abutmentBack,span.abutmentFront]){
      const centerX=185+35/55*(z+550);
      expect((centerX-(left.max[0]!+spec.position.x))*normalX,`${name} west full-depth opening`).toBeGreaterThanOrEqual(span.protectedWidth/2);
      expect(((right.min[0]!+spec.position.x)-centerX)*normalX,`${name} east full-depth opening`).toBeGreaterThanOrEqual(span.protectedWidth/2);
    }
    root.position.set(spec.position.x,spec.position.y,spec.position.z);root.updateMatrixWorld(true);
    for(const x of [145,span.left+.10,(span.left+span.right)/2,span.right-.10,173]){
      const underside=new Raycaster(new Vector3(x,49,-585),new Vector3(0,1,0),0,1.5).intersectObject(root,true)[0];
      const top=new Raycaster(new Vector3(x,50.4,-585),new Vector3(0,-1,0),0,1.5).intersectObject(root,true)[0];
      expect(underside,`${name} true stone soffit ${x}`).toBeTruthy();expect(top,`${name} full deck top ${x}`).toBeTruthy();
      expect(underside!.point.y).toBeGreaterThanOrEqual(span.minSoffit-.001);expect(underside!.point.y).toBeLessThanOrEqual(span.crownSoffit+.001);
      expect(top!.point.y).toBeCloseTo(span.top,3);
    }
    const center=(span.left+span.right)/2;
    for(const [z,direction] of [[-581,-1],[-589,1]]){
      expect(new Raycaster(new Vector3(center,49.65,z!),new Vector3(0,0,direction!),0,7).intersectObject(root,true),`${name} actual arch void from${z}`).toHaveLength(0);
      expect(new Raycaster(new Vector3(center,49.9,z!),new Vector3(0,0,direction!),0,7).intersectObject(root,true).length,`${name} closed vault face from${z}`).toBeGreaterThan(0);
    }
  }
  await RAPIER.init();const ground=new RAPIER.World({x:0,y:0,z:0});
  try{
    for(const source of [...blueprint.terrain,...cityRoadSurfaces(blueprint.roads)])ground.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(source.vertices),new Uint32Array(source.indices)));
    ground.step();
    for(const anchor of span.anchors)for(const dx of [-.35,.35])for(const dz of [-.10,.10]){
      const hit=ground.castRay(new RAPIER.Ray({x:anchor.x+dx,y:44.12,z:anchor.z+dz},{x:0,y:-1,z:0}),.25,true);
      expect(hit,`actual44m foundation bearing ${JSON.stringify({anchor,dx,dz})}`).toBeTruthy();expect(44.12-hit!.timeOfImpact).toBeCloseTo(span.base,3);
    }
  }finally{ground.free();}
});

test('actual closed return apron matches shared collision faces and bears on the unchanged incline in both asset levels',async()=>{
  const apron=CITADEL_RETURN_APRON,points=Array.from({length:6},(_,i)=>new Vector3(...apron.vertices.slice(i*3,i*3+3) as [number,number,number]));
  const report=JSON.parse(await readFile('assets/source/citadel-hero.report.json','utf8'));
  expect(report.collisionSurfaces).toEqual([apron]);
  expect(report.triangleBudgetHistory.find((b:{stage:string})=>b.stage==='return-apron')).toMatchObject({previous:10000,current:10004});
  expect(report.residentTriangleCeiling).toMatchObject({previous:10004,current:11250});
  expect(spec.roofEnvelopes).toHaveLength(15);
  const expectedFaces=Array.from({length:8},(_,i)=>apron.indices.slice(i*3,i*3+3).sort((a,b)=>a-b).join(',')).sort();
  const expectedBounds=new Box3().setFromPoints(points),keyFor=(a:number,b:number)=>[a,b].sort((x,y)=>x-y).join(',');
  // The fitted toe ends before the transverse vault, including capsule radius.
  expect(expectedBounds.max.z+PLAYER.radius).toBeLessThan(CITADEL_FORECOURT_SPAN.back-1.19);
  await RAPIER.init();const collision=new RAPIER.World({x:0,y:0,z:0}),original=new RAPIER.World({x:0,y:0,z:0});
  try{
    collision.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(apron.vertices),new Uint32Array(apron.indices)));
    for(const s of cityRoadSurfaces(blueprint.roads.filter(r=>r.id==='citadel-ascent')))
      original.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));
    collision.step();original.step();
    for(const name of ['citadel-hero','citadel-skyline']){
      const {root}=await asset(name),facts=name==='citadel-hero'?inspectCitadelHero(root):inspectCitadelSkyline(root);
      expect(facts.parts['forecourt-return.apron']).toEqual({min:expectedBounds.min.clone().sub(new Vector3(spec.position.x,spec.position.y,spec.position.z)).toArray(),
        max:expectedBounds.max.clone().sub(new Vector3(spec.position.x,spec.position.y,spec.position.z)).toArray()});
      root.position.set(spec.position.x,spec.position.y,spec.position.z);root.updateMatrixWorld(true);
      const actualFaces:number[][]=[];
      root.traverse(o=>{
        if(!(o instanceof Mesh)||(o.userData.parts as string[]).includes('forecourt-return.apron')===false)return;
        const positions=o.geometry.getAttribute('position'),index=o.geometry.index;
        for(let f=0;f<(index?.count??positions.count);f+=3){
          const mapped=Array.from({length:3},(_,j)=>{
            const p=new Vector3().fromBufferAttribute(positions,index?index.getX(f+j):f+j).applyMatrix4(o.matrixWorld);
            return points.findIndex(expected=>p.distanceTo(expected)<.0001);
          });
          if(mapped.every(i=>i>=0))actualFaces.push(mapped);
        }
      });
      expect(actualFaces.map(f=>[...f].sort((a,b)=>a-b).join(',')).sort(),`${name} eight actual structural faces`).toEqual(expectedFaces);
      const edges=new Map<string,number>();
      for(const face of actualFaces)for(let j=0;j<3;j++){const key=keyFor(face[j]!,face[(j+1)%3]!);edges.set(key,(edges.get(key)??0)+1);}
      expect([...edges.values()],`${name} closed manifold`).toEqual(Array(edges.size).fill(2));
      for(let f=0;f<2;f++){
        const triangle=apron.indices.slice(f*3,f*3+3).map(i=>points[i]!),p=triangle.reduce((v,q)=>v.add(q),new Vector3()).multiplyScalar(1/3);
        const normal=triangle[1]!.clone().sub(triangle[0]!).cross(triangle[2]!.clone().sub(triangle[0]!)).normalize();
        expect(Math.acos(normal.y)*180/Math.PI,`${name} supported fitted top slope`).toBeLessThan(32);
        const hit=new Raycaster(p.clone().add(new Vector3(0,.1,0)),new Vector3(0,-1,0),0,.2).intersectObject(root,true)[0];
        expect(hit,`${name} true apron top`).toBeTruthy();expect(hit!.point.y).toBeCloseTo(p.y,4);
        const proxy=collision.castRay(new RAPIER.Ray({x:p.x,y:p.y+.1,z:p.z},{x:0,y:-1,z:0}),.2,true);
        expect(proxy,`${name} collision top`).toBeTruthy();expect(p.y+.1-proxy!.timeOfImpact).toBeCloseTo(hit!.point.y,4);
      }
      for(let f=2;f<4;f++){
        const triangle=apron.indices.slice(f*3,f*3+3).map(i=>points[i]!),samples=[...triangle,triangle.reduce((v,q)=>v.add(q),new Vector3()).multiplyScalar(1/3)];
        for(const p of samples){
          const hit=original.castRay(new RAPIER.Ray({x:p.x,y:p.y+.03,z:p.z},{x:0,y:-1,z:0}),.06,true);
          expect(hit,`${name} base bearing ${p.toArray()}`).toBeTruthy();expect(p.y+.03-hit!.timeOfImpact).toBeCloseTo(p.y,4);
        }
      }
    }
  }finally{collision.free();original.free();}
});

for(const mode of ['third-person','first-person'] as const)test(`citadel return apron supports continuous native-like ascent and descent in ${mode}`,async()=>{
  const results=[];
  for(const steerFrames of [5,6])for(const leg of ['ascent','descent'] as const){
    const start=leg==='descent'?{x:150.2655792236328,y:50.01551818847656,z:-604.7804565429688}:{x:185,y:40.04,z:-550};
    const target=leg==='descent'?{x:185,y:40,z:-550}:{x:150,y:50,z:-605};
    const physics=await createPhysics({...course,spawn:start}),state=stateFor(mode);state.player.position={...start};
    const rig=createCameraRig(state,physics,blueprint),architecture=(await asset()).root;
    architecture.position.set(spec.position.x,spec.position.y,spec.position.z);architecture.updateMatrixWorld(true);
    let airborne=0,frames=0,crestSamples=0,headSamples=0,maxStep=0,running=true;
    try{
      for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      for(;frames<3600;frames++){
        const before={...state.player.position},distance=Math.hypot(before.x-target.x,before.z-target.z);
        if(distance<.55)break;if(distance<1.8)running=false;
        if(frames%steerFrames===0)state.camera.yaw=Math.atan2(before.x-target.x,before.z-target.z);
        physics.step(state,{...IDLE_INPUT,forward:1,run:running},FIXED_DT);
        const p=state.player.position;airborne+=Number(!state.player.grounded);
        maxStep=Math.max(maxStep,Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z));
        const diagonalDistance=(25*(p.z+605)-20*(p.x-150))/Math.hypot(25,20);
        if(diagonalDistance>2.45&&diagonalDistance<3.3)crestSamples++;
        if(p.y<48&&p.z>CITADEL_FORECOURT_SPAN.back+.04&&p.z<CITADEL_FORECOURT_SPAN.front-.04){
          const hit=new Raycaster(new Vector3(p.x,p.y+PLAYER.height,p.z),new Vector3(0,1,0),0,2.5).intersectObject(architecture,true)[0];
          expect(hit,`${leg} true vault headroom`).toBeTruthy();expect(hit!.distance).toBeGreaterThan(.65);headSamples++;
        }
        if(frames%steerFrames===0){rig.update(steerFrames*FIXED_DT,1.6);expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);}
      }
      const p=state.player.position,u=((p.x-150)*35+(p.z+605)*55)/(35*35+55*55);
      const expectedFloor=leg==='ascent'?50:50-10*u;
      results.push({mode,leg,steerFrames,frames,airborne,crestSamples,headSamples,maxStep,arrival:{...p},resets:state.resets});
      expect(frames).toBeLessThan(3600);expect(airborne,`${leg}/${steerFrames}`).toBe(0);expect(state.resets).toBe(0);
      expect(p.y).toBeCloseTo(expectedFloor+.015,2);expect(crestSamples).toBeGreaterThan(4);expect(headSamples).toBeGreaterThan(4);expect(maxStep).toBeLessThan(.13);
    }finally{physics.dispose();}
  }
  await test.info().attach('citadel-native-like-apron-support',{contentType:'application/json',body:Buffer.from(JSON.stringify({mode,results}))});
});

for(const mode of ['third-person','first-person'] as const)test(`citadel ascent, open gate and ceremonial court traverse with real controller input in ${mode}`,async()=>{
  const physics=await createPhysics(course),state=stateFor(mode),rig=createCameraRig(state,physics,blueprint);
  const architecture=(await asset()).root;architecture.position.set(spec.position.x,spec.position.y,spec.position.z);architecture.updateMatrixWorld(true);
  for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
  let maxStep=0,headClearSamples=0;const span=CITADEL_FORECOURT_SPAN;
  try{
    for(const target of CITADEL_ROUTE.slice(1)){
      for(let i=0;i<2400;i++){
        const previous={...state.player.position},dx=target.x-previous.x,dz=target.z-previous.z,distance=Math.hypot(dx,dz);
        if(distance<.04&&Math.hypot(state.player.velocity.x,state.player.velocity.z)<.08)break;
        state.camera.yaw=Math.atan2(-dx,-dz);
        physics.step(state,{...IDLE_INPUT,forward:distance<.6?Math.min(1,distance*2):1,run:distance>1.4},FIXED_DT);
        maxStep=Math.max(maxStep,Math.hypot(state.player.position.x-previous.x,state.player.position.y-previous.y,state.player.position.z-previous.z));
        const p=state.player.position;
        if(i%12===0&&p.y<48&&p.z>span.back+.04&&p.z<span.front-.04){
          expect(state.player.grounded,`${mode} transverse span support`).toBe(true);
          const head=p.y+PLAYER.height;
          expect(span.minSoffit-head,`${mode} conservative head clearance`).toBeGreaterThan(.65);
          const hit=new Raycaster(new Vector3(p.x,head,p.z),new Vector3(0,1,0),0,2.5).intersectObject(architecture,true)[0];
          expect(hit,`${mode} actual overhead stone`).toBeTruthy();expect(hit!.point.y).toBeGreaterThanOrEqual(span.minSoffit-.001);
          expect(hit!.distance,`${mode} actual head clearance`).toBeGreaterThan(.65);headClearSamples++;
        }
        if(i%12===0){rig.update(12*FIXED_DT,1.6);expect(rig.camera.position.toArray().every(Number.isFinite)).toBe(true);}
      }
      for(let i=0;i<24;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(Math.hypot(state.player.position.x-target.x,state.player.position.z-target.z),JSON.stringify(target)).toBeLessThan(.16);
      expect(state.player.position.y).toBeCloseTo(target.y+.015,1);expect(state.player.grounded).toBe(true);
    }
    expect(state.resets).toBe(0);expect(maxStep).toBeLessThan(.42);expect(headClearSamples).toBeGreaterThan(3);
  }finally{physics.dispose();}
});

test('inspection bookmarks and real arcade shelter positions have supported ground outside solid buildings',async()=>{
  const physics=await createPhysics(course),state=stateFor('third-person');
  try{
    const positions:Vec3[]=[...Object.values(spec.course.bookmarks).map(b=>b.position),...Object.values(CITADEL_SHELTERS)];
    for(const p of positions){
      physics.reset(state,{...p,y:p.y+.03});for(let i=0;i<30;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      expect(Math.abs(state.player.position.y-p.y),JSON.stringify(p)).toBeLessThan(.12);
      expect(state.player.grounded,JSON.stringify(p)).toBe(true);
      expect(Math.hypot(state.player.position.x-p.x,state.player.position.z-p.z),JSON.stringify(p)).toBeLessThan(.13);
    }
  }finally{physics.dispose();}
});

function lease(references:ResourceReferences,cache:PreparationCache){
  const owned=new Map<DisposableResource,()=>void>();
  const scope:PreparationResources={cache,own(resource){if(!owned.has(resource))owned.set(resource,references.acquire([resource]));return resource;},
    release(resource){owned.get(resource)?.();owned.delete(resource);}};
  return {scope,dispose(){for(const release of owned.values())release();owned.clear();}};
}

test('citadel preparation cancellation releases partial instance ownership and warm reuse stays bounded',async()=>{
  // Native GPU work and pigment canvas are deliberately outside this ownership test.
  // The real raw imported template is pre-admitted to the exact finite cache path.
  const {root}=await asset(),references=new ResourceReferences(),cache=new PreparationCache(references);
  cache.retain('glb.citadel.hero',root,glbSceneResources(root));
  // Existing flags map is prewarmed as it is on an ordinary upper-ward approach;
  // pigment canvas/native GPU rendering remain outside this ownership unit test.
  const flags=new Texture();cache.retain('urban.paving.flags.512',flags,[flags]);
  const baseline=references.snapshot(),aborted=new AbortController(),partial=lease(references,cache);
  let work=0;
  const scheduler=new PreparationScheduler(aborted.signal,{nextFrame:async()=>{},onWork(){if(++work===8)aborted.abort();}});
  try{
    await expect(createCitadelPresentation(spec,aborted.signal,scheduler,partial.scope,new Group())).rejects.toMatchObject({name:'AbortError'});
    partial.dispose();expect(references.snapshot()).toEqual(baseline);expect(cache.snapshot().instanceReferences).toBe(0);
    for(let circuit=0;circuit<3;circuit++){
      const scope=lease(references,cache),signal=new AbortController().signal,target=new Group();
      const presentation=await createCitadelPresentation(spec,signal,new PreparationScheduler(signal,{nextFrame:async()=>{}}),scope.scope,target);
      expect(presentation.facts.meshes).toBe(17);expect(presentation.roofEnvelopes).toHaveLength(spec.roofEnvelopes.length);
      expect(target.children.map(c=>c.name).sort()).toEqual(['citadel.court.flags','citadel.court.inlay','citadel.hero.architecture']);
      scope.dispose();expect(references.snapshot()).toEqual(baseline);
      expect(cache.snapshot().entries).toBe(2);expect(cache.snapshot().instanceReferences).toBe(0);
    }
  }finally{partial.dispose();cache.dispose();}
  expect(references.snapshot().resources).toBe(0);
});

test('actual citadel material batches use only explicit rain roofs and retain authoritative wetness/window materials',async()=>{
  const {root}=await asset(),references=new ResourceReferences(),cache=new PreparationCache(references);
  cache.retain('glb.citadel.hero',root,glbSceneResources(root));
  const flags=new Texture();cache.retain('urban.paving.flags.512',flags,[flags]);
  const scope=lease(references,cache),signal=new AbortController().signal,target=new Group(),scene=new Scene();
  const sun=new DirectionalLight(),fill=new HemisphereLight();scene.add(sun,fill);
  const environment=createEnvironmentPresentation(scene,sun,fill,course,[],blueprint);
  try{
    const citadel=await createCitadelPresentation(spec,signal,new PreparationScheduler(signal,{nextFrame:async()=>{}}),scope.scope,target);
    const meshes:Mesh[]=[];target.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
    expect(meshes).toHaveLength(19);
    expect(meshes.every(o=>o.name.startsWith('citadel.hero.')||o.name.startsWith('citadel.court.'))).toBe(true);
    const materials=new Map(meshes.map(o=>[o,o.material]));
    environment.attachArea('citadel',target,spec.roofEnvelopes);environment.areaActive('citadel',true);
    expect(environment.stats().roofEnvelopes).toEqual(spec.roofEnvelopes);
    expect(environment.stats().surfaceMaterials).toBe(0);
    for(const mesh of meshes)expect(mesh.material).toBe(materials.get(mesh));
    const window=meshes.map(o=>o.material).find(m=>m instanceof MeshStandardMaterial&&m.name==='window_warm') as MeshStandardMaterial;
    const stone=meshes.map(o=>o.material).find(m=>m instanceof MeshStandardMaterial&&m.name==='stone_citadel') as MeshStandardMaterial;
    const paving=meshes.find(o=>o.name==='citadel.court.flags')!.material as MeshStandardMaterial;
    const dryColor=stone.color.clone(),dryRoughness=stone.roughness,dryPaving=paving.roughness;
    const state=createEnvironment();citadel.updateEnvironment(state);expect(window.emissiveIntensity).toBe(0);
    setEnvironment(state,'rain','night',true);citadel.updateEnvironment(state);
    const wetColor=stone.color.clone(),wetRoughness=stone.roughness,nightEmission=window.emissiveIntensity;
    expect(wetColor.r).toBeLessThan(dryColor.r);expect(wetRoughness).toBeLessThan(dryRoughness);
    expect(paving.roughness).toBeLessThan(dryPaving);expect(nightEmission).toBeGreaterThan(1);
    environment.update(state,{x:150,y:50,z:-605},false);
    expect(stone.color).toEqual(wetColor);expect(stone.roughness).toBe(wetRoughness);expect(window.emissiveIntensity).toBe(nightEmission);
    expect(environment.stats().roofEnvelopes).toEqual(spec.roofEnvelopes);expect(environment.stats().surfaceMaterials).toBe(0);
    const rain=scene.getObjectByName('living.rain') as LineSegments,positions=rain.geometry.getAttribute('position');
    let lowOpenCourtSamples=0;
    for(let i=0;i<environment.stats().rainDrops*2;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
      if(!spec.roofEnvelopes.some(r=>x>=r.min[0]!&&x<=r.max[0]!&&z>=r.min[2]!&&z<=r.max[2]!)&&y<65)lowOpenCourtSamples++;
    }
    expect(lowOpenCourtSamples).toBeGreaterThan(20);
    environment.detachArea('citadel');expect(environment.stats().roofEnvelopes).toEqual([]);
    for(const mesh of meshes)expect(mesh.material).toBe(materials.get(mesh));
  }finally{environment.dispose();scope.dispose();cache.dispose();}
  expect(references.snapshot().resources).toBe(0);
});

test('court paving conforms to accepted ground/ramp triangles without additional collision surfaces',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0});
  try{
    const sources=[...blueprint.terrain,...cityRoadSurfaces(blueprint.roads)];
    for(const s of sources)world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(s.vertices),new Uint32Array(s.indices)));
    world.step();expect(spec.course.surfaces).toEqual([CITADEL_RETURN_APRON]);
    expect(spec.paving!.length).toBeGreaterThan(15);let samples=0,gradedSamples=0;
    for(const surface of spec.paving!){
      for(let f=0;f<surface.indices.length;f+=3){
        const points=surface.indices.slice(f,f+3).map(i=>({x:surface.vertices[i*3]!,y:surface.vertices[i*3+1]!,z:surface.vertices[i*3+2]!}));
        const [a,b,c]=points.map(p=>({x:Math.fround(p.x),z:Math.fround(p.z)}));
        const cross=Math.abs((b!.x-a!.x)*(c!.z-a!.z)-(b!.z-a!.z)*(c!.x-a!.x));
        const longest=Math.max(Math.hypot(b!.x-a!.x,b!.z-a!.z),Math.hypot(c!.x-a!.x,c!.z-a!.z),Math.hypot(c!.x-b!.x,c!.z-b!.z));
        expect(cross,surface.id).toBeGreaterThanOrEqual(1e-5);expect(cross/longest,surface.id).toBeGreaterThanOrEqual(.0003);
        const p={x:points.reduce((n,p)=>n+p.x,0)/3,y:points.reduce((n,p)=>n+p.y,0)/3,z:points.reduce((n,p)=>n+p.z,0)/3};
        // Accepted ramps/forecourt can overhang the lower gate terrace. Probe
        // this patch's local support instead of an unrelated higher surface.
        const origin=p.y+.12;
        const hit=world.castRay(new RAPIER.Ray({x:p.x,y:origin,z:p.z},{x:0,y:-1,z:0}),.25,true);
        expect(hit,`${surface.id} face ${f/3}: ${JSON.stringify({p,points})}`).toBeTruthy();const height=origin-hit!.timeOfImpact;
        expect(p.y-height,surface.id).toBeGreaterThan(.02);expect(p.y-height,surface.id).toBeLessThan(.061);
        samples++;gradedSamples+=Number(height>44.1&&height<49.9);
      }
    }
    expect(samples).toBeGreaterThan(100);expect(gradedSamples).toBeGreaterThan(0);
    console.log(JSON.stringify({citadelPavingPatches:spec.paving!.length,citadelPavingTriangles:samples,gradedSamples}));
  }finally{world.free();}
});

test('all citadel inspection views have clear capsule/eye space and frame actual all-side architecture',async()=>{
  const {root}=await asset();root.position.set(spec.position.x,spec.position.y,spec.position.z);root.updateMatrixWorld(true);
  const physics=await createPhysics(course),state=stateFor('first-person'),rig=createCameraRig(state,physics,blueprint);
  try{
    for(const [name,view] of Object.entries(spec.course.bookmarks)){
      physics.reset(state,view.position);for(let i=0;i<30;i++)physics.step(state,IDLE_INPUT,FIXED_DT);
      state.camera.yaw=view.yaw;state.camera.pitch=view.pitch;rig.update(0,1.6);
      const distances:number[]=[];
      for(const u of [-.72,-.36,0,.36,.72])for(const v of [-.35,0,.35]){
        const ray=new Raycaster();ray.setFromCamera(new Vector2(u,v),rig.camera);
        const hit=ray.intersectObject(root,true)[0];if(hit)distances.push(hit.distance);
      }
      expect(distances.length,`${name} actual hero framing`).toBeGreaterThanOrEqual(2);
      expect(Math.min(...distances),`${name} near architectural occlusion`).toBeGreaterThan(1.8);
      expect(Math.min(...distances),`${name} architecture too distant`).toBeLessThan(100);
      rig.setMode('third-person');rig.update(0,1.6);
      expect(rig.camera.position.distanceTo(new Vector3(state.player.position.x,state.player.position.y+1.43,state.player.position.z)),`${name} camera obstruction`).toBeGreaterThan(.5);
      rig.setMode('first-person');
    }
  }finally{physics.dispose();}
});

test('resident skyline is primary hero architecture with the same bounds and six small full-sided batches',async()=>{
  const {root,bytes}=await asset('citadel-skyline'),facts=inspectCitadelSkyline(root),hero=inspectCitadelHero((await asset()).root);
  const report=JSON.parse(await readFile('assets/source/citadel-hero.report.json','utf8')).assets.find((a:{id:string})=>a.id==='citadel.skyline');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(report.sha256);
  expect(facts.triangles).toBe(report.triangles);expect(facts.triangles).toBeLessThanOrEqual(CITADEL_SKYLINE_TRIANGLE_LIMIT);
  // Measured additive pavilion is607,484 bytes; the parent authorized610,000
  // from600,000 without changing cadence/readiness or material/cache gates.
  expect(facts.meshes).toBe(6);expect(facts.materials).toHaveLength(6);expect(bytes.length).toBeLessThanOrEqual(610_000);
  for(let i=0;i<3;i++){expect(facts.min[i]).toBeCloseTo(hero.min[i]!,3);expect(facts.max[i]).toBeCloseTo(hero.max[i]!,3);}
  for(const part of ['watch-tower.drum','watch-tower.cap','east-beacon.cap','east-front-tower.cap','great-keep.roof','outer-gate.vault'])
    expect(facts.parts[part],part).toEqual(hero.parts[part]);
  const keepMeshes:Mesh[]=[];root.traverse(o=>{if(o instanceof Mesh&&(o.userData.parts as string[]).includes('great-keep.walls'))keepMeshes.push(o);});
  for(const [x,z,dx,dz] of [[35,20,0,-1],[35,-90,0,1],[85,-33,-1,0],[-20,-33,1,0]]){
    expect(new Raycaster(new Vector3(x!,10,z!),new Vector3(dx!,0,dz!)).intersectObjects(keepMeshes,true).length).toBeGreaterThan(0);
  }
  root.traverse(o=>{if(o instanceof Mesh)expect((o.material as {map:unknown}).map).toBe(null);});
});

test('skyline cold-load, cancellation and three resident leases keep immutable ownership bounded',async()=>{
  const {bytes}=await asset('citadel-skyline'),originalFetch=globalThis.fetch;
  const references=new ResourceReferences(),cache=new PreparationCache(references);
  let fetches=0;
  globalThis.fetch=async()=>{fetches++;return new Response(bytes);};
  try{
    const initial=lease(references,cache),signal=new AbortController().signal;
    const loaded=await loadCitadelSkyline(signal,new PreparationScheduler(signal,{nextFrame:async()=>{}}),initial.scope);
    expect(loaded.facts.id).toBe('citadel.skyline');expect(fetches).toBe(1);initial.dispose();
    const baseline=references.snapshot();expect(cache.snapshot().entries).toBe(1);expect(cache.snapshot().instanceReferences).toBe(0);
    const aborted=new AbortController(),partial=lease(references,cache);let work=0;
    try{
      await expect(loadCitadelSkyline(aborted.signal,new PreparationScheduler(aborted.signal,{nextFrame:async()=>{},
        onWork(){if(++work===4)aborted.abort();}}),partial.scope)).rejects.toMatchObject({name:'AbortError'});
    }finally{partial.dispose();}
    expect(references.snapshot()).toEqual(baseline);
    for(let i=0;i<3;i++){
      const scope=lease(references,cache),signal=new AbortController().signal;
      const loaded=await loadCitadelSkyline(signal,new PreparationScheduler(signal,{nextFrame:async()=>{}}),scope.scope);
      expect(loaded.facts.meshes).toBe(6);scope.dispose();expect(references.snapshot()).toEqual(baseline);
    }
    expect(fetches).toBe(1);expect(cache.snapshot().entries).toBe(1);expect(cache.snapshot().instanceReferences).toBe(0);
  }finally{globalThis.fetch=originalFetch;cache.dispose();}
  expect(references.snapshot().resources).toBe(0);
});
