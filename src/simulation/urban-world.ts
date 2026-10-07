import { createCentralMarket } from './central-market';
import { createLowerCanal } from './lower-canal';
import { cityRoadSurfaces } from './city-blueprint';
import { cityRetainingSurface } from './city-terrain';
import type { CityBlueprint } from './city-contracts';
import type { UrbanDistrict } from './urban-contracts';
import type { BoxSpec, CourseSpec } from './types';
import { createCoreDistricts } from './city-core-districts';
import { urbanNamespace } from './urban-grammar';
import { createUpperCityDistricts } from './upper-city';

export function createUrbanDistricts(blueprint:CityBlueprint,core=false,upper=false):UrbanDistrict[]{
  const roads=cityRoadSurfaces(blueprint.roads),retaining=cityRetainingSurface(blueprint.terrain,roads);
  return [createCentralMarket(blueprint),createLowerCanal(blueprint),...(core?createCoreDistricts(blueprint):[]),...(upper?createUpperCityDistricts(blueprint):[])].map(district=>({
    ...district,pavingSurfaces:[...blueprint.terrain.filter(s=>district.id!=='garden-terrace'&&s.id.startsWith(`city.terrain.${district.id}`)),
      ...cityRoadSurfaces(blueprint.roads.filter(r=>r.districts.includes(district.id))),...district.surfaces],
    retainingSurfaces:(()=>{
      const polygon=blueprint.districts.find(d=>d.id===district.id)!.footprint;
      const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z));
      const surface={...retaining,id:`${urbanNamespace(district.id)}.${district.id}.retaining-veneer`,vertices:[] as number[],indices:[] as number[]};
      for(let i=0;i<retaining.indices.length;i+=3){
        const points=retaining.indices.slice(i,i+3).map(n=>retaining.vertices.slice(n*3,n*3+3));
        const x=points.reduce((s,p)=>s+p[0]!,0)/3,z=points.reduce((s,p)=>s+p[2]!,0)/3;
        if(x<minX-.1||x>maxX+.1||z<minZ-.1||z>maxZ+.1)continue;
        const offset=surface.vertices.length/3;surface.vertices.push(...points.flat());surface.indices.push(offset,offset+1,offset+2);
      }return [surface];
    })(),
  }));
}
export function urbanEntrances(district:UrbanDistrict){return district.buildings.flatMap(b=>{
const front={
  id:`${b.id}.entrance`,buildingId:b.id,closed:true,
  position:{x:b.position.x+Math.sin(b.yaw)*(b.depth/2+1),y:b.position.y,z:b.position.z+Math.cos(b.yaw)*(b.depth/2+1)},
  yaw:b.yaw,name:b.id.split('.').at(-1)!.replaceAll('-',' '),
  text:b.hero?'This guild keeps the district’s measures and work. The door is closed today; its covered frontage belongs to the street.':
    b.archetype==='workshop'?'Tools and stock wait inside. The workshop door is closed; the working apron joins the public lane.':'A tended doorway shared by the household and its street. The door is closed today.',
};
if(b.rearEntrance===false || (b.archetype!=='workshop'&&b.archetype!=='canal'))return [front];
const x=-b.width*.28,z=-b.depth/2-1;
return [front,{...front,id:`${b.id}.rear-entrance`,yaw:b.yaw+Math.PI,
  position:{x:b.position.x+Math.cos(b.yaw)*x+Math.sin(b.yaw)*z,y:b.position.y,z:b.position.z-Math.sin(b.yaw)*x+Math.cos(b.yaw)*z}}];
});}
export function urbanCourse(district:UrbanDistrict,seed:number):CourseSpec{
  const namespace=urbanNamespace(district.id);
  const boxes:BoxSpec[]=[];
  boxes.push(...district.structures??[]);
  for(const b of district.buildings){
    const height=b.floors*b.floorHeight;
    boxes.push({id:`${b.id}.collider`,position:{...b.position,y:b.position.y+height/2},size:{x:b.width,y:height,z:b.depth},
      rotationY:b.yaw,color:b.plaster,visible:false,collides:true});
    for(const sign of b.rearEntrance!==false&&(b.archetype==='workshop'||b.archetype==='canal')?[1,-1]:[1]){
      const lx=sign===-1?-b.width*.28:0,lz=sign*b.depth/2;
      boxes.push({id:`${b.id}.threshold.${sign}`,position:{x:b.position.x+Math.cos(b.yaw)*lx+Math.sin(b.yaw)*(lz+sign*.22),
        y:b.position.y+.09,z:b.position.z-Math.sin(b.yaw)*lx+Math.cos(b.yaw)*(lz+sign*.22)},
        size:{x:1.45,y:.18,z:.65},rotationY:b.yaw,color:b.plaster,visible:false,collides:true});
    }
    if(b.shopfront==='arcade')for(let bay=0;bay<b.bays;bay++){
      const lx=-b.width*.42+b.width*.84*bay/(b.bays-1),lz=b.depth/2+1.65;
      boxes.push({id:`${b.id}.arcade-post.${bay}`,position:{x:b.position.x+Math.cos(b.yaw)*lx+Math.sin(b.yaw)*lz,y:b.position.y+1.5,
        z:b.position.z-Math.sin(b.yaw)*lx+Math.cos(b.yaw)*lz},size:{x:.27,y:3,z:.27},color:b.plaster,collides:true,visible:false});
    }
  }
  for(const [i,s] of district.stalls.entries())boxes.push({id:`${namespace}.${district.id}.stall.${i}`,position:{x:s.x,y:s.y+.47,z:s.z},
    size:{x:2.62*s.width,y:.94,z:1.52*s.depth},rotationY:s.yaw,color:s.cloth,collides:true,visible:false});
  for(const p of district.dressing)if(p.collider)boxes.push({id:`${p.id}.collider`,position:{...p.position,y:p.position.y+p.collider.y/2},
    size:p.collider,rotationY:p.yaw,color:0x877c62,collides:true,visible:false});
  for(const [i,[x,y,z]] of district.lamps.entries())boxes.push({id:`${namespace}.${district.id}.lamp.${i}`,position:{x,y:y-1.3,z},size:{x:.2,y:2.6,z:.2},color:0x635541,collides:true,visible:false});
  for(const g of district.gardens??[])if(g.tree)boxes.push({id:`${g.id}.trunk`,position:{...g.position,y:g.position.y+g.scale*1.55},
    size:{x:g.scale*.66,y:g.scale*3.1,z:g.scale*.66},color:0x635541,collides:true,visible:false});
  return {id:`${namespace}.${district.id}`,seed,bounds:850,spawn:{...district.route[0]!},boxes,surfaces:district.surfaces,labels:[],
    bookmarks:Object.fromEntries(Object.entries(district.views).map(([id,v])=>[`${namespace}.${district.id}.${id}`,v]))};
}
