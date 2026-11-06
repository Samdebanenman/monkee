import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/colleggtiblesRepository.js', () => ({
  getStoredColleggtibles: vi.fn(() => []),
}));

vi.mock('../../../sim-core/src/predictmaxcs/simulation.js', () => ({
  simulateScenariosParallel: vi.fn(async scenarios => scenarios.map(() => ({ summaries: [] }))),
}));

vi.mock('../../../services/simulation/shared.js', () => ({
  buildPredictMaxCsVariant: vi.fn(options => ({
    ...options,
    baselineDeflectors: Array(options.players).fill(20),
    playerConfigs: Array.from({ length: options.players }, () => ({})),
    baseIHR: 1,
  })),
  scorePredictMaxCsResult: vi.fn((_result, variant) => (
    variant.targetEggs * variant.gradeMultiplier + (variant.usePlayer1Siab ? 10 : 0)
  )),
}));

import { simulateScenariosParallel } from '../../../sim-core/src/predictmaxcs/simulation.js';
import { buildPredictMaxCsVariant } from '../../../services/simulation/shared.js';
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
  it('runs exactly four fixed-six-token scenarios for AAA and AA', async () => {
    const result = await checkOptimalGrade(makeContract(), { colleggtiblesRows: [] });

    expect(result.ok).toBe(true);
    expect(result.simulationsRun).toBe(4);
    expect(result.noteworthyGrades).toEqual(['AA']);
    expect(buildPredictMaxCsVariant).toHaveBeenCalledTimes(4);
    expect(buildPredictMaxCsVariant.mock.calls.every(([options]) => (
      options.assumptions.teValues.every(value => value === 100)
      && options.giftMinutes === 10 && options.gg === false
    ))).toBe(true);
    expect(buildPredictMaxCsVariant.mock.calls.map(([options]) => [options.gradeMultiplier, options.usePlayer1Siab])).toEqual([
      [7, true], [7, false], [5, true], [5, false],
    ]);
    expect(simulateScenariosParallel).toHaveBeenCalledTimes(1);
    const scenarios = simulateScenariosParallel.mock.calls[0][0];
    expect(scenarios).toHaveLength(4);
    expect(scenarios.every(scenario => (
      scenario.tokensPerPlayer.length === 3
      && scenario.tokensPerPlayer.every(tokens => tokens === 6)
      && scenario.giftMinutes === 10 && scenario.gg === false
    ))).toBe(true);
    expect(scenarios.map(scenario => scenario.gradeMultiplier)).toEqual([7, 7, 5, 5]);
    expect(result.grades.map(entry => entry.grade)).toEqual(['AAA', 'AA']);
    expect(result.grades.find(entry => entry.grade === 'AAA')).toMatchObject({
      noSiab: 700, siab: 710, predictedScore: 710, bestVariant: 'SIAB',
    });
  });

  it('accepts contracts with only AAA and AA data', async () => {
    const contract = makeContract();
    contract.gradeSpecs = contract.gradeSpecs.filter(spec => ['AAA', 'AA'].includes(spec.grade));
    const result = await checkOptimalGrade(contract, { colleggtiblesRows: [] });
    expect(result.ok).toBe(true);
    expect(result.simulationsRun).toBe(4);
  });

  it('rejects contracts missing AA data', async () => {
    const contract = makeContract();
    contract.gradeSpecs = contract.gradeSpecs.filter(spec => spec.grade !== 'AA');

    const result = await checkOptimalGrade(contract, { colleggtiblesRows: [] });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('AA');
    expect(simulateScenariosParallel).not.toHaveBeenCalled();
  });
});
