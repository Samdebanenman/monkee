import { describe, expect, it } from 'vitest';

import { getCS, getTeamwork, getBtvRate } from '../../../../utils/predictmaxcs/score.js';

describe('utils/predictmaxcs/score', () => {
  it('computes CS score', () => {
    const cs = getCS(1.5, 86400, 36000, 0.5);
    expect(Number.isFinite(cs)).toBe(true);
    expect(cs).toBeGreaterThan(0);
  });

  it('computes teamwork for legacy mode', () => {
    const tw = getTeamwork(1.5, 4, 3, 2, 1, false);
    expect(tw).toBeGreaterThan(0);
  });

  it('computes teamwork for new2p0 mode', () => {
    const tw = getTeamwork(1.5, 2, 3, 2, 1, true);
    expect(tw).toBeCloseTo(0.6578947368421053, 6);
  });

  it('computes btv rate for new and legacy modes', () => {
    const legacy = getBtvRate(10, 20, false);
    const modern = getBtvRate(10, 20, true);
    expect(legacy).toBeGreaterThan(0);
    expect(modern).toBeGreaterThan(legacy);
  });
});
