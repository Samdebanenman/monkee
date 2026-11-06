import { getAssumptions } from '../sim-core/src/predictmaxcs/model.js';
import { getGradeMultiplier } from '../sim-core/src/predictmaxcs/score.js';
import { getStoredColleggtibles } from '../utils/database/colleggtiblesRepository.js';
import { simulateScenariosParallel } from '../sim-core/src/predictmaxcs/simulation.js';
import { buildPredictMaxCsVariant, scorePredictMaxCsResult } from './simulation/shared.js';

export const GRADE_ORDER = ['AAA', 'AA'];
export const NOTEWORTHY_RATIO = 0.95;

const DEFAULT_TE = 100;
const GIFT_MINUTES = 10;
const TOKENS_PER_PLAYER = 6;

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
  const variants = gradeSpecs.flatMap(gradeSpec => [true, false].map(usePlayer1Siab => ({
    grade: gradeSpec.grade,
    variant: buildPredictMaxCsVariant({
      ...buildOptions(contract, gradeSpec, colleggtiblesRows),
      usePlayer1Siab,
    }),
  })));
  const scenarios = variants.map(({ variant }) => ({
    players: variant.players,
    playerDeflectors: variant.baselineDeflectors,
    playerConfigs: variant.playerConfigs,
    durationSeconds: variant.durationSeconds,
    targetEggs: variant.targetEggs,
    tokenTimerMinutes: variant.tokenTimerMinutes,
    giftMinutes: variant.giftMinutes,
    gg: variant.gg,
    baseIHR: variant.baseIHR,
    tokensPerPlayer: Array.from({ length: variant.players }, () => TOKENS_PER_PLAYER),
    cxpMode: variant.assumptions.cxpMode,
    gradeMultiplier: variant.gradeMultiplier,
  }));
  const simulations = await simulateScenariosParallel(scenarios, {
    maxWorkers: options.maxWorkers ?? 4,
    onProgress: options.onProgress,
  });
  const scores = variants.map(({ grade, variant }, index) => ({
    grade,
    usePlayer1Siab: variant.usePlayer1Siab,
    score: scorePredictMaxCsResult(simulations[index], variant),
  }));
  const grades = GRADE_ORDER.map(grade => {
    const noSiab = scores.find(entry => entry.grade === grade && !entry.usePlayer1Siab)?.score ?? 0;
    const siab = scores.find(entry => entry.grade === grade && entry.usePlayer1Siab)?.score ?? 0;
    return {
      grade,
      noSiab,
      siab,
      predictedScore: Math.max(noSiab, siab),
      bestVariant: siab > noSiab ? 'SIAB' : 'no SIAB',
    };
  });

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
    simulationsRun: simulations.length,
  };
}

export default { checkOptimalGrade };
