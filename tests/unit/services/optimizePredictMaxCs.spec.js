import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/colleggtiblesRepository.js', () => ({
  getStoredColleggtibles: vi.fn(() => []),
}));

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
import { checkOptimalGrade } from '../../../services/optimalGradeService.js';
import { GameDimension } from '../../../Enums.js';

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

  it('reproduces memorial-2020 with AAA ahead of AA under ten-minute farming', async () => {
    const contract = {
      id: 'memorial-2020',
      maxCoopSize: 50,
      minutesPerToken: 240,
      gradeSpecs: [
        { grade: 'C', coopDurationSeconds: 172800, eggGoal: 3.2e12 },
        { grade: 'B', coopDurationSeconds: 259200, eggGoal: 4.6e14 },
        { grade: 'A', coopDurationSeconds: 345600, eggGoal: 1.9e16 },
        { grade: 'AA', coopDurationSeconds: 432000, eggGoal: 1.6e18 },
        { grade: 'AAA', coopDurationSeconds: 432000, eggGoal: 11e18 },
      ],
    };
    // Combined colleggtible buffs from the reported run.
    const colleggtiblesRows = [{ buffs: [
      { dimension: GameDimension.EGG_LAYING_RATE, value: 1.1025 },
      { dimension: GameDimension.SHIPPING_CAPACITY, value: 1.1025 },
      { dimension: GameDimension.INTERNAL_HATCHERY_RATE, value: 1.05 },
      { dimension: GameDimension.HAB_CAPACITY, value: 1.05 },
    ] }];
    const result = await checkOptimalGrade(contract, { colleggtiblesRows });
    expect(result.aaaScore).toBe(65960);
    expect(result.grades.find(entry => entry.grade === 'AA').predictedScore).toBe(59436);
    expect(result.noteworthyGrades).toEqual([]);
  }, 60000);
});
