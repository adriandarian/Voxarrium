import { BoxGeometry, Color, Group, InstancedMesh, Object3D } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { BoxSpec } from '../simulation/types';
import type { PreparationResources } from './preparation-cache';

/** Complete structural dimensions are shared with collision; instance batches own finite per-lease resources. */
export function* upperStructureJobs(structures:readonly BoxSpec[],scope:PreparationResources,target:Group):Generator<string>{
  // visible:false suppresses the ordinary course-box renderer; this dedicated batch owns presentation.
  const visible=structures;if(!visible.length)return;
  const geometry=scope.own(new BoxGeometry(1,1,1));yield 'upper.structural-geometry';
  const material=scope.own(new MeshStandardNodeMaterial({color:0xffffff,roughness:.92}));material.name='upper.structural-aged-stone';
  const mesh=scope.own(new InstancedMesh(geometry,material,visible.length));mesh.name='upper.structural-instances';mesh.castShadow=true;mesh.receiveShadow=true;
  const object=new Object3D();
  for(const [index,box] of visible.entries()){
    object.position.set(box.position.x,box.position.y,box.position.z);object.scale.set(box.size.x,box.size.y,box.size.z);
    object.rotation.set(box.rotationX??0,box.rotationY??0,box.rotationZ??0);object.updateMatrix();mesh.setMatrixAt(index,object.matrix);
    mesh.setColorAt(index,new Color(box.color));if(index%24===0)yield 'upper.structural-transforms';
  }
  mesh.computeBoundingBox();mesh.computeBoundingSphere();target.add(mesh);yield 'upper.structural-batch';
}
