import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../sim-core/src/predictmaxcs/simulation.js', () => ({
  simulateScenariosParallel: vi.fn(async scenarios => scenarios.map(() => ({ summaries: [] }))),
}));

vi.mock('../../../utils/database/colleggtiblesRepository.js', () => ({
  getStoredColleggtibles: vi.fn(() => []),
}));

vi.mock('../../../services/simOrchestrator/shared.js', () => ({
  buildPredictMaxCsVariant: vi.fn(options => ({
    ...options,
    baselineDeflectors: Array.from({ length: options.players }, () => 20),
    playerConfigs: Array.from({ length: options.players }, () => ({})),
    baseIHR: 1,
  })),
  scorePredictMaxCsResult: vi.fn((_result, variant) => (
    variant.targetEggs * variant.gradeMultiplier + (variant.usePlayer1Siab ? 10 : 0)
  )),
}));

import { simulateScenariosParallel } from '../../../sim-core/src/predictmaxcs/simulation.js';
import { buildPredictMaxCsVariant } from '../../../services/simOrchestrator/shared.js';
import { checkOptimalGrade } from '../../../services/optimalGradeService.js';

const makeContract = () => ({
  id: 'contract-1',
  name: 'Contract One',
  maxCoopSize: 3,
  minutesPerToken: 5,
  gradeSpecs: [
    { grade: 'C', coopDurationSeconds: 1000, eggGoal: 96 },
    { grade: 'B', coopDurationSeconds: 1000, eggGoal: 80 },
    { grade: 'A', coopDurationSeconds: 1000, eggGoal: 70 },
    { grade: 'AA', coopDurationSeconds: 1000, eggGoal: 134 },
    { grade: 'AAA', coopDurationSeconds: 1000, eggGoal: 100 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('services/optimalGradeService', () => {
  it('runs one SIAB and one non-SIAB simulation for every grade', async () => {
    const result = await checkOptimalGrade(makeContract(), { colleggtiblesRows: [] });

    expect(result.ok).toBe(true);
    expect(result.simulationsRun).toBe(10);
    expect(result.noteworthyGrades).toEqual(['AA']);
    expect(buildPredictMaxCsVariant).toHaveBeenCalledTimes(10);
    expect(buildPredictMaxCsVariant.mock.calls.every(([options]) => (
      options.assumptions.teValues.every(value => value === 100)
    ))).toBe(true);
    expect(buildPredictMaxCsVariant.mock.calls.map(([options]) => options.gradeMultiplier)).toEqual([
      1, 1, 2, 2, 3.5, 3.5, 5, 5, 7, 7,
    ]);

    const scenarios = simulateScenariosParallel.mock.calls[0][0];
    expect(scenarios).toHaveLength(10);
    expect(scenarios.every(scenario => scenario.tokensPerPlayer.every(value => value === 6))).toBe(true);
    expect(scenarios.map(scenario => scenario.gradeMultiplier)).toEqual([
      1, 1, 2, 2, 3.5, 3.5, 5, 5, 7, 7,
    ]);
  });

  it('rejects contracts without all five grade configurations', async () => {
    const contract = makeContract();
    contract.gradeSpecs = contract.gradeSpecs.filter(spec => spec.grade !== 'B');

    const result = await checkOptimalGrade(contract, { colleggtiblesRows: [] });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('B');
    expect(simulateScenariosParallel).not.toHaveBeenCalled();
  });
});
