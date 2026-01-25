import { describe, expect, it } from 'vitest';

import {
  calcBoostMulti,
  buildTokenPlan,
  getTokensForPrediction,
  computeTotalTokens,
  applyNextBoost,
} from '../../../../utils/predictmaxcs/tokens.js';

describe('utils/predictmaxcs/tokens', () => {
  it('calculates boost multipliers', () => {
    expect(calcBoostMulti(1)).toBe(80);
    expect(calcBoostMulti(4)).toBe(1040);
    expect(calcBoostMulti(11)).toBe(16000);
    expect(calcBoostMulti(99)).toBe(50);
  });

  it('builds token plan and selects best time', () => {
    const plan = buildTokenPlan(6, 10, true, 4, 1000, 1_000_000);
    expect(plan.tokenRate).toBeGreaterThan(0);
    expect(plan.results.length).toBe(4);
    expect(plan.bestTime.tokens).toBeTruthy();
  });

  it('gets tokens for prediction', () => {
    const tokens = getTokensForPrediction(6, 10, false, 4, 1000, 1_000_000);
    expect([4, 5, 6, 8]).toContain(tokens);
  });

  it('computes total tokens over time', () => {
    const total = computeTotalTokens({
      tElapsed: 600,
      players: 4,
      giftSeconds: 120,
      tokenTimerSeconds: 60,
      ggMult: 2,
    });
    expect(total).toBe(80);
  });

  it('applies next boost when tokens available', () => {
    const states = [
      { tokens: 4, boostMulti: 1, timeToBoost: null },
      { tokens: 6, boostMulti: 1, timeToBoost: null },
    ];

    const result = applyNextBoost({
      states,
      numberBoosting: 0,
      totalTokens: 10,
      tokensUsed: 0,
      tElapsed: 100,
      boostOrder: null,
    });

    expect(result.numberBoosting).toBe(1);
    expect(result.tokensUsed).toBe(4);
    expect(states[0].boostMulti).toBe(calcBoostMulti(4));
    expect(states[0].timeToBoost).toBe(100);
  });

  it('skips boost when no player is found', () => {
    const result = applyNextBoost({
      states: [],
      numberBoosting: 0,
      totalTokens: 0,
      tokensUsed: 0,
      tElapsed: 0,
      boostOrder: null,
    });

    expect(result.numberBoosting).toBe(0);
    expect(result.tokensUsed).toBe(0);
  });
});
