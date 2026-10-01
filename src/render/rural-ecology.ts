import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { RURAL_TREES } from '../simulation/rural';
import { blade, branch, combined, lobe, pigment, randomSequence } from './rural-geometry';
import type { EcologyContext, EnvironmentPut, EnvironmentRegister } from './rural-geometry';
import { finishPreparation } from './preparation-scheduler';
import { preparationResources } from './preparation-cache';
import type { PreparationResources } from './preparation-cache';

const TAU = Math.PI * 2;
const TREE_FAMILIES = ['oak', 'hornbeam', 'orchard', 'alder', 'ash', 'pine'] as const;
type TreeFamily = typeof TREE_FAMILIES[number];

/** Rounded, thick little leaves, curved along their length and readable from below. */
function softLeaf(length: number, width: number, bend: number, color: number) {
  const leaf = lobe(0, length * 0.5, 0, width * 0.5, length * 0.5, width * 0.10, color, 0, true);
  const positions = leaf.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const t = positions.getY(i) / length;
    positions.setZ(i, positions.getZ(i) + bend * t * t);
  }
  return leaf;
}

/** A gently bowed solid grass ribbon with a blunt tip and continuous side normals. */
function curvedGrass(height: number, width: number, bend: number, color: number) {
  const vertices: number[] = [], indices: number[] = [];
  const profiles = [0.24, 1, 0.71, 0.10];
  for (let ring = 0; ring < profiles.length; ring++) {
    const t = ring / (profiles.length - 1), y = height * (t - 0.18 * t * t), z = bend * t * t;
    const half = width * profiles[ring]! * 0.5, thickness = 0.003 * (1 - t * 0.6);
    vertices.push(-half, y, z - thickness, half, y, z - thickness,
      half, y, z + thickness, -half, y, z + thickness);
    if (ring) for (let side = 0; side < 4; side++) {
      const a = (ring - 1) * 4 + side, b = (ring - 1) * 4 + (side + 1) % 4;
      const c = ring * 4 + side, d = ring * 4 + (side + 1) % 4;
      indices.push(a, c, b, b, c, d);
    }
  }
  indices.push(0, 1, 2, 0, 2, 3, 12, 14, 13, 12, 15, 14);
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const result = pigment(geometry, color, 0.07); geometry.dispose(); return result;
}

/** Overlapping leafy branch islands retain crown voids without knife-shaped fans. */
function* leafSpray(parts: BufferGeometry[], center: Vector3, radius: number, family: TreeFamily, random: () => number) {
  const colors = family === 'pine' ? [0x445d32, 0x526a36, 0x667840] :
    family === 'alder' ? [0x536b35, 0x708044, 0x808b49] :
    family === 'orchard' ? [0x526535, 0x6d7c3e, 0x858b49] : [0x4c6330, 0x627739, 0x788440];
  const spread = family === 'hornbeam' ? 0.78 : family === 'pine' ? 1.28 : family === 'ash' ? 1.17 : 1.14;
  for (let island = 0; island < 6; island++) {
    yield 'ecology.tree.crown-island';
    const a = island * 2.399963 + random() * 0.45;
    const reach = radius * (0.20 + random() * 0.56), size = radius * (0.56 + random() * 0.32);
    const volume = lobe(0, 0, 0, size * spread,
      size * (family === 'pine' ? 0.26 : family === 'hornbeam' ? 0.81 : family === 'ash' ? 0.46 : 0.55),
      size * (family === 'pine' ? 0.86 : 0.74), colors[island % 3]!, island % 3 === 0 ? 1 : 0);
    volume.rotateY(a); volume.rotateZ((random() - 0.5) * 0.4);
    volume.translate(center.x + Math.cos(a) * reach, center.y + (random() - 0.4) * radius * 0.55,
      center.z + Math.sin(a) * reach); parts.push(volume);
  }
  for (let leafIndex = 0; leafIndex < 8; leafIndex++) {
    if (leafIndex % 4 === 0) yield 'ecology.tree.leaves';
    const a = leafIndex * 2.399963 + random() * 0.4;
    const size = radius * (0.23 + random() * 0.18);
    const leaf = softLeaf(size, size * (family === 'ash' ? 0.36 : 0.62), size * 0.16, colors[leafIndex % 3]!);
    leaf.rotateZ(-1.08 - random() * 0.30); leaf.rotateY(a);
    leaf.translate(center.x + Math.cos(a) * radius * 0.96, center.y + (random() - 0.3) * radius * 0.45,
      center.z + Math.sin(a) * radius * 0.96); parts.push(leaf);
  }
}

function* treeGeometry(family: TreeFamily, variant: number) {
  const random = randomSequence(13031 + TREE_FAMILIES.indexOf(family) * 1777 + variant * 931);
  const parts: BufferGeometry[] = [];
  let completed = false;
  try {
  const bark = family === 'alder' ? 0x6d6b4e : family === 'pine' ? 0x66513b : 0x62503a;
  const fork = new Vector3(0.07, 3.13, -0.04);
  // All botanical families keep the existing central 3.1 m collision-aligned trunk.
  parts.push(branch(new Vector3(0, 0, 0), new Vector3(-0.025, 1.3, 0.02), 0.34, 0.29, bark));
  parts.push(branch(new Vector3(-0.025, 1.3, 0.02), fork, 0.29, 0.22, bark));
  for (let root = 0; root < 4; root++) {
    const a = root * TAU / 4 + variant * 0.53;
    parts.push(branch(new Vector3(Math.cos(a) * (0.63 + random() * 0.23), 0.025, Math.sin(a) * 0.65),
      new Vector3(0, 0.6, 0), 0.055, 0.16, bark, 5));
  }
  const twig = (a: Vector3, b: Vector3, radius = 0.047) => parts.push(branch(a, b, radius, radius * 0.35, bark, 5));
  const spray = (p: Vector3, size: number) => leafSpray(parts, p, size, family, random);
  if (family === 'oak' || family === 'orchard') {
    // Crooked lateral scaffold: broad split oak crown vs lower orchard umbrella.
    const orchard = family === 'orchard', arms = orchard ? 6 : 7;
    const height = orchard ? 6.1 : 7.3, width = orchard ? 3.0 : 2.65;
    const leader = new Vector3(variant ? -0.48 : 0.32, height - 1.25, 0.2);
    parts.push(branch(fork, leader, 0.21, 0.07, bark));
    for (let arm = 0; arm < arms; arm++) {
      const a = arm * 2.399963 + variant * 0.61, reach = width * (0.72 + random() * 0.38);
      const elbow = new Vector3(Math.cos(a) * reach * 0.50, 3.75 + random() * 1.15, Math.sin(a) * reach * 0.5);
      const tip = new Vector3(Math.cos(a) * reach, height - 1 + random() * 1.3, Math.sin(a) * reach);
      parts.push(branch(new Vector3(fork.x, 3.25 + arm % 3 * 0.4, fork.z), elbow, 0.14, 0.085, bark)); twig(elbow, tip, 0.086);
      if (arm % 3 !== 1) yield* spray(elbow.clone().lerp(tip, 0.57).add(new Vector3(0, 0.38, 0)), orchard ? 0.83 : 1.04);
      for (let end = 0; end < 4; end++) {
        const angle = a + (end - 1.3) * 0.62;
        const p = tip.clone().add(new Vector3(Math.cos(angle) * (0.35 + random() * 0.65),
          (end % 2) * 0.65 - 0.15, Math.sin(angle) * (0.4 + random() * 0.45)));
        twig(tip, p); yield* spray(p, orchard ? 0.66 + random() * 0.27 : 0.82 + random() * 0.32);
      }
    }
    yield* spray(leader.clone().add(new Vector3(0, 0.5, 0)), orchard ? 0.75 : 1.0);
  } else if (family === 'hornbeam') {
    // Unequal ascending forks form a serrated upright silhouette.
    for (let leader = 0; leader < 3; leader++) {
      const a = leader * TAU / 3 + variant * 0.42;
      const top = new Vector3(Math.cos(a) * (0.55 + leader * 0.23), 8.9 - leader * 0.62, Math.sin(a) * 0.8);
      parts.push(branch(fork, top, 0.15, 0.032, bark));
      for (let tier = 0; tier < 5; tier++) {
        const t = 0.28 + tier * 0.16, start = fork.clone().lerp(top, t), angle = a + tier * 2.23;
        const width = (1.45 - t * 0.85) * (0.8 + random() * 0.4);
        const tip = start.clone().add(new Vector3(Math.cos(angle) * width, 0.6, Math.sin(angle) * width));
        twig(start, tip, 0.058); yield* spray(tip, 0.55 + random() * 0.23);
        yield* spray(tip.clone().add(new Vector3(-Math.sin(angle) * 0.43, 0.35, Math.cos(angle) * 0.43)), 0.50);
      }
      yield* spray(top, 0.58);
    }
  } else if (family === 'alder') {
    // Three separate coppice leaders with broad horizontal leaf fans.
    for (let leader = 0; leader < 3; leader++) {
      const a = leader * 2.35 + variant * 0.7;
      const top = new Vector3(Math.cos(a) * (1.05 + random() * 0.7), 6.4 + leader * 0.67, Math.sin(a) * 1.5);
      const middle = fork.clone().lerp(top, 0.49).add(new Vector3(-0.3, 0, 0.17));
      parts.push(branch(fork, middle, 0.17, 0.11, bark), branch(middle, top, 0.11, 0.03, bark));
      for (let arm = 0; arm < 6; arm++) {
        const t = 0.40 + arm / 6 * 0.51, angle = a + arm * 2.399963, start = fork.clone().lerp(top, t);
        const tip = start.clone().add(new Vector3(Math.cos(angle) * 1.18, 0.38 + random() * 0.48, Math.sin(angle) * 1.15));
        twig(start, tip, 0.065); yield* spray(tip, 0.82);
        if (arm % 2 === 0) yield* spray(start.clone().lerp(tip, 0.48).add(new Vector3(0, 0.2, 0)), 0.73);
        yield* spray(tip.clone().add(new Vector3(Math.cos(angle) * 0.5, 0.2, Math.sin(angle) * 0.5)), 0.52);
      }
      yield* spray(top, 0.80);
    }
  } else if (family === 'ash') {
    // Swept leaders and feathered terminal twigs leave the middle open.
    const bend = variant ? -1 : 1;
    for (let leader = 0; leader < 2; leader++) {
      const elbow = new Vector3(bend * (0.6 + leader * 0.75), 5.45, leader ? 0.72 : -0.35);
      const top = new Vector3(bend * (1.8 + leader * 0.35), 7.9 - leader * 0.4, leader ? 1.3 : -0.7);
      parts.push(branch(fork, elbow, 0.19 - leader * 0.04, 0.105, bark), branch(elbow, top, 0.105, 0.035, bark));
      for (let arm = 0; arm < 6; arm++) {
        const start = elbow.clone().lerp(top, arm / 6), a = arm * 2.399963 + leader;
        const tip = start.clone().add(new Vector3(Math.cos(a) * 1.4, 0.34, Math.sin(a) * 1.4)); twig(start, tip, 0.065);
        if (arm % 3 !== 1) yield* spray(start.clone().lerp(tip, 0.45).add(new Vector3(0, 0.35, 0)), 0.90);
        for (let end = 0; end < 3; end++) {
          const p = tip.clone().add(new Vector3(Math.cos(a + end * 0.7) * 0.62, end * 0.15, Math.sin(a + end * 0.7) * 0.62));
          twig(tip, p, 0.033); yield* spray(p, 0.74 + random() * 0.23);
        }
      }
      yield* spray(top, 0.8);
    }
  } else {
    // Uneven pine shelves with exposed undersides, rather than a cone or blob.
    const top = new Vector3(variant ? -0.5 : 0.3, 8.5, 0.2); parts.push(branch(fork, top, 0.22, 0.025, bark));
    for (let tier = 0; tier < 5; tier++) {
      const y = 3.85 + tier * 0.92, width = 2.8 - tier * 0.44;
      const hub = fork.clone().lerp(top, (y - 3.13) / (8.5 - 3.13));
      for (let arm = 0; arm < (tier === 0 ? 3 : 4); arm++) {
        const a = arm * 1.67 + tier * 0.92 + variant * 0.73;
        const tip = hub.clone().add(new Vector3(Math.cos(a) * width, 0.13 + random() * 0.22, Math.sin(a) * width));
        twig(hub, tip, 0.087 - tier * 0.011);
        if (arm % 2 === 0) yield* spray(hub.clone().lerp(tip, 0.50).add(new Vector3(0, 0.14, 0)), 0.68 - tier * 0.025);
        for (let end = 0; end < 3; end++) {
          yield* spray(tip.clone().add(new Vector3(Math.cos(a + end * 0.62) * 0.54, 0.18, Math.sin(a + end * 0.62) * 0.54)), 0.67 - tier * 0.042);
        }
      }
    }
    yield* spray(top, 0.64);
  }
  const result = combined(parts); completed = true; return result;
  } finally { if (!completed) for (const part of parts) part.dispose(); }
}

type ShrubKind = 'spreading' | 'wiry' | 'upright';
function shrubGeometry(kind: ShrubKind, variant = 0) {
  const random = randomSequence(17131 + kind.length * 319 + variant * 1237), parts: BufferGeometry[] = [];
  for (let stem = 0; stem < (kind === 'wiry' ? 7 : kind === 'upright' ? 6 : 5); stem++) {
    const a = stem * 2.399963 + variant, spread = kind === 'upright' ? 0.22 : 0.62;
    const height = kind === 'upright' ? 0.88 + random() * 0.40 : kind === 'wiry' ? 0.63 + random() * 0.33 : 0.30 + random() * 0.38;
    const tip = new Vector3(Math.cos(a) * spread, height, Math.sin(a) * spread);
    parts.push(branch(new Vector3(0, 0, 0), tip, kind === 'wiry' ? 0.026 : 0.019, 0.008, 0x67573b, 4));
    if (kind === 'wiry') {
      const side = tip.clone().multiplyScalar(0.72).add(new Vector3(Math.cos(a + 1) * 0.35, 0.13, Math.sin(a + 1) * 0.35));
      parts.push(branch(tip.clone().multiplyScalar(0.5), side, 0.015, 0.004, 0x776345, 4));
      for (const p of [side, tip]) for (let i = 0; i < 4; i++) {
        const leaf = softLeaf(0.15, 0.075, 0.025, i % 2 ? 0x738144 : 0x5b7138);
        leaf.rotateZ(-0.95); leaf.rotateY(a + i * 1.4); leaf.translate(p.x, p.y, p.z); parts.push(leaf);
      }
    } else {
      const mass = lobe(0, 0, 0,
        kind === 'upright' ? 0.20 : 0.26 + random() * 0.10,
        kind === 'upright' ? 0.28 : 0.15 + random() * 0.05, 0.23,
        stem % 2 ? 0x748444 : 0x637b3b, 0, true);
      mass.rotateY(a); mass.translate(tip.x * 0.84, height * 0.79, tip.z * 0.84); parts.push(mass);
      for (let i = 0; i < 5; i++) {
        const leaf = softLeaf(kind === 'upright' ? 0.25 : 0.28, 0.13 + random() * 0.06, 0.045, [0x536b36, 0x718141, 0x828c4a][i % 3]!);
        leaf.rotateZ(-0.82 - random() * 0.68); leaf.rotateY(a + i * 1.77);
        const base = tip.clone().multiplyScalar(0.3 + i * 0.14); leaf.translate(base.x, base.y, base.z); parts.push(leaf);
      }
    }
  }
  return combined(parts);
}

function fernGeometry() {
  const parts: BufferGeometry[] = [];
  for (let frond = 0; frond < 6; frond++) {
    const angle = frond * 2.399, length = 0.64 + frond % 3 * 0.13;
    for (let leaflet = 0; leaflet < 6; leaflet++) for (const sign of [-1, 1]) {
      const t = (leaflet + 1) / 7, radius = t * length;
      const leaf = blade(0.23 * (1 - t * 0.65), 0.09 * (1 - t * 0.55), 0.025, frond % 2 ? 0x647b39 : 0x466431);
      leaf.rotateZ(sign * -Math.PI / 2.8); leaf.rotateY(angle);
      leaf.translate(Math.sin(angle) * radius, Math.sin(t * Math.PI * 0.8) * length * 0.57, Math.cos(angle) * radius); parts.push(leaf);
    }
  }
  return combined(parts);
}

function groundcoverGeometry(clover: boolean) {
  const parts: BufferGeometry[] = [], random = randomSequence(clover ? 3517 : 4971);
  for (let rosette = 0; rosette < 3; rosette++) {
    const x = (random() - 0.5) * 0.48, z = (random() - 0.5) * 0.43;
    for (let i = 0; i < (clover ? 3 : 4); i++) {
      const leaf = softLeaf(clover ? 0.14 : 0.20, clover ? 0.10 : 0.11, 0.018, [0x687b3d, 0x7c8947, 0x536b35][(i + rosette) % 3]!);
      leaf.rotateZ(-1.44); leaf.rotateY(i * (clover ? TAU / 3 : 2.399963) + rosette);
      leaf.translate(x, 0.025 + rosette * 0.009, z); parts.push(leaf);
    }
  }
  return combined(parts);
}

/** Thin irregular ground islands, never repeated pebble-shaped mounds. */
function earthVeneer(color: number, seed: number) {
  const random = randomSequence(seed), parts: BufferGeometry[] = [];
  for (let island = 0; island < 3; island++) {
    const vertices = [island * 0.33 - 0.28, 0.013 + island * 0.007, (island % 2) * 0.29 - 0.15], indices: number[] = [];
    for (let edge = 0; edge < 9; edge++) {
      const a = edge * TAU / 9, r = 0.45 + random() * 0.24;
      vertices.push(vertices[0]! + Math.cos(a) * r, 0.010 + island * 0.007, vertices[2]! + Math.sin(a) * r * 0.68);
      indices.push(0, (edge + 1) % 9 + 1, edge + 1);
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); const colored = pigment(geometry, color, 0.045);
    geometry.dispose(); parts.push(colored);
  }
  return combined(parts);
}

function debrisGeometry() {
  const parts: BufferGeometry[] = [branch(new Vector3(-0.43, 0.036, -0.13), new Vector3(0.41, 0.05, 0.17), 0.026, 0.018, 0x746245, 4),
    branch(new Vector3(0.08, 0.04, 0.04), new Vector3(0.3, 0.045, -0.18), 0.014, 0.007, 0x6a593f, 4)];
  for (let i = 0; i < 4; i++) {
    const leaf = blade(0.16, 0.10, 0.025, i % 2 ? 0x867649 : 0x727145);
    leaf.rotateZ(-1.51); leaf.rotateY(i * 2.4); leaf.translate((i - 1.5) * 0.18, 0.02, i % 2 * 0.15); parts.push(leaf);
  }
  return combined(parts);
}

function plantGeometry(kind: 'short' | 'tall' | 'reed' | 'wheat' | 'white' | 'yellow' | 'weed' | 'dry') {
  const parts: BufferGeometry[] = [], random = randomSequence(kind.charCodeAt(0) * 8191 + kind.length * 131);
  if (kind === 'white' || kind === 'yellow') {
    for (let stalk = 0; stalk < 3; stalk++) {
      const x = (random() - 0.5) * 0.26, z = (random() - 0.5) * 0.26, h = 0.30 + random() * 0.25;
      parts.push(branch(new Vector3(x, 0, z), new Vector3(x + 0.03, h, z), 0.009, 0.005, 0x52692d, 4));
      for (let petal = 0; petal < 5; petal++) {
        const leaf = blade(0.10, 0.075, 0.015, kind === 'white' ? 0xe5dfbd : 0xd5b449);
        leaf.rotateZ(-Math.PI / 2); leaf.rotateY(petal * TAU / 5); leaf.translate(x + 0.03, h, z); parts.push(leaf);
      }
      parts.push(lobe(x + 0.03, h + 0.016, z, 0.033, 0.028, 0.033, 0xc39734, 0));
      const leaf = blade(0.20, 0.052, 0.11, 0x536b30); leaf.rotateY(stalk * 2); leaf.translate(x, 0.04, z); parts.push(leaf);
    }
  } else if (kind === 'reed' || kind === 'wheat') {
    for (let stalk = 0; stalk < (kind === 'reed' ? 4 : 3); stalk++) {
      const x = (random() - 0.5) * 0.27, z = (random() - 0.5) * 0.27;
      const h = kind === 'reed' ? 1.2 + random() * 0.55 : 0.88 + random() * 0.27, lean = 0.035 + random() * 0.08;
      const stem = kind === 'reed' ? 0x67764a : 0xb8a14e;
      parts.push(branch(new Vector3(x, 0, z), new Vector3(x + lean, h, z), 0.012, 0.007, stem, 4));
      for (let i = 0; i < 2; i++) {
        const leaf = kind === 'reed' ? curvedGrass(0.71, 0.072, 0.30, 0x859054) : blade(0.42, 0.046, 0.26, stem);
        leaf.rotateY(stalk * 2.3 + i * 2.7); leaf.translate(x, h * (0.18 + i * 0.21), z); parts.push(leaf);
      }
      if (kind === 'wheat') {
        parts.push(lobe(x + lean, h + 0.09, z, 0.052, 0.17, 0.052, stalk % 2 ? 0xc4aa51 : 0xab9142, 1));
        for (let awn = 0; awn < 3; awn++) {
          const leaf = blade(0.21, 0.012, 0.06, 0xc8b266); leaf.rotateY(awn * 2.1); leaf.translate(x + lean, h + 0.1, z); parts.push(leaf);
        }
      } else if (stalk % 2 === 0) {
        parts.push(branch(new Vector3(x + lean, h - 0.03, z), new Vector3(x + lean, h + 0.16, z), 0.032, 0.027, 0x6b5738, 6));
      }
    }
  } else {
    const h = kind === 'short' ? 0.145 : kind === 'weed' ? 0.42 : kind === 'dry' ? 0.25 : 0.40;
    for (let i = 0; i < (kind === 'weed' ? 6 : kind === 'short' ? 4 : 5); i++) {
      const color = kind === 'dry' ? [0x8a8b50, 0xa39b63, 0x79834a][i % 3]! : [0x788949, 0x8b9655, 0x7f914c][i % 3]!;
      const leaf = kind === 'weed' ? softLeaf(h * (0.58 + random() * 0.28), 0.095, 0.065, color) :
        curvedGrass(h * (0.70 + random() * 0.45), kind === 'short' ? 0.060 : 0.073, h * 0.56, color);
      leaf.rotateZ(kind === 'weed' ? -0.55 : (random() - 0.5) * 0.77); leaf.rotateY(i * 2.399);
      leaf.translate((random() - 0.5) * 0.21, 0, (random() - 0.5) * 0.21); parts.push(leaf);
    }
  }
  return combined(parts);
}

export function registerEcology(register: EnvironmentRegister) { finishPreparation(ecologyRegistrationJobs(register)); }
export function* ecologyRegistrationJobs(register: EnvironmentRegister, scope?: PreparationResources) {
  const ownership = preparationResources(scope);
  function* add(name: string, make: () => BufferGeometry | Generator<string, BufferGeometry, unknown>, shadows = false) {
    let geometry = ownership.cache?.get<BufferGeometry>(`ecology.geometry.${name}`);
    if (!geometry) {
      const built = make(); geometry = built instanceof BufferGeometry ? built : yield* built;
      ownership.cache?.retain(`ecology.geometry.${name}`, geometry, [geometry]);
    }
    register(name, ownership.own(geometry), shadows);
    yield `ecology.register.${name}`;
  }
  for (const family of TREE_FAMILIES) for (let variant = 0; variant < 2; variant++)
    yield* add(`tree-${family}-${variant}`, () => treeGeometry(family, variant), true);
  for (const kind of ['short', 'tall', 'reed', 'wheat', 'white', 'yellow', 'weed', 'dry'] as const)
    yield* add(kind, () => plantGeometry(kind), kind === 'wheat');
  yield* add('shrub', () => shrubGeometry('spreading'), true); yield* add('shrub-spreading', () => shrubGeometry('spreading', 1), true);
  yield* add('shrub-wiry', () => shrubGeometry('wiry'), true); yield* add('shrub-upright', () => shrubGeometry('upright'), true);
  yield* add('fern', fernGeometry); yield* add('ecology-groundcover', () => groundcoverGeometry(false)); yield* add('ecology-clover', () => groundcoverGeometry(true));
  yield* add('ecology-earth', () => earthVeneer(0x787044, 619)); yield* add('ecology-duff', () => earthVeneer(0x6a6540, 137)); yield* add('ecology-moss', () => earthVeneer(0x627637, 193));
  yield* add('ecology-stone', () => lobe(0, 0.026, 0, 0.20, 0.11, 0.13, 0x8a876b, 0)); yield* add('ecology-debris', debrisGeometry);
}

export function placeTrees(put: EnvironmentPut) {
  // Deliberate composition: neighbouring trees have unlike scaffolds and crowns.
  const families = [0, 4, 1, 3, 2, 4, 0, 2, 1, 3, 2, 5, 3, 0, 4, 1, 2, 5, 4, 5, 0, 3, 1, 5];
  for (const [index, [x, y, z, scale]] of RURAL_TREES.entries()) {
    const family = TREE_FAMILIES[families[index]!]!;
    put(`tree-${family}-${Math.floor(index / 6) % 2}`, x, y, z, scale, scale, scale, index * 1.718, 0.92 + (index % 4) * 0.045);
  }
}

type Community = 'meadow' | 'woodland' | 'dry' | 'ledge';
type Patch = [number, number, number, number, Community];
export function addGroundEcology(context: EcologyContext) { finishPreparation(groundEcologyJobs(context)); }
export function* groundEcologyJobs({ random, groundHeight, pathDistance, reserved, put }: EcologyContext) {
  const veneerFits = (x: number, y: number, z: number, scale: number) =>
    !reserved(x, z, y, scale * 1.15) &&
    [[-1.1, 0], [1.1, 0], [0, -0.65], [0, 0.65]].every(([dx, dz]) =>
      Math.abs(groundHeight(x + dx! * scale, z + dz! * scale) - y) < 0.10);
  const patches: Patch[] = [
    [-34, -15, 7, 5, 'woodland'], [-27, -23, 5, 6, 'dry'], [-36, -31, 7, 6, 'woodland'], [-22, -32, 4, 7, 'meadow'],
    [-11, -33, 6, 5, 'woodland'], [1, -40, 8, 5, 'woodland'], [16, -43, 7, 4, 'dry'], [30, -34, 8, 7, 'woodland'],
    [29, -23, 6, 4, 'meadow'], [34, -11, 9, 7, 'woodland'], [20, -12, 6, 6, 'meadow'], [14, -16, 4, 3, 'dry'],
    [-7, -15, 5, 3, 'meadow'], [-8, -8, 2.4, 4, 'meadow'], [-21, -7, 5, 7, 'woodland'], [-29, -1, 7, 4, 'meadow'],
    [-3, 1, 2.5, 1.2, 'dry'], [19, 1, 5, 4, 'meadow'], [27, 2, 7, 3, 'woodland'], [36, 2, 7, 3, 'dry'],
    [-20, 6, 6, 2.1, 'ledge'], [-13, 9, 2.8, 1.3, 'ledge'], [2, 7, 5, 1.5, 'ledge'], [9, 6.6, 5, 1.8, 'ledge'],
    [24, 7, 8, 1.8, 'ledge'], [-29, 6, 8, 1.4, 'ledge'], [-39, 6, 6, 2, 'ledge'], [-22, 29.3, 6, 2, 'ledge'],
    [-11, 30.7, 4, 2, 'ledge'], [8, 29.7, 6, 2, 'ledge'], [24, 29.5, 7, 2.5, 'ledge'], [-21, 37, 10, 7, 'woodland'],
    [-7, 42, 7, 6, 'meadow'], [18, 39, 8, 8, 'woodland'], [33, 38, 8, 7, 'woodland'], [-38, 39, 7, 7, 'dry'],
    [-29, -41, 6, 4, 'dry'], [-17, -26, 4, 4, 'meadow'], [1, -16, 5, 3, 'meadow'],
    [8, -11, 3, 2.5, 'dry'], [37, -26, 5, 5, 'meadow'], [25, -40, 4, 4, 'woodland'],
    [-34, 31, 5, 3, 'meadow'], [3, 43, 4, 4, 'dry'], [39, 32, 5, 4, 'meadow'],
    // The playable crop approach needs the same layered meadow as the eagle-eye margins.
    [-7, -29, 5, 4.5, 'woodland'], [-12, -40, 5, 4, 'woodland'],
    [-2, -23.5, 4, 2.1, 'meadow'], [-9, -21.5, 4, 1.7, 'ledge'],
    [7, -23, 3.8, 1.7, 'meadow'], [18, -23, 5.5, 1.8, 'dry'],
  ];
  // Cluster centres define low-frequency growth; small plants share their local community.
  for (const [patchIndex, [cx, cz, rx, rz, community]] of patches.entries()) {
    for (let cluster = 0; cluster < (community === 'ledge' ? 14 : 20); cluster++) {
      yield 'ecology.ground-cluster';
      const a = random() * TAU, r = Math.sqrt(random()), px = cx + Math.cos(a) * r * rx, pz = cz + Math.sin(a) * r * rz;
      const py = groundHeight(px, pz), spread = 0.8 + random() * 1.35;
      if (reserved(px, pz, py, spread * 0.45)) continue;
      if (cluster % 3 === 0 && veneerFits(px, py, pz, spread)) {
        const veneer = community === 'woodland' ? 'ecology-duff' : community === 'ledge' ? 'ecology-moss' : 'ecology-earth';
        put(veneer, px, py + 0.006, pz, spread, 1, spread * (0.65 + random() * 0.35));
      }
      for (let member = 0; member < (community === 'woodland' ? 18 : 21); member++) {
        const angle = random() * TAU, radius = Math.sqrt(random()) * spread;
        const x = px + Math.cos(angle) * radius, z = pz + Math.sin(angle) * radius * 0.7, y = groundHeight(x, z);
        if (Math.abs(y - py) > 0.12 || reserved(x, z, y, 0.35)) continue;
        const scale = 0.68 + random() * 0.70;
        const kind = member % 3 === 0 ? (community === 'meadow' ? 'ecology-clover' : 'ecology-groundcover') :
          community === 'dry' ? 'dry' : community === 'woodland' && member % 7 === 0 ? 'fern' :
          member % 11 === 0 ? 'weed' : member % 8 === 0 && community !== 'woodland' ? 'tall' : 'short';
        put(kind, x, y + 0.006, z, scale, scale, scale);
        if (community === 'meadow' && member % 7 === 0) put(patchIndex % 3 ? 'white' : 'yellow', x + 0.07, y, z, 0.6 + random() * 0.4);
      }
      // Small low satellites feather clustered growth into adjoining lawn, rather than hard disks.
      for (let edge = 0; edge < 7; edge++) {
        const angle = random() * TAU, radius = spread * (0.95 + random() * 0.85);
        const x = px + Math.cos(angle) * radius, z = pz + Math.sin(angle) * radius * 0.73, y = groundHeight(x, z);
        if (Math.abs(y - py) > 0.10 || reserved(x, z, y, 0.40)) continue;
        put(edge % 2 ? 'ecology-groundcover' : 'short', x, y + 0.007, z, 0.44 + random() * 0.34);
      }
      if (cluster % 4 === 0 && !reserved(px, pz, py, 1.15)) {
        const shrub = community === 'woodland' ? 'shrub-wiry' : community === 'ledge' ? 'shrub-upright' : 'shrub-spreading';
        const scale = community === 'ledge' ? 0.5 + random() * 0.4 : 0.65 + random() * 0.45;
        put(shrub, px, py, pz, scale, scale, scale);
      }
      if (cluster % 5 === 0 && pathDistance(px, pz, py) > 0.9) put(community === 'woodland' ? 'ecology-debris' : 'ecology-stone', px, py + 0.012, pz, 0.65 + random() * 0.6);
    }
  }
  // Medium understorey is deliberately grouped at ledges/tree margins, not spread over every lawn.
  const shrubPockets = [
    [-32, -8], [-26, -15], [-31, -29], [-20, -35], [-3, -36], [4, -43], [28, -36],
    [30, -11], [21, -4], [-28, 4], [-19, 5.5], [-2, 6], [18, 5.4], [30, 5],
    [-24, 31], [-16, 40], [21, 36], [32, 31], [-5, 41], [31, 42],
  ];
  for (const [pocketIndex, [cx, cz]] of shrubPockets.entries()) {
    yield 'ecology.shrub-pocket';
    const cy = groundHeight(cx!, cz!);
    for (let shrub = 0; shrub < 5; shrub++) {
      const a = shrub * 2.399963 + pocketIndex, r = shrub === 0 ? 0 : 0.85 + random() * 0.85;
      const x = cx! + Math.cos(a) * r, z = cz! + Math.sin(a) * r, y = groundHeight(x, z);
      if (Math.abs(y - cy) > 0.10 || reserved(x, z, y, 1.1)) continue;
      const kind = shrub === 3 ? 'shrub-wiry' : shrub === 1 && pocketIndex % 2 ? 'shrub-upright' : 'shrub-spreading';
      const scale = 0.98 + random() * 0.36;
      put(kind, x, y + 0.006, z, scale, scale * (0.87 + random() * 0.18), scale);
      if (shrub % 2 === 0) put('fern', x + 0.28, y, z + 0.14, 0.54 + random() * 0.24);
    }
  }
  // Earth, low shade plants and restrained fallen twigs specifically nest at tree roots.
  for (const [treeIndex, [tx, ty, tz, treeScale]] of RURAL_TREES.entries()) for (let pocket = 0; pocket < 5; pocket++) {
    yield 'ecology.tree-ground';
    const a = pocket * 2.399963 + treeIndex, radius = (0.8 + random() * 1.2) * treeScale;
    const x = tx + Math.cos(a) * radius, z = tz + Math.sin(a) * radius, y = groundHeight(x, z);
    if (Math.abs(y - ty) > 0.1 || reserved(x, z, y, 0.75)) continue;
    const coverScale = 0.7 + random() * 0.55;
    if (veneerFits(x, y, z, coverScale)) put(pocket % 2 ? 'ecology-moss' : 'ecology-duff', x, y + 0.004, z, coverScale, 1, 0.6 + random() * 0.4);
    put(pocket % 3 ? 'ecology-groundcover' : 'fern', x, y + 0.015, z, 0.6 + random() * 0.45);
    if (pocket === 2 && !reserved(x, z, y, 1.0)) put(treeIndex % 3 ? 'shrub-spreading' : 'shrub-upright', x, y, z, 0.95 + random() * 0.3);
    if (pocket === 0) put('ecology-debris', x, y + 0.014, z, 0.8);
  }
}
