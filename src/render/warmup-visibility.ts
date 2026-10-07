import {Light,Mesh,Sprite} from 'three';
import type {Object3D} from 'three';

/** Warm a destination against the same scene/light identities without drawing
 * the already-warm resident city again. Visibility is restored synchronously,
 * including on failure; no scene mutation survives the render job's return.
 * A mesh containing a light stays visible so the lighting layout is unchanged. */
export function withResidentMeshesHidden<T>(scene:Object3D,work:()=>T):T{
  const lightAncestors=new Set<Object3D>();
  scene.traverse(object=>{if(object instanceof Light)for(let parent=object.parent;parent;parent=parent.parent)lightAncestors.add(parent);});
  const saved=new Map<Object3D,boolean>();
  scene.traverse(object=>{
    if((object instanceof Mesh||object instanceof Sprite)&&!lightAncestors.has(object)){
      saved.set(object,object.visible);object.visible=false;
    }
  });
  try{return work();}finally{for(const [object,visible]of saved)object.visible=visible;}
}
