import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { loadCitadelHero } from '../assets/citadel';
import type { CitadelSpec } from '../simulation/citadel-contracts';
import type { EnvironmentState } from '../simulation/environment';
import type { PreparationResources } from './preparation-cache';
import type { PreparationScheduler } from './preparation-scheduler';
import { urbanPavingTexture } from './urban-paving';

/** Detail has the same staged immutable-cache and lease lifetime as the M8 wards. */
export async function createCitadelPresentation(spec:CitadelSpec,signal:AbortSignal,scheduler:PreparationScheduler,
  scope:PreparationResources,target:Group){
  const loaded=await loadCitadelHero(signal,scheduler,scope);
  loaded.root.position.set(spec.position.x,spec.position.y,spec.position.z);
  loaded.root.name='citadel.hero.architecture';
  const materials=new Map<MeshStandardMaterial,{color:Color;roughness:number}>();
  await scheduler.run('citadel.architecture',(function*(){
    for(const child of loaded.root.children){
      if(child instanceof Mesh){
        child.name=`citadel.hero.${child.name}`;
        child.castShadow=true;child.receiveShadow=true;
        if(child.material instanceof MeshStandardMaterial)materials.set(child.material,{color:child.material.color.clone(),roughness:child.material.roughness});
      }
      yield 'citadel.material-batch';
    }
    target.add(loaded.root);
    yield 'citadel.attach-detail';
  })());
  await scheduler.run('citadel.court-paving',(function*(){
    if(!spec.paving?.length)return;
    const pigment=yield* urbanPavingTexture('flags',scope);
    for(const family of ['flags','inlay'] as const){
      const selected=spec.paving.filter(s=>family==='flags'?s.id.includes('.flags.'):!s.id.includes('.flags.'));
      if(!selected.length)continue;
      const vertices:number[]=[],indices:number[]=[],colors:number[]=[],uv:number[]=[];
      for(const source of selected){
        const offset=vertices.length/3,tint=new Color(source.color);
        for(let i=0;i<source.vertices.length;i+=3){
          const x=source.vertices[i]!,y=source.vertices[i+1]!,z=source.vertices[i+2]!;
          vertices.push(x,y,z);colors.push(tint.r,tint.g,tint.b);uv.push(x/5,z/5);
        }
        indices.push(...source.indices.map(i=>i+offset));yield 'citadel.fitted-court-patch';
      }
      const geometry=scope.own(new BufferGeometry());geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
      geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const material=scope.own(new MeshStandardMaterial({map:family==='flags'?pigment:null,vertexColors:true,roughness:.94}));
      material.name=`citadel.court.${family}`;materials.set(material,{color:material.color.clone(),roughness:material.roughness});
      const mesh=new Mesh(geometry,material);mesh.name=`citadel.court.${family}`;mesh.receiveShadow=true;target.add(mesh);
      yield 'citadel.court-paving-batch';
    }
  })());
  function updateEnvironment(environment:EnvironmentState){
    const warmth=Math.max(0,Math.min(1,(1.85-environment.lighting.fillIntensity)/.67));
    for(const [material,source] of materials){
      if(material.name.startsWith('window_')){
        material.emissive.set(0xffb661);material.emissiveIntensity=warmth*(material.name==='window_warm'?1.2:.28);
      }else{
        material.color.copy(source.color).multiplyScalar(1-environment.wetness*.085);
        material.roughness=Math.max(.34,source.roughness-environment.wetness*.17);
      }
    }
  }
  const facts={...loaded.facts,loadedAssets:[loaded.facts],roofEnvelopes:spec.roofEnvelopes,
    districtId:'citadel',residentLocalLightAnchors:4,collisionBoxes:spec.course.boxes.filter(b=>b.collides).length,
    principalTowers:6,courtyardWings:3,gateClearWidth:11.2,assumptions:spec.assumptions};
  Object.assign(facts,{courtPavingPatches:spec.paving?.length??0,courtPavingTriangles:spec.paving?.reduce((n,s)=>n+s.indices.length/3,0)??0});
  target.userData.citadel=facts;
  return {group:target,facts,roofEnvelopes:spec.roofEnvelopes,updateEnvironment,update(_time:number,_wind?:number,_rain?:number){}};
}
