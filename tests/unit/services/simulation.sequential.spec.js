import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batches: [],
}));

vi.mock('../../../services/simulation/shared.js', () => {
  const tokenCandidates = [0, 1, 2, 3, 4, 5, 6, 8];

  const setScenarioBatch = vi.fn(async (simulation, scenarios) => {
    simulation.pending += scenarios.length;
    mocks.batches.push(scenarios);
  });

  const buildPredictMaxCsVariant = options => ({
    players: options.players,
    durationSeconds: options.durationSeconds,
    targetEggs: options.targetEggs,
    tokenTimerMinutes: options.tokenTimerMinutes,
    giftMinutes: options.giftMinutes,
    gg: options.gg,
    assumptions: options.assumptions,
    baselineDeflectors: Array.from({ length: options.players }, () => 20),
    playerConfigs: Array.from({ length: options.players }, () => ({})),
    baseIHR: 100,
    deflectorDisplay: {
      displayDeflectors: Array.from({ length: options.players }, () => 20),
    },
    usePlayer1Siab: options.usePlayer1Siab,
  });

  const buildPredictCsVariant = options => ({
    players: options.players,
    durationSeconds: options.durationSeconds,
    targetEggs: options.targetEggs,
    tokenTimerMinutes: options.tokenTimerMinutes,
    giftMinutes: options.giftMinutes,
    gg: options.gg,
    assumptions: { cxpMode: true },
    boostOrder: Array.from({ length: options.players }, (_, index) => index),
    pushCount: 0,
    playerConfigs: Array.from({ length: options.players }, () => ({})),
    playerArtifacts: Array.from({ length: options.players }, () => ({})),
    playerIHRs: Array.from({ length: options.players }, () => 100),
    avgIHR: 100,
    playerDeflectors: Array.from({ length: options.players }, () => 20),
    deflectorDisplay: {
      displayDeflectors: Array.from({ length: options.players }, () => 20),
    },
  });

  return {
    tokenCandidates,
    setScenarioBatch,
    buildPredictMaxCsVariant,
    buildPredictCsVariant,
    scorePredictMaxCsResult: result => result.score,
    scorePredictCsResult: result => result.score,
    buildFinalModelFromPredictMaxCs: vi.fn(),
    buildFinalModelFromPredictCs: vi.fn(),
  };
});

import {
  advancePredictMaxCs,
  handlePredictMaxCsResult,
  createPredictMaxCsRun,
} from '../../../services/simulation/predictMaxCs.js';
import {
  advancePredictCs,
  handlePredictCsResult,
  createPredictCsRun,
} from '../../../services/simulation/predictCs.js';

const scenarioTokens = entry => entry.scenario.tokensPerPlayer;

async function completeBatch(simulation, batch, handleResult, advance, getScore) {
  for (const entry of batch) {
    const context = entry.context;
    handleResult(simulation, {
      context,
      score: getScore(context),
    });
    simulation.pending -= 1;
    await advance(simulation);
  }
}

const commonOptions = {
  interaction: {},
  contractLabel: 'test',
  players: 3,
  durationSeconds: 3600,
  targetEggs: 1e12,
  tokenTimerMinutes: 5,
  giftMinutes: 5,
  gg: false,
  assumptions: { cxpMode: true },
};

beforeEach(() => {
  mocks.batches.length = 0;
  vi.clearAllMocks();
});

describe('simulation token refinement', () => {
  it('prepares one max-CS player batch at a time and carries winners into later players', async () => {
    const simulation = await createPredictMaxCsRun({
      ...commonOptions,
      siabOverride: null,
    });

    expect(mocks.batches[0]).toHaveLength(16);

    await completeBatch(
      simulation,
      mocks.batches[0],
      handlePredictMaxCsResult,
      advancePredictMaxCs,
      ({ tokenCandidate }) => (tokenCandidate === 6 ? 100 : tokenCandidate),
    );

    const player1Batch = mocks.batches[1];
    expect(player1Batch).toHaveLength(8);
    expect(player1Batch.every(entry => entry.context.variantId === 'base')).toBe(true);
    expect(player1Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [candidate, 6, 6]),
    );

    await completeBatch(
      simulation,
      player1Batch,
      handlePredictMaxCsResult,
      advancePredictMaxCs,
      ({ tokenCandidate }) => (tokenCandidate === 5 ? 100 : tokenCandidate),
    );

    const player2Batch = mocks.batches[2];
    expect(player2Batch).toHaveLength(8);
    expect(player2Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [5, candidate, 6]),
    );

    await completeBatch(
      simulation,
      player2Batch,
      handlePredictMaxCsResult,
      advancePredictMaxCs,
      ({ tokenCandidate }) => (tokenCandidate === 4 ? 100 : tokenCandidate),
    );

    const player3Batch = mocks.batches[3];
    expect(player3Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [5, 4, candidate]),
    );

    await completeBatch(
      simulation,
      player3Batch,
      handlePredictMaxCsResult,
      advancePredictMaxCs,
      ({ tokenCandidate }) => (tokenCandidate === 2 ? 100 : tokenCandidate),
    );

    const siabPlayer1Batch = mocks.batches[4];
    expect(siabPlayer1Batch).toHaveLength(8);
    expect(siabPlayer1Batch.every(entry => entry.context.variantId === 'siab')).toBe(true);
    expect(siabPlayer1Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [candidate, 6, 6]),
    );
  });

  it('carries each PredictCS winner into the next eight-scenario batch', async () => {
    const simulation = await createPredictCsRun({
      ...commonOptions,
      playerArtifacts: [{}, {}, {}],
      playerIhrArtifacts: [{}, {}, {}],
      playerTe: [100, 100, 100],
    });

    expect(mocks.batches[0]).toHaveLength(8);

    await completeBatch(
      simulation,
      mocks.batches[0],
      handlePredictCsResult,
      advancePredictCs,
      ({ tokenCandidate }) => (tokenCandidate === 6 ? 100 : tokenCandidate),
    );

    const player1Batch = mocks.batches[1];
    expect(player1Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [candidate, 6, 6]),
    );

    await completeBatch(
      simulation,
      player1Batch,
      handlePredictCsResult,
      advancePredictCs,
      ({ tokenCandidate }) => (tokenCandidate === 5 ? 100 : tokenCandidate),
    );

    const player2Batch = mocks.batches[2];
    expect(player2Batch).toHaveLength(8);
    expect(player2Batch.map(scenarioTokens)).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 8].map(candidate => [5, candidate, 6]),
    );
  });
});
