import { DateTime } from 'luxon';

const SEASON_PATTERN = /^([a-z]+)_(\d{4})$/i;

function toUtcSeconds(year, month, day) {
  return DateTime.utc(year, month, day).toSeconds();
}

export function parseSeasonKey(seasonKey) {
  if (!seasonKey) return null;

  const match = SEASON_PATTERN.exec(String(seasonKey).trim());
  if (!match) return null;

  const label = match[1].toLowerCase() === 'autumn' ? 'fall' : match[1].toLowerCase();
  const year = Number(match[2]);
  return Number.isInteger(year) ? { label, year } : null;
}

export function getAstronomicalSeasonRange(seasonKey) {
  const parsed = parseSeasonKey(seasonKey);
  if (!parsed) return null;

  const { label, year } = parsed;

  switch (label) {
    case 'spring':
      return { start: toUtcSeconds(year, 3, 20), endExclusive: toUtcSeconds(year, 6, 21) };
    case 'summer':
      return { start: toUtcSeconds(year, 6, 21), endExclusive: toUtcSeconds(year, 9, 22) };
    case 'fall':
      return { start: toUtcSeconds(year, 9, 22), endExclusive: toUtcSeconds(year, 12, 21) };
    case 'winter':
      return { start: toUtcSeconds(year - 1, 12, 21), endExclusive: toUtcSeconds(year, 3, 20) };
    default:
      return null;
  }
}

export function getCurrentAstronomicalSeason(nowSeconds = Date.now() / 1000) {
  const normalizedNow = Number.isFinite(nowSeconds) ? nowSeconds : Date.now() / 1000;
  const now = DateTime.fromSeconds(normalizedNow, { zone: 'utc' });
  const year = now.year;
  const springStart = toUtcSeconds(year, 3, 20);
  const summerStart = toUtcSeconds(year, 6, 21);
  const fallStart = toUtcSeconds(year, 9, 22);
  const winterStart = toUtcSeconds(year, 12, 21);

  let key;
  if (normalizedNow < springStart) {
    key = `winter_${year}`;
  } else if (normalizedNow < summerStart) {
    key = `spring_${year}`;
  } else if (normalizedNow < fallStart) {
    key = `summer_${year}`;
  } else if (normalizedNow < winterStart) {
    key = `fall_${year}`;
  } else {
    key = `winter_${year + 1}`;
  }

  return { key, ...getAstronomicalSeasonRange(key) };
}

export default {
  parseSeasonKey,
  getAstronomicalSeasonRange,
  getCurrentAstronomicalSeason,
};
