import { getAssumptions } from '../sim-core/src/predictmaxcs/model.js';
import { getGradeMultiplier } from '../sim-core/src/predictmaxcs/score.js';
import { simulateScenariosParallel } from '../sim-core/src/predictmaxcs/simulation.js';
import { getStoredColleggtibles } from '../utils/database/colleggtiblesRepository.js';
import {
  buildPredictMaxCsVariant,
  scorePredictMaxCsResult,
} from './simOrchestrator/shared.js';

export const GRADE_ORDER = ['C', 'B', 'A', 'AA', 'AAA'];
export const NOTEWORTHY_RATIO = 0.95;

const DEFAULT_TE = 100;
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

function buildVariant(contract, gradeSpec, usePlayer1Siab, colleggtiblesRows) {
  const players = Math.floor(contract.maxCoopSize);
  const assumptions = getAssumptions(Array.from({ length: players }, () => DEFAULT_TE));
  return buildPredictMaxCsVariant({
    players,
    durationSeconds: gradeSpec.coopDurationSeconds,
    targetEggs: gradeSpec.eggGoal,
    tokenTimerMinutes: contract.minutesPerToken,
    giftMinutes: 0,
    gg: false,
    assumptions,
    usePlayer1Siab,
    modifierType: gradeSpec.modifierType,
    modifierValue: gradeSpec.modifierValue,
    colleggtiblesRows,
    gradeMultiplier: getGradeMultiplier(gradeSpec.grade),
  });
}

function buildScenario(variant) {
  return {
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
  };
}

export async function checkOptimalGrade(contract, options = {}) {
  const gradeSpecs = normalizeGradeSpecs(contract);
  const invalidReason = validateContract(contract, gradeSpecs);
  if (invalidReason) {
    return { ok: false, contractId: contract?.id ?? null, reason: invalidReason };
  }

  const colleggtiblesRows = options.colleggtiblesRows ?? getStoredColleggtibles();
  const entries = gradeSpecs.flatMap(gradeSpec => [false, true].map(usePlayer1Siab => ({
    gradeSpec,
    usePlayer1Siab,
    variant: buildVariant(contract, gradeSpec, usePlayer1Siab, colleggtiblesRows),
  })));
  const scenarios = entries.map(entry => buildScenario(entry.variant));
  const simulations = await simulateScenariosParallel(scenarios, {
    onProgress: options.onProgress,
  });

  const scores = entries.map((entry, index) => ({
    grade: entry.gradeSpec.grade,
    usePlayer1Siab: entry.usePlayer1Siab,
    score: scorePredictMaxCsResult(simulations[index], entry.variant),
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
