import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../sim-core/src/predictmaxcs/simulation.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    simulateScenariosParallel: vi.fn(async scenarios => scenarios.map(actual.simulateScenario)),
  };
});

import { optimizePredictMaxCs } from '../../../services/simulation/predictMaxCs.js';
import { getAssumptions } from '../../../sim-core/src/predictmaxcs/model.js';
import { computeAdjustedSummaries, simulateScenariosParallel } from '../../../sim-core/src/predictmaxcs/simulation.js';

describe('headless PredictMaxCS optimization', () => {
  it('runs every phase without Discord and preserves grade scoring for player one', async () => {
    const assumptions = getAssumptions([100, 100]);
    const result = await optimizePredictMaxCs({
      players: 2,
      durationSeconds: 10,
      targetEggs: 1e12,
      tokenTimerMinutes: 240,
      giftMinutes: 10,
      gg: false,
      assumptions,
      gradeMultiplier: 5,
      colleggtiblesRows: [],
    });
    expect(result.simulationsRun).toBe(50);
    expect(result.variants).toHaveLength(2);
    expect(simulateScenariosParallel.mock.calls.every(([batch]) => (
      batch.every(scenario => scenario.gradeMultiplier === 5 && scenario.giftMinutes === 10)
    ))).toBe(true);
    for (const variant of result.variants) {
      const adjusted = computeAdjustedSummaries({
        summaries: variant.finalScenario.summaries,
        displayDeflectors: variant.deflectorDisplay.displayDeflectors,
        durationSeconds: 10,
        players: 2,
        assumptions,
        gradeMultiplier: 5,
      });
      expect(variant.finalScore).toBe(adjusted.adjustedSummaries[0].cs);
      expect(variant.selectedTokens).toHaveLength(2);
    }
  });
});
