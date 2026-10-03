import { BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { materialColor, normalWorld, positionWorld, texture, vec2 } from 'three/tsl';
import { loadDistrictKit } from '../assets/district';
import { districtArchitectureJobs } from './district';
import { landscapeMaterialJobs } from './landscape-materials';
import type { PreparationResources } from './preparation-cache';
import type { PreparationScheduler } from './preparation-scheduler';
import type { UrbanDistrict } from '../simulation/urban-contracts';
import type { EnvironmentState } from '../simulation/environment';
import { ecologyRegistrationJobs } from './rural-ecology';
import { urbanPavingTexture } from './urban-paving';
import type { UrbanPavingKind } from './urban-paving';

/** Reuses the accepted GLB kit and M5.1 scheduler/cache/ownership, without another world system. */
export async function createUrbanPresentation(urban:UrbanDistrict,signal:AbortSignal,scheduler:PreparationScheduler,
  scope:PreparationResources,target:Group) {
  const loaded=await loadDistrictKit(signal,scheduler,scope);
  const architecture=await scheduler.run(`urban.${urban.id}.architecture`,districtArchitectureJobs(loaded.root,scope,target,urban));
  const replacements=new Map<MeshStandardMaterial,MeshStandardNodeMaterial>();
  await scheduler.run(`urban.${urban.id}.pigment`,(function*(){
    for(const object of target.children){
      if(!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial))continue;
      const source=object.material;
      if(source.name.startsWith('plaster') && source.map){
        let material=replacements.get(source);
        if(!material){
          material=scope.own(new MeshStandardNodeMaterial().copy(source) as MeshStandardNodeMaterial);
          material.name=source.name;
          const across=positionWorld.x.mul(normalWorld.z.abs()).add(positionWorld.z.mul(normalWorld.x.abs()));
          material.colorNode=texture(source.map,vec2(across.div(4),positionWorld.y.div(4))).mul(materialColor);
          replacements.set(source,material);
        }object.material=material;
      }yield 'urban.material-adaptation';
    }
    for(const source of replacements.keys())scope.release(source);
  })());
  if(urban.gardens?.length)await scheduler.run(`urban.${urban.id}.gardens`,(function*(){
    const library=new Map<string,{geometry:BufferGeometry;shadows:boolean}>();
    yield* ecologyRegistrationJobs((name,geometry,shadows=false)=>library.set(name,{geometry,shadows}),scope);
    const items:{kind:string;x:number;y:number;z:number;scale:number;heading:number}[]=[];
    const vertices:number[]=[],indices:number[]=[],colors:number[]=[];
    for(const [index,g] of urban.gardens!.entries()){
      const offset=vertices.length/3,tint=new Color(0x666b42);
      vertices.push(g.position.x,g.position.y+.055,g.position.z);colors.push(tint.r,tint.g,tint.b);
      for(let n=0;n<=20;n++){
        const angle=n/20*Math.PI*2,r=g.radius*(1+Math.sin(angle*3+index)*.12);
        vertices.push(g.position.x+Math.cos(angle)*r,g.position.y+.055,g.position.z+Math.sin(angle)*r);colors.push(tint.r,tint.g,tint.b);
        if(n)indices.push(offset,offset+n+1,offset+n);
      }
      if(g.tree)items.push({kind:g.tree,x:g.position.x,y:g.position.y,z:g.position.z,scale:g.scale,heading:index*1.61});
      for(let n=0;n<32;n++){
        const angle=n*2.399,indexRadius=Math.sqrt((n+.5)/32)*g.radius*.92;
        items.push({kind:['ecology-clover','fern','short','white','ecology-groundcover'][n%5]!,x:g.position.x+Math.cos(angle)*indexRadius,
          y:g.position.y+.07,z:g.position.z+Math.sin(angle)*indexRadius,scale:.4+(n%4)*.05,heading:angle});
      }yield 'urban.garden-pocket';
    }
    const geometry=scope.own(new BufferGeometry());geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const soil=new Mesh(geometry,scope.own(new MeshStandardMaterial({vertexColors:true,roughness:1})));soil.name=`urban.${urban.id}.garden-soil`;soil.receiveShadow=true;target.add(soil);
    for(const kind of new Set(items.map(i=>i.kind))){
      const source=library.get(kind);if(!source)throw new Error(`Unknown urban garden geometry ${kind}`);
      const instances=items.filter(i=>i.kind===kind),material=scope.own(new MeshStandardMaterial({vertexColors:true,roughness:.97}));
      const mesh=scope.own(new InstancedMesh(source.geometry,material,instances.length));mesh.name=`district.instances.${kind}`;mesh.castShadow=source.shadows;mesh.receiveShadow=true;
      const object=new Object3D();for(const [index,item] of instances.entries()){
        object.position.set(item.x,item.y,item.z);object.scale.setScalar(item.scale);object.rotation.y=item.heading;object.updateMatrix();mesh.setMatrixAt(index,object.matrix);
      }mesh.computeBoundingBox();mesh.computeBoundingSphere();target.add(mesh);yield 'urban.garden-instances';
    }
    for(const [kind,g] of library)if(!items.some(i=>i.kind===kind))scope.release(g.geometry);
  })());
  await scheduler.run(`urban.${urban.id}.paving`,(function*(){
    const palette=yield* landscapeMaterialJobs(scope);
    for(const kind of ['setts','flags','service','timber'] as UrbanPavingKind[]){
    const surfaces=(urban.pavingSurfaces??[]).filter(s=>{
      const type=s.id.includes('cargo-dock')?'timber':s.id.startsWith('city.road.')?'setts':s.id.startsWith('city.terrain.')?'flags':'service';
      return type===kind;
    });
    if(!surfaces.length)continue;
    const paving=yield* urbanPavingTexture(kind,scope);
    const vertices:number[]=[],indices:number[]=[],colors:number[]=[],uv:number[]=[];
    for(const surface of surfaces){
      const offset=vertices.length/3;
      for(let i=0;i<surface.vertices.length;i+=3){
        const x=surface.vertices[i]!,y=surface.vertices[i+1]!,z=surface.vertices[i+2]!;
        vertices.push(x,y+.045,z);uv.push(x/8,z/8);
        const shade=.92+Math.sin(x*.11+z*.16)*.04+Math.cos(z*.09)*.035;
        const road=surface.id.startsWith('city.road.');
        const timber=surface.id.includes('cargo-dock');
        const color=new Color(timber?surface.color:road?0xd3c09c:urban.id==='central-market'?0xb9aa8c:0xa89d83).multiplyScalar(shade);
        colors.push(color.r,color.g,color.b);
      }
      indices.push(...surface.indices.map(i=>i+offset));yield 'urban.paving-surface';
    }
    const geometry=scope.own(new BufferGeometry());geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=scope.own(new MeshStandardNodeMaterial({vertexColors:true,roughness:.93}));
    // Reuse pigment structure as a restrained value wash instead of multiplying
    // the rural olive stone palette into an entire commercial paving field.
    const scale=kind==='flags'?6:kind==='timber'?2.5:5;
    const wash=texture(palette.stone.map!,vec2(positionWorld.x.div(13),positionWorld.z.div(13))).r.mul(.2).add(.8);
    material.colorNode=texture(paving,vec2(positionWorld.x.div(scale),positionWorld.z.div(scale))).mul(wash).mul(materialColor);
    const mesh=new Mesh(geometry,material);mesh.name=`urban.${urban.id}.paving-${kind}`;mesh.receiveShadow=true;target.add(mesh);
    yield 'urban.paving-normals';
    }
    for(const source of urban.retainingSurfaces??[]){
      const geometry=scope.own(new BufferGeometry());geometry.setAttribute('position',new Float32BufferAttribute(source.vertices,3));geometry.setIndex(source.indices);geometry.computeVertexNormals();
      const p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
      for(let i=0;i<p.count;i++){p.setX(i,p.getX(i)+normal.getX(i)*.035);p.setZ(i,p.getZ(i)+normal.getZ(i)*.035);}
      const material=scope.own(new MeshStandardNodeMaterial({color:urban.id==='lower-canal'?0x99947b:0xb0a389,roughness:1}));
      const across=positionWorld.x.mul(normalWorld.z.abs()).add(positionWorld.z.mul(normalWorld.x.abs()));
      const wash=texture(palette.stone.map!,vec2(across.div(5),positionWorld.y.div(5))).r.mul(.25).add(.75);
      material.colorNode=wash.mul(materialColor);
      const mesh=new Mesh(geometry,material);mesh.name=source.id;mesh.receiveShadow=true;target.add(mesh);yield 'urban.retaining-veneer';
    }
    for(const m of Object.values(palette)){if(m.map && m.map!==palette.stone.map)scope.release(m.map);scope.release(m);}
    yield 'urban.paving-normals';
  })());
  const materials=new Map<MeshStandardMaterial|MeshStandardNodeMaterial,{color:Color;roughness:number}>();
  target.traverse(object=>{if(object instanceof Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])
    if(material instanceof MeshStandardMaterial || material instanceof MeshStandardNodeMaterial)
      materials.set(material,{color:material.color.clone(),roughness:material.roughness});});
  function updateEnvironment(environment:EnvironmentState){
    const warmth=Math.max(0,Math.min(1,(1.85-environment.lighting.fillIntensity)/.67));
    for(const [material,source] of materials){
      if(material.name.startsWith('window_')){material.emissive.set(0xffba62);material.emissiveIntensity=warmth*(material.name==='window_warm'?1.2:.32);}
      else {material.color.copy(source.color).multiplyScalar(1-environment.wetness*.09);material.roughness=Math.max(.31,source.roughness-environment.wetness*.16);}
    }
  }
  const facts={...architecture.facts,districtId:urban.id,identity:urban.identity,loadedAssets:[loaded.facts],
    heroIds:urban.buildings.filter(b=>b.hero).map(b=>b.id),gardenPockets:urban.gardens?.length??0,assumptions:urban.assumptions,
    materialTreatment:'Accepted dimensional GLB kit with world-coordinate pigment and coherent recipe palettes.'};
  target.userData.urban=facts;
  return {group:target,facts,updateEnvironment,update(_time:number,_wind?:number,_rain?:number){}};
}
