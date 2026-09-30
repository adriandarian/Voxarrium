import {
  BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute,
  Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NPC_DEFINITIONS } from '../simulation/npcs';
import type { NpcState } from '../simulation/npcs';
import type { NpcDefinition } from '../simulation/npcs';
import type { Vec3 } from '../simulation/types';

interface Figure {
  root: Group;
  body: Mesh;
  leftLeg: Group;
  rightLeg: Group;
  leftArm: Group;
  rightArm: Group;
  phase: number;
  nextPoseTime: number;
}

/**
 * Six solid, all-side human figures. Baked vertex pigment keeps each character
 * to one body and four limb meshes; no labels, sprites or camera-facing planes.
 * Every retained geometry/material is in group, owned by scene disposal.
 */
export function createNpcPresentation(definitions: readonly NpcDefinition[] = NPC_DEFINITIONS) {
  const group = new Group();
  group.name = 'living-slice.locals';
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  material.name = 'local.cloth-skin-pigment';
  const cube = new BoxGeometry(1, 1, 1);
  const sphere = new SphereGeometry(1, 12, 8);
  const cylinder = new CylinderGeometry(1, 1, 1, 10);
  const torso = new CylinderGeometry(0.78, 1, 1, 10);
  const geometries = [cube, sphere, cylinder, torso];
  const figures = new Map<string, Figure>();
  let triangles = 0;
  let poseUpdates = 0;
  let reducedPoseUpdates = 0;

  function part(source: BufferGeometry, color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const geometry = source.clone();
    const transform = new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(sx, sy, sz));
    geometry.applyMatrix4(transform);
    const pigment = new Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = pigment.r; colors[i + 1] = pigment.g; colors[i + 2] = pigment.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return geometry;
  }

  function baked(parts: BufferGeometry[], name: string) {
    const geometry = mergeGeometries(parts);
    parts.forEach(item => item.dispose());
    if (!geometry) throw new Error(`Could not combine NPC figure parts: ${name}`);
    geometry.computeBoundingSphere();
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  for (const [index, definition] of definitions.entries()) {
    const appearance = definition.appearance;
    const root = new Group();
    root.name = `npc:${definition.id}`;
    root.userData = { npcId: definition.id, dynamicCollider: false };
    root.scale.setScalar(appearance.height / (appearance.hat ? 1.811 : 1.732));
    group.add(root);
    const bodyParts = [
      part(torso, appearance.coat, 0, 1.02, 0, 0.255, 0.58, 0.17),
      part(sphere, appearance.trousers, 0, 0.74, 0, 0.235, 0.15, 0.165),
      part(cube, 0x685237, 0, 0.82, 0, 0.46, 0.055, 0.35),
      part(cylinder, appearance.skin, 0, 1.34, 0, 0.065, 0.15, 0.065),
      part(sphere, appearance.skin, 0, 1.52, -0.008, 0.158, 0.195, 0.145),
      part(sphere, appearance.hair, 0, 1.645, 0.027, 0.16, 0.087, 0.147),
      part(sphere, appearance.skin, 0, 1.515, -0.148, 0.037, 0.046, 0.055),
      part(sphere, 0x392e26, -0.053, 1.565, -0.14, 0.011, 0.012, 0.012),
      part(sphere, 0x392e26, 0.053, 1.565, -0.14, 0.011, 0.012, 0.012),
      part(sphere, appearance.skin, -0.156, 1.525, 0.0, 0.031, 0.048, 0.037),
      part(sphere, appearance.skin, 0.156, 1.525, 0.0, 0.031, 0.048, 0.037),
    ];
    if (appearance.hat) bodyParts.push(
      part(cylinder, 0xbda56f, 0, 1.686, 0.016, 0.248, 0.035, 0.217),
      part(torso, 0xab925d, 0, 1.756, 0.018, 0.178, 0.11, 0.163),
    );
    else bodyParts.push(part(cube, 0xc5b480, 0, 1.281, -0.06, 0.31, 0.075, 0.26));
    if (appearance.apron) bodyParts.push(
      part(cube, 0xc8b58b, 0, 0.888, -0.164, 0.31, 0.51, 0.028),
      part(cube, 0xa39476, 0.058, 0.878, -0.184, 0.125, 0.095, 0.015),
    );
    const body = baked(bodyParts, `${definition.id}.body`);
    root.add(body);

    function leg(side: number) {
      const pivot = new Group();
      pivot.name = `${definition.id}.${side < 0 ? 'left' : 'right'}-leg`;
      pivot.position.set(side * 0.13, 0.74, 0);
      pivot.add(baked([
        part(cylinder, appearance.trousers, 0, -0.29, 0, 0.086, 0.55, 0.084),
        part(cube, 0x493d30, 0, -0.655, -0.045, 0.153, 0.16, 0.255),
      ], `${pivot.name}.mesh`));
      root.add(pivot);
      return pivot;
    }

    function arm(side: number) {
      const pivot = new Group();
      pivot.name = `${definition.id}.${side < 0 ? 'left' : 'right'}-arm`;
      pivot.position.set(side * 0.273, 1.23, 0);
      pivot.rotation.z = side * 0.065;
      pivot.add(baked([
        part(torso, appearance.coat, 0, -0.178, 0, 0.079, 0.35, 0.085),
        part(sphere, appearance.skin, 0, -0.416, 0, 0.07, 0.108, 0.061),
      ], `${pivot.name}.mesh`));
      root.add(pivot);
      return pivot;
    }

    figures.set(definition.id, {
      root, body, leftLeg: leg(-1), rightLeg: leg(1), leftArm: arm(-1), rightArm: arm(1),
      phase: index * 1.37, nextPoseTime: -Infinity,
    });
  }
  // Source primitives were only construction helpers; merged meshes own copies.
  geometries.forEach(geometry => geometry.dispose());

  return {
    group,
    update(population: NpcState[], elapsed: number, player: Vec3, reduced: boolean): void {
      const present = new Set(population.map(npc => npc.id));
      for (const [id, figure] of figures) figure.root.visible = present.has(id);
      for (const npc of population) {
        const figure = figures.get(npc.id);
        if (!figure) continue;
        // World transforms remain smooth even when distant limb poses run at 4 Hz.
        figure.root.position.set(npc.position.x, npc.position.y, npc.position.z);
        figure.root.rotation.y = npc.heading;
        const nearby = Math.hypot(npc.position.x - player.x, npc.position.z - player.z) <= 20;
        const interval = !nearby ? 0.25 : reduced ? 0.125 : 0;
        if (elapsed < figure.nextPoseTime && figure.nextPoseTime - elapsed < interval + 0.001) continue;
        figure.nextPoseTime = elapsed + interval;
        poseUpdates++;
        if (interval > 0) reducedPoseUpdates++;
        const walking = Math.min(1, npc.speed / 0.68);
        const phase = npc.distanceTravelled * 5.7 + figure.phase;
        const swing = Math.sin(phase) * 0.38 * walking;
        figure.leftLeg.rotation.x = swing;
        figure.rightLeg.rotation.x = -swing;
        figure.leftArm.rotation.x = -swing * 0.72;
        figure.rightArm.rotation.x = swing * 0.72;
        figure.body.position.y = walking > 0 ? Math.abs(Math.sin(phase)) * 0.017 * walking
          : nearby && !reduced ? Math.sin(elapsed * 1.8 + figure.phase) * 0.005 : 0;
        if (npc.mode === 'talking') {
          figure.rightArm.rotation.x = -0.25;
          figure.rightArm.rotation.z = -0.18;
        } else figure.rightArm.rotation.z = 0.065;
      }
    },
    stats() {
      return {
        count: figures.size, meshes: figures.size * 5, geometries: figures.size * 5,
        materials: 1, triangles, dynamicColliders: 0, poseUpdates, reducedPoseUpdates,
        animationPolicy: 'world transforms every frame; near full pose, distant 4 Hz, reduced near 8 Hz',
        disposal: 'all retained geometry/material resources owned by scene traversal',
      };
    },
  };
}
