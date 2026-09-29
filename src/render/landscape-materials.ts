import { BufferGeometry, CanvasTexture, Float32BufferAttribute, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

/** Project-authored pigment textures. No reference pixels are shipped or sampled. */
export function createLandscapeMaterials() {
  function texture(kind: 'grass' | 'stone' | 'path' | 'soil') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Landscape pigment canvas unavailable');
    let state = 7319;
    const rand = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const colors = {
      grass: ['#6d793e', '#536131', '#7e8847', '#929251', '#676b39'],
      stone: ['#77755e', '#626451', '#9a9679', '#86896b', '#646653'],
      path: ['#bfaa77', '#b7a16d', '#c9b687', '#a99361', '#c2ac78'],
      soil: ['#6d5737', '#58472e', '#816746', '#74633b', '#615334'],
    }[kind];
    ctx.fillStyle = colors[0]!; ctx.fillRect(0, 0, 512, 512);
    // Overlapping translucent washes wrap at edges, without a tiled cell pattern.
    for (let i = 0; i < 180; i++) {
      const x = rand() * 512, y = rand() * 512, r = 12 + rand() * 74;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const gradient = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gradient.addColorStop(0, `${colors[1 + i % 4]}99`);
        gradient.addColorStop(1, `${colors[1 + i % 4]}00`);
        ctx.fillStyle = gradient; ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    // Small broken pigment strokes remain subordinate to authored landforms.
    ctx.globalAlpha = kind === 'grass' ? 0.20 : 0.14;
    for (let i = 0; i < 8500; i++) {
      const x = rand() * 512, y = rand() * 512;
      ctx.fillStyle = colors[1 + i % 4]!;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.5 + rand() * 2.3, 0.4 + rand() * 1.8, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const map = new CanvasTexture(canvas); map.name = `pigment.${kind}.512`;
    map.wrapS = map.wrapT = RepeatWrapping; map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const material = new MeshStandardMaterial({ color: 0xffffff, map, roughness: 1 });
    material.name = `landscape.${kind}`;
    return material;
  }
  return { grass: texture('grass'), stone: texture('stone'), path: texture('path'), soil: texture('soil') };
}

/** Planar coordinates in meters; surface triangulation never draws a visible grid. */
export function applyLandscapeUV(geometry: BufferGeometry, kind: 'ground' | 'cliff') {
  const positions = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    uv.push(kind === 'ground' ? x / 18 : (x + z) / 7, kind === 'ground' ? z / 18 : y / 7);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}
