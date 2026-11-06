import { getAssumptions } from '../sim-core/src/predictmaxcs/model.js';
import { getGradeMultiplier } from '../sim-core/src/predictmaxcs/score.js';
import { getStoredColleggtibles } from '../utils/database/colleggtiblesRepository.js';
import { optimizePredictMaxCs } from './simulation/predictMaxCs.js';

export const GRADE_ORDER = ['C', 'B', 'A', 'AA', 'AAA'];
export const NOTEWORTHY_RATIO = 0.95;

const DEFAULT_TE = 100;
const GIFT_MINUTES = 10;

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeGradeSpecs(contract) {
  const byGrade = new Map(
    (Array.isArray(contract?.gradeSpecs) ? contract.gradeSpecs : [])
      .filter(spec => GRADE_ORDER.includes(spec?.grade))
      .map(spec => [spec.grade, spec]),
  );

  return GRADE_ORDER.map(grade => byGrade.get(grade)).filter(Boolean);
}

function validateContract(contract, gradeSpecs) {
  if (!isPositiveNumber(contract?.maxCoopSize)) return 'missing max coop size';
  if (!isPositiveNumber(contract?.minutesPerToken)) return 'missing token interval';

  const missingGrades = GRADE_ORDER.filter(grade => !gradeSpecs.some(spec => spec.grade === grade));
  if (missingGrades.length > 0) return `missing grade data for ${missingGrades.join(', ')}`;

  const invalidGrade = gradeSpecs.find(spec => (
    !isPositiveNumber(spec.coopDurationSeconds) || !isPositiveNumber(spec.eggGoal)
  ));
  if (invalidGrade) return `invalid ${invalidGrade.grade} duration or target`;
  return null;
}

function buildOptions(contract, gradeSpec, colleggtiblesRows) {
  const players = Math.floor(contract.maxCoopSize);
  const assumptions = getAssumptions(Array.from({ length: players }, () => DEFAULT_TE));
  return {
    players,
    durationSeconds: gradeSpec.coopDurationSeconds,
    targetEggs: gradeSpec.eggGoal,
    tokenTimerMinutes: contract.minutesPerToken,
    giftMinutes: GIFT_MINUTES,
    gg: false,
    assumptions,
    modifierType: gradeSpec.modifierType,
    modifierValue: gradeSpec.modifierValue,
    colleggtiblesRows,
    gradeMultiplier: getGradeMultiplier(gradeSpec.grade),
  };
}

export async function checkOptimalGrade(contract, options = {}) {
  const gradeSpecs = normalizeGradeSpecs(contract);
  const invalidReason = validateContract(contract, gradeSpecs);
  if (invalidReason) {
    return { ok: false, contractId: contract?.id ?? null, reason: invalidReason };
  }

  const colleggtiblesRows = options.colleggtiblesRows ?? getStoredColleggtibles();
  const grades = [];
  let simulationsRun = 0;
  for (const gradeSpec of gradeSpecs) {
    const result = await optimizePredictMaxCs({
      ...buildOptions(contract, gradeSpec, colleggtiblesRows),
      maxWorkers: options.maxWorkers,
      onProgress: options.onProgress
        ? progress => options.onProgress({ ...progress, grade: gradeSpec.grade })
        : null,
    });
    simulationsRun += result.simulationsRun;
    const noSiab = result.variants.find(variant => !variant.usePlayer1Siab)?.finalScore ?? 0;
    const siab = result.variants.find(variant => variant.usePlayer1Siab)?.finalScore ?? 0;
    grades.push({
      grade: gradeSpec.grade,
      noSiab,
      siab,
      predictedScore: Math.max(noSiab, siab),
      bestVariant: siab > noSiab ? 'SIAB' : 'no SIAB',
    });
  }

  const aaaScore = grades.find(entry => entry.grade === 'AAA')?.predictedScore ?? 0;
  const noteworthyGrades = grades
    .filter(entry => entry.grade !== 'AAA' && entry.predictedScore >= aaaScore * NOTEWORTHY_RATIO)
    .map(entry => entry.grade);

  return {
    ok: true,
    contractId: contract.id,
    contractName: contract.name || contract.id,
    grades,
    aaaScore,
    noteworthyGrades,
    simulationsRun,
  };
}

export default { checkOptimalGrade };
