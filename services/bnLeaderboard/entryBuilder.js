import {
  formatDurationYdhm,
  formatInteger,
  formatRatePerHour,
} from './common.js';
import { BnLeaderboardArtifactsService } from './artifacts.js';
import { BnLeaderboardAuditService } from './audit.js';
import { BnLeaderboardDurationService } from './duration.js';
import { BnLeaderboardScoringService } from './scoring.js';

function normalizeDuration(durationSeconds) {
  const label = formatDurationYdhm(durationSeconds);
  if (label === '0h0m') {
    return {
      durationSeconds: Number.POSITIVE_INFINITY,
      durationLabel: '--',
    };
  }

  return { durationSeconds, durationLabel: label };
}

function toStatusLabel({ isSavedCoop, auditPassed, isFinished }) {
  const labels = [auditPassed ? '✓' : '✗'];
  if (!isSavedCoop) {
    labels.push('⚠︎');
  }
  labels.push(isFinished ? '🏳' : '⌛︎');
  return labels.join(' ');
}

export class BnLeaderboardEntryBuilder {
  constructor() {
    this.artifactsService = new BnLeaderboardArtifactsService();
    this.auditService = new BnLeaderboardAuditService({ artifactsService: this.artifactsService });
    this.durationService = new BnLeaderboardDurationService();
    this.scoringService = new BnLeaderboardScoringService({ artifactsService: this.artifactsService });
  }

  build({ contract, coopStatus, coop, isSavedCoop = false }) {
    const contributors = Array.isArray(coopStatus?.contributors) ? coopStatus.contributors : [];
    if (contributors.length === 0) {
      return null;
    }

    const auditFailures = this.auditService.collectAuditFailures(contributors);
    const auditPassed = auditFailures.length === 0;
    const isFinished = this.durationService.isCoopFinished(coopStatus);

    const rawDurationSeconds = this.durationService.calculateTotalDurationSeconds(contract, coopStatus, contributors);
    const { durationSeconds, durationLabel } = normalizeDuration(rawDurationSeconds);

    const totalTokens = this.scoringService.calculateTotalTokens(contributors);
    const deliveryRatePerHour = this.scoringService.calculateTotalDeliveryRatePerHour(contributors);
    const csSummary = this.scoringService.calculateCsSummary(contract, coopStatus, contributors);

    return {
      coop,
      durationSeconds,
      durationLabel,
      tokens: totalTokens,
      tokensLabel: formatInteger(totalTokens),
      deliveryRatePerHour,
      deliveryRateLabel: formatRatePerHour(deliveryRatePerHour),
      maxCs: csSummary.maxCs,
      meanCs: csSummary.meanCs,
      maxCsLabel: csSummary.maxCsLabel,
      meanCsLabel: csSummary.meanCsLabel,
      auditFailures,
      status: toStatusLabel({ isSavedCoop, auditPassed, isFinished }),
    };
  }
}
