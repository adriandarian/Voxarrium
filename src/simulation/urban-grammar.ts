import type { CityBlueprint } from './city-contracts';
import { cityRoadSurfaces } from './city-blueprint';
import type { ProductionDistrictId, UrbanBuilding, UrbanRecipe } from './urban-contracts';
import type { Vec3 } from './types';

const recipes = {
  'merchant-house': { archetype:'merchant', floors:3, floorHeight:2.85, facade:'paired', roof:'gable', bays:3, corner:'timber', shopfront:'paired', balcony:false, awning:true },
  'exchange-house': { archetype:'merchant', floors:4, floorHeight:3.0, facade:'tall', roof:'mansard', bays:4, corner:'pilaster', shopfront:'wide', balcony:true, awning:true },
  'corner-inn': { archetype:'townhouse', floors:3, floorHeight:3.1, facade:'tall', roof:'hip', bays:3, corner:'stone', shopfront:'single', balcony:true, awning:true },
  hall: { archetype:'civic', floors:3, floorHeight:3.8, facade:'civic', roof:'hip', bays:5, corner:'pilaster', shopfront:'arcade', balcony:false, awning:false },
  'canal-house': { archetype:'canal', floors:2, floorHeight:2.6, facade:'narrow', roof:'gable', bays:2, corner:'timber', shopfront:'single', balcony:true, awning:false },
  'workshop-house': { archetype:'workshop', floors:2, floorHeight:2.8, facade:'trade', roof:'gable', bays:2, corner:'stone', shopfront:'service', balcony:false, awning:true },
  storehouse: { archetype:'workshop', floors:1, floorHeight:3.7, facade:'trade', roof:'hip', bays:3, corner:'stone', shopfront:'service', balcony:false, awning:true },
  'water-guild': { archetype:'civic', floors:2, floorHeight:3.3, facade:'paired', roof:'gable', bays:3, corner:'stone', shopfront:'service', balcony:true, awning:false },
} as const;
export const URBAN_RULES = {
  'central-market': [['merchant-house',6],['exchange-house',4],['corner-inn',2]],
  'lower-canal': [['canal-house',5],['workshop-house',4],['storehouse',2]],
} as const;
export function urbanHash(id:string) { let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619);return hash>>>0; }

/** A stable parcel chooses from a district's coherent recipes. Hero recipes are authored. */
export function urbanBuilding(district:ProductionDistrictId,id:string,x:number,z:number,width:number,depth:number,
  yaw=0,y=district==='central-market'?12:4,recipe?:UrbanRecipe,variant=0):UrbanBuilding {
  const hash=urbanHash(`${district}.${id}`), rules=URBAN_RULES[district];
  let choice=hash%rules.reduce((sum,rule)=>sum+rule[1],0);
  let selected:UrbanRecipe=rules[0][0];
  for(const [name,weight] of rules){if(choice<weight){selected=name;break;}choice-=weight;}
  const name=recipe??selected,r=recipes[name],v=(hash+variant)>>>0;
  const palette=district==='central-market'?[0xe0ceaa,0xd2b892,0xe9dbba,0xcabc9f]:[0xcbbba0,0xd5c9ad,0xbfae91,0xddcfb2];
  const clay=[0xab5937,0x99502f,0xb96b41,0x874733,0x9d6042];
  return {id:`m7.${district}.${id}`,position:{x,y,z},width,depth,yaw,recipe:name,...r,
    floorHeight:r.floorHeight+(v%3-1)*.12,roofHeight:name==='hall'?4.4:name==='water-guild'?3.1:1.9+width*.06,
    plaster:palette[v%palette.length]!,roofColor:v%13===0?0x3b7470:clay[v%clay.length]!,
    roofDirection:(v%3===0?1:0),shutterOffset:v%4,cloth:[0x4b7771,0x955d48,0x8a794d,0x6d765d][v%4]!};
}

export function urbanCorners(b:UrbanBuilding,margin=0):Vec3[] {
  return [-1,1].flatMap(x=>[-1,1].map(z=>({x:b.position.x+Math.cos(b.yaw)*x*(b.width/2+margin)+Math.sin(b.yaw)*z*(b.depth/2+margin),
    y:b.position.y,z:b.position.z-Math.sin(b.yaw)*x*(b.width/2+margin)+Math.cos(b.yaw)*z*(b.depth/2+margin)})));
}
type FloorTriangle=[number[],number[],number[]];
const floorTriangles=new WeakMap<CityBlueprint,Map<string,FloorTriangle[]>>();
export function urbanFloorAt(blueprint:CityBlueprint,x:number,z:number):number|null {
  let cells=floorTriangles.get(blueprint);
  if(!cells){
    cells=new Map();
    for(const source of [...blueprint.terrain,...cityRoadSurfaces(blueprint.roads)])for(let i=0;i<source.indices.length;i+=3){
      const triangle=source.indices.slice(i,i+3).map(n=>source.vertices.slice(n*3,n*3+3)) as FloorTriangle;
      const minX=Math.floor(Math.min(...triangle.map(p=>p[0]!))/16),maxX=Math.floor(Math.max(...triangle.map(p=>p[0]!))/16);
      const minZ=Math.floor(Math.min(...triangle.map(p=>p[2]!))/16),maxZ=Math.floor(Math.max(...triangle.map(p=>p[2]!))/16);
      for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){const key=`${cx}:${cz}`,list=cells.get(key)??[];list.push(triangle);cells.set(key,list);}
    }
    floorTriangles.set(blueprint,cells);
  }
  let highest:number|null=null;
  for(const [a,b,c] of cells.get(`${Math.floor(x/16)}:${Math.floor(z/16)}`)??[]){
    const d=(b[2]!-c[2]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[2]!-c[2]!);if(Math.abs(d)<1e-8)continue;
    const u=((b[2]!-c[2]!)*(x-c[0]!)+(c[0]!-b[0]!)*(z-c[2]!))/d;
    const v=((c[2]!-a[2]!)*(x-c[0]!)+(a[0]!-c[0]!)*(z-c[2]!))/d;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6){const y=u*a[1]!+v*b[1]!+(1-u-v)*c[1]!;highest=Math.max(highest??-Infinity,y);}
  }return highest;
}
export function urbanSegmentDistance(p:Vec3,a:Vec3,b:Vec3) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
/** Full parcel samples stay on one supported level and outside the protected macro lanes. */
export function urbanLotFits(blueprint:CityBlueprint,b:UrbanBuilding,clearance=.7) {
  const points=[b.position,...urbanCorners(b,.25)];
  if(points.some(p=>Math.abs((urbanFloorAt(blueprint,p.x,p.z)??-999)-b.position.y)>.08))return false;
  const local=(p:Vec3)=>({x:Math.cos(b.yaw)*(p.x-b.position.x)-Math.sin(b.yaw)*(p.z-b.position.z),
    y:p.y,z:Math.sin(b.yaw)*(p.x-b.position.x)+Math.cos(b.yaw)*(p.z-b.position.z)});
  for(const road of blueprint.roads)for(let i=1;i<road.points.length;i++){
    const a=local(road.points[i-1]!),c=local(road.points[i]!);
    const radius=road.width/2+clearance;
    for(let n=0;n<=Math.ceil(Math.hypot(c.x-a.x,c.z-a.z));n++){
      const t=n/Math.max(1,Math.ceil(Math.hypot(c.x-a.x,c.z-a.z))),x=a.x+(c.x-a.x)*t,z=a.z+(c.z-a.z)*t;
      if(Math.hypot(Math.max(0,Math.abs(x)-b.width/2),Math.max(0,Math.abs(z)-b.depth/2))<radius)return false;
    }
  }return true;
}
