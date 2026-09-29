import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../simulation/types';
import type { CourseSpec, GameState, InputFrame, Vec3 } from '../simulation/types';

export interface Physics {
  step(state: GameState, input: InputFrame, dt: number): void;
  reset(state: GameState, position?: Vec3): void;
  cameraCast(origin: Vec3, target: Vec3, radius: number): number;
  dispose(): void;
}

let initialization: Promise<void> | undefined;
const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

export async function createPhysics(course: CourseSpec): Promise<Physics> {
  initialization ??= RAPIER.init();
  await initialization;
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  for (const box of course.boxes) {
    if (!box.collides) continue;
    const sx = Math.sin((box.rotationX ?? 0) / 2), cx = Math.cos((box.rotationX ?? 0) / 2);
    const sy = Math.sin((box.rotationY ?? 0) / 2), cy = Math.cos((box.rotationY ?? 0) / 2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(box.size.x / 2, box.size.y / 2, box.size.z / 2)
      .setTranslation(box.position.x, box.position.y, box.position.z)
      .setRotation({ x: sx * cy, y: cx * sy, z: sx * sy, w: cx * cy }));
  }
  const halfHeight = PLAYER.height / 2;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(course.spawn.x, course.spawn.y + halfHeight, course.spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight - PLAYER.radius, PLAYER.radius), body);
  const controller = world.createCharacterController(0.015);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 4);
  controller.enableAutostep(0.21, 0.12, false);
  controller.enableSnapToGround(0.24);
  controller.setSlideEnabled(true);
  world.timestep = 1 / 60;
  world.step(); // Populate broad phase before the first controller/camera query.

  function reset(state: GameState, position = course.spawn) {
    state.player.position = { ...position };
    state.player.velocity = { x: 0, y: 0, z: 0 };
    state.player.grounded = false;
    state.resets++;
    const center = { x: position.x, y: position.y + halfHeight, z: position.z };
    body.setTranslation(center, true);
    body.setNextKinematicTranslation(center);
    world.step();
  }

  return {
    step(state, input, dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      // Fixed-step caller owns catch-up; prevent an accidental huge step here too.
      dt = Math.min(dt, 1 / 30);
      const player = state.player;
      const length = Math.max(1, Math.hypot(input.forward, input.right));
      const forward = input.forward / length, right = input.right / length;
      const yaw = state.camera.yaw;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const targetX = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
      const targetZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
      const accelerating = Math.abs(forward) + Math.abs(right) > 0;
      const acceleration = (player.grounded ? (accelerating ? 18 : 24) : 7) * dt;
      player.velocity.x = approach(player.velocity.x, targetX, acceleration);
      player.velocity.z = approach(player.velocity.z, targetZ, acceleration);
      if (accelerating) player.heading = Math.atan2(-targetX, -targetZ);
      if (input.jump && player.grounded) {
        player.velocity.y = PLAYER.jumpSpeed;
        player.grounded = false;
      } else if (player.grounded) {
        player.velocity.y = -0.5;
      }
      player.velocity.y = Math.max(-25, player.velocity.y - PLAYER.gravity * dt);
      const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt };
      controller.computeColliderMovement(collider, desired);
      const corrected = controller.computedMovement();
      const current = body.translation();
      body.setNextKinematicTranslation({ x: current.x + corrected.x, y: current.y + corrected.y, z: current.z + corrected.z });
      world.timestep = dt;
      world.step();
      const center = body.translation();
      player.position = { x: center.x, y: center.y - halfHeight, z: center.z };
      let steepContact = false;
      let walkableContact = false;
      for (let index = 0; index < controller.numComputedCollisions(); index++) {
        const collision = controller.computedCollision(index);
        if (!collision) continue;
        if (collision.normal1.y >= Math.SQRT1_2 - 0.001) walkableContact = true;
        else if (collision.normal1.y > 0.01) steepContact = true;
      }
      // Rapier may count a steep face as ground contact. Keep gravity accumulating
      // there and disallow jumping until a walkable support surface is reached.
      player.grounded = controller.computedGrounded() && (!steepContact || walkableContact);
      // Cancel upward speed when the capsule meets a ceiling.
      if (player.velocity.y > 0 && corrected.y < desired.y - 0.001) player.velocity.y = 0;
      if (player.grounded && player.velocity.y < 0) player.velocity.y = 0;
      state.tick++;
      state.elapsed += dt;
      if (!Number.isFinite(center.x + center.y + center.z) || player.position.y < -6 || Math.abs(center.x) > 40 || Math.abs(center.z) > 40) reset(state);
    },
    reset,
    cameraCast(origin, target, radius) {
      const delta = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      if (distance < 0.0001) return 0;
      const direction = { x: delta.x / distance, y: delta.y / distance, z: delta.z / distance };
      const hit = world.castShape(origin, { x: 0, y: 0, z: 0, w: 1 }, direction,
        new RAPIER.Ball(radius), 0, distance, true, undefined, undefined, collider, body);
      return hit ? Math.max(0, hit.time_of_impact - 0.045) : distance;
    },
    dispose() { world.removeCharacterController(controller); world.free(); },
  };
}
