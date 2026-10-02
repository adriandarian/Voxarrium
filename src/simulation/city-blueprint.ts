import type { CityBlueprint, CityDistrict, CityDistrictId, CityRoad, CityWaterway, CityTerrace } from './city-contracts';
import { createStreamingWorld } from './streaming-world';
import type { BoxSpec, CourseSpec, Vec3 } from './types';

type Point = { x: number; z: number };
type Surface = NonNullable<CourseSpec['surfaces']>[number];
const p = (x: number, z: number, y = 4): Vec3 => ({ x, y, z });
const polygon = (...pairs: number[]): Point[] => Array.from({ length: pairs.length / 2 }, (_, i) => ({ x: pairs[i * 2]!, z: pairs[i * 2 + 1]! }));
const area = (points: readonly Point[]) => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length]!; return sum + a.x * b.z - b.x * a.z;
}, 0) / 2;
const ccw = (points: Point[]) => area(points) < 0 ? points.reverse() : points;
function surface(id: string, points: Vec3[], color: number): Surface {
  const vertices = points.flatMap(point => [point.x, point.y, point.z]);
  const indices: number[] = [];
  for (let i = 1; i < points.length - 1; i++) indices.push(0, i + 1, i);
  return { id, vertices, indices, color };
}
function strip(a: Vec3, b: Vec3, width: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = -(b.z - a.z) / length * width / 2, nz = (b.x - a.x) / length * width / 2;
  return ccw([{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
    { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }]);
}
const square = (point: Point, radius: number) => polygon(point.x - radius, point.z - radius,
  point.x + radius, point.z - radius, point.x + radius, point.z + radius, point.x - radius, point.z + radius);

/** Convex half-plane clipping. Fragments remain convex and fan-triangulatable. */
function halfPlane(subject: Point[], a: Point, b: Point, inside: boolean): Point[] {
  if (!subject.length) return [];
  const side = (point: Point) => (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
  const result: Point[] = [];
  for (let i = 0; i < subject.length; i++) {
    const start = subject[i]!, end = subject[(i + 1) % subject.length]!;
    const s = side(start), e = side(end), includeS = inside ? s >= -1e-8 : s <= 1e-8;
    const includeE = inside ? e >= -1e-8 : e <= 1e-8;
    if (includeS) result.push(start);
    if (includeS !== includeE) {
      const t = s / (s - e);
      result.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
    }
  }
  return result.filter((point, i) => {
    const previous = result[(i + result.length - 1) % result.length]!;
    return Math.hypot(point.x - previous.x, point.z - previous.z) > 1e-6;
  });
}
function subtract(subject: Point[], cutter: Point[]): Point[][] {
  const fragments: Point[][] = [];
  let remaining = subject;
  for (let i = 0; i < cutter.length && remaining.length >= 3; i++) {
    const a = cutter[i]!, b = cutter[(i + 1) % cutter.length]!;
    const outside = halfPlane(remaining, a, b, false);
    if (outside.length >= 3 && Math.abs(area(outside)) > 0.01) fragments.push(ccw(outside));
    remaining = halfPlane(remaining, a, b, true);
  }
  return fragments;
}

/** The resident renderer and Rapier use exactly these inclined decks and joins.
 * Accepted lanes describe connectivity only: their authored M2/M4 surfaces stay authoritative.
 */
export function cityRoadSurfaces(roads: readonly CityRoad[]): Surface[] {
  const surfaces: Surface[] = [];
  for (const road of roads) {
    if (road.id.startsWith('accepted.')) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!, b = road.points[i]!;
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      // Shared nodes need a level landing: a crossing flat side street must
      // not introduce a >21cm riser across an approaching inclined deck.
      const landing=road.kind==='stairs'?0:Math.min(5,length*.15);
      const at=(t:number,y:number):Vec3=>({x:a.x+(b.x-a.x)*t,y,z:a.z+(b.z-a.z)*t});
      const segments=Math.abs(a.y-b.y)>.001 && landing>0
        ? [a,at(landing/length,a.y),at(1-landing/length,b.y),b] : [a,b];
      for(let part=1;part<segments.length;part++) {
      const start=segments[part-1]!,end=segments[part]!;
      const dx = end.x - start.x, dz = end.z - start.z, length2 = dx * dx + dz * dz;
      const corners = strip(start, end, road.width).map(point => {
        const t = ((point.x - start.x) * dx + (point.z - start.z) * dz) / length2;
        return { ...point, y: start.y + (end.y - start.y) * t };
      });
      surfaces.push(surface(`city.road.${road.id}.${i}.${part}`, corners, road.kind === 'bridge' ? 0xc7bea0 : 0xb8ad8f));
      }
    }
    // A small center cap seals float rounding without flattening a whole inclined road.
    for (let i = 0; i < road.points.length; i++) {
      const point = road.points[i]!;
      surfaces.push(surface(`city.road.${road.id}.center.${i}`, square(point, 0.35).map(corner => ({ ...corner, y: point.y })), 0xb8ad8f));
      if (i === 0 || i === road.points.length - 1) continue;
      const before = strip(road.points[i - 1]!, point, road.width), after = strip(point, road.points[i + 1]!, road.width);
      // Convex hull at a turn fills only the outer wedges, leaving the sloping strip intact.
      const corners = [...before, ...after].filter(corner => Math.hypot(corner.x - point.x, corner.z - point.z) < road.width);
      corners.sort((a, b) => Math.atan2(a.z - point.z, a.x - point.x) - Math.atan2(b.z - point.z, b.x - point.x));
      for (let j = 0; j < corners.length; j++) {
        const triangle = ccw([{ x: point.x, z: point.z }, corners[j]!, corners[(j + 1) % corners.length]!]);
        if (Math.abs(area(triangle)) > 0.001) surfaces.push(surface(`city.road.${road.id}.join.${i}.${j}`,
          triangle.map(corner => ({ ...corner, y: point.y })), 0xb8ad8f));
      }
    }
  }
  return surfaces;
}

/** Deterministic, meter-authored M6 macro composition, with no render/physics objects. */
export function createCityBlueprint(): CityBlueprint {
  const accepted = createStreamingWorld();
  const roads: CityRoad[] = [];
  const connections: CityBlueprint['connections'] = [];
  const districts: CityDistrict[] = [];
  const addDistrict = (id: CityDistrictId, name: string, role: string, footprint: Point[], center: Vec3,
    elevationBand: [number, number], density: CityDistrict['density'], streamingPriority: number,
    waterAdjacency: string[] = [], landmarks: string[] = [], acceptedArea?: CityDistrict['acceptedArea']) => {
    districts.push({ id, name, role, footprint: ccw(footprint), center, elevationBand, density,
      streamingPriority, waterAdjacency, landmarks, neighbors: [], entrances: [], ...(acceptedArea ? { acceptedArea } : {}) });
  };
  addDistrict('rural', 'Rural outskirts', 'accepted cottage, crops and lower river crossing', polygon(-48,-48,48,-48,48,48,-48,48), p(5,-10), [0,8], 'rural', 0, ['accepted-river'], [], 'rural');
  addDistrict('river-market', 'River Market', 'accepted market street, workshop lots and quays', polygon(48,-48,146,-48,146,48,48,48), p(89,-12), [0,5.4], 'dense', 1, ['accepted-river'], [], 'river-market');
  addDistrict('neighbor-shell', 'Workshop forecourt', 'accepted eastern workshop handoff', polygon(146,-48,218,-48,218,1,146,1), p(206,-10), [4,4], 'sparse', 2, [], [], 'neighbor-shell');
  addDistrict('south-gate', 'South river gate', 'forecourt, bridge approaches and city entrance', polygon(218,1,218,-80,330,-80,380,-45,375,48,218,48), p(240,-55), [0,4], 'sparse', 3, ['southern-reach'], ['south-gate-tower']);
  addDistrict('lower-canal', 'Lower canal wards', 'working quays and lower river neighborhoods', polygon(225,-80,370,-85,385,-185,375,-260,225,-260), p(310,-165), [0,8], 'medium', 4, ['southern-reach','middle-reach'], []);
  addDistrict('garden-terrace', 'Garden terrace', 'planted transition between the accepted slice and dense city', polygon(-80,-48,218,-48,225,-150,175,-160,-65,-160,-80,-110), p(110,-110,8), [4,8], 'sparse', 4, [], []);
  addDistrict('central-market', 'Central market', 'dense street walls around an open exchange plaza', polygon(0,-160,225,-160,225,-305,0,-305), p(110,-235,12), [8,12], 'dense', 5, ['middle-reach'], ['market-belfry']);
  addDistrict('west-bank', 'West-bank homes', 'river terraces and quieter residential courtyards', polygon(-160,-160,0,-160,0,-305,-70,-365,-135,-365,-160,-310), p(-75,-275,12), [8,12], 'medium', 5, [], ['west-bank-tower']);
  addDistrict('civic-terrace', 'Civic terrace', 'hall, public square and eastern high bridge', polygon(0,-305,225,-305,225,-425,-70,-425,-70,-365), p(110,-365,22), [12,22], 'dense', 6, ['upper-reach'], ['civic-hall']);
  addDistrict('noble-quarter', 'Noble quarter', 'courts and larger upper residential lots', polygon(-70,-425,110,-425,110,-570,-65,-570), p(10,-465,32), [22,36], 'medium', 7, [], []);
  addDistrict('temple-quarter', 'Temple and academy', 'eastern tower precinct over the river valley', polygon(225,-260,355,-260,380,-365,370,-495,255,-495,225,-405), p(280,-405,30), [18,30], 'monumental', 7, ['upper-reach','headwater-reach'], ['temple-tower']);
  addDistrict('upper-city', 'Upper city', 'approach streets below the citadel and northern crossing', polygon(110,-425,220,-425,240,-490,250,-570,110,-570), p(185,-505,40), [30,40], 'dense', 8, ['headwater-reach'], []);
  addDistrict('citadel', 'Citadel plateau', 'dominant castle and a clear ceremonial forecourt', polygon(40,-570,265,-570,280,-645,245,-660,70,-660,40,-630), p(150,-605,50), [40,50], 'monumental', 9, [], ['citadel-keep','citadel-tower','citadel-wing']);
  addDistrict('orchard-edge', 'Orchard edge', 'western gardens, plots and sparse rural transition', polygon(-160,-365,-70,-365,-70,-630,-115,-660,-160,-630), p(-115,-525,18), [12,18], 'rural', 6, [], []);
  const byId = new Map(districts.map(district => [district.id, district]));
  const road = (id: string, kind: CityRoad['kind'], width: number, points: Vec3[], ids: CityDistrictId[]) => {
    roads.push({ id, kind, width, points, districts: ids }); return id;
  };
  const link = (from: CityDistrictId, to: CityDistrictId, id: string, kind: CityRoad['kind'], width: number, points: Vec3[]) => {
    road(id, kind, width, points, [from,to]);
    const connection = { id: `connection.${from}.${to}`, from, to, road: id, points, width };
    connections.push(connection);
    byId.get(from)!.neighbors.push(to); byId.get(to)!.neighbors.push(from);
    byId.get(from)!.entrances.push(connection.id); byId.get(to)!.entrances.push(connection.id);
  };
  link('rural','river-market','accepted.market-street','primary',4.8,accepted.route.slice(1,9));
  link('river-market','neighbor-shell','accepted.workshop-lane','primary',4.8,[p(111,-11),p(145,-10),p(206,-10)]);
  link('neighbor-shell','south-gate','gate-approach','primary',6,[p(206,-10),p(218,-10),p(240,-55)]);
  link('south-gate','garden-terrace','garden-ascent','ramp',6,[p(240,-55),p(190,-80),p(145,-105,8),p(110,-110,8)]);
  link('south-gate','lower-canal','lower-gate-bridge','bridge',6,[p(240,-55),p(260,-65),p(315,-65),p(310,-165)]);
  link('garden-terrace','central-market','exchange-ascent','ramp',6.5,[p(110,-110,8),p(118,-160,8),p(115,-200,12),p(110,-235,12)]);
  link('garden-terrace','west-bank','western-garden-road','secondary',4,[p(110,-110,8),p(-55,-130,8),p(-75,-225,12),p(-75,-275,12)]);
  link('central-market','west-bank','market-west-road','primary',6,[p(110,-235,12),p(25,-245,12),p(-75,-275,12)]);
  link('central-market','lower-canal','exchange-river-bridge','bridge',6,[p(110,-235,12),p(175,-235,12),p(215,-225,12),p(260,-225,12),p(315,-215),p(310,-165)]);
  link('central-market','civic-terrace','civic-ascent','ramp',6.5,[p(110,-235,12),p(110,-275,12),p(125,-345,22),p(110,-365,22)]);
  link('west-bank','orchard-edge','orchard-road','secondary',4,[p(-75,-275,12),p(-115,-410,18),p(-115,-525,18)]);
  link('orchard-edge','noble-quarter','orchard-court-ascent','ramp',4,[p(-115,-525,18),p(-115,-600,18),p(-30,-545,32),p(10,-465,32)]);
  link('civic-terrace','noble-quarter','court-ascent','ramp',5.5,[p(110,-365,22),p(55,-400,22),p(10,-465,32)]);
  link('civic-terrace','temple-quarter','civic-high-bridge','bridge',6.5,[p(110,-365,22),p(160,-365,22),p(180,-385,22),p(220,-385,22),p(275,-385,30),p(280,-405,30)]);
  link('noble-quarter','upper-city','upper-court-road','ramp',5.5,[p(10,-465,32),p(85,-495,32),p(145,-515,40),p(185,-505,40)]);
  link('temple-quarter','upper-city','northern-high-bridge','bridge',6,[p(280,-405,30),p(300,-455,30),p(275,-480,30),p(230,-480,30),p(220,-535,38),p(185,-550,40),p(185,-505,40)]);
  link('upper-city','citadel','citadel-ascent','stairs',9,[p(185,-505,40),p(185,-550,40),p(150,-605,50)]);
  // Street loops are authored to return to the primary route and leave plazas open.
  road('exchange-courtyard','secondary',4,[p(110,-235,12),p(75,-215,12),p(55,-205,12),p(160,-205,12),p(175,-235,12)],['central-market']);
  road('west-bank-lane','secondary',3.5,[p(-75,-275,12),p(-115,-260,12),p(-125,-315,12),p(-80,-335,12),p(-75,-275,12)],['west-bank']);
  road('civic-square','secondary',4,[p(110,-365,22),p(85,-345,22),p(50,-355,22),p(50,-395,22),p(110,-365,22)],['civic-terrace']);
  road('temple-court','secondary',4,[p(280,-405,30),p(255,-425,30),p(265,-460,30),p(300,-455,30)],['temple-quarter']);
  road('upper-lane','secondary',4,[p(185,-505,40),p(160,-475,40),p(130,-465,40),p(145,-515,40)],['upper-city']);
  road('market-alley','alley',2.8,[p(75,-215,12),p(75,-265,12),p(110,-275,12)],['central-market']);
  road('court-passage','alley',2.6,[p(10,-465,32),p(-10,-490,32),p(35,-515,32),p(85,-495,32)],['noble-quarter']);
  road('citadel-forecourt','secondary',5,[p(150,-605,50),p(95,-605,50),p(95,-585,50),p(175,-585,50),p(150,-605,50)],['citadel']);
  road('garden-stair-route','stairs',3.6,[p(110,-110,8),p(110,-125,8),p(70,-148,4)],['garden-terrace']);
  road('quay-stair-quarter','stairs',3.8,[p(310,-165),p(275,-165,8),p(280,-190,8),p(260,-225,12)],['lower-canal','central-market']);
  road('east-bank-retaining-street','secondary',4,[p(220,-385,22),p(235,-350,22),p(245,-325,22)],['temple-quarter']);
  road('bank-garden-stairs','stairs',3.8,[p(245,-325,22),p(270,-300,18),p(295,-320,18),p(315,-360,24),p(335,-400,30),p(280,-405,30)],['temple-quarter']);
  road('noble-stair-cut','stairs',3.8,[p(85,-495,32),p(100,-465,36),p(130,-465,40)],['noble-quarter','upper-city']);
  road('market-south-lane','secondary',3.6,[p(55,-205,12),p(40,-210,12),p(40,-195,12),p(105,-195,12),p(115,-200,12)],['central-market']);
  road('market-quay-lane','bridge',4.2,[p(175,-235,12),p(173,-245,12),p(215,-260,12),p(215,-280,12),p(145,-292,12),p(110,-275,12)],['central-market']);
  road('civic-retaining-lane','secondary',3.8,[p(50,-355,22),p(35,-320,22),p(85,-320,22),p(85,-345,22)],['civic-terrace']);
  road('upper-gate-plaza','secondary',4,[p(185,-505,40),p(205,-495,40),p(240,-505,40),p(240,-545,40),p(220,-555,40),p(185,-550,40)],['upper-city']);
  road('west-court-stairs','stairs',3.8,[p(50,-395,22),p(15,-415,22),p(-20,-470,32),p(10,-465,32)],['civic-terrace','noble-quarter']);
  road('market-civic-stair-quarter','stairs',3.8,[p(145,-292,12),p(160,-320,18),p(165,-340,22),p(165,-350,22),p(160,-365,22)],['central-market','civic-terrace']);
  road('western-retaining-quarter','stairs',3.8,[p(50,-395,22),p(-25,-395,20),p(-45,-395,20),p(-40,-375,20)],['civic-terrace']);
  // Parallel circulation uses the same district adjacencies with its own supported portal.
  for(const id of ['quay-stair-quarter','noble-stair-cut','west-court-stairs','market-civic-stair-quarter']){
    const secondary=roads.find(item=>item.id===id)!,[from,to]=secondary.districts as [CityDistrictId,CityDistrictId];
    const connection={id:`connection.secondary.${id}`,from,to,road:id,points:secondary.points,width:secondary.width};
    connections.push(connection);byId.get(from)!.entrances.push(connection.id);byId.get(to)!.entrances.push(connection.id);
  }
  const terraces: CityTerrace[] = [
    {id:'western-retaining-quarter',district:'civic-terrace',elevation:20,footprint:ccw(polygon(-70,-365,-10,-365,-10,-425,-70,-425)),color:0x9d9d7a,access:'western-retaining-quarter'},
    {id:'civic-stair-quarter',district:'civic-terrace',elevation:18,footprint:ccw(polygon(145,-305,185,-305,185,-330,145,-330)),color:0xb1a389,access:'market-civic-stair-quarter'},
    {id:'inhabited-quay',district:'lower-canal',elevation:8,footprint:ccw(polygon(265,-135,295,-135,295,-210,270,-225,250,-205)),color:0xb0a38a,access:'quay-stair-quarter'},
    {id:'east-bank-street',district:'temple-quarter',elevation:22,footprint:ccw(polygon(210,-315,260,-315,260,-365,245,-410,210,-410)),color:0xb1a389,access:'east-bank-retaining-street'},
    {id:'bank-garden',district:'temple-quarter',elevation:18,footprint:ccw(polygon(245,-270,320,-270,320,-325,260,-345,230,-315)),color:0x7b8953,access:'bank-garden-stairs'},
    {id:'noble-stair-quarter',district:'noble-quarter',elevation:36,footprint:ccw(polygon(85,-445,110,-445,110,-505,85,-505)),color:0xb0a58c,access:'noble-stair-cut'},
    {id:'citadel-gate-terrace',district:'citadel',elevation:44,footprint:ccw(polygon(140,-570,210,-570,210,-588,140,-588)),color:0xb8ac91,access:'citadel-ascent'},
  ];
  const waterways: CityWaterway[] = [
    { id:'accepted-river',from:'rural-west',to:'market-east',width:14,evidence:'visible',points:[p(-48,19,-1.16),p(146,19,-1.16)] },
    { id:'southern-reach',from:'market-east',to:'lower-bend',width:14,evidence:'assumed-connection',points:[p(146,19,-1.16),p(225,19,-1.16),p(270,-20,-1.16),p(285,-95,-1.16),p(260,-175,-1.16)] },
    { id:'middle-reach',from:'lower-bend',to:'civic-bend',width:12,evidence:'visible',points:[p(260,-175,-1.16),p(205,-225,-1.16),p(165,-280,-1.16),p(210,-340,-1.16)] },
    { id:'upper-reach',from:'civic-bend',to:'temple-bend',width:12,evidence:'visible',points:[p(210,-340,-1.16),p(220,-425,-1.16),p(245,-475,-1.16)] },
    { id:'headwater-reach',from:'temple-bend',to:'north-inlet',width:12,evidence:'assumed-connection',points:[p(245,-475,-1.16),p(285,-530,-1.16),p(285,-630,-1.16)] },
  ];
  const cutters: Point[][] = [];
  for (const feature of [...roads.filter(item => !item.id.startsWith('accepted.')), ...waterways]) {
    const width = feature.width + ('kind' in feature ? 0.4 : 2.2);
    for (let i = 1; i < feature.points.length; i++) cutters.push(strip(feature.points[i-1]!,feature.points[i]!,width));
    for (const point of feature.points) cutters.push(square(point,width/2));
  }
  const terrain: Surface[] = [];
  for (const district of districts.filter(item => !item.acceptedArea)) {
    let fragments = [district.footprint];
    const levels=terraces.filter(terrace=>terrace.district===district.id);
    for(const level of levels) fragments=fragments.flatMap(fragment=>subtract(fragment,level.footprint));
    for (const cutter of cutters) fragments = fragments.flatMap(fragment => subtract(fragment,cutter));
    // One static trimesh per district, retaining the exact clipped triangles.
    // Authoring fragments are not streaming/collider objects of their own.
    const grouped:Surface={id:`city.terrain.${district.id}`,vertices:[],indices:[],
      color:district.density === 'rural' || district.id === 'garden-terrace' ? 0x7b8953 : 0xaaa38d};
    const appendLevel=(pieces:Point[][],height:number,target=grouped)=>{
      for(const fragment of pieces){
        const part=surface(target.id,fragment.map(point=>({...point,y:height})),target.color);
        const offset=target.vertices.length/3;
        target.vertices.push(...part.vertices);target.indices.push(...part.indices.map(index=>index+offset));
      }
    };
    appendLevel(fragments,district.center.y);
    for(const level of levels){
      let pieces=[level.footprint];
      // Clip to the owner's convex footprint, so a level cannot silently overlap a neighbor.
      for(let i=0;i<district.footprint.length;i++)pieces=pieces.map(piece=>halfPlane(piece,district.footprint[i]!,district.footprint[(i+1)%district.footprint.length]!,true)).filter(piece=>piece.length>=3);
      for(const cutter of cutters)pieces=pieces.flatMap(piece=>subtract(piece,cutter));
      const tier:Surface={id:`city.terrain.${district.id}.${level.id}`,vertices:[],indices:[],color:level.color};
      appendLevel(pieces,level.elevation,tier);terrain.push(tier);
    }
    terrain.push(grouped);
  }
  const box = (id:string,x:number,z:number,y:number,width:number,depth:number,height:number,color:number,collides=true):BoxSpec => ({
    id:`city.landmark.${id}`,position:{x,y:y+height/2,z},size:{x:width,y:height,z:depth},color,collides,
  });
  const landmarks:BoxSpec[] = [box('citadel-keep',185,-638,50,50,34,34,0xd1c5a4),box('citadel-tower',132,-638,50,18,18,42,0xb9b99f),
    box('citadel-wing',235,-628,50,30,36,23,0xc4b995),box('civic-hall',145,-397,22,30,20,16,0xd8ceb2),
    box('temple-tower',340,-420,30,16,16,28,0xb8c4ae),box('market-belfry',158,-260,12,10,10,21,0xd8c4a0),
    box('south-gate-tower',252,-34,4,12,10,14,0xbfb7a0),box('west-bank-tower',-108,-305,12,12,12,18,0xc7c0a3),
    box('citadel-west-tower',80,-644,50,14,14,32,0xc9bea0),box('citadel-east-tower',245,-648,50,12,12,34,0xc7b99d),
    box('citadel-court-tower',207,-610,50,12,12,27,0xcfc4a8),box('citadel-court-west',105,-620,50,30,20,20,0xd0c4a5),
    box('citadel-court-east',225,-598,50,30,18,16,0xc8bb9b),box('citadel-front-west-tower',70,-585,50,12,12,21,0xc6bba0),
    box('citadel-front-east-tower',250,-585,50,12,12,18,0xcbbda0),
    box('citadel-west-wall',60,-608,50,6,45,8,0xa69c83),box('citadel-east-wall',260,-610,50,6,42,8,0xa69c83),
    box('citadel-rear-wall',165,-657,50,160,4,8,0xa69c83),box('citadel-front-west-wall',107,-577,50,60,5,6,0xa69c83),
    box('citadel-front-east-wall',231,-577,50,25,5,6,0xa69c83),
    box('upper-gate-west-pier',148,-576,44,6,4,12,0xb7ab8e),box('upper-gate-east-pier',194,-576,44,7,4,10,0xb7ab8e),
    box('upper-support-west',132,-548,40,24,22,17,0xccbfa0),
    box('upper-support-court',210,-460,40,24,22,19,0xd1c3a4),box('upper-support-east',238,-562,40,12,12,16,0xc6b799),
    box('civic-wall-buttress',85,-418,12,8,10,10,0xa69a80),box('civic-wall-east-buttress',165,-418,12,8,10,10,0xa69a80),
    box('civic-front-west-buttress',40,-304,12,8,10,10,0xa69a80),box('civic-front-east-buttress',195,-304,12,8,10,10,0xa69a80),
    box('civic-embedded-gate',85,-306,12,17,13,12,0xbeb293)];
  // District ownership includes structural masses as well as skyline landmarks.
  for (const district of districts) {
    const prefix = district.id === 'civic-terrace' ? 'civic-' : district.id === 'upper-city' ? 'upper-support-' : district.id === 'citadel' ? 'citadel-' : undefined;
    if (prefix) district.landmarks = landmarks.map(item => item.id.replace('city.landmark.', ''))
      .filter(id => id.startsWith(prefix) || district.id === 'citadel' && id.startsWith('upper-gate-'));
  }
  const massing = {} as Record<CityDistrictId,BoxSpec[]>;
  for (const district of districts) massing[district.id] = [];
  const lots:Partial<Record<CityDistrictId,number[][]>> = {
    'south-gate':[[235,15,16,19,7],[342,-20,19,17,8],[344,20,17,21,9],[312,30,16,15,6],[359,-55,16,14,8]],
    'lower-canal':[[320,-150,19,20,9],[400,-155,22,25,10],[402,-210,23,24,11],[328,-235,18,19,8],
      [418,-110,24,19,9],[386,-105,20,22,8],[435,-180,21,23,10],[350,-110,18,19,8],[385,-240,22,17,9],[320,-190,17,20,8]],
    'garden-terrace':[[20,-80,15,17,6],[168,-130,18,17,7],[-35,-145,13,15,5],[-48,-80,16,17,6],[58,-83,17,18,7],[205,-120,15,17,6]],
    'central-market':[[22,-179,20,22,14],[58,-178,22,24,15],[90,-180,19,22,16],[155,-178,23,22,17],[193,-184,24,25,16],
      [24,-217,21,22,15],[23,-279,22,25,14],[48,-278,18,21,16],[143,-292,18,18,17],[191,-278,20,21,15],[42,-247,18,18,15]],
    'west-bank':[[-28,-190,23,22,12],[-70,-187,24,22,11],[-121,-185,23,21,10],[-137,-225,18,23,11],[-28,-223,23,22,13],
      [-26,-310,24,23,12],[-40,-350,23,21,12],[-92,-353,20,16,10],[-102,-291,16,15,11],[-148,-290,15,20,9],[-53,-334,15,18,12]],
    'civic-terrace':[[25,-325,24,23,16],[65,-325,24,22,15],[167,-327,24,23,18],[193,-395,19,23,15],
      [23,-395,21,23,14],[78,-410,20,18,16],[155,-365,23,20,18],[183,-418,23,12,15]],
    'noble-quarter':[[-45,-446,24,23,14],[57,-445,25,22,15],[85,-452,20,24,14],[-48,-488,23,24,16],
      [51,-483,22,20,16],[-45,-517,20,12,15],[72,-517,23,13,17],[20,-438,18,14,14]],
    'temple-quarter':[[402,-330,25,24,16],[402,-465,26,24,14],[290,-345,20,22,12],[340,-325,25,24,17],
      [375,-365,23,24,16],[410,-395,20,24,15],[356,-474,22,20,14],[294,-295,20,16,12]],
    'upper-city':[[235,-445,23,24,18],[245,-535,24,23,17],[126,-548,20,22,16],[194,-472,24,22,19],
      [240,-555,22,17,18],[142,-440,23,18,16],[203,-535,18,22,18],[158,-553,21,18,17],[230,-485,18,19,19]],
    'orchard-edge':[[-144,-460,16,17,6],[-144,-595,17,19,7],[-90,-405,16,17,6],[-90,-465,16,17,6],[-89,-590,16,17,7]],
  };
  for(const lot of lots['lower-canal']!)lot[0]!-=55;
  for(const lot of lots['temple-quarter']!)lot[0]!-=65;
  const infill:Partial<Record<CityDistrictId,number[][]>>={
    'central-market':[[12,-260,19,26,13],[72,-294,27,17,17],[83,-243,25,29,16],[139,-245,28,30,18],[212,-180,28,26,14],[210,-205,24,18,15],[225,-257,27,25,16],[219,-289,27,23,15]],
    'civic-terrace':[[15,-349,23,23,14],[75,-377,28,23,17],[100,-402,24,22,19],[178,-393,25,28,18],[177,-313,26,16,16],[23,-374,23,25,15],[77,-310,27,12,16],[35,-408,22,21,14]],
    'noble-quarter':[[-40,-540,35,29,13],[13,-546,39,28,16],[-40,-510,32,23,15],[60,-542,27,30,17],[55,-475,32,28,16],[27,-442,23,19,14],[-41,-427,35,13,15]],
    'upper-city':[[155,-535,33,22,20],[126,-560,24,15,17],[232,-566,31,11,16],[256,-507,22,25,18],[211,-453,30,27,19],[135,-494,24,25,16],[201,-576,25,14,18]],
    'temple-quarter':[[350,-289,27,28,14],[345,-340,30,26,17],[318,-387,27,25,16],[355,-462,26,30,15],[235,-446,25,27,16],[238,-478,22,20,17],[313,-480,22,18,15],[288,-354,27,28,15]],
    'lower-canal':[[345,-129,30,28,10],[358,-174,29,28,11],[342,-220,31,25,12],[294,-241,27,24,11],[258,-251,22,15,12],[330,-92,27,17,10],[308,-132,23,23,9],[318,-191,23,27,11]],
    'west-bank':[[-132,-337,25,25,11],[-45,-295,27,24,12],[-105,-215,25,23,13],[-135,-253,22,20,11],[-38,-251,20,21,14]],
  };
  for(const district of districts)(lots[district.id]??=[]).push(...(infill[district.id]??[]));
  // Individually authored connector blocks and street-wall groups, not production buildings.
  const streetWalls:Partial<Record<CityDistrictId,number[][]>>={
    'central-market':[[93,-258,14,18,17],[130,-219,14,14,18],[148,-219,16,14,16],[188,-213,12,14,16],
      [136,-265,20,32,18],[11,-300,15,8,13],[99,-294,17,16,16],[14,-163,18,5,8]],
    'civic-terrace':[[-55,-411,20,12,12],[-55,-380,22,15,10],[-20,-415,15,12,13],
      [20,-310,27,8,14],[140,-312,25,9,17],[145,-350,24,16,18],[85,-359,24,11,17],
      [65,-367,18,13,16],[60,-411,18,18,16],[133,-418,28,10,19],[195,-360,16,20,17],[198,-399,16,18,16]],
    'noble-quarter':[[-58,-540,12,18,14],[-45,-466,24,13,15],[-13,-432,12,13,16],[85,-431,22,7,16],
      [52,-465,25,9,16],[72,-474,19,14,17],[29,-490,17,17,17],[5,-513,16,12,15],[48,-521,21,10,17]],
    'upper-city':[[126,-531,14,10,18],[120,-476,10,11,17],[157,-491,15,14,20],[175,-444,22,22,20],
      [160,-461,17,8,18],[194,-482,18,18,20],[205,-529,17,16,18],[217,-565,16,6,17]],
    'temple-quarter':[[276,-439,17,19,18],[312,-440,17,24,17],[313,-419,18,12,17],[354,-390,25,24,17],
      [361,-437,18,20,16],[355,-363,24,17,16],[309,-287,16,14,9],[283,-277,24,10,9],[260,-288,16,14,10],[243,-371,16,12,10]],
    'lower-canal':[[360,-243,22,17,12],[370,-184,15,15,11],[370,-142,12,20,10],[298,-106,14,20,10],
      [337,-180,22,15,12],[234,-244,13,16,10],[260,-116,15,17,9]],
  };
  for(const district of districts)(lots[district.id]??=[]).push(...(streetWalls[district.id]??[]));

  const pointInside = (point:Point, footprint:Point[]) => footprint.every((a,i) => {
    const b=footprint[(i+1)%footprint.length]!;
    return (b.x-a.x)*(point.z-a.z)-(b.z-a.z)*(point.x-a.x)>=-1e-6;
  });
  const segmentHits = (a:Vec3,b:Vec3,x:number,z:number,width:number,depth:number,buffer:number) => {
    let lo=0,hi=1;
    for(const [origin,delta,minimum,maximum] of [[a.x,b.x-a.x,x-width/2-buffer,x+width/2+buffer],[a.z,b.z-a.z,z-depth/2-buffer,z+depth/2+buffer]]){
      if(Math.abs(delta!)<1e-9){if(origin!<minimum!||origin!>maximum!)return false;}
      else{const t1=(minimum!-origin!)/delta!,t2=(maximum!-origin!)/delta!;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}
    }
    return true;
  };
  for (const district of districts) for (const [index,lot] of (lots[district.id] ?? []).entries()) {
    const [x,z,width,depth,height] = lot as [number,number,number,number,number];
    const corners=polygon(x-width/2-0.5,z-depth/2-0.5,x+width/2+0.5,z-depth/2-0.5,
      x+width/2+0.5,z+depth/2+0.5,x-width/2-0.5,z+depth/2+0.5);
    if(!corners.every(corner=>pointInside(corner,district.footprint)))continue;
    const level=terraces.find(item=>item.district===district.id && pointInside({x,z},item.footprint));
    if(terraces.filter(item=>item.district===district.id).some(item=>corners.some(corner=>pointInside(corner,item.footprint)) && !corners.every(corner=>pointInside(corner,item.footprint))))continue;
    const floor=level?.elevation??district.center.y;
    if(cutters.some(cutter=>{
      let overlap=corners;
      for(let i=0;i<cutter.length&&overlap.length>=3;i++)overlap=halfPlane(overlap,cutter[i]!,cutter[(i+1)%cutter.length]!,true);
      return overlap.length>=3&&Math.abs(area(overlap))>.001;
    }))continue;
    if([...roads,...waterways].some(feature=>feature.points.slice(1).some((b,i)=>segmentHits(feature.points[i]!,b,x,z,width,depth,feature.width/2+1))))continue;
    if(landmarks.some(item=>Math.abs(item.position.x-x)<(item.size.x+width)/2+1&&Math.abs(item.position.z-z)<(item.size.z+depth)/2+1))continue;
    if(massing[district.id].some(item=>item.collides&&Math.abs(item.position.x-x)<(item.size.x+width)/2+1&&Math.abs(item.position.z-z)<(item.size.z+depth)/2+1))continue;
    massing[district.id].push({id:`city.massing.${district.id}.${index}.body`,position:{x,y:floor+height/2,z},size:{x:width,y:height,z:depth},
      color:[0xd1c4a4,0xcab998,0xd9ceb1][index%3]!,collides:true});
    massing[district.id].push({id:`city.massing.${district.id}.${index}.roof`,position:{x,y:floor+height+1,z},size:{x:width+0.7,y:2,z:depth+0.7},
      color:[0xa45b39,0x925035,0xb36b40,0x447a75][index%4]!,collides:false});
  }
  const route = [...accepted.route.slice(0,10).map(point => ({...point,y:4})),
    ...roads.find(item=>item.id==='gate-approach')!.points.slice(1),
    ...roads.find(item=>item.id==='garden-ascent')!.points.slice(1),
    ...roads.find(item=>item.id==='exchange-ascent')!.points.slice(1),
    ...roads.find(item=>item.id==='civic-ascent')!.points.slice(1),
    ...roads.find(item=>item.id==='civic-high-bridge')!.points.slice(1),
    ...roads.find(item=>item.id==='northern-high-bridge')!.points.slice(1),
    ...roads.find(item=>item.id==='citadel-ascent')!.points.slice(1)];
  return {id:'m6-city-blueprint',seed:104729,districts,terraces,terrain,roads,waterways,connections,landmarks,massing,route,
    cameras:[{id:'master-eagle',position:p(-250,900,950),target:p(120,-300,18),fov:50},
      {id:'district-map',position:p(120,-300,880),target:p(120,-300,0),fov:46},
      {id:'castle-lower-city',position:p(90,-140,60),target:p(170,-620,71),fov:53},
      {id:'water-network',position:p(620,300,420),target:p(235,-300,0),fov:44},
      {id:'exchange-debug',position:p(20,-135,115),target:p(110,-235,12),fov:50},
      {id:'civic-debug',position:p(5,-255,145),target:p(170,-385,24),fov:50},
      {id:'temple-debug',position:p(450,-310,155),target:p(330,-425,30),fov:50},
      {id:'citadel-debug',position:p(-10,-495,175),target:p(170,-610,50),fov:50}],
    assumptions:['The 545×708 m macro footprint is a meter-authored design, not a measurement from pixels.',
      'The north river inlet and eastward continuation of the accepted straight canal are unseen connection assumptions.',
      'The source-derived mean -1.16 m water datum continues accepted rural and market water in a deeply incised valley.',
      'Terrace heights 4, 8, 12, 18, 20, 22, 30, 32, 36, 40, 44 and 50 m and navigable ramps are human-scale design decisions.',
      'Simple boxes establish density and skyline only; roof shape, facades, doors, bank detail and gardens await later production.',
      'Stair-class road uses a smooth collision slope beneath visible stone treads; inclined road joins have short level landings.',
      'The approved rural/market/shell origin, rotations, source images, NPC IDs and authored courses remain unchanged.']};
}
