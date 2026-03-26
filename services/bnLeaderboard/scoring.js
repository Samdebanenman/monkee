import { getBtvRate, getTeamwork } from '../../sim-core/src/predictmaxcs/score.js';
import { formatInteger, getContributorRatePerSecond, getValue, toNumber } from './common.js';

const GRADE_MULTIPLIERS = {
  GRADE_C: 1,
  GRADE_B: 2,
  GRADE_A: 3.5,
  GRADE_AA: 5,
  GRADE_AAA: 7,
};

function getSiabInferenceFromBuffHistory(contributor, projectedCompletionSeconds) {
  const buffHistory = Array.isArray(contributor?.buffHistory) ? contributor.buffHistory : [];
  if (buffHistory.length < 2) {
    return { activeSeconds: 0, inferredSiabPercent: 0 };
  }

  const events = buffHistory
    .map(item => ({
      serverTimestamp: toNumber(item?.serverTimestamp ?? item?.server_timestamp),
      eggLayingRate: toNumber(item?.eggLayingRate ?? item?.egg_laying_rate),
      earnings: toNumber(item?.earnings),
    }))
    .filter(item => Number.isFinite(item.serverTimestamp)
      && Number.isFinite(item.eggLayingRate)
      && Number.isFinite(item.earnings))
    .sort((a, b) => a.serverTimestamp - b.serverTimestamp);

  if (events.length < 2) {
    return { activeSeconds: 0, inferredSiabPercent: 0 };
  }

  let bestActiveSeconds = 0;
  let bestInferredPercent = 0;

  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index];
    const next = events[index + 1];
    const elrDelta = Math.abs(current.eggLayingRate - next.eggLayingRate);
    if (elrDelta > 1e-6) continue;

    const earningsDelta = Math.abs(current.earnings - next.earnings);
    if (earningsDelta <= 1e-6) continue;

    const windowSeconds = Math.abs(next.serverTimestamp - current.serverTimestamp);
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) continue;

    const inferredPercent = earningsDelta / 0.0075;
    if (!Number.isFinite(inferredPercent) || inferredPercent <= 0) continue;

    if (windowSeconds > bestActiveSeconds) {
      bestActiveSeconds = windowSeconds;
      bestInferredPercent = inferredPercent;
    }
  }

  return {
    activeSeconds: Math.max(0, Math.min(bestActiveSeconds, projectedCompletionSeconds)),
    inferredSiabPercent: Math.max(0, Math.min(bestInferredPercent, 100)),
  };
}

function getOfflineBacklogSeconds(contributor, elapsedSecondsNow) {
  const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
  const timestamp = toNumber(farmInfo?.timestamp);
  if (!Number.isFinite(timestamp) || timestamp >= 0) return 0;
  return Math.max(0, Math.min(-timestamp, elapsedSecondsNow));
}

function contributionFactor(contributionRatio) {
  if (contributionRatio > 2.5) {
    return 0.02221 * Math.min(contributionRatio, 12.5) + 4.386486;
  }
  return 3 * Math.pow(contributionRatio, 0.15) + 1;
}

function computeCs({ contributionRatio, contractLengthSeconds, completionTimeSeconds, teamwork, grade }) {
  const gradeMultiplier = GRADE_MULTIPLIERS[String(grade ?? '').toUpperCase()] ?? GRADE_MULTIPLIERS.GRADE_AAA;
  const clampedCompletion = Math.max(0, Math.min(completionTimeSeconds, contractLengthSeconds));

  let cs = 1 + (contractLengthSeconds / 259200);
  cs *= gradeMultiplier;
  cs *= contributionFactor(Math.max(0, contributionRatio));
  cs *= 4 * Math.pow((1 - clampedCompletion / contractLengthSeconds), 3) + 1;
  cs *= (0.19 * teamwork + 1);
  cs *= 1.05;
  return Math.ceil(cs * 187.5);
}

export class BnLeaderboardScoringService {
  constructor({ artifactsService }) {
    this.artifactsService = artifactsService;
  }

  calculateTotalTokens(contributors) {
    let total = 0;
    for (const contributor of contributors) {
      total += getValue(contributor, 'boostTokens', 'boost_tokens') ?? 0;
    }
    return total;
  }

  calculateTotalDeliveryRatePerHour(contributors) {
    let perSecond = 0;
    for (const contributor of contributors) {
      perSecond += getContributorRatePerSecond(contributor);
    }
    return perSecond * 3600;
  }

  calculateCsSummary(contract, coopStatus, contributors) {
    const goal3 = toNumber(contract?.eggGoal);
    const contractLengthSeconds = toNumber(contract?.coopDurationSeconds);
    if (!Number.isFinite(goal3) || goal3 <= 0 || !Number.isFinite(contractLengthSeconds) || contractLengthSeconds <= 0) {
      return {
        maxCs: null,
        meanCs: null,
        maxCsLabel: '--',
        meanCsLabel: '--',
      };
    }

    const maxCoopSizeRaw = toNumber(contract?.maxCoopSize ?? contract?.max_coop_size);
    const maxCoopSize = Math.max(1, Math.round(Number.isFinite(maxCoopSizeRaw) ? maxCoopSizeRaw : contributors.length));
    const totalAmountNow = toNumber(coopStatus?.totalAmount ?? coopStatus?.total_amount) ?? 0;
    const secondsRemaining = getValue(coopStatus, 'secondsRemaining', 'seconds_remaining') ?? 0;
    const secondsSinceAllGoalsAchieved = getValue(coopStatus, 'secondsSinceAllGoalsAchieved', 'seconds_since_all_goals_achieved');
    const allGoalsAchieved = Boolean(coopStatus?.allGoalsAchieved ?? coopStatus?.all_goals_achieved);
    const includePending = coopStatus?.allMembersReporting === false;
    const elapsedSecondsNow = Math.max(0, contractLengthSeconds - secondsRemaining);

    const contributorsWithBacklog = contributors.map(contributor => {
      const contributionRate = getContributorRatePerSecond(contributor);
      const contributionAmount = getValue(contributor, 'contributionAmount', 'contribution_amount') ?? 0;
      const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
      const delivered = getValue(productionParams, 'delivered', 'delivered');
      const contributionNow = Math.max(contributionAmount, delivered ?? contributionAmount);
      const backlogSeconds = includePending ? getOfflineBacklogSeconds(contributor, elapsedSecondsNow) : 0;
      const pendingContribution = contributionRate * backlogSeconds;

      return {
        contributor,
        contributionRate,
        contributionNow,
        pendingContribution,
      };
    });

    const pendingTotal = contributorsWithBacklog.reduce((sum, item) => sum + item.pendingContribution, 0);
    const adjustedTotalNow = totalAmountNow + pendingTotal;
    const totalRatePerSecond = contributorsWithBacklog.reduce((sum, item) => sum + item.contributionRate, 0);
    const eggsRemaining = Math.max(0, goal3 - adjustedTotalNow);
    const rawSecondsToGoal = totalRatePerSecond > 0 ? eggsRemaining / totalRatePerSecond : Number.POSITIVE_INFINITY;
    const secondsLeftInContract = Math.max(0, contractLengthSeconds - elapsedSecondsNow);
    const projectedSecondsToGoal = Math.min(rawSecondsToGoal, secondsLeftInContract);

    const hasActualCompletion = Number.isFinite(contractLengthSeconds)
      && Number.isFinite(secondsRemaining)
      && Number.isFinite(secondsSinceAllGoalsAchieved)
      && secondsSinceAllGoalsAchieved >= 0
      && (allGoalsAchieved || secondsSinceAllGoalsAchieved > 0);

    const projectedCompletion = hasActualCompletion
      ? Math.max(0, contractLengthSeconds - secondsRemaining - secondsSinceAllGoalsAchieved)
      : Math.min(contractLengthSeconds, elapsedSecondsNow + projectedSecondsToGoal);

    const projectedTotalAmount = adjustedTotalNow + totalRatePerSecond * projectedSecondsToGoal;
    const contributionDenominator = Math.min(goal3, Math.max(projectedTotalAmount, 1));
    const grade = String(coopStatus?.grade ?? contract?.grade ?? 'GRADE_AAA');

    const scoreRows = contributorsWithBacklog.map(item => {
      const { contributor, contributionRate, contributionNow, pendingContribution } = item;
      const projectedContribution = contributionNow + pendingContribution + contributionRate * projectedSecondsToGoal;
      const contributionRatio = projectedContribution * maxCoopSize / contributionDenominator;

      const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
      const { deflectorPercent, siabPercent } = this.artifactsService.getBestArtifactPercentsForCs(farmInfo);

      const siabFromArtifacts = Math.max(0, siabPercent);
      const siabInference = getSiabInferenceFromBuffHistory(contributor, projectedCompletion);
      const effectiveSiabPercent = siabFromArtifacts > 0 ? siabFromArtifacts : siabInference.inferredSiabPercent;

      const rateWithoutSiab = getBtvRate(deflectorPercent, 0, true);
      const rateWithSiab = getBtvRate(deflectorPercent, effectiveSiabPercent, true);
      const siabRateDelta = Math.max(0, rateWithSiab - rateWithoutSiab);
      const inferredOnly = siabFromArtifacts <= 0 && effectiveSiabPercent > 0;
      const siabActiveSeconds = siabRateDelta > 0
        ? (inferredOnly
          ? Math.min(projectedCompletion, siabInference.activeSeconds || projectedCompletion)
          : projectedCompletion)
        : 0;

      const predBuff = rateWithoutSiab * projectedCompletion + siabRateDelta * siabActiveSeconds;
      const effectiveBtvRate = projectedCompletion > 0 ? predBuff / projectedCompletion : rateWithSiab;

      const teamwork = getTeamwork(
        effectiveBtvRate,
        maxCoopSize,
        contractLengthSeconds / 86400,
        Math.min(maxCoopSize - 1, 20),
        0,
        true
      );

      return {
        cs: computeCs({
          contributionRatio,
          contractLengthSeconds,
          completionTimeSeconds: projectedCompletion,
          teamwork,
          grade,
        }),
      };
    });

    if (scoreRows.length === 0) {
      return {
        maxCs: null,
        meanCs: null,
        maxCsLabel: '--',
        meanCsLabel: '--',
      };
    }

    const scores = scoreRows.map(row => row.cs);
    const maxCs = Math.max(...scores);
    const meanCs = scores.reduce((sum, value) => sum + value, 0) / scores.length;

    return {
      maxCs,
      meanCs,
      maxCsLabel: formatInteger(maxCs),
      meanCsLabel: formatInteger(Math.round(meanCs)),
    };
  }
}
