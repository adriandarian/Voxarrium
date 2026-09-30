import { test, expect } from '@playwright/test';
import { createPopulation } from '../src/simulation/npcs';
import { createNpcResidency, stepResidentPopulation, npcTierCounts } from '../src/simulation/npc-residency';

test('unloaded NPCs retain stable IDs and in-progress state through JSON continuation', () => {
  const population = createPopulation(true), residency = createNpcResidency();
  const environment = { weather: 'clear', timeOfDay: 'day' } as const;
  const player = { x: 89, y: 4, z: -12 };
  for (let i = 0; i < 600; i++) stepResidentPopulation(population, residency, 1/60, environment, player, ['river-market'], ['river-market'], null);
  const ruralBefore = structuredClone(population.slice(0, 6));
  const marketBefore = structuredClone(population.slice(6));
  for (let i = 0; i < 600; i++) stepResidentPopulation(population, residency, 1/60, environment, {x:206,y:4,z:-10}, ['neighbor-shell'], ['neighbor-shell'], null);
  expect(population.slice(0,6)).toEqual(ruralBefore);
  expect(population.slice(6).map(n => ({...n,speed:0}))).toEqual(marketBefore.map(n => ({...n,speed:0})));
  const copy = JSON.parse(JSON.stringify({population,residency}));
  for (let i=0;i<120;i++) {
    stepResidentPopulation(population,residency,1/60,environment,player,['river-market'],['river-market'],null);
    stepResidentPopulation(copy.population,copy.residency,1/60,environment,player,['river-market'],['river-market'],null);
  }
  expect(copy).toEqual({population,residency});
  expect(npcTierCounts(population,residency).uniqueIds).toBe(42);
  expect(population[6]!.distanceTravelled).toBeGreaterThanOrEqual(marketBefore[0]!.distanceTravelled);
});

test('tiers bound navigation work and intentional schedule changes remain authored on return', () => {
  const population = createPopulation(true), residency = createNpcResidency();
  const player = population[6]!.position;
  stepResidentPopulation(population,residency,1/60,{weather:'clear',timeOfDay:'day'},player,['river-market'],['river-market'],null);
  const counts = npcTierCounts(population,residency).counts;
  expect(counts['nearby-full']).toBeGreaterThan(0);
  expect(counts['loaded-reduced']).toBeGreaterThan(0);
  expect(counts['unloaded-data']).toBe(6);
  const before = structuredClone(population);
  stepResidentPopulation(population,residency,1/60,{weather:'rain',timeOfDay:'night'},player,[],[],null);
  expect(population.map(n=>({...n,speed:0}))).toEqual(before.map(n=>({...n,speed:0})));
  expect(residency.entries[population[6]!.id]!.observedSchedule).toBe('night');
  for(let i=0;i<6;i++) stepResidentPopulation(population,residency,1/60,{weather:'rain',timeOfDay:'night'},player,['river-market'],['river-market'],null);
  expect(population[6]!.schedule).toBe('night');
  expect(population.slice(0,6).every(n=>n.schedule==='day')).toBe(true);
  expect(new Set(population.map(n=>n.id)).size).toBe(42);
});
