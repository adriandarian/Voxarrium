import { PerspectiveCamera, Vector3 } from 'three';
import { PLAYER } from '../simulation/types';
import type { CameraMode, GameState, InputFrame, Vec3 } from '../simulation/types';
import type { Physics } from '../physics/physics';

export function createCameraRig(state: GameState, physics: Physics) {
  const camera = new PerspectiveCamera(60, 1, 0.08, state.sceneId === 'm4-market-district' ? 400 : 220);
  const forward = new Vector3();
  const pivot = new Vector3();
  const desired = new Vector3();
  let boomDistance = 4.2;
  let gameplayFov = 60;
  let previousMode: CameraMode | undefined;
  const direction = () => forward.set(-Math.sin(state.camera.yaw) * Math.cos(state.camera.pitch),
    Math.sin(state.camera.pitch), -Math.cos(state.camera.yaw) * Math.cos(state.camera.pitch));

  function setMode(mode: CameraMode) {
    if (mode === state.camera.mode) return;
    if (mode === 'free') {
      state.camera.debugPosition = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      camera.getWorldDirection(forward);
      state.camera.yaw = Math.atan2(-forward.x, -forward.z);
      state.camera.pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)));
    }
    state.camera.mode = mode;
    previousMode = undefined;
  }

  return {
    camera, setMode,
    setFov(degrees: number) { gameplayFov = Math.max(45, Math.min(90, degrees)); },
    update(dt: number, aspect: number, renderPosition: Vec3 = state.player.position) {
      const mode = state.camera.mode;
      camera.aspect = aspect;
      camera.fov = mode === 'eagle-eye' ? 50 : gameplayFov;
      camera.updateProjectionMatrix();
      if (mode === 'eagle-eye') {
        // Overview stays deterministic and frames the full authored 64 m bounds.
        const fit = Math.max(1, 1.25 / aspect);
        if (state.sceneId === 'm4-market-district') {
          camera.fov = 42;
          camera.updateProjectionMatrix();
          const districtFit = Math.max(1, 1.4 / aspect);
          camera.position.set(18, 108 * districtFit, 123 * districtFit);
          camera.lookAt(82, 3, -4);
        } else if (state.sceneId === 'm2-rural-96m') {
          camera.fov = 31;
          camera.updateProjectionMatrix();
          const ruralFit = Math.max(1, 0.75 / aspect);
          camera.position.set(-29 * ruralFit, 60 * ruralFit, 81 * ruralFit);
          camera.lookAt(1, 3, 1);
        } else {
          camera.position.set(47 * fit, 57 * fit, 61 * fit);
          camera.lookAt(0, 0, -1);
        }
      } else if (mode === 'free') {
        camera.position.set(state.camera.debugPosition.x, state.camera.debugPosition.y, state.camera.debugPosition.z);
        camera.lookAt(desired.copy(camera.position).add(direction()));
      } else if (mode === 'first-person') {
        camera.position.set(renderPosition.x, renderPosition.y + PLAYER.eyeHeight, renderPosition.z);
        camera.lookAt(desired.copy(camera.position).add(direction()));
      } else {
        pivot.set(renderPosition.x, renderPosition.y + 1.43, renderPosition.z);
        desired.copy(pivot).addScaledVector(direction(), -4.2);
        // A sphere encloses the near plane at this FOV/DPR-independent camera.
        // Inward changes are immediate; only outward recovery is eased.
        const nearRadius = Math.max(0.27, camera.near * Math.tan(camera.fov * Math.PI / 360) * Math.hypot(1, aspect) + 0.04);
        const safeDistance = physics.cameraCast(pivot, desired, nearRadius);
        const snap = dt === 0 || previousMode !== mode;
        boomDistance = snap || safeDistance < boomDistance ? safeDistance :
          Math.min(safeDistance, boomDistance + (safeDistance - boomDistance) * (1 - Math.exp(-8 * Math.max(0, dt))));
        camera.position.copy(pivot).addScaledVector(forward, -boomDistance);
        camera.lookAt(desired.copy(pivot).addScaledVector(forward, 0.5));
      }
      camera.updateMatrixWorld();
      previousMode = mode;
    },
    moveFree(input: InputFrame, dt: number) {
      if (state.camera.mode !== 'free') return;
      direction();
      const horizontalRight = new Vector3(Math.cos(state.camera.yaw), 0, -Math.sin(state.camera.yaw));
      const movement = new Vector3().addScaledVector(forward, input.forward).addScaledVector(horizontalRight, input.right);
      movement.y += input.ascend;
      if (movement.lengthSq() > 1) movement.normalize();
      movement.multiplyScalar((input.run ? 16 : 7) * Math.min(dt, 1 / 30));
      state.camera.debugPosition.x += movement.x;
      state.camera.debugPosition.y += movement.y;
      state.camera.debugPosition.z += movement.z;
    },
    dispose() { /* Camera has no owned GPU resources. */ },
  };
}
