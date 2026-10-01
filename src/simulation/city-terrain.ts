import type { CourseSpec } from './types';
type Surface = NonNullable<CourseSpec['surfaces']>[number];

/** Close exposed terrace boundaries without putting walls on coplanar joins.
 * Coordinates identify shared edges even when the top triangles were batched. */
export function cityRetainingSurface(surfaces: readonly Surface[]): Surface {
  type Edge = { a: number[]; b: number[] };
  const edges = new Map<string, Edge[]>();
  const coordinate = (p: readonly number[]) => `${p[0]!.toFixed(4)},${p[2]!.toFixed(4)}`;
  for(const surface of surfaces) {
    const local=new Map<string,{a:number;b:number;count:number}>();
    for(let i=0;i<surface.indices.length;i+=3)for(let j=0;j<3;j++) {
      const a=surface.indices[i+j]!,b=surface.indices[i+(j+1)%3]!;
      const key=`${Math.min(a,b)}:${Math.max(a,b)}`,edge=local.get(key);
      if(edge)edge.count++;else local.set(key,{a,b,count:1});
    }
    for(const edge of local.values())if(edge.count===1) {
      const a=surface.vertices.slice(edge.a*3,edge.a*3+3),b=surface.vertices.slice(edge.b*3,edge.b*3+3);
      const key=[coordinate(a),coordinate(b)].sort().join(':');
      const shared=edges.get(key)??[];shared.push({a,b});edges.set(key,shared);
    }
  }
  const result:Surface={id:'city.terrain.collision-retaining-sides',vertices:[],indices:[],color:0x877c62};
  for(const shared of edges.values())for(const edge of shared) {
    const top=(edge.a[1]!+edge.b[1]!)/2;
    if(shared.some(other=>other!==edge && Math.abs((other.a[1]!+other.b[1]!)/2-top)<.001))continue;
    const lower=shared.filter(other=>(other.a[1]!+other.b[1]!)/2<top-.001);
    const bottom=lower.length?Math.max(...lower.map(other=>(other.a[1]!+other.b[1]!)/2)):-3;
    const a=edge.a,b=edge.b,offset=result.vertices.length/3;
    result.vertices.push(...a,...b,b[0]!,bottom,b[2]!,a[0]!,bottom,a[2]!);
    result.indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  return result;
}
