import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { DISTRICT, DISTRICT_BUILDINGS, DISTRICT_STREETS } from '../simulation/district-layout';
import { randomSequence } from './rural-geometry';

/** Selective small paving, facade aprons, gutters and quay wear; collision stays on M4 ground. */
export function createDistrictGround() {
  const group=new Group(); group.name='district.ground.street-craft';
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[];
  const pigment=new Color();
  const polygon=(points:[number,number,number][],color:number,value=1)=>{
    const start=vertices.length/3; pigment.setHex(color).multiplyScalar(value);
    for(const p of points){vertices.push(...p);colors.push(pigment.r,pigment.g,pigment.b);}
    for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
  };
  const rng=randomSequence(104751);
  const rect=(x:number,y:number,z:number,w:number,d:number,color:number,yaw=0,value=1,chipped=false)=>{
    const cut=Math.min(w,d)*.07;
    const corners=chipped?[[-w/2+cut,-d/2],[-w/2,-d/2+cut],[-w/2,d/2-cut],[-w/2+cut,d/2],
      [w/2-cut,d/2],[w/2,d/2-cut],[w/2,-d/2+cut],[w/2-cut,-d/2]]:[[-w/2,-d/2],[-w/2,d/2],[w/2,d/2],[w/2,-d/2]];
    polygon(corners.map(([u0,v0])=>{
      const u=u0!+(chipped?(rng()-.5)*.018:0),v=v0!+(chipped?(rng()-.5)*.025:0);
      return [
      x+u!*Math.cos(yaw)+v!*Math.sin(yaw),y,z-u!*Math.sin(yaw)+v!*Math.cos(yaw),
    ];}),color,value);
  };
  // Staggered, irregular cobbles are confined to streets; service aprons stay calmer.
  for(const [streetIndex,street] of DISTRICT_STREETS.entries()) for(let s=1;s<street.points.length;s++){
    const a=street.points[s-1]!,b=street.points[s]!;
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
    rect((a.x+b.x)/2,a.y+.031,(a.z+b.z)/2,street.width+.05,length,0x968a74,yaw);
    const cross=Math.max(3,Math.ceil(street.width/.52)),rows=Math.ceil(length/.58);
    for(let row=0;row<rows;row++){
      const t=(row+.5)/rows,cx=a.x+dx*t,cz=a.z+dz*t;
      if(street.id==='market-street'&&cx<48)continue;
      if(cx>80&&cx<98&&cz>-21&&cz<-3)continue;
      for(let c=0;c<cross;c++){
        const u=(c+.5)/cross*street.width-street.width/2+(row%2?.09:-.09);
        const x=cx+Math.cos(yaw)*u,z=cz-Math.sin(yaw)*u;
        const w=street.width/cross-.008-rng()*.005,d=length/rows-.008-rng()*.006;
        const edge=c===0||c===cross-1;
        rect(x,a.y+.040+streetIndex*.001,z,w,d,edge?0x9f947c:0xb3a78c,yaw+(rng()-.5)*.065,.95+rng()*.10,true);
      }
    }
    // Low drain channels and paired edge courses visually compress the walking band.
    for(const side of [-1,1]) for(let i=0;i<Math.ceil(length/.8);i++){
      const t=(i+.5)/Math.ceil(length/.8),u=side*(street.width/2+.17);
      const x=a.x+dx*t+Math.cos(yaw)*u,z=a.z+dz*t-Math.sin(yaw)*u;
      if(x>80&&x<98&&z>-21&&z<-3)continue;
      rect(x,a.y+.038,z,.12,.79,0x625f50,yaw);
      rect(x+Math.cos(yaw)*side*.17,a.y+.065,z,.23,.76,0xb9af98,yaw,.94+rng()*.12);
      if(i%9===3)for(let bar=0;bar<5;bar++)rect(x,a.y+.047,z+(bar-2)*.054,.19,.019,0x403e34,yaw);
    }
  }
  // Plaza: a crosswise pedestrian band between irregular patches and occupied stall aprons.
  rect(89,4.033,-12,18,18,0x978d77);
  for(let row=0;row<30;row++)for(let c=0;c<29;c++){
    const x=80.25+c*.62+(row%2?.17:0),z=-20.76+row*.60;
    if(x>97.8||z>-3.15)continue;
    const crossing=Math.abs(x-89)<1.62 || Math.abs(z+11.2)<1.5;
    const patch=(x<86&&z<-13)||(x>93&&z>-8);
    rect(x,4.047,z,.608-rng()*.008,.586-rng()*.008,crossing?0xbcb098:patch?0xa3967f:0xafa28a,
      .04*Math.sin(row*.7),.95+rng()*.1,true);
  }
  // Individually edged door/work aprons, rather than unoccupied full-width setbacks.
  for(const [i,b] of DISTRICT_BUILDINGS.entries()){
    const world=(x:number,z:number):[number,number]=>[b.position.x+Math.cos(b.yaw)*x+Math.sin(b.yaw)*z,
      b.position.z-Math.sin(b.yaw)*x+Math.cos(b.yaw)*z];
    for(let c=0;c<Math.ceil(b.width/.69);c++)for(let r=0;r<2;r++){
      const lx=-b.width/2+(c+.5)*b.width/Math.ceil(b.width/.69),lz=b.depth/2+.21+r*.43;
      const [x,z]=world(lx,lz);
      // Leave the imported threshold exposed and avoid coplanar civic terrain.
      if(Math.abs(lx)<.80)continue;
      rect(x,b.position.y+.046,z,.64,.40,i%3===0?0x988a71:0xb7a68a,b.yaw,.94+rng()*.1);
    }
  }
  for(const bridge of DISTRICT.bridges)for(const z of [10.9,27.1])for(let c=0;c<5;c++){
    rect(bridge.x+(c-2)*bridge.width/5,.048,z,bridge.width/5-.025,.70,0xc0b496);
  }
  for(const [i,x] of [69.5,83,110.5,140].entries()){
    polygon([[x-1.8, .042,1.05],[x-2,.042,3.6],[x-.6,.042,4.0],[x+2.4,.042,3.7],[x+2.7,.042,1.05]],
      i%2?0x9b8c70:0x998a72);
    for(let row=0;row<4;row++)for(let c=0;c<6;c++)rect(x-1.5+c*.62+(row%2?.15:0),.051,1.4+row*.55,
      .598,.53,0xafa188,0,.91+rng()*.09,true);
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const paving=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true,roughness:.94}));
  paving.name='district.paving.cobbles-aprons-drainage';paving.receiveShadow=true;group.add(paving);
  // A damp, irregular base band on the water-facing walls. No alteration to canal topology.
  const stainVertices:number[]=[],stainColors:number[]=[];
  for(const bank of [12.01,25.99])for(let i=0;i<98;i++){
    const x=48+i,top=-.35+.12*Math.sin(i*.39)+.06*Math.sin(i*1.13);
    const coords=[[x,-1.15,bank],[x+1,-1.15,bank],[x+1,top,bank],[x,top,bank]];
    const order=bank<19?[0,1,2,0,2,3]:[0,2,1,0,3,2];
    for(const n of order){stainVertices.push(...coords[n]!);const col=new Color(0x52675b).multiplyScalar(.88+Math.sin(i*.42)*.09);stainColors.push(col.r,col.g,col.b);}
  }
  const stainGeo=new BufferGeometry();stainGeo.setAttribute('position',new Float32BufferAttribute(stainVertices,3));
  stainGeo.setAttribute('color',new Float32BufferAttribute(stainColors,3));stainGeo.computeVertexNormals();
  const stains=new Mesh(stainGeo,new MeshStandardMaterial({vertexColors:true,roughness:.91}));
  stains.name='district.quay.waterline-patina';group.add(stains);
  // Low-cost feathered warm pavement bounce under selected shop lamps (not dynamic lights).
  const pools=new Group();pools.name='district.lighting.shop-pavement-bounce';group.add(pools);
  const poolMaterials:MeshBasicMaterial[]=[];
  for(const [x,y,z,rx,rz] of [[63,4,-10,3.1,1.9],[70,4,-11,2.7,1.8],[80,4,-12,2.6,2.0],[99,4,-12,3,2],[115,4,-11,3,1.8]]){
    const p:number[]=[],c:number[]=[];
    for(let i=0;i<36;i++)for(const [angle,r] of [[0,0],[i/36*Math.PI*2,1],[(i+1)/36*Math.PI*2,1]]){
      p.push(x!+Math.cos(angle!)*r!*rx!,y!+.073,z!+Math.sin(angle!)*r!*rz!);
      const col=new Color(0xeab776).multiplyScalar(r===0?1:0);c.push(col.r,col.g,col.b);
    }
    const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(p,3));geo.setAttribute('color',new Float32BufferAttribute(c,3));
    // Up-facing triangle winding.
    const idx:number[]=[];for(let i=0;i<p.length/3;i+=3)idx.push(i,i+2,i+1);geo.setIndex(idx);
    const mat=new MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0,depthWrite:false,blending:AdditiveBlending});
    poolMaterials.push(mat);pools.add(new Mesh(geo,mat));
  }
  return {group,paving,updateWarmth(warmth:number){for(const mat of poolMaterials)mat.opacity=warmth*.24;},
    facts:{pavingTriangles:indices.length/3,groundDetail:'Authored street ribbons, staggered cobbles, low edge courses, drains, facade aprons and waterline patina; surface relief <= 7.3cm.'}};
}
