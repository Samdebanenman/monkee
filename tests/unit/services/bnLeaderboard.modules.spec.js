import { describe, expect, it } from 'vitest';

import {
  formatDurationYdhm,
  formatRatePerHour,
  getArray,
  getContributorRatePerSecond,
  getValue,
} from '../../../services/bnLeaderboard/common.js';
import { BnLeaderboardArtifactsService } from '../../../services/bnLeaderboard/artifacts.js';
import { BnLeaderboardAuditService } from '../../../services/bnLeaderboard/audit.js';
import { BnLeaderboardDurationService } from '../../../services/bnLeaderboard/duration.js';
import { BnLeaderboardScoringService } from '../../../services/bnLeaderboard/scoring.js';
import { BnLeaderboardEntryBuilder } from '../../../services/bnLeaderboard/entryBuilder.js';

function baseContributor(overrides = {}) {
  return {
    userName: 'p1',
    contributionAmount: 100,
    contributionRate: 1,
    recentlyActive: false,
    farmInfo: {
      timestamp: -60,
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
        { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }, { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }] },
        { spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] },
        { spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] },
        { spec: { name: 'ORNATE_GUSSET', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] },
      ],
    },
    productionParams: {
      farmPopulation: 100,
      farmCapacity: 100,
      delivered: 100,
      elr: 10,
      sr: 10,
    },
    ...overrides,
  };
}

describe('bnLeaderboard common helpers', () => {
  it('handles getValue/getArray fallbacks and formatting branches', () => {
    expect(getValue(null, 'a', 'b')).toBeNull();
    expect(getValue({ b: 7 }, 'a', 'b')).toBe(7);
    expect(getArray(null, 'a', 'b')).toEqual([]);
    expect(getArray({ b: [1, 2] }, 'a', 'b')).toEqual([1, 2]);
    expect(getArray({ a: 1, b: 2 }, 'a', 'b')).toEqual([]);
    expect(formatDurationYdhm(Number.NaN)).toBe('--');
    expect(formatDurationYdhm(365 * 24 * 60 * 60 + 30)).toBe('1y');
    expect(formatRatePerHour(0)).toBe('0');
    expect(formatRatePerHour(125000)).toBe('125K');
    expect(getContributorRatePerSecond({ contributionRate: 0, productionParams: { sr: 2 } })).toBe(2);
    expect(getContributorRatePerSecond({ contributionRate: 0, productionParams: { sr: 0 } })).toBe(0);
  });
});

describe('bnLeaderboard artifacts service', () => {
  const artifactsService = new BnLeaderboardArtifactsService();

  it('supports enum artifact names/levels/rarity and legacy audit enums', () => {
    const percents = artifactsService.getBestArtifactPercentsForCs({
      equipped_artifacts: [
        { spec: { name: 26, level: 3, rarity: 3 } },
        { spec: { name: 25, level: 3, rarity: 1 } },
      ],
    });
    expect(percents.deflectorPercent).toBe(20);
    expect(percents.siabPercent).toBe(80);

    expect(artifactsService.auditArtifacts([{ spec: { name: 26 } }, { spec: { name: 24 } }, { spec: { name: 27 } }, { spec: { name: 8 } }])).toBe(true);
    expect(artifactsService.auditArtifacts([{ spec: { name: 'TACHYON_DEFLECTOR' } }])).toBe(false);
  });

  it('covers artifact percent branches for string and unknown inputs', () => {
    const percents = artifactsService.getBestArtifactPercentsForCs({
      equippedArtifacts: [
        { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'COMMON' } },
        { spec: { name: 'SHIP_IN_A_BOTTLE', level: 'GREATER', rarity: 'COMMON' } },
      ],
    });
    expect(percents.deflectorPercent).toBe(15);
    expect(percents.siabPercent).toBe(70);

    const l3Percents = artifactsService.getBestArtifactPercentsForCs({
      equippedArtifacts: [
        { spec: { name: 'TACHYON_DEFLECTOR', level: 'NORMAL', rarity: 'COMMON' } },
        { spec: { name: 'SHIP_IN_A_BOTTLE', level: 'NORMAL', rarity: 'COMMON' } },
      ],
    });
    expect(l3Percents.deflectorPercent).toBe(12);
    expect(l3Percents.siabPercent).toBe(50);

    const unknownSpec = artifactsService.getBestArtifactPercentsForCs({
      equippedArtifacts: [
        { spec: { name: null, level: {}, rarity: {} } },
      ],
    });
    expect(unknownSpec.deflectorPercent).toBe(0);
    expect(unknownSpec.siabPercent).toBe(0);
  });

  it('covers stone setup failure branches', () => {
    const overfilled = artifactsService.auditStoneSetup(
      { elr: 10, sr: 9, farmPopulation: 100 },
      [{ spec: { name: 'SHIP_IN_A_BOTTLE', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] }]
    );
    expect(overfilled).toContain('slots');

    const noSlots = artifactsService.auditStoneSetup(
      { elr: 10, sr: 10, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'COMMON' }, stones: [] }]
    );
    expect(noSlots).toContain('no available stone slots');

    const noStones = artifactsService.auditStoneSetup(
      { elr: 10, sr: 10, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [] }]
    );
    expect(noStones).toContain('no stones equipped');

    const badStone = artifactsService.auditStoneSetup(
      { elr: 10, sr: 10, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'PROPHECY_STONE', level: 'NORMAL' } }] }]
    );
    expect(badStone).toContain('Tachyon stone or Quantum stone');

    const badLevel = artifactsService.auditStoneSetup(
      { elr: 10, sr: 10, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'LESSER' } }] }]
    );
    expect(badLevel).toContain('level 2');

    const missingRates = artifactsService.auditStoneSetup(
      { elr: Number.NaN, sr: 0 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] }]
    );
    expect(missingRates).toContain('missing sr/elr');
  });

  it('covers stone mismatch advice outcomes', () => {
    const shippingMismatch = artifactsService.auditStoneSetup(
      { elr: 10, sr: 1, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }, { spec: { name: 'TACHYON_STONE', level: 'NORMAL' } }] }]
    );
    expect(shippingMismatch).toContain('QUANTUM_STONE');

    const layingMismatch = artifactsService.auditStoneSetup(
      { elr: 1, sr: 10, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }, { spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] }]
    );
    expect(layingMismatch).toContain('TACHYON_STONE');

    const balanced = artifactsService.auditStoneSetup(
      { elr: 10, sr: 9.8, farmPopulation: 100 },
      [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 36, level: 2 } }, { spec: { name: 36, level: 2 } }] }]
    );
    expect(balanced).toBeNull();
  });
});

describe('bnLeaderboard audit service', () => {
  it('collects no-contributor and contributor failures', () => {
    const artifactsService = new BnLeaderboardArtifactsService();
    const auditService = new BnLeaderboardAuditService({ artifactsService });

    expect(auditService.collectAuditFailures([])).toEqual([{ contributor: 'unknown', reasons: ['no contributors'] }]);

    const bad = baseContributor({
      farmInfo: {
        ...baseContributor().farmInfo,
        habs: [1, 2],
        vehicles: [1],
        trainLength: [1],
        silosOwned: 1,
        commonResearch: [{ id: 'comfy_nests', level: 1 }],
        equippedArtifacts: [{ spec: { name: 'TACHYON_DEFLECTOR', rarity: 'LEGENDARY' }, stones: [{ spec: { name: 'QUANTUM_STONE', level: 'NORMAL' } }] }],
      },
      productionParams: { farmPopulation: 1, farmCapacity: 2, elr: 1, sr: 2, delivered: 0 },
    });

    const failures = auditService.collectAuditFailures([bad]);
    expect(failures[0].reasons).toContain('full habs');
    expect(failures[0].reasons).toContain('habs');
    expect(failures[0].reasons).toContain('vehicles');
    expect(failures[0].reasons).toContain('silos');
    expect(failures[0].reasons).toContain('research');
    expect(failures[0].reasons).toContain('artifacts');
  });
});

describe('bnLeaderboard duration service', () => {
  const durationService = new BnLeaderboardDurationService();

  it('covers completion, running, and fallback branches', () => {
    const contract = { eggGoal: 1000, coopDurationSeconds: 10000 };

    const completed = durationService.calculateTotalDurationSeconds(
      contract,
      { allGoalsAchieved: true, secondsRemaining: 1000, secondsSinceAllGoalsAchieved: 250 },
      [baseContributor()]
    );
    expect(completed).toBe(8750);

    const running = durationService.calculateTotalDurationSeconds(
      contract,
      { secondsRemaining: 5000, clientTimestamp: 2000, lastSyncDEP: 1000, totalAmount: 100, allMembersReporting: false },
      [baseContributor({ contributionRate: 2, contributionAmount: 100, farmInfo: { ...baseContributor().farmInfo, timestamp: -100 } })]
    );
    expect(running).toBeGreaterThan(0);

    const fromContributorTimestamps = durationService.calculateTotalDurationSeconds(
      contract,
      { secondsRemaining: 5000, totalAmount: 100, allMembersReporting: false },
      [baseContributor({ recentlyActive: false, farmInfo: { ...baseContributor().farmInfo, timestamp: -200 } })]
    );
    expect(fromContributorTimestamps).toBeGreaterThan(0);

    const noData = durationService.calculateTotalDurationSeconds(
      { eggGoal: 0 },
      {},
      []
    );
    expect(noData).toBe(Number.POSITIVE_INFINITY);

    const noTimestampCandidates = durationService.calculateTotalDurationSeconds(
      contract,
      { secondsRemaining: 5000, totalAmount: 100, allMembersReporting: false },
      [baseContributor({ recentlyActive: false, farmInfo: { ...baseContributor().farmInfo, timestamp: null } })]
    );
    expect(noTimestampCandidates).toBeGreaterThan(0);

    const zeroRateInfinity = durationService.calculateTotalDurationSeconds(
      contract,
      { secondsRemaining: 5000, totalAmount: 0, allMembersReporting: false },
      [baseContributor({ contributionRate: 0, productionParams: { ...baseContributor().productionParams, sr: 0 } })]
    );
    expect(zeroRateInfinity).toBe(Number.POSITIVE_INFINITY);
  });

  it('handles isCoopFinished branches', () => {
    expect(durationService.isCoopFinished({ allGoalsAchieved: true })).toBe(true);
    expect(durationService.isCoopFinished({ secondsRemaining: 0 })).toBe(true);
    expect(durationService.isCoopFinished({ secondsSinceAllGoalsAchieved: 1 })).toBe(true);
    expect(durationService.isCoopFinished({ secondsRemaining: 100, secondsSinceAllGoalsAchieved: 0 })).toBe(false);
  });
});

describe('bnLeaderboard scoring service', () => {
  const artifactsService = new BnLeaderboardArtifactsService();
  const scoringService = new BnLeaderboardScoringService({ artifactsService });

  it('covers token/rate and cs-summary edge branches', () => {
    expect(scoringService.calculateTotalTokens([{ boostTokensSpent: 3 }, { boost_tokens_spent: 2 }])).toBe(5);
    expect(scoringService.calculateTotalDeliveryRatePerHour([
      { contributionRate: 0, productionParams: { sr: 2 } },
      { contribution_rate: 1 },
    ])).toBe(10800);

    const emptySummary = scoringService.calculateCsSummary({ eggGoal: 0, coopDurationSeconds: 0 }, {}, []);
    expect(emptySummary.maxCs).toBeNull();

    const noRowsSummary = scoringService.calculateCsSummary({ eggGoal: 1000, coopDurationSeconds: 1000 }, { totalAmount: 0 }, []);
    expect(noRowsSummary.maxCs).toBeNull();

    const contract = { eggGoal: 1000, coopDurationSeconds: 1000, maxCoopSize: 2, grade: 'GRADE_AAA' };
    const coopStatus = {
      allGoalsAchieved: true,
      secondsRemaining: 0,
      secondsSinceAllGoalsAchieved: 0,
      totalAmount: 1000,
    };

    const gussetContributor = baseContributor({
      contributionAmount: 900,
      contributionRate: 1,
      buffHistory: [
        { serverTimestamp: 100, eggLayingRate: 1.1, earnings: 1 },
        { serverTimestamp: 1500, eggLayingRate: 1.2, earnings: 1.6 },
      ],
      farmInfo: {
        ...baseContributor().farmInfo,
        equippedArtifacts: [
          { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'ORNATE_GUSSET', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
        ],
      },
    });

    const siabContributor = baseContributor({
      contributionAmount: 900,
      contributionRate: 1,
      buffHistory: [
        { serverTimestamp: 100, eggLayingRate: 1.2, earnings: 1 },
        { serverTimestamp: 1200, eggLayingRate: 1.2, earnings: 1.6 },
      ],
      farmInfo: {
        ...baseContributor().farmInfo,
        equippedArtifacts: [
          { spec: { name: 'TACHYON_DEFLECTOR', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'QUANTUM_METRONOME', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'INTERSTELLAR_COMPASS', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
          { spec: { name: 'SHIP_IN_A_BOTTLE', level: 'GREATER', rarity: 'LEGENDARY' }, stones: [] },
        ],
      },
    });

    const gusset = scoringService.calculateCsSummary(contract, coopStatus, [gussetContributor]);
    const siab = scoringService.calculateCsSummary(contract, coopStatus, [siabContributor]);
    expect(siab.maxCs).toBeGreaterThan(gusset.maxCs);
    expect(siab.meanCs).toBeGreaterThan(gusset.meanCs);

    const highRatio = scoringService.calculateCsSummary(
      { eggGoal: 1000, coopDurationSeconds: 1000, maxCoopSize: 10, grade: 'GRADE_AAA' },
      { totalAmount: 1000, allGoalsAchieved: true, secondsRemaining: 0, secondsSinceAllGoalsAchieved: 0 },
      [baseContributor({ contributionAmount: 9999, contributionRate: 50 })]
    );
    expect(highRatio.maxCs).toBeGreaterThan(0);

    const backlogZeroTimestamp = scoringService.calculateCsSummary(
      { eggGoal: 1000, coopDurationSeconds: 1000, maxCoopSize: 2, grade: 'GRADE_AAA' },
      { totalAmount: 500, secondsRemaining: 100, allMembersReporting: false },
      [baseContributor({ contributionRate: 1, farmInfo: { ...baseContributor().farmInfo, timestamp: 15 } })]
    );
    expect(backlogZeroTimestamp.maxCs).toBeGreaterThan(0);
  });
});

describe('bnLeaderboard entry builder', () => {
  it('returns null with no contributors', () => {
    const builder = new BnLeaderboardEntryBuilder();
    const entry = builder.build({ contract: { eggGoal: 1000, coopDurationSeconds: 1000 }, coopStatus: {}, coop: 'noo' });
    expect(entry).toBeNull();
  });
});
