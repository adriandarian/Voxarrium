import type { CitadelSpec } from './citadel-contracts';
import type { CityBlueprint } from './city-contracts';
import type { BoxSpec, CourseSpec, Vec3 } from './types';
import { cityRoadSurfaces } from './city-blueprint';

export const CITADEL_POSITION: Vec3 = { x:150, y:50, z:-605 };
/** Parent-owned fixed light pool keeps shader light counts stable across streaming. */
export const CITADEL_LAMPS = [[160,50,-573.6],[182,50,-573.6],[105,54.4,-607.3],[225,53.8,-587.3]] as const;
/** Ordinary controller input follows the accepted ascent and ceremonial forecourt. */
export const CITADEL_ROUTE: Vec3[] = [
  {x:185,y:40,z:-550},{x:150,y:50,z:-605},{x:95,y:50,z:-605},
  {x:95,y:50,z:-585},{x:175,y:50,z:-585},{x:150,y:50,z:-605},
];
/** Supported route-adjacent public space under the real west arcade. */
export const CITADEL_SHELTERS: Record<string,Vec3> = {
  westArcade:{x:110,y:50,z:-606.8},
};
/** Only the added pavilion cap receives the elevated rain clipping volume;
 * the keep hip and all previous separate roof envelopes retain their bounds.
 */
export const CITADEL_KEEP_PAVILION_ROOF = {
  min:[174.25,100.35,-642.55],max:[195.75,105.85,-621.05],
} as const;
/** Fitted production structure under the existing level-50 forecourt crossing.
 * A wide skew opening protects the full 9.6m normal-to-stair corridor across
 * the support depth. Conservative vault collision never drops below49.5m.
 */
export const CITADEL_FORECOURT_SPAN = {
  left:155.1,right:170.6,back:-587.5,front:-582.5,top:50,minSoffit:49.5,crownSoffit:49.8,
  abutmentBack:-587.8,abutmentFront:-581.7,base:44,abutmentWidth:1.3,protectedWidth:9.6,
  anchors:[{x:154.45,y:44,z:-581.9},{x:171.25,y:44,z:-581.9}],
} as const;

/** Closed fitted return apron: top joins the diagonal coping and feathers onto
 * the original ascent; both lower crest vertices bear on that same incline.
 * These exact world-meter vertices/faces also author the Blender hero/context.
 * A localized production addition, with no modification to accepted roads.
 */
export const CITADEL_RETURN_APRON: NonNullable<CourseSpec['surfaces']>[number] = {
  id:'citadel.return-apron',color:0xb7ac91,
  vertices:[
    158.070765,50,-595.111314,
    150.827206,50,-600.90616,
    158.398267,47.238926,-589.00878,
    160.929251,47.238926,-590.619406,
    158.070765,48.055636458476826,-595.111314,
    150.827206,49.40208609401795,-600.90616,
  ],
  indices:[0,1,2,0,2,3,4,3,2,4,2,5,0,4,5,0,5,1,0,3,4,1,5,2],
};

function detail(id:string,x:number,y:number,z:number,w:number,h:number,d:number):BoxSpec {
  return {id:`citadel.${id}`,position:{x,y:y+h/2,z},size:{x:w,y:h,z:d},
    color:0xb7ac91,collides:true,visible:false};
}

/** Decorative patches are clipped to the actual accepted triangles. Interpolated
 * Y follows the ramp/landings and never creates a flat sheet above the ascent.
 * These are render data only; resident ground retains its single collision owner.
 */
export function createCitadelPaving(blueprint:CityBlueprint):NonNullable<CitadelSpec['paving']>{
  const rectangle=(x0:number,z0:number,x1:number,z1:number)=>[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
  const patches:{id:string;polygon:{x:number;z:number}[];color:number;lift:number}[]=[];
  const add=(id:string,x0:number,z0:number,x1:number,z1:number,color=0xbfb69a,lift=.03)=>
    patches.push({id:`citadel.paving.${id}`,polygon:rectangle(x0,z0,x1,z1),color,lift});
  // Public court rooms and fitted gallery aprons, rather than a citywide grid.
  add('flags.west-court',78,-610,138,-580);
  add('flags.ceremonial-court',138,-622,218,-589.2);
  add('flags.rear-passage',142,-655,159,-620);
  add('flags.east-gallery',208,-591,242,-584.5);
  add('flags.gate-landing',141,-588,202,-571,0xb8ad91);
  for(const [id,x0,z0,x1,z1] of [
    ['west-front',79,-581.2,136,-580.8],['west-west',79,-603,79.4,-581],
    ['west-gallery',83,-604.2,137,-603.8],['keep-axis-west',180,-620,180.35,-590],
    ['keep-axis-east',189.65,-620,190,-590],['keep-threshold',158,-619.3,213,-618.9],
    ['court-transverse',140,-593.4,201,-593.1],['gate-west',151,-587.2,151.35,-572],
    ['gate-east',190.65,-587.2,191,-572],
  ] as const)add(`border.${id}`,x0,z0,x1,z1,0x8f8e78,.044);
  const center={x:175,z:-600};
  for(const [id,radius,color,lift] of [['medallion-rim',7.1,0x8c917d,.046],['medallion-field',6.65,0xd4c5a3,.049]] as const){
    patches.push({id:`citadel.paving.inlay.${id}`,polygon:Array.from({length:8},(_,i)=>{
      const a=i*Math.PI/4+Math.PI/8;return{x:center.x+Math.cos(a)*radius,z:center.z+Math.sin(a)*radius};}),color,lift});
  }
  // A restrained eight-point stone compass ties the ceremonial court to its well.
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,dx=Math.cos(a),dz=Math.sin(a),nx=-dz,nz=dx;
    patches.push({id:`citadel.paving.inlay.compass.${i}`,polygon:[
      {x:center.x+dx*1.7+nx*.12,z:center.z+dz*1.7+nz*.12},
      {x:center.x+dx*5.9+nx*.055,z:center.z+dz*5.9+nz*.055},
      {x:center.x+dx*5.9-nx*.055,z:center.z+dz*5.9-nz*.055},
      {x:center.x+dx*1.7-nx*.12,z:center.z+dz*1.7-nz*.12},
    ].reverse(),color:0x75857a,lift:.052});
  }
  const sources=[...blueprint.terrain.filter(s=>s.id.startsWith('city.terrain.citadel')),
    ...cityRoadSurfaces(blueprint.roads.filter(r=>r.districts.includes('citadel')))];
  return patches.map(patch=>{
    const surface={id:patch.id,vertices:[] as number[],indices:[] as number[],color:patch.color};
    const xs=patch.polygon.map(p=>p.x),zs=patch.polygon.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
    for(const source of sources)for(let face=0;face<source.indices.length;face+=3){
      let polygon:Vec3[]=source.indices.slice(face,face+3).map(index=>({x:source.vertices[index*3]!,y:source.vertices[index*3+1]!,z:source.vertices[index*3+2]!}));
      if(Math.max(...polygon.map(p=>p.x))<minX||Math.min(...polygon.map(p=>p.x))>maxX||Math.max(...polygon.map(p=>p.z))<minZ||Math.min(...polygon.map(p=>p.z))>maxZ)continue;
      for(let edge=0;edge<patch.polygon.length&&polygon.length>=3;edge++){
        const a=patch.polygon[edge]!,b=patch.polygon[(edge+1)%patch.polygon.length]!;
        const distance=(p:Vec3)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x),clipped:Vec3[]=[];
        for(let n=0;n<polygon.length;n++){
          const p=polygon[n]!,q=polygon[(n+1)%polygon.length]!,dp=distance(p),dq=distance(q),inside=dp>=-1e-7;
          if(inside)clipped.push(p);
          if(inside!==(dq>=-1e-7)){
            const t=dp/(dp-dq);clipped.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t});
          }
        }
        polygon=clipped;
      }
      if(polygon.length<3)continue;
      const offset=surface.vertices.length/3;
      for(const p of polygon)surface.vertices.push(p.x,p.y+patch.lift,p.z);
      for(let n=1;n<polygon.length-1;n++){
        // glTF/Three and Rapier use Float32 coordinates. A clipped source edge
        // can leave a microscopic positive-area double triangle that rounds
        // onto that edge. Omit only numerical slivers, not authored paving.
        const [a,b,c]=[polygon[0]!,polygon[n]!,polygon[n+1]!].map(p=>({x:Math.fround(p.x),z:Math.fround(p.z)}));
        const cross=(b!.x-a!.x)*(c!.z-a!.z)-(b!.z-a!.z)*(c!.x-a!.x);
        const longest=Math.max(Math.hypot(b!.x-a!.x,b!.z-a!.z),Math.hypot(c!.x-a!.x,c!.z-a!.z),Math.hypot(c!.x-b!.x,c!.z-b!.z));
        if(Math.abs(cross)<1e-5||Math.abs(cross)/longest<.0003)continue;
        surface.indices.push(...(cross<0?[offset,offset+n,offset+n+1]:[offset,offset+n+1,offset+n]));
      }
    }
    return surface;
  }).filter(s=>s.indices.length>0);
}

/** M6.1 envelopes are authoritative; hero ornament is a separate stream lease. */
export function createCitadel(blueprint:CityBlueprint):CitadelSpec {
  const accepted=blueprint.landmarks.filter(b=>b.id.startsWith('city.landmark.citadel-')||b.id.startsWith('city.landmark.upper-gate-'));
  if(accepted.length!==17)throw new Error('Citadel requires all 17 accepted M6.1 structural envelopes.');
  const boxes:BoxSpec[]=accepted.map(b=>({...b,position:{...b.position},size:{...b.size},visible:false}));
  // Lower corner buttresses extend beyond the unchanged envelope. Explicit
  // proxies prevent walking a capsule through that close structural detail.
  for(const b of accepted.filter(b=>!/wall|pier/.test(b.id))){
    const floor=b.position.y-b.size.y/2;
    for(const dx of [-1,1])for(const dz of [-1,1])boxes.push(detail(`${b.id}.buttress.${dx}.${dz}`,
      b.position.x+dx*(b.size.x/2-.30),floor,b.position.z+dz*(b.size.z/2-.30),1.95,b.size.y*.56,1.95));
  }
  // The outer gate flanks the full 9m ascent corridor; the arch is overhead.
  boxes.push(detail('gate.west-pier',163.9,44,-576,3,8.8,3.8),detail('gate.east-pier',178.1,44,-576,3,8.8,3.8),
    detail('gate.arch-crown',171,52.8,-576,11.2,1.65,3.8));
  // Arcades occupy the building apron, never the accepted forecourt road.
  for(const x of [92,100.5,109,117.5,126])boxes.push(detail(`west-arcade.post.${x}`,x,50,-607.7,.58,5.05,.58));
  for(const x of [212,220,228,238])boxes.push(detail(`east-arcade.post.${x}`,x,50,-587.6,.58,4.65,.58));
  boxes.push(detail('west-arcade.roof',109,55.1,-608.5,36,1,4),detail('east-arcade.roof',225,54.7,-588.1,30,1,3.3));
  boxes.push(detail('court-well',175,50,-600,2.1,1.1,2.1));
  const span=CITADEL_FORECOURT_SPAN;
  for(const [name,x0,x1] of [['left-deck',95,span.left],['vault',span.left,span.right],['right-deck',span.right,175]] as const)
    boxes.push(detail(`forecourt-span.${name}`,(x0+x1)/2,span.minSoffit,(span.back+span.front)/2,x1-x0,span.top-span.minSoffit,span.front-span.back));
  for(const [name,x0,x1] of [['left-abutment',span.left-span.abutmentWidth,span.left],['right-abutment',span.right,span.right+span.abutmentWidth]] as const)
    boxes.push(detail(`forecourt-span.${name}`,(x0+x1)/2,span.base,(span.abutmentBack+span.abutmentFront)/2,x1-x0,span.minSoffit-span.base,span.abutmentFront-span.abutmentBack));
  const silhouettes:BoxSpec[]=accepted.map(b=>({...b,position:{...b.position},size:{...b.size},collides:false}));
  const roofEnvelopes:{min:number[];max:number[]}[]=[];
  for(const b of accepted){
    if(/wall|pier/.test(b.id))continue;
    // Authored roof presentation changes only. Macro bodies/collision remain the
    // accepted 17 records; highest finial stays below the prior 106.45 m cap.
    const roofHeight: number = ({
      'city.landmark.citadel-tower':14.4,
      'city.landmark.citadel-west-tower':11.55,
      'city.landmark.citadel-east-tower':12.35,
      'city.landmark.citadel-court-tower':10.05,
      'city.landmark.citadel-front-west-tower':8.4,
      'city.landmark.citadel-front-east-tower':7.5,
      'city.landmark.citadel-keep':7.775,
    } as Record<string,number>)[b.id] ?? 7;
    const y=b.position.y+b.size.y/2;
    // Actual thick hip edges extend 1.160034 m beyond a body, and the keep's
    // two attached roof turrets extend 1.756 m. These rain-only bounds cover
    // that authored overhang, without creating an aggregate court-sized roof.
    const overhangX=b.id==='city.landmark.citadel-keep'?1.8:1.17,overhangZ=overhangX;
    roofEnvelopes.push({min:[b.position.x-b.size.x/2-overhangX,y-.76,b.position.z-b.size.z/2-overhangZ],
      max:[b.position.x+b.size.x/2+overhangX,y+roofHeight,b.position.z+b.size.z/2+overhangZ]});
    silhouettes.push({id:`${b.id}.hero-roof`,position:{x:b.position.x,y:y+roofHeight*.36,z:b.position.z},
      size:{x:b.size.x+1.8,y:roofHeight*.72,z:b.size.z+1.8},color:/citadel-tower$|east-tower/.test(b.id)?0x3b7770:0xa55e3f,collides:false});
  }
  roofEnvelopes.push({min:[91,55,-610.5],max:[127,56.1,-606.5]},
    {min:[210,54.6,-589.75],max:[240,55.8,-586.45]},
    {min:[151,52.8,-578.2],max:[191,55.5,-573.8]},
    {min:[95,span.minSoffit,span.back],max:[175,span.top,span.front]});
  roofEnvelopes.push({min:[...CITADEL_KEEP_PAVILION_ROOF.min],max:[...CITADEL_KEEP_PAVILION_ROOF.max]});
  return {assetId:'citadel.hero',position:{...CITADEL_POSITION},replacedLandmarks:accepted.map(b=>b.id),silhouettes,roofEnvelopes,paving:createCitadelPaving(blueprint),
    course:{id:'m9.citadel',seed:blueprint.seed,bounds:850,spawn:{x:150,y:50.04,z:-605},boxes,labels:[],
      surfaces:[{...CITADEL_RETURN_APRON,vertices:[...CITADEL_RETURN_APRON.vertices],indices:[...CITADEL_RETURN_APRON.indices]}],bookmarks:{
      approach:{position:{x:185,y:40.04,z:-548},yaw:0,pitch:.27},
      court:{position:{x:140,y:50.04,z:-600},yaw:-.75,pitch:.14},
      close:{position:{x:154,y:50.04,z:-616},yaw:-.8,pitch:.15},
      side:{position:{x:82,y:50.04,z:-602},yaw:-1.2925,pitch:.16},
      back:{position:{x:151,y:50.04,z:-651},yaw:Math.PI,pitch:.14},
    }},assumptions:[
      'Citadel court use, unseen rear elevations, vaulted gateway, civic galleries, tower fenestration and roof construction are authored interpretations of the single master image.',
      'All 17 accepted landmark envelopes, plateau datum, ceremonial route and 9m monumental ascent remain fixed; closed keeps and towers do not claim playable interiors.',
      'Taller varied crowns, octagonal open belfries, continuous gallery bands and court clock faces reinterpret prior proxy presentation roofs within the former 106.45m maximum; no walking collision envelope changes.',
      'A broad eight-sided fore-pavilion rises from an internal stone bearing core within the closed keep, retains its prior roof lanterns/chimneys, and reaches105.8m below the106.4m watchtower. Its complete sides, real arched gallery and shallow teal hat are authored skyline interpretation; roof interiors are not an additional playable route.',
      'The outer gate introduces an overhead crown and clear flanking piers; rain shelters use supported courtyard arcades.',
      'The level-50 forecourt crossing receives a shallow segmental stone vault and gate-terrace abutments; the protected skew stair opening is at least9.6m with soffit at least49.5m. The final diagonal road convergence retains its existing lateral controller passage, without claiming full-width centerline head clearance.',
      'A closed three-meter skew return apron joins the exposed final diagonal coping to the original ascent, supporting both traversal directions without changing road records, terrain or original collision boxes. Its original eight resident triangles required the10,000-to-10,004 ceiling adjustment. The later additive keep pavilion has a separate bounded11,250 resident ceiling, preserving all prior architecture.',
    ]};
}
