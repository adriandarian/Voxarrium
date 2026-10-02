import type { CourseSpec } from './types';
type Surface = NonNullable<CourseSpec['surfaces']>[number];

/** Shared visual/collision retaining geometry. A wall stops at the adjacent
 * street or intermediate terrace rather than descending through it to -3m.
 * Spatial triangle lookup also handles partial edges at clipped terrace joins. */
export function cityRetainingSurface(surfaces: readonly Surface[], streets: readonly Surface[] = []): Surface {
  type Edge = { a: number[]; b: number[] };
  type Triangle = { a:number[]; b:number[]; c:number[] };
  const edges = new Map<string, Edge[]>(), cells=new Map<string,Triangle[]>();
  const cellSize=20;
  const coordinate = (p: readonly number[]) => `${p[0]!.toFixed(4)},${p[2]!.toFixed(4)}`;
  for(const source of [...surfaces,...streets])for(let i=0;i<source.indices.length;i+=3){
    const [a,b,c]=source.indices.slice(i,i+3).map(index=>source.vertices.slice(index*3,index*3+3)) as [number[],number[],number[]];
    const triangle={a,b,c};
    const minX=Math.floor(Math.min(a[0]!,b[0]!,c[0]!)/cellSize),maxX=Math.floor(Math.max(a[0]!,b[0]!,c[0]!)/cellSize);
    const minZ=Math.floor(Math.min(a[2]!,b[2]!,c[2]!)/cellSize),maxZ=Math.floor(Math.max(a[2]!,b[2]!,c[2]!)/cellSize);
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=`${x}:${z}`,list=cells.get(key)??[];list.push(triangle);cells.set(key,list);
    }
  }
  function floorAt(x:number,z:number):number {
    let floor=-3;
    for(const {a,b,c} of cells.get(`${Math.floor(x/cellSize)}:${Math.floor(z/cellSize)}`)??[]){
      const denominator=(b[2]!-c[2]!)*(a[0]!-c[0]!)+(c[0]!-b[0]!)*(a[2]!-c[2]!);
      if(Math.abs(denominator)<1e-8)continue;
      const u=((b[2]!-c[2]!)*(x-c[0]!)+(c[0]!-b[0]!)*(z-c[2]!))/denominator;
      const v=((c[2]!-a[2]!)*(x-c[0]!)+(a[0]!-c[0]!)*(z-c[2]!))/denominator;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)floor=Math.max(floor,u*a[1]!+v*b[1]!+(1-u-v)*c[1]!);
    }
    return floor;
  }
  for(const source of surfaces) {
    const local=new Map<string,{a:number;b:number;count:number}>();
    for(let i=0;i<source.indices.length;i+=3)for(let j=0;j<3;j++) {
      const a=source.indices[i+j]!,b=source.indices[i+(j+1)%3]!;
      const key=`${Math.min(a,b)}:${Math.max(a,b)}`,edge=local.get(key);
      if(edge)edge.count++;else local.set(key,{a,b,count:1});
    }
    for(const edge of local.values())if(edge.count===1) {
      const a=source.vertices.slice(edge.a*3,edge.a*3+3),b=source.vertices.slice(edge.b*3,edge.b*3+3);
      const key=[coordinate(a),coordinate(b)].sort().join(':');
      const shared=edges.get(key)??[];shared.push({a,b});edges.set(key,shared);
    }
  }
  const result:Surface={id:'city.terrain.collision-retaining-sides',vertices:[],indices:[],color:0x877c62};
  for(const shared of edges.values())for(const edge of shared) {
    const top=(edge.a[1]!+edge.b[1]!)/2;
    if(shared.some(other=>other!==edge && Math.abs((other.a[1]!+other.b[1]!)/2-top)<.001))continue;
    const a=edge.a,b=edge.b,dx=b[0]!-a[0]!,dz=b[2]!-a[2]!,length=Math.hypot(dx,dz);
    if(length<1e-5)continue;
    // Positive-Y triangle winding places the outside on the left of an edge.
    const nx=-dz/length*.35,nz=dx/length*.35,count=Math.max(1,Math.ceil(length/20));
    const at=(t:number)=>[a[0]!+dx*t,a[1]!+(b[1]!-a[1]!)*t,a[2]!+dz*t];
    for(let i=0;i<count;i++){
      const start=at(i/count),end=at((i+1)/count);
      const bottomA=Math.min(start[1]!,floorAt(start[0]!+dx/length*.002+nx,start[2]!+dz/length*.002+nz));
      const bottomB=Math.min(end[1]!,floorAt(end[0]!-dx/length*.002+nx,end[2]!-dz/length*.002+nz));
      if(Math.max(start[1]!-bottomA,end[1]!-bottomB)<.01)continue;
      const offset=result.vertices.length/3;
      result.vertices.push(...start,...end,end[0]!,bottomB,end[2]!,start[0]!,bottomA,start[2]!);
      result.indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
    }
  }
  return result;
}
