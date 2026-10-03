import type { DistrictModuleId } from '../assets/district';
import type { CityBlueprint } from './city-contracts';
import { cityRoadSurfaces } from './city-blueprint';
import type { DistrictDressing } from './district-art';
import type { NpcDefinition } from './npcs';
import type { Vec3 } from './types';
import type { UrbanBuilding, UrbanDistrict, UrbanRecipe } from './urban-contracts';
import { urbanBuilding, urbanLotFits, urbanSegmentDistance } from './urban-grammar';

const p = (x: number, z: number, y = 12): Vec3 => ({ x, y, z });
type Parcel = [number, number, number, number];
type Surface = UrbanDistrict['surfaces'][number];

/** Composed street walls, with rear lanes and court-facing frontage rather than an infill grid. */
const blocks: { id: string; z: number; depth: number; yaw: number; lots: [number, number][] }[] = [
  { id: 'south-cloth', z: -176, depth: 13, yaw: Math.PI, lots: [[9,8.2],[21,9.1],[33,9],[47,10.4],[60,9.4],[73,8.6],[85,9.8],[98,8.4],[109,6.4]] },
  { id: 'south-spice', z: -174, depth: 14, yaw: Math.PI, lots: [[133,9.6],[146,10.2],[160,11.5],[175,10.8],[189,10],[202,9.6],[215,8.5]] },
  { id: 'court-north', z: -194, depth: 11, yaw: Math.PI, lots: [[133,10.4],[147,10.5],[160,9.3],[173,10.2],[187,10],[201,10.4],[215,8.6]] },
  { id: 'west-gate', z: -193, depth: 9, yaw: Math.PI, lots: [[9,8.4],[22,9.3]] },
  { id: 'west-court', z: -211, depth: 11, yaw: 0, lots: [[9,8.1],[21,9.4],[33,7.6]] },
  { id: 'court-tail', z: -218, depth: 7, yaw: 0, lots: [[48,9],[61,8.4]] },
  { id: 'exchange-south', z: -218, depth: 12, yaw: Math.PI, lots: [[132,10.8],[146,10.2],[158,8.2]] },
  { id: 'west-front', z: -229, depth: 10, yaw: Math.PI, lots: [[9,8.4],[22,9.6],[36,10.2],[50,10.1],[63,8.6]] },
  { id: 'west-ledger', z: -256, depth: 12, yaw: 0, lots: [[9,8.6],[22,9.6],[37,10.6],[51,10],[64,8.4]] },
  { id: 'west-service', z: -270, depth: 8, yaw: 0, lots: [[9,8.4],[22,9.6],[36,10.2],[50,10.1],[63,8.6]] },
  { id: 'west-stores', z: -282, depth: 10, yaw: Math.PI, lots: [[9,8.4],[22,9.7],[36,10.2],[50,10],[63,8.8]] },
  { id: 'north-ledger', z: -295, depth: 6, yaw: 0, lots: [[10,8.2],[24,9.4],[39,10.2],[54,10.4],[69,9],[85,8.3],[99,7]] },
  { id: 'alley-east', z: -249, depth: 10, yaw: 0, lots: [[89,8.2],[100,7]] },
  { id: 'alley-north', z: -261, depth: 7, yaw: Math.PI, lots: [[89,8.4],[100,7]] },
];

function pointLocal(b: UrbanBuilding, point: Vec3) {
  return { x: Math.cos(b.yaw) * (point.x - b.position.x) - Math.sin(b.yaw) * (point.z - b.position.z),
    z: Math.sin(b.yaw) * (point.x - b.position.x) + Math.cos(b.yaw) * (point.z - b.position.z) };
}
function bodyDistance(b: UrbanBuilding, point: Vec3) {
  const local = pointLocal(b, point);
  return Math.hypot(Math.max(0, Math.abs(local.x) - b.width / 2), Math.max(0, Math.abs(local.z) - b.depth / 2));
}
function frontage(b: UrbanBuilding, lateral: number, out: number): Vec3 {
  const forward = b.depth / 2 + out;
  return p(b.position.x + Math.cos(b.yaw) * lateral + Math.sin(b.yaw) * forward,
    b.position.z - Math.sin(b.yaw) * lateral + Math.cos(b.yaw) * forward, b.position.y);
}

/** Local alley paving lies on the accepted 12 m terrace, sealing only its narrow coplanar road joins. */
function streetSurface(id: string, a: Vec3, b: Vec3, width: number): Surface {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = -(b.z - a.z) / length * width / 2, nz = (b.x - a.x) / length * width / 2;
  return { id, color: 0xaaa18c, vertices: [a.x+nx,a.y,a.z+nz,b.x+nx,b.y,b.z+nz,
    b.x-nx,b.y,b.z-nz,a.x-nx,a.y,a.z-nz], indices: [0,1,2,0,2,3] };
}

function floorSampler(surfaces: Surface[]) {
  const triangles = surfaces.flatMap(surface => Array.from({ length: surface.indices.length / 3 }, (_, i) => {
    const [a,b,c] = surface.indices.slice(i*3,i*3+3).map(index => surface.vertices.slice(index*3,index*3+3)) as [number[],number[],number[]];
    return { a,b,c,minX:Math.min(a[0]!,b[0]!,c[0]!),maxX:Math.max(a[0]!,b[0]!,c[0]!),
      minZ:Math.min(a[2]!,b[2]!,c[2]!),maxZ:Math.max(a[2]!,b[2]!,c[2]!),
      d:(b[2]!-c[2]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[2]!-c[2]!) };
  }));
  const grid = new Map<string, typeof triangles>();
  for(const triangle of triangles) for(let x=Math.floor(triangle.minX/12);x<=Math.floor(triangle.maxX/12);x++)
    for(let z=Math.floor(triangle.minZ/12);z<=Math.floor(triangle.maxZ/12);z++) {
      const key=`${x},${z}`,bucket=grid.get(key)??[]; bucket.push(triangle);grid.set(key,bucket);
    }
  return (point: Vec3): number | null => {
    let highest: number | null = null;
    for(const {a,b,c,minX,maxX,minZ,maxZ,d} of grid.get(`${Math.floor(point.x/12)},${Math.floor(point.z/12)}`)??[]) {
      if(Math.abs(d)<1e-8 || point.x<minX-1e-6 || point.x>maxX+1e-6 || point.z<minZ-1e-6 || point.z>maxZ+1e-6) continue;
      const u=((b[2]!-c[2]!)*(point.x-c[0]!)+(c[0]!-b[0]!)*(point.z-c[2]!))/d;
      const v=((c[2]!-a[2]!)*(point.x-c[0]!)+(a[0]!-c[0]!)*(point.z-c[2]!))/d;
      if(u>=-1e-6 && v>=-1e-6 && u+v<=1+1e-6) highest=Math.max(highest??-Infinity,u*a[1]!+v*b[1]!+(1-u-v)*c[1]!);
    }
    return highest;
  };
}

/** M7 production data only. The supplied M6.1 macro geometry is never mutated. */
export function createCentralMarket(blueprint: CityBlueprint): UrbanDistrict {
  const buildings: UrbanBuilding[] = [];
  const recipes: UrbanRecipe[] = ['merchant-house','exchange-house','merchant-house','corner-inn','merchant-house','exchange-house'];
  const add = (id: string, parcel: Parcel, yaw: number, recipe: UrbanRecipe, sequence: number, hero = false) => {
    const [x,z,width,depth] = parcel;
    const b = urbanBuilding('central-market', id, x, z, width, depth, yaw, 12, recipe, sequence);
    // Block role controls the rhythm. Geometry variation is authored rather than free part mixing.
    if (!hero) {
      b.bays = width > 10 ? (recipe === 'exchange-house' ? 4 : 3) : width < 8 ? 2 : 3;
      b.roofDirection = sequence % 3 === 1 ? 1 : 0;
      b.shopfront = recipe === 'exchange-house' ? (sequence % 2 ? 'wide' : 'arcade')
        : recipe === 'corner-inn' ? 'single' : sequence % 3 === 0 ? 'paired' : 'single';
      if(b.shopfront==='arcade') b.bays=4; // An even bay count keeps the central doorway between columns.
      if (id.startsWith('west-stores') || id.startsWith('west-service')) {
        b.facade = sequence % 2 ? 'trade' : 'paired'; b.shopfront = 'service'; b.awning = false;
      }
      if (id.startsWith('north-ledger')) { b.floorHeight = 3.05; b.balcony = sequence % 3 === 0; }
      // Service ventilation ridges break the two exact envelopes found by review diagnostics.
      if(id==='west-stores.0')b.roofHeight+=.15;
      if(id==='west-stores.2')b.roofHeight+=.12;
      b.shutterOffset = sequence % 4;
      b.cloth = [0x4e736a,0x925b43,0x8a7749,0x6c7052][Math.floor(sequence/2)%4]!;
    }
    b.hero = hero;
    if (!urbanLotFits(blueprint, b)) return;
    buildings.push(b);
  };
  for (const [blockIndex,block] of blocks.entries()) for (const [index,[x,width]] of block.lots.entries()) {
    add(`${block.id}.${index}`, [x,block.z,width,block.depth+(index%3-1)*.35], block.yaw,
      recipes[(index+blockIndex*2)%recipes.length]!, index+blockIndex*7);
  }
  // East-bank frontage follows the bridge service geometry instead of copying the west blocks.
  for (const [index,parcel] of ([[219,-245,7,7],[194,-261,11,10],[195,-275,10,8],
    [193,-294,8,7],[205,-294,8.5,7],[218,-294,8,7]] as Parcel[]).entries()) {
    add(`river-exchange.${index}`, parcel, index < 3 ? -Math.PI/2 : 0, index%2 ? 'exchange-house' : 'merchant-house', index+43);
  }
  add('exchange-hall', [140,-266,23,18], 0, 'hall', 0, true);
  add('ledger-wing', [123.5,-265,7.5,13], 0, 'hall', 1, true);
  add('market-belfry', [158,-260,8,8], 0, 'hall', 2, true);
  const hall = buildings.find(b => b.id.endsWith('.exchange-hall'))!;
  const wing = buildings.find(b => b.id.endsWith('.ledger-wing'))!;
  const tower = buildings.find(b => b.id.endsWith('.market-belfry'))!;
  hall.floors=2; hall.floorHeight=4.2; hall.bays=8; hall.roofDirection=0; hall.cloth=0x4e736a;
  wing.floors=3; wing.floorHeight=3.05; wing.bays=2; wing.shopfront='wide'; wing.facade='tall'; wing.roof='gable'; wing.roofHeight=2.4;
  tower.floors=6; tower.floorHeight=3.4; tower.bays=2; tower.roof='hip'; tower.roofHeight=3.6;
  tower.roofColor=0x3b7470; tower.shopfront='single'; tower.facade='civic'; tower.corner='stone';

  const streets: UrbanDistrict['streets'] = [
    { id:'m7.central.west-service-spine', width:2.6, points:[p(34,-201),p(2.5,-201),p(2.5,-251.75),p(2.5,-293)] },
    { id:'m7.central.stock-alley', width:2.6, points:[p(2.5,-264),p(69,-264),p(75,-265)] },
    { id:'m7.central.ledger-lane', width:2.8, points:[p(2.5,-289.5),p(100,-289.5),p(110,-275)] },
    { id:'m7.central.west-court-link', width:2.6, points:[p(34,-201),p(40,-195)] },
  ];
  const surfaces = streets.flatMap(street => street.points.slice(1).map((end,i) =>
    streetSurface(`${street.id}.${i}`, street.points[i]!, end, street.width)));
  const floorAt = floorSampler([...blueprint.terrain,...cityRoadSurfaces(blueprint.roads),...surfaces]);
  const supportNear = (point:Vec3) => [point,...[.25,-.25,.5,-.5].flatMap(offset=>
    [{...point,x:point.x+offset},{...point,z:point.z+offset}])].some(sample=>Math.abs((floorAt(sample)??-999)-12)<.05);
  const stalls: UrbanDistrict['stalls'] = [
    {x:123,z:-244,y:12,yaw:0,cloth:0x8d5944,width:.94,depth:1,goods:'goods-bread'},
    {x:132,z:-244,y:12,yaw:0,cloth:0x557368,width:1.06,depth:.92,goods:'goods-pottery'},
    {x:151,z:-244,y:12,yaw:0,cloth:0x8a7749,width:1.08,depth:1,goods:'goods-textiles'},
    {x:163,z:-243,y:12,yaw:0,cloth:0x6c7052,width:.98,depth:.96,goods:'goods-produce'},
    {x:61,z:-201,y:12,yaw:Math.PI,cloth:0x6c7052,width:1.04,depth:.88,goods:'goods-produce'},
    {x:83,z:-201,y:12,yaw:Math.PI,cloth:0x8d5944,width:.96,depth:.90,goods:'goods-bread'},
    {x:99,z:-201,y:12,yaw:Math.PI,cloth:0x557368,width:1.05,depth:.88,goods:'goods-textiles'},
    {x:141,z:-201,y:12,yaw:Math.PI,cloth:0x8a7749,width:.96,depth:.90,goods:'goods-pottery'},
    {x:130,z:-229,y:12,yaw:Math.PI,cloth:0x8a7749,width:.94,depth:.88,goods:'goods-pottery'},
    {x:142,z:-229,y:12,yaw:Math.PI,cloth:0x557368,width:1.03,depth:.92,goods:'goods-textiles'},
    {x:153,z:-229,y:12,yaw:Math.PI,cloth:0x8d5944,width:.96,depth:.90,goods:'goods-bread'},
    {x:85,z:-214,y:12,yaw:Math.PI,cloth:0x925b43,width:1,depth:.90,goods:'goods-textiles'},
    {x:96,z:-214,y:12,yaw:Math.PI,cloth:0x6c7052,width:.94,depth:.92,goods:'goods-produce'},
    {x:106,z:-214,y:12,yaw:Math.PI,cloth:0x8a7749,width:.92,depth:.88,goods:'goods-pottery'},
    {x:88,z:-230,y:12,yaw:Math.PI,cloth:0x557368,width:.94,depth:.90,goods:'goods-bread'},
  ];
  const dressing: DistrictDressing[] = [];
  const dress = (id: string,module: DistrictModuleId,point: Vec3,scale: [number,number,number],yaw=0,collider?: Vec3,tint=1) =>
    dressing.push({id:`m7.central-market.dressing.${id}`,module,position:point,scale,yaw,tint,...(collider?{collider}: {})});
  const serviceLots = buildings.filter(b => !b.hero && /west-service|west-stores|court-north|south-spice/.test(b.id));
  for(const [index,b] of serviceLots.entries()) {
    const stock = frontage(b,(index%2?1:-1)*(b.width/2-.62),.52);
    if(Math.abs((floorAt(stock)??-999)-12)<.01) dress(`${b.id}.stock`,index%3===0?'barrel':index%3===1?'crate':'basket',stock,
      [.65,.72,.65],b.yaw,{x:.52,y:index%3===2?.42:.60,z:.50},index%2?.91:1);
    const gutter = frontage(b,0,.26);
    if(Math.abs((floorAt(gutter)??-999)-12)<.01) dress(`${b.id}.gutter`,'stone',p(gutter.x,gutter.z,12.016),[b.width-.8,.035,.19],b.yaw,undefined,.69);
  }
  for(const [i,stall] of stalls.entries()) {
    const side = i%2 ? -1 : 1;
    const point = p(stall.x+side*2.05,stall.z+.35);
    if(Math.abs((floorAt(point)??-999)-12)<.01 && buildings.every(b=>bodyDistance(b,point)>.75)) {
      dress(`stall.${i}.basket`,'basket',point,[.72,.76,.72],.08,{x:.55,y:.43,z:.55});
    }
  }
  // Exchange equipment is concentrated at its walls and loading apron.
  dress('hall.notice','sign',p(134.4,-256.65,14.1),[1.35,1.15,1.05],0);
  dress('hall.west-bench','bench',p(130.5,-253.9),[1,1,1],0,{x:2.1,y:.84,z:.67});
  dress('hall.east-bench','bench',p(149.4,-253.9),[1,1,1],0,{x:2.1,y:.84,z:.67});
  dress('belfry.records','crate',p(162.65,-258),[.78,.7,.72],0,{x:.72,y:.52,z:.55},.88);
  dress('belfry.cask','barrel',p(162.65,-262),[.8,.86,.8],0,{x:.61,y:.70,z:.61},.91);
  dress('ledger.basket','basket',p(120.4,-257.7),[.78,.78,.78],0,{x:.58,y:.47,z:.58});
  dress('ledger.drain','stone',p(124,-257.82,12.016),[5.6,.035,.20],0,undefined,.66);
  const lamps: UrbanDistrict['lamps']=[[109,14.8,-231],[177,14.8,-232],[137,14.8,-252],[78,14.8,-236],[4.2,14.5,-263],[97,14.5,-287.8]];
  const gardens: NonNullable<UrbanDistrict['gardens']> = [
    {id:'exchange.entry',position:p(124,-184),radius:1.15,tree:'tree-orchard-0',scale:.46},
    {id:'cloth-court',position:p(85,-227),radius:1.20,tree:'tree-hornbeam-1',scale:.47},
    {id:'hall.north',position:p(155,-278),radius:1.05,tree:'tree-ash-0',scale:.43},
    {id:'ledger.yard',position:p(81,-283),radius:1.25,tree:'tree-orchard-0',scale:.45},
    {id:'west.court',position:p(5.7,-220),radius:1.05,tree:'tree-hornbeam-1',scale:.42},
  ].filter(g=>Array.from({length:8},(_,i)=>p(g.position.x+Math.cos(i*Math.PI/4)*g.radius,g.position.z+Math.sin(i*Math.PI/4)*g.radius))
    .every(point=>Math.abs((floorAt(point)??-999)-12)<.05) && buildings.every(b=>bodyDistance(b,g.position)>g.radius+.45)
    && blueprint.roads.every(road=>road.points.slice(1).every((end,i)=>urbanSegmentDistance(g.position,road.points[i]!,end)>road.width/2+g.radius+.45)));

  const nodes: Record<string,Vec3> = {};
  const edges: [string,string][] = [];
  const node = (id: string,point: Vec3) => { const key=`m7.cm.${id}`; nodes[key]={...point,y:point.y+.012}; return key; };
  const paths: [string,Vec3][] = [
    ['entry',p(115,-200)],['court-west',p(55,-205)],['court-mid',p(75,-205)],['court-east',p(110,-205)],['court-bourse',p(160,-205)],
    ['court-bend',p(75,-215)],['west-junction',p(75,-239.1176470588)],['west-gate',p(25,-245)],
    ['square',p(110,-235)],['bridge',p(175,-235)],['civic-middle',p(110,-255)],['civic-foot',p(110,-275)],
    ['alley-middle',p(75,-239.1176470588)],['alley-foot',p(75,-265)],['quay-turn',p(173,-245)],
    ['quay-east',p(215,-260)],
    ['hall-court',p(141,-249)],['hall-front',p(141,-251.5)],['hall-west',p(122,-251.5)],
    ['service-start',p(34,-201)],['service-link',p(40,-195)],['west-corner',p(40,-210)],
    ['service-south',p(2.5,-201)],['service-cross',p(2.5,-251.75)],
    ['service-stock',p(2.5,-264)],['service-north',p(2.5,-289.5)],['stock-east',p(69,-264)],['ledger-east',p(100,-289.5)],
  ];
  for(const [id,point] of paths) node(id,point);
  const link = (a: string,b: string) => edges.push([`m7.cm.${a}`,`m7.cm.${b}`]);
  for(const [a,b] of [
    ['entry','court-east'],['court-west','court-mid'],['court-mid','court-east'],['court-east','court-bourse'],['court-bourse','bridge'],
    ['court-west','court-bend'],['court-bend','alley-middle'],['alley-middle','alley-foot'],['alley-foot','civic-foot'],
    ['square','west-junction'],['west-junction','west-gate'],['west-junction','alley-middle'],['square','bridge'],
    ['square','civic-middle'],['civic-middle','civic-foot'],['bridge','quay-turn'],['quay-turn','quay-east'],
    ['hall-court','hall-front'],['hall-front','hall-west'],['hall-court','quay-turn'],['hall-court','civic-middle'],
    ['service-start','service-south'],['service-start','service-link'],['service-link','west-corner'],['west-corner','court-west'],['service-south','service-cross'],
    ['service-cross','west-gate'],['service-cross','service-stock'],['service-stock','stock-east'],['stock-east','alley-foot'],
    ['service-stock','service-north'],['service-north','ledger-east'],['ledger-east','civic-foot'],
  ]) link(a!,b!);
  const clear = (a: Vec3,b: Vec3,radius=.34) => {
    const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.35);
    for(let i=0;i<=count;i++) {
      const point=p(a.x+(b.x-a.x)*i/Math.max(1,count),a.z+(b.z-a.z)*i/Math.max(1,count));
      if(!supportNear(point) || buildings.some(building=>bodyDistance(building,point)<radius)) return false;
      if(lamps.some(([x,,z])=>Math.hypot(point.x-x,point.z-z)<radius+.15)
        || gardens.some(g=>Math.hypot(point.x-g.position.x,point.z-g.position.z)<radius+.33*g.scale))return false;
      if(buildings.some(building=>{
        const threshold=frontage(building,0,.22),dx=Math.abs(Math.cos(building.yaw)*(point.x-threshold.x)-Math.sin(building.yaw)*(point.z-threshold.z));
        const dz=Math.abs(Math.sin(building.yaw)*(point.x-threshold.x)+Math.cos(building.yaw)*(point.z-threshold.z));
        return Math.hypot(Math.max(0,dx-.725),Math.max(0,dz-.325))<radius;
      }))return false;
      if(buildings.some(building=>building.shopfront==='arcade' && Array.from({length:building.bays},(_,bay)=>
        frontage(building,-building.width*.42+building.width*.84*bay/(building.bays-1),1.65))
        .some(post=>Math.hypot(Math.max(0,Math.abs(point.x-post.x)-.135),Math.max(0,Math.abs(point.z-post.z)-.135))<radius)))return false;
      if(dressing.some(item=>item.collider && Math.hypot(Math.max(0,Math.abs(point.x-item.position.x)-item.collider.x/2),
        Math.max(0,Math.abs(point.z-item.position.z)-item.collider.z/2))<radius)) return false;
      if(stalls.some(stall=> Math.hypot(Math.max(0,Math.abs(point.x-stall.x)-1.6*stall.width),
        Math.max(0,Math.abs(point.z-stall.z)-.72*stall.depth))<radius)) return false;
    }
    return true;
  };
  // Shelters connect geometrically to an authored street edge; never through a parcel or counter.
  const streetEdges=[...edges];
  const attach = (id: string,point: Vec3) => {
    const candidates = streetEdges.map(([a,b]) => {
      const start=nodes[a]!,end=nodes[b]!,dx=end.x-start.x,dz=end.z-start.z;
      const t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.z-start.z)*dz)/(dx*dx+dz*dz||1)));
      const projected=p(start.x+dx*t,start.z+dz*t);
      return {a,b,projected,distance:Math.hypot(projected.x-point.x,projected.z-point.z)};
    }).sort((a,b)=>a.distance-b.distance);
    const candidate=candidates.find(candidate=>clear(point,candidate.projected));
    if(!candidate) return null;
    const branch=node(`${id}.street`,candidate.projected),key=node(id,point);
    edges.push([candidate.a,branch],[branch,candidate.b],[key,branch]);
    return key;
  };
  const shelters: string[] = [];
  for(const b of buildings.filter(b=>b.awning || b.hero)) {
    if(shelters.length>=36) break;
    for(const side of [-1,1]) {
      const key=attach(`shelter.${shelters.length}`,frontage(b,side*b.width*.22,.70));
      if(key) shelters.push(key);
      if(shelters.length>=36) break;
    }
  }
  if(shelters.length<32) throw new Error(`Central Market needs 32 clear eave shelters; found ${shelters.length}`);
  const names=['Avel','Bera','Celia','Davin','Esme','Fenn','Gita','Harlan','Iona','Jarek','Kesta','Ludo','Mirel','Nalin','Orla','Pavel',
    'Quin','Rima','Soren','Tavi','Una','Vey','Wilna','Yara','Zev','Arden','Belis','Corin','Demi','Elo','Frida','Galen'];
  const roles=['merchant','customer','merchant','civic worker','traveler','customer','merchant','customer'] as const;
  const dialogue={ merchant:'The exchange bell marks the trading hours. Cloth and pottery are weighed here before they go to the bridge.',
    customer:'I came for bread, then found the cloth sellers. The little stock alley is quieter than the exchange street.',
    'civic worker':'I keep the drains and the ledger hall in order. Leave the middle of the square open for the carts.',
    traveler:'The teal bell roof brings you to the exchange. The road beside it leads toward the river bridge.' };
  const definitions: NpcDefinition[] = names.map((name,index) => {
    const role=roles[index%roles.length]!,shelter=shelters[index]!;
    const tour=index%4===0?['square','bridge','quay-turn','hall-court']:index%4===1?['court-mid','court-bend','square']
      :index%4===2?['west-junction','alley-foot','civic-foot']:['court-east','court-bourse','bridge','hall-front'];
    const marketIndex=names.slice(0,index).filter((_,i)=>roles[i%roles.length]==='merchant').length;
    const stall=stalls[marketIndex%stalls.length]!;
    const stallNode=role==='merchant'?attach(`seller.${index}`,p(stall.x-Math.sin(stall.yaw)*1.30,stall.z-Math.cos(stall.yaw)*1.30)):null;
    const dayRoute=stallNode?[stallNode,`m7.cm.${tour[0]}`,shelter]
      :role==='customer'?[`m7.cm.${tour[index%tour.length]!}`,shelter,...tour.map(id=>`m7.cm.${id}`)]
        :[shelter,...tour.map(id=>`m7.cm.${id}`)];
    return { id:`m7.central-market.local.${index.toString().padStart(2,'0')}`,name:`${name} · ${role}`,dialogue:dialogue[role],
      rainDialogue:role==='merchant'?'The covers are tied down. I will wait under the shop eaves until the shower passes.'
        :'The exchange roofs have a dry edge. I will stay here until the square clears.',
      eveningDialogue:role==='civic worker'?'The bell has sounded. I am checking the ledger doors and street lamps.'
        :'The stalls have closed for today. The upper street still catches the last light.',
      dayRoute,duskRoute:[`m7.cm.${index%2?'hall-front':'square'}`,shelter],shelterNode:shelter,
      walkSpeed:.72+(index%6)*.045,idleSeconds:role==='merchant'?13+(index%3)*3:5.5+(index%7)*1.6,
      initialWait:role==='merchant'?18+(index%4)*1.7:(index*2.31)%12,
      appearance:{ height:1.57+(index%8)*.032,coat:[0x5e6c4d,0x496d6b,0x956b4c,0xa59674,0x775b54][index%5]!,
        trousers:[0x514c40,0x615341,0x474e51][index%3]!,skin:[0xb98c65,0xd3a67e,0x92694f,0xdeb58d][index%4]!,
        hair:[0x423127,0x756851,0x57402e][index%3]!,hat:role==='merchant'||role==='traveler',apron:role==='merchant',
        hatStyle:role==='merchant'?'cap':'brim',accessory:role==='traveler'?'satchel':index%3===1?'shawl':'belt',
        coatLength:role==='traveler'?.72:.57,build:[.9,1.02,.95,1.12][index%4]! } };
  });
  const route=[p(110,-235),p(115,-200),p(110,-205),p(55,-205),p(40,-210),p(40,-195),p(34,-201),p(2.5,-201),p(2.5,-264),
    p(69,-264),p(75,-265),p(110,-275),p(110,-255),p(141,-249),p(141,-251.5),p(122,-251.5),p(141,-251.5),
    p(141,-249),p(173,-245),p(175,-235),p(110,-235),p(75,-239.1176470588),p(75,-215),p(75,-205),p(110,-205),p(115,-200),p(110,-235)];
  // M6.1 deliberately clips a 0.2 m shoulder around road decks. Tiny coplanar
  // paving joints support lateral human-scale entry without widening any macro road.
  const seal = (a:Vec3,b:Vec3) => {
    const length=Math.hypot(b.x-a.x,b.z-a.z),count=Math.max(1,Math.ceil(length/.16));
    let gapStart:Vec3|null=null;
    for(let i=0;i<=count;i++) {
      const point=p(a.x+(b.x-a.x)*i/count,a.z+(b.z-a.z)*i/count);
      const supported=Math.abs((floorAt(point)??-999)-12)<.05;
      if(!supported&&!supportNear(point))throw new Error(`Central Market connector leaves the supported road shoulder: ${JSON.stringify(point)}`);
      if(!supported && supportNear(point)) {
        if(!gapStart)gapStart=p(a.x+(b.x-a.x)*Math.max(0,i-1)/count,a.z+(b.z-a.z)*Math.max(0,i-1)/count);
      } else if(gapStart) {
        if(Math.hypot(point.x-gapStart.x,point.z-gapStart.z)>.01) surfaces.push(streetSurface(`m7.central.paving-joint.${surfaces.length}`,gapStart,point,1.05));
        gapStart=null;
      }
    }
  };
  for(const [a,b] of edges)seal(nodes[a]!,nodes[b]!);
  for(let i=1;i<route.length;i++)seal(route[i-1]!,route[i]!);
  // One static trimesh for alleys and one for shoulder joints, rather than one collider per patch.
  const groupedSurfaces = ['alleys','paving-joints'].map(kind=>{
    const grouped:Surface={id:`m7.central.${kind}`,color:0xaaa18c,vertices:[],indices:[]};
    for(const surface of surfaces.filter(surface=>surface.id.includes('paving-joint')===(kind==='paving-joints'))) {
      const offset=grouped.vertices.length/3;grouped.vertices.push(...surface.vertices);grouped.indices.push(...surface.indices.map(index=>index+offset));
    }
    return grouped;
  }).filter(surface=>surface.indices.length);
  return { id:'central-market',identity:'Uphill exchange: tall merchant street walls, a covered civic market and a busy cross-city trading court.',
    buildings,dressing,stalls,streets,surfaces:groupedSurfaces,lamps,gardens,route,
    views:{ street:{position:p(146,-237),yaw:-.16,pitch:.10}, alley:{position:p(27,-264),yaw:-Math.PI/2,pitch:.04},
      doorway:{position:p(124,-254.8),yaw:0,pitch:.05},hero:{position:p(130,-230),yaw:-.22,pitch:.18},
      transition:{position:p(115,-200),yaw:0,pitch:.12} },
    eagle:{position:p(-20,-140,145),target:p(110,-239,20),fov:50},npcs:{nodes,edges,definitions},
    ambience:{market:1,workshop:.28,river:.12,position:p(139,-242)},
    assumptions:['All Central Market frontage, trade roles, names, lanes and unseen elevations are authored interpretations of the master, not pixel measurements.',
      'The M7 detail replaces the market-belfry proxy with a kit-built bell tower at its exact approved position; the source M6.1 blueprint is unchanged.',
      'The closed exchange hall, ledger wing and bell tower form one civic-commercial focal composition; no explorable interiors are provided.',
      'The local service alleys are narrow coplanar paving over the supported 12 m terrace and preserve every accepted road and water corridor.'] };
}
