import { getValue, toNumber, getContributorRatePerSecond } from './common.js';

function calculateAverage(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function calculateOfflineSecondsFromContributorTimestamps(contributors) {
  if (!Array.isArray(contributors) || contributors.length === 0) {
    return 0;
  }

  const allNotRecentlyActive = contributors.every(contributor => {
    const recentlyActive = contributor?.recentlyActive ?? contributor?.recently_active;
    return recentlyActive === false;
  });
  if (!allNotRecentlyActive) {
    return 0;
  }

  const candidateSeconds = [];
  for (const contributor of contributors) {
    const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
    const timestamp = toNumber(farmInfo?.timestamp);
    if (Number.isFinite(timestamp) && timestamp < 0) {
      candidateSeconds.push(-timestamp);
    }
  }

  if (candidateSeconds.length === 0) {
    return 0;
  }

  return Math.max(0, calculateAverage(candidateSeconds));
}

function calculateCoopOfflineSeconds(coopStatus, contributors) {
  const lastSync = toNumber(getValue(coopStatus, 'lastSyncDEP', 'last_sync_DEP'));
  const snapshotTime = toNumber(getValue(coopStatus, 'clientTimestamp', 'client_timestamp') ?? (Date.now() / 1000));

  if (!Number.isFinite(lastSync) || !Number.isFinite(snapshotTime)) {
    return calculateOfflineSecondsFromContributorTimestamps(contributors);
  }

  return Math.max(0, snapshotTime - lastSync);
}

function calculateOfflineAdjustedRemainingSeconds(contract, coopStatus, contributors, elapsedSecondsNow) {
  const target = toNumber(contract?.eggGoal);
  if (target == null || target <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const includePending = coopStatus?.allMembersReporting === false;
  const coopTotalAmount = toNumber(coopStatus?.totalAmount ?? coopStatus?.total_amount);

  let adjustedCurrent = 0;
  let rate = 0;

  for (const contributor of contributors) {
    const contributionAmount = getValue(contributor, 'contributionAmount', 'contribution_amount') ?? 0;
    const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
    const delivered = getValue(productionParams, 'delivered', 'delivered');
    const contributionRate = getContributorRatePerSecond(contributor);
    const baselineContribution = Math.max(contributionAmount, delivered ?? contributionAmount);

    let pendingContribution = 0;
    if (includePending && contributionRate > 0 && Number.isFinite(elapsedSecondsNow) && elapsedSecondsNow > 0) {
      const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
      const timestamp = toNumber(farmInfo?.timestamp);
      if (Number.isFinite(timestamp) && timestamp < 0) {
        const pendingSeconds = Math.max(0, Math.min(-timestamp, elapsedSecondsNow));
        pendingContribution = contributionRate * pendingSeconds;
      }
    }

    adjustedCurrent += baselineContribution + pendingContribution;
    rate += contributionRate;
  }

  if (Number.isFinite(coopTotalAmount)) {
    adjustedCurrent = Math.max(adjustedCurrent, coopTotalAmount);
  }

  const remaining = Math.max(target - adjustedCurrent, 0);
  if (remaining <= 0) {
    return 0;
  }

  if (rate <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return remaining / rate;
}

export class BnLeaderboardDurationService {
  calculateTotalDurationSeconds(contract, coopStatus, contributors) {
    const contractLength = toNumber(contract?.coopDurationSeconds);
    const secondsRemaining = getValue(coopStatus, 'secondsRemaining', 'seconds_remaining');
    const secondsSinceAllGoalsAchieved = getValue(coopStatus, 'secondsSinceAllGoalsAchieved', 'seconds_since_all_goals_achieved');
    const allGoalsAchieved = Boolean(coopStatus?.allGoalsAchieved ?? coopStatus?.all_goals_achieved);

    const elapsedSecondsNow = Number.isFinite(contractLength) && Number.isFinite(secondsRemaining)
      ? Math.max(0, contractLength - secondsRemaining)
      : null;

    const remainingSeconds = calculateOfflineAdjustedRemainingSeconds(contract, coopStatus, contributors, elapsedSecondsNow);
    const offlineSeconds = calculateCoopOfflineSeconds(coopStatus, contributors);

    const hasActualCompletion = Number.isFinite(contractLength)
      && Number.isFinite(secondsRemaining)
      && Number.isFinite(secondsSinceAllGoalsAchieved)
      && secondsSinceAllGoalsAchieved >= 0
      && (allGoalsAchieved || secondsSinceAllGoalsAchieved > 0);

    if (hasActualCompletion) {
      return Math.max(0, contractLength - secondsRemaining - secondsSinceAllGoalsAchieved);
    }

    if (Number.isFinite(contractLength) && Number.isFinite(secondsRemaining)) {
      const activeElapsedSeconds = Math.max(0, contractLength - secondsRemaining - offlineSeconds);
      return Math.max(0, activeElapsedSeconds + remainingSeconds);
    }

    return remainingSeconds;
  }

  isCoopFinished(coopStatus) {
    const allGoalsAchieved = Boolean(coopStatus?.allGoalsAchieved ?? coopStatus?.all_goals_achieved);
    const secondsRemaining = getValue(coopStatus, 'secondsRemaining', 'seconds_remaining');
    const secondsSinceAllGoalsAchieved = getValue(coopStatus, 'secondsSinceAllGoalsAchieved', 'seconds_since_all_goals_achieved');

    if (allGoalsAchieved) return true;
    if (Number.isFinite(secondsRemaining) && secondsRemaining <= 0) return true;
    return Number.isFinite(secondsSinceAllGoalsAchieved) && secondsSinceAllGoalsAchieved > 0;
  }
}
