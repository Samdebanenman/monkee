import { DateTime } from 'luxon';
import { getContractHistoryForMember } from '../utils/database/contractHistoryRepository.js';
import { getCurrentAstronomicalSeason } from '../utils/seasons.js';

export const DEFAULT_HISTORY_SCOPE = '1-month';

export const HISTORY_CHOICES = Object.freeze([
  { name: '1 month', value: '1-month' },
  { name: '3 months', value: '3-months' },
  { name: 'this season - seasonal', value: 'this-season-seasonal' },
  { name: 'this season - all', value: 'this-season-all' },
  { name: 'total - seasonal', value: 'total-seasonal' },
  { name: 'total - all', value: 'total-all' },
]);

const HISTORY_SCOPE_VALUES = new Set(HISTORY_CHOICES.map(choice => choice.value));
const HISTORY_TIMELINES = new Map(HISTORY_CHOICES.map(choice => [choice.value, choice.name]));

export function buildContractHistoryFilter(scope = DEFAULT_HISTORY_SCOPE, nowSeconds = Date.now() / 1000) {
  const normalizedScope = HISTORY_SCOPE_VALUES.has(scope) ? scope : DEFAULT_HISTORY_SCOPE;
  const now = DateTime.fromSeconds(nowSeconds, { zone: 'utc' });
  const timeline = HISTORY_TIMELINES.get(normalizedScope);

  switch (normalizedScope) {
    case '3-months':
      return {
        scope: normalizedScope,
        timeline,
        criteria: { releasedAfter: now.minus({ months: 3 }).toSeconds() },
      };
    case 'this-season-seasonal': {
      const season = getCurrentAstronomicalSeason(nowSeconds);
      return {
        scope: normalizedScope,
        timeline,
        criteria: { seasonalOnly: true, season: season.key },
      };
    }
    case 'this-season-all': {
      const season = getCurrentAstronomicalSeason(nowSeconds);
      return {
        scope: normalizedScope,
        timeline,
        criteria: {
          releasedAfter: season.start,
          releasedBefore: season.endExclusive,
        },
      };
    }
    case 'total-seasonal':
      return {
        scope: normalizedScope,
        timeline,
        criteria: { seasonalOnly: true },
      };
    case 'total-all':
      return {
        scope: normalizedScope,
        timeline,
        criteria: {},
      };
    case '1-month':
    default:
      return {
        scope: DEFAULT_HISTORY_SCOPE,
        timeline,
        criteria: { releasedAfter: now.minus({ months: 1 }).toSeconds() },
      };
  }
}

export function fetchContractHistory({
  discordId,
  scope = DEFAULT_HISTORY_SCOPE,
  nowSeconds = Date.now() / 1000,
} = {}) {
  const { criteria, ...report } = buildContractHistoryFilter(scope, nowSeconds);
  const rows = getContractHistoryForMember(discordId, criteria);
  return { ...report, rows };
}

export default {
  DEFAULT_HISTORY_SCOPE,
  HISTORY_CHOICES,
  buildContractHistoryFilter,
  fetchContractHistory,
};
