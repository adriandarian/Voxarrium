import {test,expect} from '@playwright/test';
import {Scene,Group,Mesh,Sprite,PointLight,DirectionalLight} from 'three';
import {withResidentMeshesHidden} from '../src/render/warmup-visibility';

for(const fail of [false,true])test(`isolated warmup preserves light ancestry and restores exact visibility on ${fail?'failure':'success'}`,()=>{
  const scene=new Scene(),resident=new Mesh(),hidden=new Mesh(),label=new Sprite(),lightGroup=new Group(),lightMesh=new Mesh();
  hidden.visible=false;lightGroup.add(new PointLight());lightMesh.add(new PointLight());
  const sun=new DirectionalLight();scene.add(resident,hidden,label,lightGroup,lightMesh,sun,sun.target);
  const before=new Map();scene.traverse(object=>before.set(object,object.visible));const destination=new Mesh();
  const run=()=>withResidentMeshesHidden(scene,()=>{
    expect(resident.visible).toBe(false);expect(hidden.visible).toBe(false);expect(label.visible).toBe(false);
    expect(lightGroup.visible).toBe(true);expect(lightMesh.visible).toBe(true);expect(sun.visible).toBe(true);
    scene.add(destination);expect(destination.visible).toBe(true);
    if(fail)throw new Error('native submit failed');return 42;
  });
  try{if(fail)expect(run).toThrow('native submit failed');else expect(run()).toBe(42);
    for(const [object,visible]of before)expect(object.visible).toBe(visible);
    expect(destination.visible).toBe(true);expect(lightMesh.children[0]).toBeInstanceOf(PointLight);
  }finally{destination.removeFromParent();}
});
