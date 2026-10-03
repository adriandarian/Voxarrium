import type { UrbanBuilding, UrbanDistrict } from '../simulation/urban-contracts';

export interface RepetitionFinding {
  kind:'facade-sequence'|'neighbor-roofs'|'silhouette'|'shopfront';
  signature:string; buildingIds:string[]; explanation:string;
}
const q=(value:number)=>Math.round(value*10)/10;
export function urbanSignatures(b:UrbanBuilding){
  return {
    facade:[b.facade,b.floors,q(b.floorHeight),b.bays,b.shutterOffset,b.balcony,b.shopfront].join('|'),
    roof:[b.roof,b.roofDirection,q(b.roofHeight),b.roofColor.toString(16)].join('|'),
    silhouette:[q(b.width),q(b.depth),b.floors,q(b.floorHeight),b.roof,b.roofDirection,q(b.roofHeight),b.balcony,b.corner].join('|'),
    shopfront:[b.shopfront,b.awning,b.bays,b.cloth.toString(16)].join('|'),
  };
}
/** Actionable identities/signatures for human review; no aggregated variety number. */
export function diagnoseUrbanRepetition(district:UrbanDistrict){
  const signatures=Object.fromEntries(district.buildings.map(b=>[b.id,urbanSignatures(b)]));
  const findings:RepetitionFinding[]=[];
  for(const [key,kind] of [['facade','facade-sequence'],['silhouette','silhouette'],['shopfront','shopfront']] as const){
    const groups=new Map<string,string[]>();
    for(const b of district.buildings){const signature=signatures[b.id]![key],ids=groups.get(signature)??[];ids.push(b.id);groups.set(signature,ids);}
    for(const [signature,ids] of groups)if(ids.length>1)findings.push({kind,signature,buildingIds:ids,
      explanation:key==='silhouette'?'Matching footprint, story/roof envelope and corner treatment.':key==='facade'?'Matching story, bay, window-group, shutter and balcony sequence.':'Matching counter/awning, bay and cloth treatment; inspect adjoining frontage.'});
  }
  const pairs=new Set<string>();
  for(const b of district.buildings){
    const nearest=district.buildings.filter(c=>c.id!==b.id).sort((a,c)=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)-Math.hypot(c.position.x-b.position.x,c.position.z-b.position.z)).slice(0,3);
    for(const c of nearest){if(Math.hypot(c.position.x-b.position.x,c.position.z-b.position.z)>24 || signatures[b.id]!.roof!==signatures[c.id]!.roof)continue;
      const ids=[b.id,c.id].sort(),key=ids.join('|');if(pairs.has(key))continue;pairs.add(key);
      findings.push({kind:'neighbor-roofs',signature:signatures[b.id]!.roof,buildingIds:ids,explanation:'Nearby roofs share family, ridge direction, height and palette; inspect their combined street silhouette.'});
    }
  }
  return {districtId:district.id,buildings:district.buildings.length,signatures,findings,
    limits:'Development review hints from controlled grammar parameters. Human camera review determines which repetition is conspicuous; no fidelity or global variety score.'};
}
