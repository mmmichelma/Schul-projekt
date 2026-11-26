import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { saveGame, loadGame, deleteGame } from '../src/storage/idb';
import { Sim } from '../src/sim/sim';
import { TOTAL } from '../src/sim/defs';

it('Spielstand landet in IndexedDB und kommt identisch zurück', async () => {
  const sim = Sim.newGame();
  sim.manualTake(-1);
  sim.manualPeel(0);
  for (let i = 0; i < 50; i++) sim.step();
  await saveGame(sim.serialize());
  const data = await loadGame();
  const copy = Sim.deserialize(data!);
  expect(copy.audit()).toEqual(sim.audit());
  expect(copy.audit().total).toBe(TOTAL);
  await deleteGame();
  expect(await loadGame()).toBeNull();
});
