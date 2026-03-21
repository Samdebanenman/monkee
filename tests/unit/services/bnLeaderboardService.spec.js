import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  getCoopAvailability: vi.fn(),
  getCoopStatus: vi.fn(),
  listCoops: vi.fn(),
}));

vi.mock('../../../services/memberService.js', () => ({
  hasKnownMembersForContributors: vi.fn(),
}));

import {
  buildBnLeaderboardReport,
  listBnLeaderboardContractOptions,
  searchBnLeaderboardContractOptions,
} from '../../../services/bnLeaderboardService.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { getCoopAvailability, getCoopStatus, listCoops } from '../../../services/coopService.js';
import { hasKnownMembersForContributors } from '../../../services/memberService.js';

function contributor(rate = 1) {
  return {
    userName: 'p1',
    contributionAmount: 0,
    contributionRate: rate,
    productionParams: { farmPopulation: 100, farmCapacity: 100, delivered: 0 },
    farmInfo: {
      habs: [18, 18, 18, 18],
      vehicles: new Array(17).fill(11),
      trainLength: new Array(17).fill(10),
      silosOwned: 10,
      commonResearch: [
        { id: 'comfy_nests', level: 50 },
        { id: 'hab_capacity1', level: 8 },
        { id: 'leafsprings', level: 30 },
        { id: 'vehicle_reliablity', level: 2 },
        { id: 'hen_house_ac', level: 50 },
        { id: 'microlux', level: 10 },
        { id: 'lightweight_boxes', level: 40 },
        { id: 'excoskeletons', level: 2 },
        { id: 'improved_genetics', level: 30 },
        { id: 'traffic_management', level: 2 },
        { id: 'driver_training', level: 30 },
        { id: 'egg_loading_bots', level: 2 },
        { id: 'super_alloy', level: 50 },
        { id: 'quantum_storage', level: 20 },
        { id: 'time_compress', level: 20 },
        { id: 'hover_upgrades', level: 25 },
        { id: 'grav_plating', level: 25 },
        { id: 'autonomous_vehicles', level: 5 },
        { id: 'dark_containment', level: 25 },
        { id: 'timeline_diversion', level: 50 },
        { id: 'wormhole_dampening', level: 25 },
        { id: 'micro_coupling', level: 5 },
        { id: 'neural_net_refine', level: 25 },
        { id: 'hyper_portalling', level: 25 },
        { id: 'relativity_optimization', level: 10 },
      ],
      equippedArtifacts: [
        { spec: { name: 'TACHYON_DEFLECTOR' } },
        { spec: { name: 'QUANTUM_METRONOME' } },
        { spec: { name: 'INTERSTELLAR_COMPASS' } },
        { spec: { name: 'ORNATE_GUSSET' } },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/bnLeaderboardService', () => {
  it('returns unknown-contract for invalid ids', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1' }]);
    const result = await buildBnLeaderboardReport({ contractId: 'bad' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown-contract');
  });

  it('continues range checks after base availability error', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue([]);
    hasKnownMembersForContributors.mockReturnValue(false);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, error: 'index out of range' };
      if (code === '2noo') return { coopCode: code, free: false };
      if (code === '3noo') return { coopCode: code, free: true };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockImplementation(async (_contract, code) => {
      if (code === 'noo' || code === '2noo') {
        return {
          contributors: [
            {
              ...contributor(1),
              boostTokens: 12,
            },
          ],
          secondsRemaining: 100,
        };
      }
      return { contributors: [], secondsRemaining: 100 };
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });

    expect(result.ok).toBe(true);
    expect(getCoopAvailability).toHaveBeenCalledWith('c1', '2noo');
    expect(result.entries.some(entry => entry.coop === 'noo')).toBe(true);
    expect(result.entries.some(entry => entry.coop === '2noo')).toBe(true);
    const first = result.entries.find(entry => entry.coop === 'noo');
    expect(first.tokens).toBe(12);
    expect(first.tokensLabel).toBe('12');
    expect(first.deliveryRateLabel).toContain('/hour');
  });

  it('provides contract options helpers', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'a', name: 'Alpha', release: 2 },
      { id: 'b', name: 'Beta', release: 1 },
    ]);

    const staticOptions = await listBnLeaderboardContractOptions();
    expect(staticOptions[0].value).toBe('a');

    const searched = await searchBnLeaderboardContractOptions('be');
    expect(searched).toHaveLength(1);
    expect(searched[0].value).toBe('b');
  });
});
