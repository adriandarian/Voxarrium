/** M2 design assumptions in meters; single contract for Blender and runtime. */
export const RURAL = {
  id: 'm2-rural-96m', seed: 104729, bounds: 48,
  cottage: { x: 0, y: 4, z: -7, width: 7.2, depth: 6.2 },
  shed: { x: -10, y: 4, z: -1, width: 3.0, depth: 2.8 },
  bridge: { x: -2, y: 0, z: 19, width: 3.6, length: 14 },
  garden: { x: 10, y: 4.03, z: -2, width: 9, depth: 8 },
  wheat: { x: 15, y: 7.44, z: -25, width: 18, depth: 11 },
  palette: { grass: 0x657539, grassLight: 0x819044, soil: 0x73603c,
    path: 0xc2aa71, stone: 0x77745b, water: 0x288f91,
    plaster: 0xded0a4, timber: 0x4c3626, terracotta: 0xa9512b, teal: 0x2f7370 },
} as const;
