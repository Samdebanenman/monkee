import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../../../utils/auxbrain.js', () => ({
  getProtoRoot: vi.fn(async () => ({
    lookupType: () => ({
      decode: () => ({}),
    }),
    lookupEnum: () => ({ valuesById: {} }),
  })),
}));

vi.mock('../../../utils/database/index.js', () => ({
  getStoredContracts: vi.fn(),
  getMeta: vi.fn(),
  setMeta: vi.fn(),
  upsertContracts: vi.fn(),
}));

vi.mock('../../../utils/colleggtibles.js', () => ({
  fetchAndCacheColleggtibles: vi.fn(async () => []),
}));

import axios from 'axios';
import { getProtoRoot } from '../../../utils/auxbrain.js';
import { activeContracts, getAllContracts, refreshContractsCache } from '../../../utils/contracts.js';
import { getStoredContracts, getMeta, setMeta, upsertContracts } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-19T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('utils/contracts', () => {
  it('returns stored contracts when refresh is not needed', async () => {
    getMeta.mockReturnValue(DateTime.now().toISO());
    getStoredContracts.mockReturnValue([{ id: 'c1', release: 1 }]);

    const result = await getAllContracts();

    expect(result.length).toBe(1);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('computes active contracts', async () => {
    getMeta.mockReturnValue(DateTime.now().toISO());
    const nowSeconds = Math.floor(DateTime.now().toSeconds());
    getStoredContracts.mockReturnValue([
      { id: 'c1', name: 'A', season: 'fall_2025', release: nowSeconds },
      { id: 'c2', name: 'B', season: 'summer_2025', release: nowSeconds },
    ]);

    const result = await activeContracts();

    expect(result.seasonal.length).toBeGreaterThan(0);
  });

  it('refreshes contracts cache', async () => {
    axios.get.mockResolvedValue({ data: null });
    await refreshContractsCache();
    expect(setMeta).toHaveBeenCalled();
  });

  it('stores the simulation fields for all five grades', async () => {
    axios.get.mockResolvedValue({ data: [{ id: 'graded-contract', proto: '' }] });
    getProtoRoot.mockResolvedValueOnce({
      lookupType: () => ({
        decode: () => ({
          name: 'Graded Contract',
          startTime: 100,
          maxCoopSize: 2,
          minutesPerToken: 5,
          gradeSpecs: [1, 2, 3, 4, 5].map(grade => ({
            grade,
            lengthSeconds: 1000 + grade,
            goals: [{ targetAmount: 10000 + grade }],
            modifiers: [{ dimension: 1, value: 1 + grade / 10 }],
          })),
        }),
      }),
      lookupEnum: name => (name === 'Egg'
        ? { valuesById: { 0: 'EDIBLE' } }
        : { valuesById: { 1: 'INTERNAL_HATCHERY_RATE' } }),
    });

    await refreshContractsCache();

    const [rows] = upsertContracts.mock.calls.at(-1);
    expect(rows[0].gradeSpecs.map(spec => spec.grade)).toEqual(['C', 'B', 'A', 'AA', 'AAA']);
    expect(rows[0].gradeSpecs[3]).toMatchObject({
      grade: 'AA',
      coopDurationSeconds: 1004,
      eggGoal: 10004,
      modifierType: 'INTERNAL_HATCHERY_RATE',
      modifierValue: 1.4,
    });
  });
});
