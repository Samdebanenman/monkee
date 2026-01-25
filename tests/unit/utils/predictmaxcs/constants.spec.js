import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDimension } from '../../../../Enums.js';

vi.mock('../../../../utils/database/index.js', () => ({
  getStoredColeggtibles: vi.fn(),
}));

import { getDynamicColeggtibles } from '../../../../utils/predictmaxcs/constants.js';
import { getStoredColeggtibles } from '../../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('utils/predictmaxcs/constants', () => {
  it('returns default multipliers when empty', () => {
    getStoredColeggtibles.mockReturnValue([]);
    const result = getDynamicColeggtibles();
    expect(result).toEqual({
      elrMult: 1,
      shipMult: 1,
      ihrMult: 1,
      chickenMult: 1,
    });
  });

  it('multiplies highest buff per egg and dimension', () => {
    getStoredColeggtibles.mockReturnValue([
      {
        identifier: 'egg1',
        buffs: [
          { dimension: GameDimension.EGG_LAYING_RATE, value: 1.05 },
          { dimension: GameDimension.EGG_LAYING_RATE, value: 1.1 },
          { dimension: GameDimension.SHIPPING_CAPACITY, value: 1.02 },
        ],
      },
      {
        identifier: 'egg2',
        buffs: [
          { dimension: GameDimension.EGG_LAYING_RATE, value: 1.05 },
          { dimension: GameDimension.INTERNAL_HATCHERY_RATE, value: 1.03 },
          { dimension: GameDimension.HAB_CAPACITY, value: 1.04 },
        ],
      },
    ]);

    const result = getDynamicColeggtibles();

    expect(result.elrMult).toBeCloseTo(1.1 * 1.05, 6);
    expect(result.shipMult).toBeCloseTo(1.02, 6);
    expect(result.ihrMult).toBeCloseTo(1.03, 6);
    expect(result.chickenMult).toBeCloseTo(1.04, 6);
  });
});
