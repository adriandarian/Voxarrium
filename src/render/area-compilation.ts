import type {Camera,Object3D,Scene} from 'three';
import type {WebGPURenderer} from 'three/webgpu';

/** r186 reports progress after each sequential object's pipeline has settled.
 * Abort there, before it submits another object. The current native promise
 * still owns its area resources until settlement; renderer state is restored
 * before the installed compile loop begins yielding/calling this callback. */
export async function compileArea(renderer:Pick<WebGPURenderer,'compileAsync'>,
  object:Object3D,camera:Camera,scene:Scene,signal:AbortSignal,onAborted?:(event:ProgressEvent)=>void):Promise<void>{
  signal.throwIfAborted();
  await renderer.compileAsync(object,camera,scene,event=>{
    if(signal.aborted)onAborted?.(event);
    signal.throwIfAborted();
  });
  signal.throwIfAborted();
}
