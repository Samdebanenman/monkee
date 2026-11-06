import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/colleggtiblesRepository.js', () => ({
  getStoredColleggtibles: vi.fn(() => []),
}));

vi.mock('../../../services/simulation/predictMaxCs.js', () => ({
  optimizePredictMaxCs: vi.fn(async options => ({
    variants: [false, true].map(usePlayer1Siab => ({
      usePlayer1Siab,
      finalScore: options.targetEggs * options.gradeMultiplier + (usePlayer1Siab ? 10 : 0),
    })),
    simulationsRun: 66,
  })),
}));

import { optimizePredictMaxCs } from '../../../services/simulation/predictMaxCs.js';
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
  it('optimizes both SIAB variants for every grade using fixed ten-minute farming', async () => {
    const result = await checkOptimalGrade(makeContract(), { colleggtiblesRows: [] });

    expect(result.ok).toBe(true);
    expect(result.simulationsRun).toBe(330);
    expect(result.noteworthyGrades).toEqual(['AA']);
    expect(optimizePredictMaxCs).toHaveBeenCalledTimes(5);
    expect(optimizePredictMaxCs.mock.calls.every(([options]) => (
      options.assumptions.teValues.every(value => value === 100)
      && options.giftMinutes === 10 && options.gg === false
    ))).toBe(true);
    expect(optimizePredictMaxCs.mock.calls.map(([options]) => options.gradeMultiplier)).toEqual([
      1, 2, 3.5, 5, 7,
    ]);
    expect(result.grades.find(entry => entry.grade === 'AAA')).toMatchObject({
      noSiab: 700, siab: 710, predictedScore: 710, bestVariant: 'SIAB',
    });
  });

  it('rejects contracts without all five grade configurations', async () => {
    const contract = makeContract();
    contract.gradeSpecs = contract.gradeSpecs.filter(spec => spec.grade !== 'B');

    const result = await checkOptimalGrade(contract, { colleggtiblesRows: [] });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('B');
    expect(optimizePredictMaxCs).not.toHaveBeenCalled();
  });
});
