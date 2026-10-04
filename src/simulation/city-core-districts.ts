import type { CityBlueprint } from './city-contracts';
import type { UrbanBuilding, UrbanDistrict, UrbanRecipe } from './urban-contracts';
import type { Vec3 } from './types';
import { urbanBuilding, urbanCorners, urbanFloorAt, urbanLotFits, urbanSegmentDistance } from './urban-grammar';

type NewDistrict = 'civic-terrace' | 'garden-terrace' | 'south-gate';
type Parcel = [string, number, number, number, number, number, number, UrbanRecipe?];
const p=(x:number,z:number,y:number):Vec3=>({x,y,z});
const front=(b:UrbanBuilding,lateral=0,out=1):Vec3=>({
  x:b.position.x+Math.cos(b.yaw)*lateral+Math.sin(b.yaw)*(b.depth/2+out),y:b.position.y,
  z:b.position.z-Math.sin(b.yaw)*lateral+Math.cos(b.yaw)*(b.depth/2+out)});
function bodyDistance(point:Vec3,b:UrbanBuilding){
  const dx=point.x-b.position.x,dz=point.z-b.position.z;
  const x=Math.cos(b.yaw)*dx-Math.sin(b.yaw)*dz,z=Math.sin(b.yaw)*dx+Math.cos(b.yaw)*dz;
  return Math.hypot(Math.max(0,Math.abs(x)-b.width/2),Math.max(0,Math.abs(z)-b.depth/2));
}
function strip(id:string,a:Vec3,b:Vec3,width:number):UrbanDistrict['surfaces'][number]{
  const length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/length*width/2,nz=(b.x-a.x)/length*width/2;
  return {id,color:0xb3a68b,vertices:[a.x+nx,a.y,a.z+nz,b.x+nx,b.y,b.z+nz,b.x-nx,b.y,b.z-nz,a.x-nx,a.y,a.z-nz],indices:[0,1,2,0,2,3]};
}
function row(name:string,x:number,z:number,count:number,step:number,axis:'x'|'z',yaw:number,y:number,depth:number):Parcel[]{
  // Named street-wall runs with deliberate gaps and alternating parcel widths.
  return Array.from({length:count},(_,i)=>[`${name}.${i}`,x+(axis==='x'?i*step:0),z+(axis==='z'?i*step:0),
    [8.4,9.6,7.8,10.2,9.1][i%5]!,depth+[0,.6,-.4,.3][i%4]!,yaw,y]);
}

const plans:Record<NewDistrict,{identity:string;parcels:Parcel[];route:Vec3[];lanes?:Vec3[][];gardens:[number,number,number,number,string,number][];locals:number;ambience:UrbanDistrict['ambience']}>={
  'civic-terrace':{
    identity:'Public terrace: pale archive streets, a broad roofed assembly hall, planted retaining lanes and formal stone corners.',
    parcels:[['assembly-hall',145,-397,30,20,0,22,'hall'],
      ...row('archive-north',8,-334,9,11.5,'x',0,22,11),
      ...row('east-records',195,-344,7,-11,'z',-Math.PI/2,22,13),
      ...row('west-court',20,-346,5,-12.5,'z',Math.PI/2,22,12),
      ...row('hall-neighbors',73,-407,4,12,'x',0,22,10),
      ...row('east-hall',183,-408,3,12,'x',0,22,10),
      ...row('stair-front',136,-347,5,12,'x',0,22,9),
      ...row('west-retaining',-56,-381,3,-12,'z',Math.PI/2,20,10),
      ...row('civic-court',71,-375,3,12,'x',0,22,10),
      ...row('stair-edge-arcades',131,-329,5,13,'x',0,22,9),
      ['record-yard-west',85,-389,12,12,0,22,'civic-house'],
      ['record-yard-east',106,-391,15,12,0,22,'exchange-house'],
      ['assembly-side-office',175,-381,12,10,Math.PI/2,22,'civic-house'],
      ['public-lane-lodging',172,-349,10,14,-Math.PI/2,22,'corner-inn']],
    route:[p(110,-365,22),p(85,-345,22),p(50,-355,22),p(35,-320,22),p(85,-320,22),p(85,-345,22),
      p(50,-355,22),p(50,-395,22),p(110,-365,22),p(145,-383,22),p(110,-365,22)],
    gardens:[[26,-365,22,3.2,'tree-hornbeam-1',.68],[98,-385,22,3.8,'tree-ash-0',.75],
      [180,-377,22,3.5,'tree-orchard-0',.65],[202,-322,22,3,'tree-hornbeam-0',.67],[-33,-406,20,2.8,'tree-ash-1',.6],
      [164,-419,22,5,'tree-hornbeam-1',.8],[-34,-384,20,7,'tree-ash-0',.85],
      [126,-336,22,6,'tree-hornbeam-0',.85],[82,-354,22,3.2,'tree-orchard-1',.65],
      [143,-372,22,3.4,'tree-ash-1',.7],[208,-380,22,4.5,'tree-hornbeam-1',.75]],
    locals:24,ambience:{market:.32,workshop:.12,river:.22,position:p(110,-365,22)},
  },
  'garden-terrace':{
    identity:'Garden approach: low orchard households, a seed exchange, irregular planting courts and narrow workshop edges around the ascent.',
    parcels:[['seed-exchange',85,-79,18,12,Math.PI,8,'water-guild'],
      ...row('orchard-north',-48,-80,10,12,'x',Math.PI,8,10),
      ...row('garden-east',145,-132,6,12,'x',0,8,12),
      ...row('south-households',-40,-147,10,12,'x',0,8,10),
      ...row('upper-workshops',172,-89,3,12,'x',Math.PI,8,9),
      ...row('garden-court',-42,-112,5,12,'x',0,8,9)],
    route:[p(110,-110,8),p(119,-108.7142857,8),p(119,-100,8),p(70,-94,8),p(25,-100,8),p(25,-118,8),p(65,-124,8),p(95,-118,8),p(110,-118,8),p(110,-110,8)],
    lanes:[[p(-49,-90,8),p(72,-90,8),p(70,-94,8)],
      [p(-42,-104,8),p(18,-104,8),p(25,-100,8)],
      [p(-40,-137,8),p(62,-137,8),p(65,-124,8)],
      [p(138,-120,8),p(202,-120,8)],
      [p(138,-120,8),p(138,-106,8),p(145,-105,8),p(119,-108.7142857,8)]],
    gardens:[[0,-91,8,6,'tree-orchard-0',.85],[44,-112,8,4.8,'tree-orchard-1',.8],
      [80,-112,8,4.2,'tree-hornbeam-1',.78],[145,-145,8,4.2,'tree-ash-0',.72],
      [160,-117,8,4,'tree-orchard-0',.8],[-57,-127,8,5,'tree-ash-1',.78],
      [3,-136,8,4.7,'tree-orchard-1',.83],[53,-70,8,4.3,'tree-hornbeam-0',.73],
      [195,-140,8,4,'tree-orchard-0',.72],[122,-89,8,4.1,'tree-ash-0',.76]],
    locals:16,ambience:{market:.28,workshop:.24,river:.05,position:p(85,-94,8)},
  },
  'south-gate':{
    identity:'River gate: a customs watch roof, cart stores, work aprons and traveler lodging between the old workshops and canal.',
    parcels:[['customs-watch',252,-34,12,10,Math.PI,4,'hall'],
      ...row('gate-west',229,16,3,12,'z',Math.PI/2,4,10),
      ...row('gate-stores',282,-28,6,12,'x',Math.PI,4,12),
      ...row('cart-lodging',282,12,6,12,'x',0,4,13),
      ...row('river-return',353,-55,5,12,'z',-Math.PI/2,4,11),
      ...row('gate-back',287,36,5,12,'x',Math.PI,4,9),
      ['watch-clerks',237,-18,9,10,Math.PI,4,'gate-house'],['east-customs-office',367,21,10,10,-Math.PI/2,4,'corner-inn']],
    route:[p(240,-55,4),p(240,-45,4),p(230,-30,4),p(230,-8,4),p(225,-8,4),p(225,-30,4),p(240,-55,4),
      p(260,-65,4),p(315,-65,4),p(315,-50,4),p(290,-7,4),p(325,-7,4),p(342,-7,4),p(342,-43,4),p(315,-50,4),p(315,-65,4),p(260,-65,4),p(240,-55,4)],
    gardens:[[264,17,4,3,'tree-hornbeam-1',.66],[343,32,4,3.3,'tree-ash-0',.67],
      [331,-47,4,3.2,'tree-alder-1',.6],[231,-59,4,2.8,'tree-orchard-0',.57],[365,39,4,3,'tree-ash-1',.62]],
    locals:18,ambience:{market:.38,workshop:.68,river:.56,position:p(248,-50,4)},
  },
};

/** Authored block composition over unchanged blueprint support, not an unbounded lot generator. */
export function createCoreDistricts(blueprint:CityBlueprint):UrbanDistrict[]{
  return (Object.keys(plans) as NewDistrict[]).map(id=>{
    const plan=plans[id],prefix=`m8.${id}`,buildings:UrbanBuilding[]=[];
    const replaced=['city.landmark.civic-hall','city.landmark.south-gate-tower'];
    const obstacles=blueprint.landmarks.filter(b=>b.collides&&!replaced.includes(b.id));
    const routeSegments=[plan.route,...plan.lanes??[]].flatMap(path=>path.slice(1).map((end,i)=>[path[i]!,end] as const));
    // Approved macro block envelopes establish purposeful density before small frontage infill.
    const blocks:Parcel[]=blueprint.massing[id].filter(b=>b.collides).map((b,i)=>{
      const toward=routeSegments.map(([a,c])=>{
        const dx=c.x-a.x,dz=c.z-a.z,t=Math.max(0,Math.min(1,((b.position.x-a.x)*dx+(b.position.z-a.z)*dz)/(dx*dx+dz*dz)));
        return p(a.x+dx*t,a.z+dz*t,a.y);
      }).sort((a,c)=>Math.hypot(a.x-b.position.x,a.z-b.position.z)-Math.hypot(c.x-b.position.x,c.z-b.position.z))[0]!;
      const yaw=Math.round(Math.atan2(toward.x-b.position.x,toward.z-b.position.z)/(Math.PI/2))*Math.PI/2;
      return [`blueprint-block.${i}`,b.position.x,b.position.z,b.size.x,b.size.z,yaw,b.position.y-b.size.y/2];
    });
    const parcels=[plan.parcels[0]!,...blocks,...plan.parcels.slice(1)];
    for(const [sequence,parcel] of parcels.entries()){
      const [name,x,z,width,depth,yaw,y,recipe]=parcel;
      const b=urbanBuilding(id,name,x,z,width,depth,yaw,y,recipe,sequence);
      b.hero=sequence===0;b.rearEntrance=false;
      if(b.hero){b.awning=true;b.bays=id==='civic-terrace'?8:4;b.roofColor=0x3b7470;
        if(id==='civic-terrace'){b.floors=4;b.floorHeight=4;b.roofHeight=4.2;}
        if(id==='south-gate'){b.floors=4;b.floorHeight=3.5;b.shopfront='wide';b.roofHeight=3.1;}}
      else {b.bays=Math.max(2,Math.round(width/3.6));b.shopfront=sequence%3===0?'paired':b.archetype==='workshop'?'service':'single';
        b.roofDirection=sequence%4===1?1:0;b.roof=sequence%4===0?'hip':sequence%4===2&&id==='civic-terrace'?'mansard':'gable';
        b.roofHeight+=sequence%5*.13;b.shutterOffset=(sequence*3)%4;
        if(id==='garden-terrace'){b.balcony=false;b.floors=sequence%7===0?3:2;}}
      const corners=urbanCorners(b,.7),xs=corners.map(c=>c.x),zs=corners.map(c=>c.z);
      const overlap=buildings.some(other=>{
        const cs=urbanCorners(other,.7);return Math.min(...xs)<Math.max(...cs.map(c=>c.x))&&Math.max(...xs)>Math.min(...cs.map(c=>c.x))
          &&Math.min(...zs)<Math.max(...cs.map(c=>c.z))&&Math.max(...zs)>Math.min(...cs.map(c=>c.z));});
      const door=front(b),approach=front(b,0,2.1);
      const grounded=[door,approach].every(q=>Math.abs((urbanFloorAt(blueprint,q.x,q.z)??-999)-y)<.05);
      const blocksRoute=routeSegments.some(([a,c])=>{
        const count=Math.ceil(Math.hypot(c.x-a.x,c.z-a.z));
        return Array.from({length:count+1},(_,n)=>p(a.x+(c.x-a.x)*n/count,a.z+(c.z-a.z)*n/count,a.y))
          .some(q=>Math.abs(q.y-y)<1&&bodyDistance(q,b)<1.8);});
      const hitsLandmark=obstacles.some(o=>corners.some(q=>Math.abs(q.x-o.position.x)<o.size.x/2+.4&&Math.abs(q.z-o.position.z)<o.size.z/2+.4));
      if(!urbanLotFits(blueprint,b,1)||overlap||!grounded||blocksRoute||hitsLandmark){
        if(b.hero)throw new Error(`Core hero parcel is unsupported or conflicts: ${b.id}`);continue;
      }buildings.push(b);
    }
    const surfaces:UrbanDistrict['surfaces']=[];
    // Local route ribbons bridge only <=0.6m coplanar shoulder cutouts.
    const supported=(q:Vec3)=>[q,...[.25,-.25,.5,-.5].flatMap(d=>[{...q,x:q.x+d},{...q,z:q.z+d}])]
      .some(s=>Math.abs((urbanFloorAt(blueprint,s.x,s.z)??-999)-q.y)<.08);
    const addPath=(name:string,a:Vec3,b:Vec3,width=1.3)=>{
      const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)return;
      for(let n=0;n<=Math.ceil(length/.3);n++){
        const t=n/Math.ceil(length/.3),q=p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
        if(!supported(q))throw new Error(`Core local lane lacks blueprint support: ${name} ${JSON.stringify(q)}`);
      }surfaces.push(strip(`${prefix}.${name}`,a,b,width));
    };
    for(const [i,[a,b]] of routeSegments.entries())addPath(`lane.${i}`,a,b,id==='garden-terrace'?2.4:2);
    const local={...blueprint,terrain:[...blueprint.terrain,...surfaces]};
    const clear=(a:Vec3,b:Vec3,radius=.35)=>{
      const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.35));
      for(let n=0;n<=count;n++){
        const t=n/count,q=p(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,a.y+(b.y-a.y)*t);
        if(!supported(q)||buildings.some(building=>{
          if(bodyDistance(q,building)<radius)return true;
          const dx=q.x-building.position.x,dz=q.z-building.position.z;
          const x=Math.cos(building.yaw)*dx-Math.sin(building.yaw)*dz,z=Math.sin(building.yaw)*dx+Math.cos(building.yaw)*dz;
          if(Math.abs(x)<.725+radius&&Math.abs(z-building.depth/2-.22)<.325+radius)return true;
          return building.shopfront==='arcade'&&Array.from({length:building.bays},(_,bay)=>-building.width*.42+building.width*.84*bay/(building.bays-1))
            .some(post=>Math.hypot(Math.max(0,Math.abs(x-post)-.135),Math.max(0,Math.abs(z-building.depth/2-1.65)-.135))<radius);
        }))return false;
        if(gardens.some(g=>g.tree&&Math.hypot(q.x-g.position.x,q.z-g.position.z)<g.scale*.33+radius))return false;
        if(obstacles.some(o=>Math.abs(q.x-o.position.x)<o.size.x/2+radius&&Math.abs(q.z-o.position.z)<o.size.z/2+radius))return false;
      }return true;
    };
    const roadClear=(q:Vec3,radius:number)=>blueprint.roads.filter(road=>road.districts.includes(id)).every(road=>
      road.points.slice(1).every((end,i)=>{
        const start=road.points[i]!,dx=end.x-start.x,dz=end.z-start.z,t=Math.max(0,Math.min(1,((q.x-start.x)*dx+(q.z-start.z)*dz)/(dx*dx+dz*dz||1)));
        return Math.abs(q.y-(start.y+(end.y-start.y)*t))>1||urbanSegmentDistance(q,start,end)>radius+road.width/2+.4;
      }));
    const gardens=plan.gardens.filter(([x,z,y,r])=>Math.abs((urbanFloorAt(local,x,z)??-999)-y)<.05
      &&buildings.every(b=>bodyDistance(p(x,z,y),b)>r+.5)&&routeSegments.every(([a,b])=>urbanSegmentDistance(p(x,z,y),a,b)>r+1.2)
      &&roadClear(p(x,z,y),r))
      .map(([x,z,y,r,tree,scale],i)=>({id:`${prefix}.garden.${i}`,position:p(x,z,y),radius:r,tree,scale}));
    const nodes:UrbanDistrict['npcs']['nodes']={},edges:UrbanDistrict['npcs']['edges']=[];
    plan.route.slice(0,-1).forEach((q,i)=>{nodes[`${prefix}.street.${i}`]={...q,y:q.y+.012};
      if(i)edges.push([`${prefix}.street.${i-1}`,`${prefix}.street.${i}`]);});
    edges.push([`${prefix}.street.${plan.route.length-2}`,`${prefix}.street.0`]);
    const streetEdges=routeSegments.map(([a,b],i)=>{
      const start=`${prefix}.lane.${i}.a`,end=`${prefix}.lane.${i}.b`;
      nodes[start]={...a,y:a.y+.012};nodes[end]={...b,y:b.y+.012};edges.push([start,end]);
      // Lane vertices share exact authored route/lane coordinates; no geometric shortcut.
      for(const key of [start,end])for(const [other,q] of Object.entries(nodes))if(other!==key&&Math.hypot(q.x-nodes[key]!.x,q.y-nodes[key]!.y,q.z-nodes[key]!.z)<.03)edges.push([key,other]);
      return [start,end] as [string,string];
    });
    const shelters:string[]=[];
    for(const b of buildings.filter(b=>b.awning)){
      const point=front(b,b.width*.22,.75);
      const candidates=routeSegments.map(([a,c],i)=>{
        const dx=c.x-a.x,dz=c.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
        const q=p(a.x+dx*t,a.z+dz*t,a.y+(c.y-a.y)*t);
        return {i,q,d:Math.hypot(q.x-point.x,q.z-point.z)};
      }).sort((a,b)=>a.d-b.d);
      const candidate=candidates.find(c=>Math.abs(c.q.y-point.y)<.05&&clear(point,c.q));
      if(!candidate)continue;
      const key=`${prefix}.shelter.${shelters.length}`,join=`${key}.join`;
      nodes[key]={...point,y:point.y+.012};nodes[join]={...candidate.q,y:candidate.q.y+.012};
      edges.push([key,join],[join,streetEdges[candidate.i]![0]],[join,streetEdges[candidate.i]![1]]);
      addPath(`shelter-lane.${shelters.length}`,point,candidate.q,1.1);shelters.push(key);
    }
    if(shelters.length<3)throw new Error(`Core ${id} needs connected sheltered fronts; found ${shelters.length}`);
    const roles=id==='civic-terrace'?['archivist','courier','resident','stone keeper']:id==='garden-terrace'?['gardener','seed seller','resident','joiner']:['porter','customs clerk','traveler','wheelwright'];
    const definitions:UrbanDistrict['npcs']['definitions']=Array.from({length:plan.locals},(_,i)=>{
      const shelter=shelters[i%shelters.length]!,role=roles[i%roles.length]!,tour=[0,2,Math.min(4,plan.route.length-2)].map(n=>`${prefix}.street.${n}`);
      return {id:`${prefix}.local.${String(i).padStart(2,'0')}`,name:`${['Ada','Bran','Cira','Daro','Ena','Faro','Gia','Haro'][i%8]} ${i+1} · ${role}`,
        dialogue:plan.identity,rainDialogue:'The covered frontage is dry. I will wait here while the rain passes.',
        eveningDialogue:'The lamps are being lit along our street. The public route remains open.',
        dayRoute:[shelter,...tour],duskRoute:[tour[i%tour.length]!,shelter],shelterNode:shelter,
        walkSpeed:.7+i%6*.05,idleSeconds:6+i%5*2,initialWait:i*1.73%12,
        appearance:{height:1.58+i%8*.035,coat:[0x566c58,0x997853,0x567875,0x8c665a][i%4]!,trousers:0x504b42,
          skin:[0xb98c65,0xd3a67e,0x92694f][i%3]!,hair:0x493a2e,hat:i%3===0,apron:i%4===1,accessory:i%2?'satchel':'belt'}};
    });
    const dressing:UrbanDistrict['dressing']=[];
    for(const [i,b] of buildings.entries()){
      const q=front(b,(i%2?1:-1)*(b.width/2-.55),.6);
      if(!supported(q)||routeSegments.some(([a,c])=>urbanSegmentDistance(q,a,c)<1))continue;
      dressing.push({id:`${b.id}.gutter`,module:'stone',position:{...front(b,0,.25),y:b.position.y+.018},scale:[b.width-.7,.035,.19],yaw:b.yaw,tint:.7});
      dressing.push({id:`${b.id}.stock`,module:id==='garden-terrace'?'basket':i%2?'crate':'barrel',position:q,
        scale:[.6,.65,.6],yaw:b.yaw,tint:.92});
    }
    const grouped:UrbanDistrict['surfaces'][number]={id:`${prefix}.local-lanes`,vertices:[],indices:[],color:0xb3a68b};
    for(const surface of surfaces){const offset=grouped.vertices.length/3;grouped.vertices.push(...surface.vertices);grouped.indices.push(...surface.indices.map(n=>n+offset));}
    const lamps:UrbanDistrict['lamps']=[];
    for(const q of plan.route.filter((_,i)=>i%3===0)){
      const candidate=[[2,2],[-2,2],[2,-2],[-2,-2],[3,0],[0,3]].map(([dx,dz])=>p(q.x+dx!,q.z+dz!,q.y))
        .find(c=>Math.abs((urbanFloorAt(local,c.x,c.z)??-999)-c.y)<.05&&buildings.every(b=>bodyDistance(c,b)>.65)
          &&routeSegments.every(([a,b])=>urbanSegmentDistance(c,a,b)>.8)&&edges.every(([a,b])=>urbanSegmentDistance(c,nodes[a]!,nodes[b]!)>.8)
          &&lamps.every(l=>Math.hypot(l[0]-c.x,l[2]-c.z)>4));
      if(candidate)lamps.push([candidate.x,candidate.y+3.1,candidate.z]);
    }
    const planting:NonNullable<UrbanDistrict['planting']>=[];
    const contexts=id==='garden-terrace'?[[44,-112,18],[95,-88,15],[160,-115,17],[193,-142,13],[-25,-130,15],[0,-66,13],[-62,-103,11]]
      :id==='civic-terrace'?gardens.map(g=>[g.position.x,g.position.z,g.radius*1.35]):[[237,-16,7],[329,-47,10],[350,36,8]];
    const open=(q:Vec3,margin:number)=>Math.abs((urbanFloorAt(local,q.x,q.z)??-999)-q.y)<.05
      &&buildings.every(b=>bodyDistance(q,b)>margin)&&routeSegments.every(([a,b])=>urbanSegmentDistance(q,a,b)>margin)
      &&edges.every(([a,b])=>urbanSegmentDistance(q,nodes[a]!,nodes[b]!)>margin)&&roadClear(q,margin);
    for(const [index,[x,z,r]] of contexts.entries()){
      const y=id==='garden-terrace'?8:id==='civic-terrace'?gardens[index]!.position.y:4;
      for(let n=0;n<(id==='garden-terrace'?380:120);n++){
        const angle=n*2.399+index*1.71,radius=Math.sqrt((n+.5)/(id==='garden-terrace'?380:120))*r!*(.85+.15*Math.sin(angle*3+index));
        const q=p(x!+Math.cos(angle)*radius,z!+Math.sin(angle)*radius,y);
        if(!open(q,1.1))continue;
        planting.push({id:`${prefix}.plant.${index}.${n}`,kind:['ecology-clover','ecology-groundcover','short','fern','white'][n%5]!,position:q,scale:.45+n%7*.065,heading:angle});
      }
      if(id==='garden-terrace')for(let n=0;n<4;n++){
        const angle=index*1.4+n*1.9,q=p(x!+Math.cos(angle)*r!*.55,z!+Math.sin(angle)*r!*.55,y);
        if(open(q,3)&&gardens.every(g=>Math.hypot(g.position.x-q.x,g.position.z-q.z)>5))
          gardens.push({id:`${prefix}.orchard.${index}.${n}`,position:q,radius:2.2,tree:['tree-orchard-0','tree-ash-1','tree-hornbeam-1','tree-orchard-1'][n]!,scale:.64+(index+n)%5*.08});
      }
    }
    const plantedCourts:NonNullable<UrbanDistrict['plantedGround']>=[];
    if(id==='civic-terrace')for(const [i,g] of gardens.entries()){
      const source={id:`${prefix}.planted-court.${i}`,vertices:[g.position.x,g.position.y+.04,g.position.z],indices:[] as number[],color:0x6b784a};
      // Authored court islands soften the public stone terrace without moving roads or collision.
      for(let n=0;n<12;n++){
        const angle=n/12*Math.PI*2,radius=g.radius*(.8+.12*Math.sin(n*1.7+i));
        const x=g.position.x+Math.cos(angle)*radius,z=g.position.z+Math.sin(angle)*radius;
        if(Math.abs((urbanFloorAt(local,x,z)??-999)-g.position.y)>.05)throw new Error(`Civic planting court lacks support: ${source.id}`);
        source.vertices.push(x,g.position.y+.04,z);
      }
      for(let n=0;n<12;n++)source.indices.push(0,(n+1)%12+1,n+1);
      plantedCourts.push(source);
    }
    const view=plan.route[0]!;
    return {id,identity:plan.identity,buildings,dressing,gardens,planting,stalls:[],lamps,
      ...(id==='garden-terrace'?{plantedGround:blueprint.terrain.filter(s=>s.id===`city.terrain.${id}`)}:plantedCourts.length?{plantedGround:plantedCourts}:{}),
      streets:[{id:`${prefix}.public-circuit`,width:2,points:plan.route},...(plan.lanes??[]).map((points,i)=>({id:`${prefix}.frontage-lane.${i}`,width:2,points}))],surfaces:[grouped],route:plan.route,
      views:{street:{position:view,yaw:id==='civic-terrace'?-.75:id==='south-gate'?-.25:1.7,pitch:.12},
        alley:{position:plan.route[3]!,yaw:id==='garden-terrace'?0:-Math.PI/2,pitch:.03},
        doorway:{position:front(buildings[0]!,0,2.1),yaw:buildings[0]!.yaw,pitch:.1},
        hero:{position:view,yaw:id==='civic-terrace'?-.75:id==='south-gate'?-.25:1.7,pitch:.18}},
      eagle:{position:p(view.x-120,view.z+95,150),target:p(view.x,view.z,view.y+5),fov:48},
      npcs:{nodes,edges,definitions},ambience:plan.ambience,
      assumptions:['Named frontage runs, trades, garden courts and closed entrances are authored interpretations of unseen master details.',
        'The fourteen-district topology, water datum and macro roads remain unchanged. Narrow local paving covers supported coplanar road shoulders.',
        'Civic Hall and South Gate Watch replace their original proxy envelopes with complete all-side kit compositions; the upper skyline is deferred to M9.']};
  });
}
