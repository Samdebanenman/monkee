import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/predictmaxcs/constants.js', () => ({
  DEFLECTOR_TIERS: [
    { label: 'quant-scrub', percent: 0 },
    { label: 'epic+', percent: 19 },
    { label: 'legendary', percent: 20 },
  ],
}));

import {
  getRequiredOtherDeflector,
  buildDeflectorPlan,
  getEligibleDeflectorTiers,
  canUseAllTier,
  canUseSwapMix,
  getMaxQuantScrubs,
  getUnusedDeflectorPercent,
  buildDeflectorDisplay,
  formatDeflectorDisplay,
} from '../../../../utils/predictmaxcs/deflector.js';

const TIERS = [
  { label: 'quant-scrub', percent: 0 },
  { label: 'epic+', percent: 19 },
  { label: 'legendary', percent: 20 },
];

describe('utils/predictmaxcs/deflector', () => {
  it('computes required other deflector percent', () => {
    const required = getRequiredOtherDeflector([
      { maxChickens: 100, elrPerChickenWithStones: 2, srWithStones: 300 },
      { maxChickens: 50, elrPerChickenWithStones: 1, srWithStones: 80 },
    ]);

    expect(required).toBeCloseTo(60, 6);
  });

  it('builds deflector plan summary', () => {
    const plan = buildDeflectorPlan([20, 20, 0, 19], TIERS);

    expect(plan.totalDeflector).toBe(59);
    expect(plan.minTier.label).toBe('quant-scrub');
    expect(plan.tiers[0].tier.label).toBe('legendary');
    expect(plan.tiers[0].count).toBe(2);
  });

  it('filters eligible tiers', () => {
    const eligible = getEligibleDeflectorTiers(4, TIERS, 40);
    expect(eligible.map(t => t.label)).toEqual(['epic+', 'legendary']);

    const all = getEligibleDeflectorTiers(1, TIERS, 999);
    expect(all.length).toBe(3);
  });

  it('checks tier compatibility helpers', () => {
    expect(canUseAllTier(4, TIERS[2], 50)).toBe(true);
    expect(canUseAllTier(4, TIERS[0], 1)).toBe(false);
    expect(canUseAllTier(1, TIERS[0], 999)).toBe(true);

    expect(canUseSwapMix(4, TIERS[2], TIERS[1], 50)).toBe(true);
    expect(canUseSwapMix(4, TIERS[2], TIERS[1], 70)).toBe(false);
  });

  it('calculates max quant scrubs', () => {
    expect(getMaxQuantScrubs(4, 20, 40)).toBe(1);
    expect(getMaxQuantScrubs(1, 20, 40)).toBe(0);
    expect(getMaxQuantScrubs(4, 0, 40)).toBe(0);
  });

  it('computes unused deflector percent', () => {
    const configs = [
      { maxChickens: 100, elrPerChickenWithStones: 1, srWithStones: 100 },
      { maxChickens: 100, elrPerChickenWithStones: 1, srWithStones: 100 },
    ];

    const unused = getUnusedDeflectorPercent(2, [20, 20], configs);
    expect(unused).toBe(19);

    const none = getUnusedDeflectorPercent(2, [20, 20], [
      { maxChickens: 100, elrPerChickenWithStones: 1, srWithStones: 200 },
      { maxChickens: 100, elrPerChickenWithStones: 1, srWithStones: 200 },
    ]);
    expect(none).toBe(0);
  });

  it('builds deflector display plan', () => {
    const playerConfigs = Array.from({ length: 4 }, () => ({
      maxChickens: 100,
      elrPerChickenWithStones: 1,
      srWithStones: 100,
    }));

    const display = buildDeflectorDisplay({
      players: 4,
      baselineDeflectors: [20, 20, 20, 20],
      playerConfigs,
    });

    expect(display.canQuantScrub).toBe(true);
    expect(display.recommendedPlan).toContain('legendary');
    expect(display.recommendedPlan).toContain('quant-scrub');
  });

  it('formats deflector display labels', () => {
    expect(formatDeflectorDisplay(0)).toContain('QS');
    expect(formatDeflectorDisplay(20)).toContain('L');
    expect(formatDeflectorDisplay(19)).toContain('E+');
    expect(formatDeflectorDisplay(10)).toContain('10%');
  });
});
