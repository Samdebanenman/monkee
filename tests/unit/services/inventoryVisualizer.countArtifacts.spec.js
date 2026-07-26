import { describe, expect, it } from 'vitest';
import {
  countArtifactsByRarity,
  listArtifactFamilies,
  resolveArtifactFamily,
} from '../../../services/inventoryVisualizer/index.js';

describe('services/inventoryVisualizer/countArtifacts', () => {
  it('lists and resolves artifact families by id, full name, and unique alias', () => {
    const deflector = listArtifactFamilies().find(family => family.family === 'Tachyon deflector');

    expect(deflector).toBeDefined();
    expect(resolveArtifactFamily(deflector.id)).toBe(deflector);
    expect(resolveArtifactFamily('Tachyon deflector')).toBe(deflector);
    expect(resolveArtifactFamily('deflector')).toBe(deflector);
  });

  it('sums split grid entries for the requested tier and rarity', () => {
    const result = countArtifactsByRarity([
      { family: 'Tachyon deflector', tier: 4, rarity: 0, count: 12 },
      { family: 'Tachyon deflector', tier: 4, rarity: 1, count: 1 },
      { family: 'Tachyon deflector', tier: 4, rarity: 3, count: 1 },
      { family: 'Tachyon deflector', tier: 3, rarity: 3, count: 99 },
      { family: 'The chalice', tier: 4, rarity: 3, count: 99 },
    ], { family: 'deflector', tier: 4 });

    expect(result).toMatchObject({
      tier: 4,
      total: 14,
      countsByRarity: {
        common: 12,
        rare: 1,
        epic: 0,
        legendary: 1,
      },
    });
  });

  it('returns null for a tier the selected family does not have', () => {
    expect(countArtifactsByRarity([], { family: 'gold meteorite', tier: 4 })).toBeNull();
  });
});
