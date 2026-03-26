export function toNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function getValue(source, camelKey, snakeKey) {
  if (!source || typeof source !== 'object') return null;
  const direct = source[camelKey];
  if (Number.isFinite(direct)) return direct;
  const fallback = source[snakeKey];
  return Number.isFinite(fallback) ? fallback : null;
}

export function getArray(source, camelKey, snakeKey) {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source[camelKey])) return source[camelKey];
  if (Array.isArray(source[snakeKey])) return source[snakeKey];
  return [];
}

export function formatDurationYdhm(seconds) {
  if (!Number.isFinite(seconds)) return '--';
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const minutesPerYear = 365 * 24 * 60;
  const minutesPerDay = 24 * 60;

  const years = Math.floor(totalMinutes / minutesPerYear);
  if (years > 0) return `${years}y`;

  const afterYears = totalMinutes % minutesPerYear;
  const days = Math.floor(afterYears / minutesPerDay);
  const afterDays = afterYears % minutesPerDay;
  const hours = Math.floor(afterDays / 60);
  const minutes = afterDays % 60;

  if (days > 0) return `${days}d${hours}h${minutes}m`;
  return `${hours}h${minutes}m`;
}

export function formatInteger(value) {
  const num = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatRatePerHour(valuePerHour) {
  const num = Number(valuePerHour);
  if (!Number.isFinite(num) || num <= 0) {
    return '0';
  }

  const suffixes = ['', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S'];
  let scaled = num;
  let index = 0;

  while (scaled >= 1000 && index < suffixes.length - 1) {
    scaled /= 1000;
    index += 1;
  }

  let decimals = 2;
  if (scaled >= 100) {
    decimals = 0;
  } else if (scaled >= 10) {
    decimals = 1;
  }

  return `${scaled.toFixed(decimals)}${suffixes[index]}`;
}

export function getContributorRatePerSecond(contributor) {
  const contributionRate = getValue(contributor, 'contributionRate', 'contribution_rate');
  if (Number.isFinite(contributionRate) && contributionRate > 0) {
    return contributionRate;
  }

  const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
  const sr = getValue(productionParams, 'sr', 'sr');
  if (Number.isFinite(sr) && sr > 0) {
    return sr;
  }

  return 0;
}
