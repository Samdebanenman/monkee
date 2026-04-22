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
        {
          spec: { name: 'TACHYON_DEFLECTOR' },
          stones: [{ spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }],
        },
        {
          spec: { name: 'QUANTUM_METRONOME' },
          stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
        },
        {
          spec: { name: 'INTERSTELLAR_COMPASS' },
          stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
        },
        {
          spec: { name: 'ORNATE_GUSSET' },
          stones: [{ spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }],
        },
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
    hasKnownMembersForContributors.mockReturnValue(true);

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
              productionParams: { farmPopulation: 90, farmCapacity: 100, delivered: 0 },
              boostTokensSpent: 12,
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
    expect(Array.isArray(first.auditFailures)).toBe(true);
    // BN coops are audited even when unsaved and may surface failures.
    expect(first.auditFailures.length).toBeGreaterThan(0);
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

  it('passes stone audit when fully quantum and shipping capped', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 90,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'EPIC' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'ORNATE_GUSSET', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✓');
    expect(entry.status).toContain('⌛︎');
    expect(entry.auditFailures).toEqual([]);
  });

  it('uses farm-population scaled ELR when it matches SR scale', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 14883750000,
            farmCapacity: 14883750000,
            delivered: 0,
            elr: 256.173931,
            sr: 3801224962069,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'EPIC' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'ORNATE_GUSSET', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✓');
    expect(entry.status).toContain('⌛︎');
  });

  it('uses productionParams.sr when contributionRate is zero', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          contributionRate: 0,
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            sr: 2,
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.deliveryRatePerHour).toBe(7200);
  });

  it('uses delivered fallback when contributionAmount is zeroed', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          userName: 'pusher',
          contributionAmount: 0,
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 900,
            elr: 100,
            sr: 100,
          },
        },
      ],
      allGoalsAchieved: true,
      secondsRemaining: 0,
      secondsSinceAllGoalsAchieved: 0,
      totalAmount: 900,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.maxCs).toBeGreaterThan(0);
  });

  it('fails stone audit when sr/elr mismatch >5% and stones are mixed', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 90,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'EPIC' },
                stones: [
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'ORNATE_GUSSET', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✗');
    expect(entry.status).toContain('⌛︎');
    expect(entry.auditFailures).toHaveLength(1);
    const compactLabels = ['habs', 'vehicles', 'silos', 'research', 'artifacts', 'full habs', 'stones'];
    expect(entry.auditFailures[0].reasons.some(reason => compactLabels.includes(reason))).toBe(true);
  });

  it('fails audit when equipped stones exceed rarity-capped artifact slots', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 90,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'EPIC' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                // Rare gusset cap is 1, so two stones must fail.
                spec: { name: 'ORNATE_GUSSET', rarity: 'RARE' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✗');
    expect(entry.status).toContain('⌛︎');
    const compactLabels = ['habs', 'vehicles', 'silos', 'research', 'artifacts', 'full habs', 'stones'];
    expect(entry.auditFailures[0].reasons.some(reason => compactLabels.includes(reason))).toBe(true);
  });

  it('passes audit when SIAB is used as the fourth artifact with two stones', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 100,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
              {
                spec: { name: 'SHIP_IN_A_BOTTLE', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✓');
    expect(entry.auditFailures).toEqual([]);
  });

  it('passes audit when a holder replaces the deflector slot', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 100,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'THE_CHALICE', rarity: 'LEGENDARY' },
                stones: [
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                ],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                ],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                ],
              },
              {
                spec: { name: 'ORNATE_GUSSET', rarity: 'LEGENDARY' },
                stones: [
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                  { name: 'TACHYON_STONE', level: 'NORMAL' },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.auditFailures).toEqual([]);
  });

  it('fails audit when SIAB exceeds its 2-slot cap', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockResolvedValue({ coopCode: 'noo', free: false });
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 100,
          },
          farmInfo: {
            ...contributor(1).farmInfo,
            equippedArtifacts: [
              {
                spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                spec: { name: 'QUANTUM_METRONOME', rarity: 'LEGENDARY' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                spec: { name: 'INTERSTELLAR_COMPASS', rarity: 'LEGENDARY' },
                stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }],
              },
              {
                spec: { name: 'SHIP_IN_A_BOTTLE', rarity: 'LEGENDARY' },
                stones: [
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                  { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } },
                ],
              },
            ],
          },
        },
      ],
      secondsRemaining: 100,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.status).toContain('✗');
    const compactLabels = ['habs', 'vehicles', 'silos', 'research', 'artifacts', 'full habs', 'stones'];
    expect(entry.auditFailures[0].reasons.some(reason => compactLabels.includes(reason))).toBe(true);
  });

  it('uses only explicit SIAB data for teamwork bonus', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo', '2noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo' || code === '2noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    const baseFarmInfo = contributor(1).farmInfo;
    const sharedArtifacts = [
      {
        spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
      {
        spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
      {
        spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
    ];

    getCoopStatus.mockImplementation(async (_contract, code) => {
      const fourthArtifact = code === 'noo'
        ? {
          spec: { name: 'ORNATE_GUSSET', level: 'GREATER', rarity: 'LEGENDARY' },
          stones: [
            { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
            { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          ],
        }
        : {
          spec: { name: 'SHIP_IN_A_BOTTLE', level: 'GREATER', rarity: 'LEGENDARY' },
          stones: [
            { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
            { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          ],
        };

      return {
        contributors: [
          {
            ...contributor(1),
            buffHistory: code === '2noo'
              ? [
                { serverTimestamp: 2000, earnings: 2 },
                { serverTimestamp: 3000, earnings: 1 },
              ]
              : [],
            productionParams: {
              farmPopulation: 100,
              farmCapacity: 100,
              delivered: 0,
              elr: 100,
              sr: 100,
            },
            farmInfo: {
              ...baseFarmInfo,
              equippedArtifacts: [...sharedArtifacts, fourthArtifact],
            },
          },
        ],
        allGoalsAchieved: true,
        secondsRemaining: 0,
        secondsSinceAllGoalsAchieved: 0,
        clientTimestamp: 3000,
      };
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const gussetEntry = result.entries.find(item => item.coop === 'noo');
    const siabEntry = result.entries.find(item => item.coop === '2noo');
    expect(gussetEntry).toBeTruthy();
    expect(siabEntry).toBeTruthy();
    expect(siabEntry.maxCs).toBeGreaterThan(gussetEntry.maxCs);
    expect(siabEntry.meanCs).toBeGreaterThan(gussetEntry.meanCs);
  });

  it('applies capped artifact buff with max-runs assumption', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 345600 }]);
    listCoops.mockReturnValue(['noo', '2noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo' || code === '2noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    const base = contributor(1);
    getCoopStatus.mockImplementation(async (_contract, code) => ({
      contributors: [
        {
          ...base,
          contributionAmount: 800,
          contributionRate: 1,
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 800,
            elr: 100,
            sr: 100,
          },
          farmInfo: {
            ...base.farmInfo,
            equippedArtifacts: code === '2noo'
              ? [
                { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'SHIP_IN_A_BOTTLE', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
              ]
              : [
                { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
                { spec: { name: 'ORNATE_GUSSET', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
              ],
          },
        },
      ],
      allGoalsAchieved: true,
      secondsRemaining: 0,
      secondsSinceAllGoalsAchieved: 0,
      totalAmount: 1000,
      grade: 'GRADE_AAA',
    }));

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const noSiab = result.entries.find(item => item.coop === 'noo');
    const withSiab = result.entries.find(item => item.coop === '2noo');
    expect(noSiab).toBeTruthy();
    expect(withSiab).toBeTruthy();
    expect(withSiab.maxCs).toBeGreaterThan(noSiab.maxCs);
  });

  it('uses buffHistory earnings transition to infer SIAB uptime', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 1000 }]);
    listCoops.mockReturnValue(['noo', '2noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo' || code === '2noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    const baseFarmInfo = contributor(1).farmInfo;
    const artifactsWithGusset = [
      {
        spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
      {
        spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
      {
        spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
      {
        spec: { name: 'ORNATE_GUSSET', level: 'GREATER', rarity: 'LEGENDARY' },
        stones: [
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
          { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } },
        ],
      },
    ];

    getCoopStatus.mockImplementation(async (_contract, code) => ({
      contributors: [
        {
          ...contributor(1),
          buffHistory: code === '2noo'
            ? [
              { serverTimestamp: 90438.0395, eggLayingRate: 1.2, earnings: 1 },
              { serverTimestamp: 91868.5485, eggLayingRate: 1.2, earnings: 1.6 },
            ]
            : [],
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 0,
            elr: 100,
            sr: 100,
          },
          farmInfo: {
            ...baseFarmInfo,
            equippedArtifacts: artifactsWithGusset,
          },
        },
      ],
      allGoalsAchieved: true,
      secondsRemaining: 0,
      secondsSinceAllGoalsAchieved: 0,
      clientTimestamp: 3000,
    }));

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const shortWindowEntry = result.entries.find(item => item.coop === 'noo');
    const tailWindowEntry = result.entries.find(item => item.coop === '2noo');
    expect(shortWindowEntry).toBeTruthy();
    expect(tailWindowEntry).toBeTruthy();
    expect(tailWindowEntry.maxCs).toBeGreaterThan(shortWindowEntry.maxCs);
    expect(tailWindowEntry.meanCs).toBeGreaterThan(shortWindowEntry.meanCs);
  });

  it('uses actual completion time when goals are achieved before contract expiry', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 10000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      if (code === '2noo') return { coopCode: code, free: true };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 100,
          },
        },
      ],
      allGoalsAchieved: true,
      secondsRemaining: 4000,
      secondsSinceAllGoalsAchieved: 1000,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.durationLabel).toBe('1h23m');
  });

  it('normalizes 0h0m to -- and sorts it to the bottom', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 1000, coopDurationSeconds: 10000 }]);
    listCoops.mockReturnValue(['noo', '2noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      if (code === '2noo') return { coopCode: code, free: false };
      if (code === '3noo') return { coopCode: code, free: true };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockImplementation(async (_contract, code) => {
      if (code === 'noo') {
        return {
          contributors: [
            {
              ...contributor(1),
              productionParams: {
                farmPopulation: 100,
                farmCapacity: 100,
                delivered: 100,
              },
            },
          ],
          allGoalsAchieved: true,
          secondsRemaining: 5000,
          secondsSinceAllGoalsAchieved: 5000,
        };
      }

      return {
        contributors: [
          {
            ...contributor(1),
            productionParams: {
              farmPopulation: 100,
              farmCapacity: 100,
              delivered: 100,
            },
          },
        ],
        allGoalsAchieved: true,
        secondsRemaining: 5000,
        secondsSinceAllGoalsAchieved: 1400,
      };
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);
    expect(result.entries.map(item => item.coop)).toEqual(['2noo', 'noo']);

    const bottom = result.entries[result.entries.length - 1];
    expect(bottom.coop).toBe('noo');
    expect(bottom.durationLabel).toBe('--');
  });

  it('subtracts shared offline time from elapsed duration', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 100000, coopDurationSeconds: 108000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          contributionAmount: 71200,
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 71200,
          },
        },
      ],
      secondsRemaining: 75600,
      clientTimestamp: 200000,
      lastSyncDEP: 178400,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.durationLabel).toBe('11h0m');
  });

  it('subtracts offline time from contributor timestamps when sync timestamps are missing', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 100000, coopDurationSeconds: 108000 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...contributor(1),
          contributionAmount: 71200,
          recentlyActive: false,
          farmInfo: {
            ...contributor(1).farmInfo,
            timestamp: -21600,
          },
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 71200,
          },
        },
      ],
      secondsRemaining: 75600,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.durationLabel).toBe('11h0m');
  });

  it('uses median contributor timestamp fallback to match payload-like offline duration', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'C1', eggGoal: 100000, coopDurationSeconds: 604800 }]);
    listCoops.mockReturnValue(['noo']);
    hasKnownMembersForContributors.mockReturnValue(true);

    getCoopAvailability.mockImplementation(async (_contract, code) => {
      if (code === 'noo') return { coopCode: code, free: false };
      return { coopCode: code, free: true };
    });

    const baseContributor = contributor(1);
    getCoopStatus.mockResolvedValue({
      contributors: [
        {
          ...baseContributor,
          contributionAmount: 3600,
          recentlyActive: false,
          farmInfo: {
            ...baseContributor.farmInfo,
            timestamp: -10049.901707,
          },
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 3600,
          },
        },
        {
          ...baseContributor,
          userName: 'p2',
          contributionAmount: 3600,
          recentlyActive: false,
          farmInfo: {
            ...baseContributor.farmInfo,
            timestamp: -22609.440188,
          },
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 3600,
          },
        },
        {
          ...baseContributor,
          userName: 'p3',
          contributionAmount: 3700,
          recentlyActive: false,
          farmInfo: {
            ...baseContributor.farmInfo,
            timestamp: -23679.483177,
          },
          productionParams: {
            farmPopulation: 100,
            farmCapacity: 100,
            delivered: 3700,
          },
        },
      ],
      secondsRemaining: 569957.382927,
    });

    const result = await buildBnLeaderboardReport({ contractId: 'c1' });
    expect(result.ok).toBe(true);

    const entry = result.entries.find(item => item.coop === 'noo');
    expect(entry).toBeTruthy();
    expect(entry.durationLabel).toBe('11h38m');
  });
});
