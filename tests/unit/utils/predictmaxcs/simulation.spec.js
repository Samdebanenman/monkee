import { describe, expect, it } from 'vitest';

import {
  simulateScenario,
  updatePlayers,
  buildPlayerSummary,
  computeAdjustedSummaries,
} from '../../../../utils/predictmaxcs/simulation.js';

describe('utils/predictmaxcs/simulation', () => {
  it('simulates a short scenario and returns summaries', () => {
    const playerConfigs = [
      {
        maxChickens: 10,
        elrPerChickenNoStones: 1,
        elrPerChickenWithStones: 1,
        srNoStones: 100,
        srWithStones: 100,
        stoneLayout: { numTach: 0, numQuant: 0 },
        siabPercent: 0,
        siabAlwaysOn: false,
      },
      {
        maxChickens: 10,
        elrPerChickenNoStones: 1,
        elrPerChickenWithStones: 1,
        srNoStones: 100,
        srWithStones: 100,
        stoneLayout: { numTach: 0, numQuant: 0 },
        siabPercent: 0,
        siabAlwaysOn: false,
      },
    ];

    const result = simulateScenario({
      players: 2,
      playerDeflectors: [0, 0],
      durationSeconds: 10,
      targetEggs: 1,
      tokenTimerMinutes: 1,
      giftMinutes: 1,
      gg: false,
      baseIHR: 60,
      tokensPerPlayer: 1,
      cxpMode: false,
      playerConfigs,
    });

    expect(result.summaries.length).toBe(2);
    expect(result.maxCS).toBeGreaterThanOrEqual(result.minCS);
    expect(result.completionTime).toBeLessThanOrEqual(10);
  });

  it('updates players and marks max habs', () => {
    const states = [
      {
        index: 1,
        deflector: 0,
        otherDefl: 0,
        tokens: 0,
        boostMulti: 1,
        chickens: 0,
        maxChickens: 1,
        ihr: 60,
        elrPerChickenNoStones: 1,
        elrPerChickenWithStones: 1,
        srNoStones: 100,
        srWithStones: 100,
        stoneLayout: { numTach: 0, numQuant: 0 },
        siabPercent: 10,
        siabAlwaysOn: true,
        eggsDelivered: 0,
        btv: 0,
        maxHab: false,
        timeToBoost: null,
        timeToMaxHab: null,
      },
    ];

    const update = updatePlayers({
      states,
      updateRate: 60,
      tElapsed: 0,
      baseIHR: 60,
      cxpMode: false,
    });

    expect(update.eggsDelivered).toBeGreaterThan(0);
    expect(states[0].maxHab).toBe(true);
    expect(states[0].timeToMaxHab).toBe(0);
  });

  it('builds a player summary with siab window', () => {
    const summary = buildPlayerSummary({
      player: {
        index: 1,
        deflector: 0,
        eggsDelivered: 100,
        btv: 50,
        timeToMaxHab: 10,
        stoneLayout: { numTach: 1, numQuant: 1 },
        siabPercent: 20,
        siabAlwaysOn: false,
      },
      fairShare: 50,
      completionTime: 100,
      durationSeconds: 100,
      durationDays: 100 / 86400,
      players: 2,
      cxpMode: false,
    });

    expect(summary.contributionRatio).toBeGreaterThan(1);
    expect(summary.siabPercent).toBeGreaterThan(0);
    expect(Number.isFinite(summary.cs)).toBe(true);
  });

  it('adjusts summaries for display deflectors', () => {
    const adjusted = computeAdjustedSummaries({
      summaries: [
        {
          index: 1,
          deflector: 0,
          contributionRatio: 1,
          completionTime: 100,
          siabPercent: 0,
          teamwork: 0,
          cs: 10,
        },
        {
          index: 2,
          deflector: 0,
          contributionRatio: 0.8,
          completionTime: 100,
          siabPercent: 0,
          teamwork: 0,
          cs: 8,
        },
      ],
      displayDeflectors: [20, 0],
      durationSeconds: 100,
      players: 2,
      assumptions: { siabPercent: 0, cxpMode: false },
    });

    expect(adjusted.adjustedSummaries[0].deflector).toBe(20);
    expect(adjusted.adjustedMaxCS).toBeGreaterThanOrEqual(adjusted.adjustedMinCS);
  });
});
