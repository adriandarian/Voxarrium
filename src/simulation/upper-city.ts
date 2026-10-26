import type { CityBlueprint } from './city-contracts';
import type { UrbanBuilding, UrbanDistrict, UrbanRecipe } from './urban-contracts';
import type { BoxSpec, Vec3 } from './types';
import { urbanBuilding, urbanCorners, urbanFloorAt, urbanLotFits, urbanSegmentDistance } from './urban-grammar';

type UpperId='noble-quarter'|'temple-quarter'|'upper-city';
type Parcel=[string,number,number,number,number,number,number,UrbanRecipe?];
const p=(x:number,z:number,y:number):Vec3=>({x,y,z});
export const UPPER_REPLACED_LANDMARKS=['city.landmark.temple-tower','city.landmark.upper-support-west',
  'city.landmark.upper-support-court','city.landmark.upper-support-east'];
const front=(b:UrbanBuilding,lateral=0,out=1):Vec3=>({x:b.position.x+Math.cos(b.yaw)*lateral+Math.sin(b.yaw)*(b.depth/2+out),
  y:b.position.y,z:b.position.z-Math.sin(b.yaw)*lateral+Math.cos(b.yaw)*(b.depth/2+out)});
function distance(q:Vec3,b:UrbanBuilding){
  const dx=q.x-b.position.x,dz=q.z-b.position.z,x=Math.cos(b.yaw)*dx-Math.sin(b.yaw)*dz,z=Math.sin(b.yaw)*dx+Math.cos(b.yaw)*dz;
  return Math.hypot(Math.max(0,Math.abs(x)-b.width/2),Math.max(0,Math.abs(z)-b.depth/2));
}
const row=(name:string,x:number,z:number,count:number,step:number,axis:'x'|'z',yaw:number,y:number,depth:number):Parcel[]=>
  Array.from({length:count},(_,i)=>[`${name}.${i}`,x+(axis==='x'?i*step:0),z+(axis==='z'?i*step:0),
    [10.4,12.6,11.2,14.3,9.8][i%5]!,depth+[0,1.2,-.6,.5][i%4]!,yaw,y]);
const plans:Record<UpperId,{identity:string;parcels:Parcel[];route:Vec3[];lanes:Vec3[][];gardens:[number,number,number,number,string,number][];locals:number;roles:string[];ambience:UrbanDistrict['ambience']}>={
  'noble-quarter':{
    identity:'Noble courts: tall pale mansard households, stone loggias, walled planting courts and an inhabited southern terrace front.',
    parcels:[['house-of-measures',50,-447,24,16,Math.PI,32,'noble-house'],
      ...row('south-loggias',-50,-435,4,19,'x',0,32,12),
      ...row('west-court-houses',-49,-470,5,-18,'z',Math.PI/2,32,14),
      ...row('east-court-houses',63,-475,4,-20,'z',-Math.PI/2,32,13),
      ...row('north-garden-houses',-22,-553,5,18,'x',0,32,13),
      ...row('lower-court-fronts',12,-529,3,18,'x',0,32,12),
      ...row('court-stewards',17,-477,2,19,'x',Math.PI,32,11),
      ['stair-quarter-west',91,-451,9,8,0,36,'upper-house'],['western-service-house',-54,-521,10,12,Math.PI/2,32,'upper-house'],
      ['court-garden-lodge',34,-553,15,13,0,32,'noble-house']],
    route:[p(10,-465,32),p(-10,-490,32),p(35,-515,32),p(85,-495,32),p(10,-465,32)],
    lanes:[[p(-10,-490,32),p(-29,-490,32),p(-29,-531,32),p(-17,-531,32),p(35,-515,32)]],
    gardens:[[-48,-450,32,4,'tree-hornbeam-1',.74],[27,-499,32,4.8,'tree-orchard-0',.8],
      [-9,-548,32,4.6,'tree-ash-1',.84],[48,-541,32,3.8,'tree-hornbeam-0',.73],[-53,-560,32,3.5,'tree-orchard-1',.71],
      [5,-485,32,2.8,'tree-hornbeam-1',.64],[-14,-446,32,2.6,'tree-orchard-0',.6],[46,-507,32,2.5,'tree-ash-1',.64],
      [75,-556,32,2.8,'tree-hornbeam-0',.66]],
    locals:20,roles:['court steward','resident','letter courier','gardener'],ambience:{market:.12,workshop:.07,river:.05,position:p(10,-465,32)},
  },
  'temple-quarter':{
    identity:'Temple and academy: broad hipped lecture houses, a teal capped scholarly tower, cloister fronts and tended river-bank ledges.',
    parcels:[['academy-tower',340,-420,16,16,Math.PI/2,30,'academy-house'],
      ...row('academy-east-houses',354,-346,5,-23,'z',-Math.PI/2,30,16),
      ...row('cloister-west',274,-440,3,22,'x',Math.PI,30,13),
      ...row('north-lecture-houses',274,-486,4,22,'x',0,30,14),
      ...row('southern-lecture-houses',289,-351,3,20,'x',Math.PI,30,15),
      ...row('academy-garden-houses',278,-284,4,20,'x',Math.PI,30,12),
      ['bank-reader-house',239,-371,12,10,Math.PI/2,22,'academy-house'],
      ['bank-garden-keeper',303,-288,12,10,Math.PI,18,'upper-house'],
      ['east-library',365,-404,16,16,-Math.PI/2,30,'academy-house'],
      ['lecture-court-west',268,-400,13,11,Math.PI/2,30,'academy-house'],
      ['lecture-court-east',310,-402,15,12,-Math.PI/2,30,'academy-house']],
    route:[p(280,-405,30),p(255,-425,30),p(265,-460,30),p(300,-455,30),p(280,-405,30)],
    lanes:[[p(280,-405,30),p(295,-390,30),p(326,-390,30),p(328,-420,30)],
      [p(300,-455,30),p(324,-451,30),p(329,-466,30)]],
    gardens:[[313,-362,30,5.2,'tree-ash-0',.9],[325,-441,30,4.2,'tree-hornbeam-1',.82],
      [272,-300,18,4,'tree-alder-1',.73],[246,-347,22,3.6,'tree-hornbeam-0',.68],
      [345,-478,30,4.6,'tree-orchard-1',.81],[351,-389,30,3.8,'tree-ash-1',.78]],
    locals:22,roles:['scholar','novice','bookbinder','bank gardener'],ambience:{market:.09,workshop:.16,river:.5,position:p(280,-405,30)},
  },
  'upper-city':{
    identity:'Upper approach: compact court households, elevated roof terraces, ceremonial lodging and planted gate-side streets beneath the citadel.',
    parcels:[['west-ceremonial-lodge',132,-548,24,22,Math.PI/2,40,'noble-house'],
      ['court-administration',210,-460,24,22,Math.PI,40,'academy-house'],
      ['east-gate-house',238,-562,12,12,0,40,'upper-house'],
      ...row('west-upper-fronts',124,-444,5,-19,'z',Math.PI/2,40,10),
      ...row('upper-court-east',209,-489,3,-19,'z',-Math.PI/2,40,11),
      ...row('upper-north-fronts',155,-560,4,19,'x',0,40,10),
      ...row('gate-lane-houses',230,-512,2,-20,'z',Math.PI/2,40,10),
      ['upper-letter-house',169,-487,11,12,0,40,'upper-house'],['upper-court-lodge',149,-445,13,13,Math.PI,40,'noble-house'],
      ['gate-stair-keeper',211,-550,12,9,0,40,'upper-house']],
    route:[p(185,-505,40),p(160,-475,40),p(130,-465,40),p(145,-515,40),p(185,-505,40),
      p(205,-495,40),p(240,-505,40),p(240,-545,40),p(220,-555,40),p(185,-550,40),p(185,-505,40)],
    lanes:[[p(145,-515,40),p(148,-536,40),p(148,-548,40)],
      [p(240,-545,40),p(247,-548,40),p(247,-555,40)]],
    gardens:[[165,-529,40,4.2,'tree-hornbeam-1',.83],[205,-522,40,3.5,'tree-orchard-0',.71],
      [230,-453,40,3.4,'tree-ash-1',.76],[121,-559,40,2.7,'tree-hornbeam-0',.64]],
    locals:24,roles:['gate attendant','resident','court messenger','roof gardener'],ambience:{market:.2,workshop:.08,river:.18,position:p(185,-505,40)},
  },
};

function ribbon(id:string,a:Vec3,b:Vec3,width:number):UrbanDistrict['surfaces'][number]{
  const length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;
  return {id,color:0xbcad91,vertices:[a.x+nx,a.y,a.z+nz,b.x+nx,b.y,b.z+nz,b.x-nx,b.y,b.z-nz,a.x-nx,a.y,a.z-nz],indices:[0,1,2,0,2,3]};
}
function structure(prefix:string,id:string,x:number,z:number,bottom:number,width:number,height:number,depth:number,color=0xaa9c80,yaw=0):BoxSpec{
  return {id:`${prefix}.${id}`,position:p(x,z,bottom+height/2),size:{x:width,y:height,z:depth},rotationY:yaw,color,collides:true,visible:false};
}
/** Selected real structures share dimensions with simplified collision. Every arch leaves its opening clear. */
function transitions(id:UpperId,blueprint:CityBlueprint):BoxSpec[]{
  const prefix=`m9.${id}.structure`,items:BoxSpec[]=[];
  const box=(name:string,x:number,z:number,bottom:number,width:number,height:number,depth:number,color?:number,yaw=0)=>
    items.push(structure(prefix,name,x,z,bottom,width,height,depth,color,yaw));
  const voussoir=(name:string,q:Vec3,length:number,thickness:number,depth:number,yaw:number,roll:number,color:number)=>{
    // Ry(yaw) · Rz(roll), represented in the shared XYZ Euler convention.
    // Keep depth normal to the wall while rotating the long axis in its face.
    const sy=Math.sin(yaw),cy=Math.cos(yaw),stone=structure(prefix,name,q.x,q.z,q.y-thickness/2,length,thickness,depth,color);
    stone.rotationY=Math.asin(Math.max(-1,Math.min(1,sy)));
    if(Math.abs(sy)<.9999999){stone.rotationX=cy<0?Math.PI:0;stone.rotationZ=Math.atan2(cy*Math.sin(roll),cy*Math.cos(roll));}
    else{stone.rotationX=Math.atan2(sy*Math.sin(roll),Math.cos(roll));stone.rotationZ=0;}
    items.push(stone);
  };
  const gate=(name:string,x:number,z:number,y:number,yaw:number,width:number)=>{
    const transform=(side:number,forward=0)=>p(x+Math.cos(yaw)*side+Math.sin(yaw)*forward,z-Math.sin(yaw)*side+Math.cos(yaw)*forward,y);
    for(const sign of [-1,1]){
      const q=transform(sign*(width/2+1));box(`${name}.pier.${sign}`,q.x,q.z,y,1.5,5.5,1.6,0xb6aa8d,yaw);
      box(`${name}.capital.${sign}`,q.x,q.z,y+4.9,1.85,.6,1.95,0xc1b798,yaw);
      box(`${name}.foot.${sign}`,q.x,q.z,y,1.85,.45,1.95,0xa49a80,yaw);
    }
    box(`${name}.lintel`,x,z,y+4.7,width+3.7,.75,1.6,0xb6aa8d,yaw);
    box(`${name}.cornice`,x,z,y+5.45,width+4,.35,1.9,0xc7bca0,yaw);
    // Tangential stones form a coherent curved rib in the gate face, with open headroom below.
    for(let n=0;n<11;n++){
      const a=(n+.5)/11*Math.PI,q=transform(Math.cos(a)*width/2),height=3.2+Math.sin(a)*1.4;
      voussoir(`${name}.arch-rib.${n}`,{...q,y:y+height},width*Math.PI/22+.08,.38,1.8,yaw,
        Math.atan2(1.4*Math.cos(a),-width/2*Math.sin(a)),0xd0c2a0);
    }
  };
  if(id==='noble-quarter'){
    // South terrace is deliberately articulated at three spans, not tiled across the whole face.
    for(const [i,x] of [-45,-5,62].entries()){
      const base=urbanFloorAt(blueprint,x,-423.9)??22;
      box(`southern-buttress.${i}`,x,-423.9,base,2.1,32.8-base,3.5,0xa7997d);
      box(`southern-buttress-cap.${i}`,x,-423.9,32.8,2.7,.55,4,0xbbae91);
      // The relief sits beside its buttress, so the load-bearing projection leaves the crown readable.
      const archX=x+6.5;
      for(const sign of [-1,1])box(`southern-blind-arch.${i}.${sign}`,archX+sign*4.5,-423.95,base,1,27-base,.9,0xb9ac8b);
      for(let n=0;n<9;n++){
        const a=(n+.5)/9*Math.PI;
        voussoir(`southern-relieving-rib.${i}.${n}`,p(archX+Math.cos(a)*4.5,-423.95,27+Math.sin(a)*3.7),1.54,.7,.9,0,
          Math.atan2(3.7*Math.cos(a),-4.5*Math.sin(a)),0xc4b692);
      }
      box(`southern-balustrade.${i}`,x,-426.15,32.2,15,.95,.3,0xc1b496);
    }
    const road=blueprint.roads.find(r=>r.id==='court-ascent')!,a=road.points[1]!,b=road.points[2]!,t=.58;
    const q=p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
    gate('court-entry',q.x,q.z,q.y,Math.atan2(b.x-a.x,b.z-a.z),7.4);
  }else if(id==='temple-quarter'){
    // Upper bridge landing shoulders and a usable academy gate share the accepted 30 m approach.
    // Frame the straight approach, not the multi-road court center where the bank route arrives laterally.
    gate('academy-landing',278,-397,30,Math.atan2(5,-20),8.2);
    for(const [i,x] of [258,273,288,312,335].entries()){
      const z=-494.2,y=urbanFloorAt(blueprint,x,z);
      if(y===null||Math.abs(y-30)>.1)continue;
      box(`north-bank-buttress.${i}`,x,z,18,1.7,12.6,2.6,0xa29479);
      box(`north-bank-cap.${i}`,x,z,30.6,2.1,.45,3,0xc1b494);
    }
    const bankTerrain={...blueprint,roads:[]};
    for(const [i,z] of [-335,-358,-405].entries()){
      // Fit the exposed river-side edge, rather than burying detail inside the 22 m terrace.
      // Search east of the real water center and on terrain alone: a bridge deck is not a bank.
      let riverX=-Infinity,bank:number|undefined;
      for(const water of blueprint.waterways)for(let n=1;n<water.points.length;n++){
        const a=water.points[n-1]!,b=water.points[n]!,dz=b.z-a.z;if(Math.abs(dz)<.01)continue;
        const t=(z-a.z)/dz;if(t>=0&&t<=1)riverX=Math.max(riverX,a.x+(b.x-a.x)*t+water.width/2+1);
      }
      for(let x=Math.ceil(riverX*4)/4;x<=260;x+=.25)if(Math.abs((urbanFloorAt(bankTerrain,x,z)??-999)-22)<.05){bank=x;break;}
      if(bank===undefined)throw new Error(`No supported east-bank edge at ${z}`);
      box(`east-bank-support.${i}`,bank-.25,z,-2.2,2.1,23.65,2.5,0xa69a7f);
      box(`bank-service-ledge.${i}`,bank-.55,z,21.45,3.7,.55,5.7,0xaaa081);
      box(`bank-service-outer-rail.${i}`,bank-2.22,z,22,.28,1.05,5.7,0xc1b494);
      for(const sign of [-1,1]){
        box(`bank-service-end-rail.${i}.${sign}`,bank-.55,z+sign*2.72,22,3.7,1.05,.28,0xc1b494);
        for(const side of [-1,1])box(`bank-service-post.${i}.${sign}.${side}`,bank-.55+side*1.62,z+sign*2.6,22,.48,1.3,.48,0xcbbd9b);
      }
    }
    // Six substantial keyed stones emphasize each bridge abutment without touching the deck or rails.
    for(const [i,[x,z,y]] of [[224,-385,22],[265,-385,28.5],[265,-480,30],[228,-480,30]].entries()){
      for(const side of [-1,1])box(`bridge-landing.${i}.${side}`,x!,z!+side*5.2,y!-4.4,2.4,4.9,1.6,0xa99b7e);
      box(`bridge-landing-coping.${i}`,x!,z!+5.2,y!+.5,3,.38,2,0xc4b797);
    }
    // The unchanged high bridge climbs over the 22 m bank before its 30 m landing.
    // Two restrained stone frames support this exposed landward span, with feet
    // outside the protected deck and a real terrain seat, rather than facade legs.
    const approach=blueprint.roads.find(r=>r.id==='civic-high-bridge')!;
    const deckOnly={...blueprint,terrain:[],roads:[approach]};
    for(const [i,x] of [242,250].entries()){
      const deckY=urbanFloorAt(deckOnly,x,-385);if(deckY===null)throw new Error('Accepted high-bridge deck missing');
      const headerBottom=deckY-.8;
      for(const sign of [-1,1]){
        const z=-385+sign*4.9,base=urbanFloorAt(bankTerrain,x,z);
        if(base===null||headerBottom-base<2)throw new Error(`Unsupported high-bridge frame: ${x},${z}`);
        for(const dx of [-.55,.55])for(const dz of [-.55,.55])
          if(Math.abs((urbanFloorAt(bankTerrain,x+dx,z+dz)??-999)-base)>.025)throw new Error('High-bridge footing crosses an unsupported edge');
        box(`bridge-bank-frame.${i}.foot.${sign}`,x,z,base,1.1,.28,1.1,0xa29579);
        box(`bridge-bank-frame.${i}.pier.${sign}`,x,z,base+.22,.9,headerBottom-base-.22,.9,0xafa184);
        const haunch=structure(prefix,`bridge-bank-frame.${i}.haunch.${sign}`,x,-385+sign*4.35,
          headerBottom-.42,.8,.28,1.35,0xbbae91);haunch.rotationX=sign*.45;items.push(haunch);
      }
      box(`bridge-bank-frame.${i}.header`,x,-385,headerBottom,1.4,.45,10.7,0xbaad90);
    }
    // A thin inclined underside joins both headers to the existing road plane.
    // Its top stays 2 cm below that plane, preserving the authoritative deck collider.
    const x0=241.3,x1=250.7,y0=urbanFloorAt(deckOnly,x0,-385)!,y1=urbanFloorAt(deckOnly,x1,-385)!;
    const pitch=Math.atan2(y1-y0,x1-x0),offset=.18;
    const underside=structure(prefix,'bridge-bank-frame.deck-underside',(x0+x1)/2+Math.sin(pitch)*offset,-385,
      (y0+y1)/2-Math.cos(pitch)*offset-.16,Math.hypot(x1-x0,y1-y0),.32,approach.width,0xa89b80);
    underside.rotationZ=pitch;items.push(underside);
  }else{
    // Street-side gate at the level gate plaza, away from the monumental stairs and their safety corridor.
    gate('upper-service-gate',240,-527,40,0,6.6);
    for(const [i,z] of [-438,-452].entries()){
      box(`east-terrace-buttress.${i}`,220.8,z,30,1.8,10.6,3.2,0xa89a7d);
      box(`east-terrace-cap.${i}`,220.8,z,40.6,2.2,.4,3.6,0xbdae90);
    }
    for(const [i,x] of [118,157,201].entries()){
      box(`north-court-balustrade.${i}`,x,-568.7,40.12,11,1.05,.28,0xbbaa8b);
      for(const sign of [-1,1])box(`north-court-post.${i}.${sign}`,x+sign*5.1,-568.7,40.12,.55,1.3,.6,0xc6b99a);
    }
  }
  return items;
}

/** Bounded authored lots, local service ribbons and activity over the immutable M6.1 macro blueprint. */
export function createUpperCityDistricts(blueprint:CityBlueprint):UrbanDistrict[]{
  return (Object.keys(plans) as UpperId[]).map(id=>{
    const plan=plans[id],prefix=`m9.${id}`,buildings:UrbanBuilding[]=[],rejected:string[]=[];
    const obstacles=blueprint.landmarks.filter(b=>b.collides&&!UPPER_REPLACED_LANDMARKS.includes(b.id));
    const paths=[plan.route,...plan.lanes],segments=paths.flatMap(path=>path.slice(1).map((end,i)=>[path[i]!,end] as const));
    const heroNames=new Set(['academy-tower','west-ceremonial-lodge','court-administration','east-gate-house','house-of-measures']);
    const blocks:Parcel[]=blueprint.massing[id].filter(b=>b.collides).map((b,i)=>{
      const nearest=segments.map(([a,c])=>{
        const dx=c.x-a.x,dz=c.z-a.z,t=Math.max(0,Math.min(1,((b.position.x-a.x)*dx+(b.position.z-a.z)*dz)/(dx*dx+dz*dz||1)));
        return p(a.x+dx*t,a.z+dz*t,a.y+(c.y-a.y)*t);
      }).sort((a,c)=>Math.hypot(a.x-b.position.x,a.z-b.position.z)-Math.hypot(c.x-b.position.x,c.z-b.position.z))[0]!;
      return [`blueprint-court.${i}`,b.position.x,b.position.z,b.size.x,b.size.z,
        (Math.round(Math.atan2(nearest.x-b.position.x,nearest.z-b.position.z)/(Math.PI/2))*Math.PI/2)||0,b.position.y-b.size.y/2];
    });
    const parcels=[...plan.parcels.filter(q=>heroNames.has(q[0])),...blocks,...plan.parcels.filter(q=>!heroNames.has(q[0]))];
    for(const [sequence,[name,x,z,width,depth,yaw,y,recipe]] of parcels.entries()){
      const b=urbanBuilding(id,name,x,z,width,depth,yaw,y,recipe,sequence);b.rearEntrance=false;b.hero=heroNames.has(name);
      b.awning=true;b.bays=Math.max(3,Math.round(width/(id==='temple-quarter'?4.1:3.7)));b.roofDirection=sequence%3===0?1:0;
      b.plaster=(id==='temple-quarter'?[0xdbd9bf,0xc7cdb4,0xd8c9a5]:id==='noble-quarter'?[0xe2d6ba,0xd7cbae,0xcfc2a4]:[0xd3c7aa,0xe0d2b2,0xc7b79b])[sequence%3]!;
      b.cloth=id==='temple-quarter'?0x6e8675:id==='noble-quarter'?0x778271:0x62766c;
      if(id==='noble-quarter'){b.roof=sequence%3===0?'hip':'mansard';b.floors=sequence%5===0?4:3;b.corner='pilaster';b.shopfront=sequence%3===1?'arcade':'wide';}
      if(id==='temple-quarter'){b.roof='hip';b.roofHeight=3.1+width*.045;b.corner='stone';b.shopfront=sequence%2?'arcade':'wide';b.balcony=sequence%4===0;}
      if(id==='upper-city'){b.roof=sequence%4===0?'mansard':'hip';b.shopfront=sequence%3===0?'arcade':'single';b.floors=sequence%5===0?4:3;}
      if(name==='academy-tower'){b.floors=7;b.floorHeight=4;b.roofHeight=4.7;b.roofColor=0x3a7470;b.shopfront='wide';b.bays=3;b.balcony=true;}
      if(name==='house-of-measures'){b.floors=4;b.floorHeight=3.7;b.roofHeight=4.8;b.roofColor=0x39726c;b.shopfront='wide';}
      if(name==='west-ceremonial-lodge'){b.floors=4;b.floorHeight=3.65;b.roofHeight=4.1;b.roofColor=0xb1663f;}
      if(name==='court-administration'){b.floors=4;b.floorHeight=3.8;b.roofHeight=4;b.roofColor=0x3b7470;}
      if(name==='east-gate-house'){b.floors=4;b.floorHeight=3.3;b.roofHeight=3.7;}
      // Even arcade bays leave the centered closed entrance between columns.
      if(b.shopfront==='arcade'&&b.bays%2)b.bays++;
      const cs=urbanCorners(b,.8),xs=cs.map(q=>q.x),zs=cs.map(q=>q.z);
      const overlaps=buildings.some(o=>{const c=urbanCorners(o,.8);return Math.min(...xs)<Math.max(...c.map(q=>q.x))&&Math.max(...xs)>Math.min(...c.map(q=>q.x))
        &&Math.min(...zs)<Math.max(...c.map(q=>q.z))&&Math.max(...zs)>Math.min(...c.map(q=>q.z));});
      const doors=[front(b),front(b,0,2.1)].every(q=>Math.abs((urbanFloorAt(blueprint,q.x,q.z)??-999)-y)<.06);
      const routeHit=segments.some(([a,c])=>{const count=Math.max(1,Math.ceil(Math.hypot(c.x-a.x,c.z-a.z)));return Array.from({length:count+1},(_,i)=>
        p(a.x+(c.x-a.x)*i/count,a.z+(c.z-a.z)*i/count,a.y+(c.y-a.y)*i/count)).some(q=>Math.abs(q.y-y)<1&&distance(q,b)<2);});
      const landmarkHit=obstacles.some(o=>cs.some(q=>Math.abs(q.x-o.position.x)<o.size.x/2+.4&&Math.abs(q.z-o.position.z)<o.size.z/2+.4));
      if(!urbanLotFits(blueprint,b,1)||overlaps||!doors||routeHit||landmarkHit){
        rejected.push(`${name} (${[!urbanLotFits(blueprint,b,1)?'support/road':'',overlaps?'overlap':'',!doors?'door apron':'',routeHit?'local route':'',landmarkHit?'landmark':''].filter(Boolean).join(', ')})`);
        if(b.hero)throw new Error(`Upper hero parcel unsupported: ${id} ${rejected.at(-1)}`);continue;
      }buildings.push(b);
    }
    const structures=transitions(id,blueprint),surfaces:UrbanDistrict['surfaces']=[],streets:UrbanDistrict['streets']=[];
    const supported=(q:Vec3)=>[q,...[.25,-.25,.5,-.5].flatMap(d=>[{...q,x:q.x+d},{...q,z:q.z+d}])]
      .some(v=>Math.abs((urbanFloorAt(blueprint,v.x,v.z)??-999)-q.y)<.09);
    const addPath=(name:string,a:Vec3,b:Vec3,width=1.8)=>{
      const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)return;
      for(let i=0;i<=Math.ceil(length/.3);i++){const t=i/Math.ceil(length/.3),q=p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
        if(!supported(q))throw new Error(`Unsupported upper local path: ${id}.${name} ${JSON.stringify(q)}`);
      }surfaces.push(ribbon(`${prefix}.${name}`,a,b,width));
    };
    // Preserve macro decks verbatim; only local service paths receive new collision/paving ribbons.
    for(const [pathIndex,path] of plan.lanes.entries()){
      path.slice(1).forEach((end,i)=>addPath(`service.${pathIndex}.${i}`,path[i]!,end));
      streets.push({id:`${prefix}.service.${pathIndex}`,points:path,width:1.8});
    }
    const local={...blueprint,terrain:[...blueprint.terrain,...surfaces]};
    const boxDistance=(q:Vec3,o:BoxSpec)=>{
      if(q.y+1.7<o.position.y-o.size.y/2||q.y>o.position.y+o.size.y/2)return Infinity;
      const dx=q.x-o.position.x,dz=q.z-o.position.z,yaw=o.rotationY??0,x=Math.cos(yaw)*dx-Math.sin(yaw)*dz,z=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
      return Math.hypot(Math.max(0,Math.abs(x)-o.size.x/2),Math.max(0,Math.abs(z)-o.size.z/2));
    };
    const gardens=plan.gardens.filter(([x,z,y,r])=>Math.abs((urbanFloorAt(local,x,z)??-999)-y)<.06&&buildings.every(b=>distance(p(x,z,y),b)>r+.5)
      &&segments.every(([a,b])=>urbanSegmentDistance(p(x,z,y),a,b)>r+1.3)&&[...obstacles,...structures].every(o=>boxDistance(p(x,z,y),o)>r+.5))
      .map(([x,z,y,r,tree,scale],i)=>({id:`${prefix}.garden.${i}`,position:p(x,z,y),radius:r,tree,scale}));
    const clear=(a:Vec3,b:Vec3,r=.28)=>{
      const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.3));
      for(let i=0;i<=count;i++){const t=i/count,q=p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
        if(!supported(q)||buildings.some(building=>{
          if(distance(q,building)<r)return true;
          const dx=q.x-building.position.x,dz=q.z-building.position.z,x=Math.cos(building.yaw)*dx-Math.sin(building.yaw)*dz,z=Math.sin(building.yaw)*dx+Math.cos(building.yaw)*dz;
          if(Math.abs(x)<.725+r&&Math.abs(z-building.depth/2-.22)<.325+r)return true;
          return building.shopfront==='arcade'&&Array.from({length:building.bays},(_,bay)=>-building.width*.42+building.width*.84*bay/(building.bays-1))
            .some(post=>Math.hypot(Math.max(0,Math.abs(x-post)-.135),Math.max(0,Math.abs(z-building.depth/2-1.65)-.135))<r);
        })||[...obstacles,...structures].some(o=>boxDistance(q,o)<r)||gardens.some(g=>Math.hypot(q.x-g.position.x,q.z-g.position.z)<g.scale*.33+r))return false;
      }return true;
    };
    const nodes:UrbanDistrict['npcs']['nodes']={},edges:UrbanDistrict['npcs']['edges']=[],keys=new Map<string,string>();
    const node=(q:Vec3)=>{const coordinate=`${q.x.toFixed(4)}:${q.y.toFixed(4)}:${q.z.toFixed(4)}`;let key=keys.get(coordinate);
      if(!key){key=`${prefix}.street.${keys.size}`;keys.set(coordinate,key);nodes[key]={...q,y:q.y+.012};}return key;};
    const streetEdges=segments.map(([a,b])=>{const pair=[node(a),node(b)] as [string,string];edges.push(pair);return pair;});
    const shelters:string[]=[];
    for(const b of buildings){
      // The single canopy is 3.12 m wide before its bounded scale; stay within its real coverage.
      const point=front(b,1.2,.78),candidates=segments.map(([a,c],i)=>{
        const dx=c.x-a.x,dz=c.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));
        const q=p(a.x+dx*t,a.z+dz*t,a.y+(c.y-a.y)*t);return {q,i,d:Math.hypot(q.x-point.x,q.z-point.z)};
      }).sort((a,c)=>a.d-c.d),candidate=candidates.find(c=>Math.abs(c.q.y-point.y)<.06&&clear(point,c.q));
      if(!candidate)continue;const key=`${prefix}.shelter.${shelters.length}`,join=`${key}.join`;
      nodes[key]={...point,y:point.y+.012};nodes[join]={...candidate.q,y:candidate.q.y+.012};edges.push([key,join],[join,streetEdges[candidate.i]![0]],[join,streetEdges[candidate.i]![1]]);
      addPath(`shelter.${shelters.length}`,point,candidate.q,1.1);shelters.push(key);
    }
    if(shelters.length<3)throw new Error(`Upper ${id} has only ${shelters.length} connected real shelters`);
    const tour=plan.route.slice(0,-1).filter((_,i)=>i%2===0).map(node);
    const definitions:UrbanDistrict['npcs']['definitions']=Array.from({length:plan.locals},(_,i)=>({
      id:`${prefix}.local.${String(i).padStart(2,'0')}`,name:`${['Iona','Jorin','Kira','Lio','Mara','Neri','Olin','Pera'][i%8]} ${i+1} · ${plan.roles[i%4]}`,
      dialogue:plan.identity,rainDialogue:'The covered court frontage gives us shelter; the passage stays open.',eveningDialogue:'The terrace lamps mark the route home above the lower city.',
      dayRoute:[shelters[i%shelters.length]!,...tour],duskRoute:[tour[i%tour.length]!,shelters[i%shelters.length]!],shelterNode:shelters[i%shelters.length]!,
      walkSpeed:.72+i%6*.045,idleSeconds:7+i%5*2,initialWait:i*1.73%12,
      appearance:{height:1.6+i%8*.032,coat:[0x65705d,0x817461,0x567875,0x8a6a59][i%4]!,trousers:0x504c43,
        skin:[0xb98c65,0xd3a67e,0x92694f][i%3]!,hair:0x493a2e,hat:i%4===0,apron:i%6===1,accessory:i%2?'satchel':'belt'}}));
    const lamps:UrbanDistrict['lamps']=[];
    for(const q of plan.route.filter((_,i)=>i%2===0)){
      const c=[[2,2],[-2,2],[2,-2],[-2,-2],[3,0],[0,3]].map(([dx,dz])=>p(q.x+dx!,q.z+dz!,q.y))
        .find(v=>supported(v)&&buildings.every(b=>distance(v,b)>.7)&&[...obstacles,...structures].every(o=>boxDistance(v,o)>.7)
          &&edges.every(([a,b])=>urbanSegmentDistance(v,nodes[a]!,nodes[b]!)>.85)&&lamps.every(l=>Math.hypot(l[0]-v.x,l[2]-v.z)>4));
      if(c)lamps.push([c.x,c.y+3.4,c.z]);
    }
    const planting:NonNullable<UrbanDistrict['planting']>=[];
    for(const [index,g] of gardens.entries())for(let n=0;n<90;n++){
      const angle=n*2.399+index*1.8,r=Math.sqrt((n+.5)/90)*g.radius,q=p(g.position.x+Math.cos(angle)*r,g.position.z+Math.sin(angle)*r,g.position.y);
      if(!supported(q)||buildings.some(b=>distance(q,b)<1)||edges.some(([a,b])=>urbanSegmentDistance(q,nodes[a]!,nodes[b]!)<1))continue;
      planting.push({id:`${prefix}.plant.${index}.${n}`,kind:['ecology-clover','fern','ecology-groundcover','white','short'][n%5]!,position:q,scale:.45+n%5*.065,heading:angle});
    }
    // Selected narrow ledge margins use real botanical geometry at their existing terrace floor.
    const ledges=id==='temple-quarter'?[[257,-339,22],[254,-362,22],[234,-403,22]]:id==='noble-quarter'?[[80,-437,32],[-62,-435,32]]:[[225,-444,40]];
    for(const [index,[x,z,y]] of ledges.entries())for(let n=0;n<28;n++){
      const q=p(x!+Math.sin(n*1.9)*1.35,z!-3+n*.23,y!);
      if(!supported(q)||buildings.some(b=>distance(q,b)<.9)||edges.some(([a,b])=>urbanSegmentDistance(q,nodes[a]!,nodes[b]!)<1.1))continue;
      planting.push({id:`${prefix}.ledge-plant.${index}.${n}`,kind:n%4===0?'fern':'ecology-groundcover',position:q,scale:.5+n%4*.07,heading:n*.9});
    }
    const grouped={id:`${prefix}.local-service-support`,vertices:[] as number[],indices:[] as number[],color:0xbcad91};
    for(const surface of surfaces){const offset=grouped.vertices.length/3;grouped.vertices.push(...surface.vertices);grouped.indices.push(...surface.indices.map(i=>i+offset));}
    return {id,identity:plan.identity,buildings,dressing:[],gardens,planting,stalls:[],lamps,streets,surfaces:[grouped],structures,
      route:plan.route,views:{street:{position:{...plan.route[0]!,y:plan.route[0]!.y+.04},yaw:id==='temple-quarter'?-.7:0,pitch:.08},
        terrace:{position:id==='noble-quarter'?p(-45,-395,20.04):id==='temple-quarter'?p(203,-350,22.04):p(240,-542,40.04),
          yaw:id==='noble-quarter'?0:id==='temple-quarter'?Math.atan2(-16,8):Math.PI/2,
          pitch:id==='noble-quarter'?.22:id==='temple-quarter'?-.4:.1},
        bridge:{position:id==='temple-quarter'?p(245,-477.8,30.04):id==='upper-city'?p(220,-535,38.04):p(85,-495,32.04),
          yaw:id==='temple-quarter'?Math.atan2(25,-52.8):Math.PI/2,pitch:id==='temple-quarter'?-.49:.12},
        close:{position:{...front(buildings[0]!,0,2.4),y:buildings[0]!.position.y+.04},yaw:buildings[0]!.yaw,pitch:.05}},
      eagle:{position:id==='temple-quarter'?p(430,-270,155):id==='noble-quarter'?p(-140,-360,180):p(35,-400,170),target:plan.route[0]!,fov:50},
      npcs:{nodes,edges,definitions},ambience:plan.ambience,assumptions:[
        'Court households, academy uses, rear facades and service passages are authored interpretations of unseen reference detail.',
        'Upper recipes use larger tall-floor proportions, stone/pilaster corners, hipped or mansard roofs and restrained cream/olive cloth palettes.',
        'Selected southern relieving arches are blind structural retaining-wall treatments, not promised interiors; gates preserve real open controller corridors.',
        `Rejected unsupported/conflicting candidate parcels: ${rejected.join('; ')||'none'}.`,
      ]};
  });
}
