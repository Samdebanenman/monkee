import { fetchContractSummaries } from './contractService.js';
import { getCoopAvailability, getCoopStatus, listCoops } from './coopService.js';
import { hasKnownMembersForContributors } from './memberService.js';

const CODE_SUFFIXES = ['oo', 'ooo'];
const MAX_INCREMENT_PREFIX = 100;
const REQUIRED_ARTIFACT_ENUMS = new Set([26, 24, 27, 8]);
const REQUIRED_ARTIFACT_NAMES = new Set([
  'TACHYON_DEFLECTOR',
  'QUANTUM_METRONOME',
  'INTERSTELLAR_COMPASS',
  'ORNATE_GUSSET',
]);
const ALLOWED_STONE_NAMES = new Set(['TACHYON_STONE', 'QUANTUM_STONE']);
const STONE_NAME_BY_ENUM = new Map([
  [1, 'TACHYON_STONE'],
  [36, 'QUANTUM_STONE'],
]);
const ARTIFACT_NAME_BY_ENUM = new Map([
  [26, 'TACHYON_DEFLECTOR'],
  [24, 'QUANTUM_METRONOME'],
  [27, 'INTERSTELLAR_COMPASS'],
  [8, 'ORNATE_GUSSET'],
]);
const ARTIFACT_STONE_SLOT_CAPS = new Map([
  ['TACHYON_DEFLECTOR', 2],
  ['QUANTUM_METRONOME', 3],
  ['INTERSTELLAR_COMPASS', 2],
  ['ORNATE_GUSSET', 3],
]);
const RARITY_SLOT_CAPS = new Map([
  [0, 0], // COMMON
  [1, 1], // RARE
  [2, 2], // EPIC
  [3, 3], // LEGENDARY
]);
const STONE_LEVEL_NORMAL = 2;
const REQUIRED_RESEARCH_LEVELS = new Map([
  ['comfy_nests', 50],
  ['hab_capacity1', 8],
  ['leafsprings', 30],
  ['vehicle_reliablity', 2],
  ['hen_house_ac', 50],
  ['microlux', 10],
  ['lightweight_boxes', 40],
  ['excoskeletons', 2],
  ['improved_genetics', 30],
  ['traffic_management', 2],
  ['driver_training', 30],
  ['egg_loading_bots', 2],
  ['super_alloy', 50],
  ['quantum_storage', 20],
  ['time_compress', 20],
  ['hover_upgrades', 25],
  ['grav_plating', 25],
  ['autonomous_vehicles', 5],
  ['dark_containment', 25],
  ['timeline_diversion', 50],
  ['wormhole_dampening', 25],
  ['micro_coupling', 5],
  ['neural_net_refine', 25],
  ['hyper_portalling', 25],
  ['relativity_optimization', 10],
]);

function buildExtendedPlusCodes() {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(97 + index));
  const digits = Array.from({ length: 10 }, (_, index) => String(index));
  const prefixes = [...letters, '-', ...digits];
  return prefixes.flatMap(prefix => CODE_SUFFIXES.map(suffix => `${prefix}${suffix}`));
}

function toNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function getValue(source, camelKey, snakeKey) {
  if (!source || typeof source !== 'object') return null;
  const direct = source[camelKey];
  if (Number.isFinite(direct)) return direct;
  const fallback = source[snakeKey];
  return Number.isFinite(fallback) ? fallback : null;
}

function getArray(source, camelKey, snakeKey) {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source[camelKey])) return source[camelKey];
  if (Array.isArray(source[snakeKey])) return source[snakeKey];
  return [];
}

function formatDurationYdhm(seconds) {
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

function formatInteger(value) {
  const num = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return new Intl.NumberFormat('en-US').format(num);
}

function formatRatePerHour(valuePerHour) {
  const num = Number(valuePerHour);
  if (!Number.isFinite(num) || num <= 0) {
    return `0`;
  }

  const suffixes = [
    '', 'K', 'M', 'B', 'T', 'q', 'Q', 's', 'S',
  ];

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

function auditResearchLevels(commonResearch) {
  const levels = new Map();

  for (const item of commonResearch) {
    const id = String(item?.id ?? '').trim();
    const level = toNumber(item?.level);
    if (!id || level == null) continue;
    levels.set(id, level);
  }

  for (const [id, level] of REQUIRED_RESEARCH_LEVELS.entries()) {
    if (levels.get(id) !== level) return false;
  }

  return true;
}

function auditArtifacts(equippedArtifacts) {
  const foundNames = new Set();
  const foundEnums = new Set();

  for (const artifact of equippedArtifacts) {
    const spec = artifact?.spec ?? {};
    const nameValue = spec?.name;

    if (typeof nameValue === 'string') {
      foundNames.add(nameValue);
      continue;
    }

    if (Number.isFinite(nameValue)) {
      foundEnums.add(nameValue);
    }
  }

  const hasAllNames = [...REQUIRED_ARTIFACT_NAMES].every(name => foundNames.has(name));
  const hasAllEnums = [...REQUIRED_ARTIFACT_ENUMS].every(value => foundEnums.has(value));

  return hasAllNames || hasAllEnums;
}

function normalizeStoneName(nameValue) {
  if (typeof nameValue === 'string') {
    return nameValue;
  }

  if (Number.isFinite(nameValue)) {
    return STONE_NAME_BY_ENUM.get(Number(nameValue)) ?? null;
  }

  return null;
}

function normalizeStoneLevel(levelValue) {
  if (typeof levelValue === 'string') {
    return levelValue.toUpperCase() === 'NORMAL' ? STONE_LEVEL_NORMAL : null;
  }

  if (Number.isFinite(levelValue)) {
    return Number(levelValue);
  }

  return null;
}

function normalizeArtifactName(nameValue) {
  if (typeof nameValue === 'string') {
    return nameValue;
  }

  if (Number.isFinite(nameValue)) {
    return ARTIFACT_NAME_BY_ENUM.get(Number(nameValue)) ?? null;
  }

  return null;
}

function normalizeRarity(rarityValue) {
  if (typeof rarityValue === 'string') {
    const upper = rarityValue.toUpperCase();
    if (upper === 'COMMON') return 0;
    if (upper === 'RARE') return 1;
    if (upper === 'EPIC') return 2;
    if (upper === 'LEGENDARY') return 3;
    return null;
  }

  if (Number.isFinite(rarityValue)) {
    return Number(rarityValue);
  }

  // Missing rarity is treated as legendary for backward compatibility with older payload mocks.
  return 3;
}

function getArtifactStoneSlotCap(artifact) {
  const spec = artifact?.spec ?? {};
  const artifactName = normalizeArtifactName(spec?.name);
  const artifactCap = ARTIFACT_STONE_SLOT_CAPS.get(artifactName ?? '') ?? 0;
  const rarity = normalizeRarity(spec?.rarity);
  const rarityCap = RARITY_SLOT_CAPS.get(rarity) ?? 0;

  return Math.min(artifactCap, rarityCap);
}

function collectContributorStones(equippedArtifacts) {
  const stones = [];
  let totalAllowedSlots = 0;
  let totalEquippedStones = 0;
  const artifactBreakdown = [];

  for (const artifact of equippedArtifacts) {
    const artifactStones = Array.isArray(artifact?.stones) ? artifact.stones : [];
    const slotCap = getArtifactStoneSlotCap(artifact);
    const artifactName = normalizeArtifactName(artifact?.spec?.name) ?? 'UNKNOWN_ARTIFACT';

    const normalizedStones = artifactStones.map(stone => {
      const spec = stone?.spec ?? stone ?? {};
      const name = normalizeStoneName(spec?.name);
      const level = normalizeStoneLevel(spec?.level);
      return { name, level };
    });

    artifactBreakdown.push({
      artifactName,
      slotCap,
      equippedCount: artifactStones.length,
      stones: normalizedStones,
    });

    totalAllowedSlots += slotCap;
    totalEquippedStones += artifactStones.length;

    if (artifactStones.length > slotCap) {
      return {
        stones,
        artifactBreakdown,
        totalAllowedSlots,
        totalEquippedStones,
        hasOverfilledArtifact: true,
      };
    }

    for (const stone of normalizedStones) {
      const { name, level } = stone;
      stones.push({ name, level });
    }
  }

  return {
    stones,
    artifactBreakdown,
    totalAllowedSlots,
    totalEquippedStones,
    hasOverfilledArtifact: false,
  };
}

function getEffectiveLayingRate(productionParams) {
  const elrRaw = getValue(productionParams, 'elr', 'elr');
  const farmPopulation = getValue(productionParams, 'farmPopulation', 'farm_population');
  const sr = getValue(productionParams, 'sr', 'sr');

  const elrScaled = Number.isFinite(elrRaw) && Number.isFinite(farmPopulation) && farmPopulation > 0
    ? elrRaw * farmPopulation
    : null;

  let elrEffective = elrRaw;
  let elrSource = 'raw';

  if (Number.isFinite(elrRaw) && Number.isFinite(elrScaled) && Number.isFinite(sr) && sr > 0) {
    const rawDistance = Math.abs(sr - elrRaw);
    const scaledDistance = Math.abs(sr - elrScaled);
    if (scaledDistance < rawDistance) {
      elrEffective = elrScaled;
      elrSource = 'scaled-by-farmPopulation';
    }
  }

  return {
    elrRaw,
    farmPopulation,
    elrScaled,
    elrEffective,
    elrSource,
  };
}

function auditStoneSetup(productionParams, equippedArtifacts) {
  const {
    stones,
    artifactBreakdown,
    totalAllowedSlots,
    totalEquippedStones,
    hasOverfilledArtifact,
  } = collectContributorStones(equippedArtifacts);

  const { elrEffective } = getEffectiveLayingRate(productionParams);
  const sr = getValue(productionParams, 'sr', 'sr');
  const maxRate = Number.isFinite(elrEffective) && Number.isFinite(sr) ? Math.max(elrEffective, sr) : null;
  const diffRatio = Number.isFinite(maxRate) && maxRate > 0 ? Math.abs(elrEffective - sr) / maxRate : null;

  if (hasOverfilledArtifact) {
    return 'equipped stones exceed available artifact slots';
  }

  if (totalAllowedSlots <= 0) {
    return 'no available stone slots for equipped artifacts';
  }

  if (stones.length === 0) {
    return 'no stones equipped';
  }

  const hasInvalidStone = stones.some(stone => !ALLOWED_STONE_NAMES.has(stone.name ?? ''));
  if (hasInvalidStone) {
    return 'all stones must be Tachyon stone or Quantum stone';
  }

  const hasInvalidLevel = stones.some(stone => stone.level !== STONE_LEVEL_NORMAL);
  if (hasInvalidLevel) {
    return 'all stones must be level 2';
  }

  if (!Number.isFinite(elrEffective) || !Number.isFinite(sr) || elrEffective <= 0 || sr <= 0) {
    return 'missing sr/elr for stone balance check';
  }

  if (diffRatio <= 0.05) {
    return null;
  }

  const totalStones = stones.length;
  const quantumStones = stones.filter(stone => stone.name === 'QUANTUM_STONE').length;
  const tachyonStones = stones.filter(stone => stone.name === 'TACHYON_STONE').length;

  const shippingCapped = elrEffective > sr;
  const layingCapped = sr > elrEffective;

  const allSlotsFilled = totalEquippedStones === totalAllowedSlots;

  if (shippingCapped && allSlotsFilled && quantumStones === totalStones) {
    return null;
  }

  if (layingCapped && allSlotsFilled && tachyonStones === totalStones) {
    return null;
  }

  if (shippingCapped) {
    return 'sr/elr mismatch >5%; swap one stone toward QUANTUM_STONE';
  }

  return 'sr/elr mismatch >5%; swap one stone toward TACHYON_STONE';
}

function auditContributor(contributor) {
  const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
  const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
  const failures = [];

  const farmPopulation = getValue(productionParams, 'farmPopulation', 'farm_population');
  const farmCapacity = getValue(productionParams, 'farmCapacity', 'farm_capacity');
  if (farmPopulation == null || farmCapacity == null || farmPopulation !== farmCapacity) {
    failures.push('full habs');
  }

  const habs = getArray(farmInfo, 'habs', 'habs');
  const habsInvalid = habs.length !== 4 || habs.some(hab => Number(hab) !== 18);

  const vehicles = getArray(farmInfo, 'vehicles', 'vehicles');
  const vehiclesInvalid = vehicles.length !== 17 || vehicles.some(vehicle => Number(vehicle) !== 11);

  const trainLength = getArray(farmInfo, 'trainLength', 'train_length');
  const trainLengthInvalid = trainLength.length !== 17 || trainLength.some(length => Number(length) !== 10);

  if (habsInvalid) {
    failures.push('habs');
  }

  if (vehiclesInvalid || trainLengthInvalid) {
    failures.push('vehicles');
  }

  const silosOwned = getValue(farmInfo, 'silosOwned', 'silos_owned');
  if (silosOwned !== 10) {
    failures.push('silos');
  }

  const commonResearch = getArray(farmInfo, 'commonResearch', 'common_research');
  if (!auditResearchLevels(commonResearch)) {
    failures.push('research');
  }

  const equippedArtifacts = getArray(farmInfo, 'equippedArtifacts', 'equipped_artifacts');
  if (!auditArtifacts(equippedArtifacts)) {
    failures.push('artifacts');
  }

  const stoneFailure = auditStoneSetup(productionParams, equippedArtifacts);
  if (stoneFailure) {
    failures.push('stones');
  }

  return failures;
}

function collectAuditFailures(contributors) {
  if (!Array.isArray(contributors) || contributors.length === 0) {
    return [{ contributor: 'unknown', reasons: ['no contributors'] }];
  }

  const details = [];
  for (const contributor of contributors) {
    const contributorName = String(contributor?.userName ?? contributor?.user_name ?? 'unknown').trim() || 'unknown';
    const reasons = auditContributor(contributor);
    if (reasons.length > 0) {
      details.push({ contributor: contributorName, reasons });
    }
  }

  return details;
}

function calculateOfflineAdjustedRemainingSeconds(contract, contributors) {
  const target = toNumber(contract?.eggGoal);
  if (target == null || target <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let adjustedCurrent = 0;
  let rate = 0;
  for (const contributor of contributors) {
    const contributionAmount = getValue(contributor, 'contributionAmount', 'contribution_amount') ?? 0;
    const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
    const delivered = getValue(productionParams, 'delivered', 'delivered');
    adjustedCurrent += Math.max(contributionAmount, delivered ?? contributionAmount);
    rate += getValue(contributor, 'contributionRate', 'contribution_rate') ?? 0;
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

function normalizeEpochSeconds(value) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

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
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    // In coop status payloads this is often negative seconds relative to "now".
    if (timestamp < 0) {
      candidateSeconds.push(-timestamp);
    }
  }

  if (candidateSeconds.length === 0) {
    return 0;
  }

  return Math.max(0, calculateAverage(candidateSeconds));
}

function calculateCoopOfflineSeconds(coopStatus, contributors) {
  const lastSync = normalizeEpochSeconds(getValue(coopStatus, 'lastSyncDEP', 'last_sync_DEP'));
  if (!Number.isFinite(lastSync)) {
    return calculateOfflineSecondsFromContributorTimestamps(contributors);
  }

  const snapshotTime = normalizeEpochSeconds(
    getValue(coopStatus, 'clientTimestamp', 'client_timestamp') ?? (Date.now() / 1000)
  );
  if (!Number.isFinite(snapshotTime)) {
    return calculateOfflineSecondsFromContributorTimestamps(contributors);
  }

  return Math.max(0, snapshotTime - lastSync);
}

function calculateTotalDurationSeconds(contract, coopStatus, contributors) {
  const contractLength = toNumber(contract?.coopDurationSeconds);
  const secondsRemaining = getValue(coopStatus, 'secondsRemaining', 'seconds_remaining');
  const secondsSinceAllGoalsAchieved = getValue(
    coopStatus,
    'secondsSinceAllGoalsAchieved',
    'seconds_since_all_goals_achieved'
  );
  const allGoalsAchieved = Boolean(coopStatus?.allGoalsAchieved ?? coopStatus?.all_goals_achieved);
  const remainingSeconds = calculateOfflineAdjustedRemainingSeconds(contract, contributors);
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

function normalizeDuration(durationSeconds) {
  const label = formatDurationYdhm(durationSeconds);
  if (label === '0h0m') {
    return {
      durationSeconds: Number.POSITIVE_INFINITY,
      durationLabel: '--',
    };
  }

  return {
    durationSeconds,
    durationLabel: label,
  };
}

function calculateTotalTokens(contributors) {
  let total = 0;
  for (const contributor of contributors) {
    total += getValue(contributor, 'boostTokens', 'boost_tokens') ?? 0;
  }
  return total;
}

function calculateTotalDeliveryRatePerHour(contributors) {
  let perSecond = 0;
  for (const contributor of contributors) {
    perSecond += getValue(contributor, 'contributionRate', 'contribution_rate') ?? 0;
  }
  return perSecond * 3600;
}

function isCoopFinished(coopStatus) {
  const allGoalsAchieved = Boolean(coopStatus?.allGoalsAchieved ?? coopStatus?.all_goals_achieved);
  const secondsRemaining = getValue(coopStatus, 'secondsRemaining', 'seconds_remaining');
  const secondsSinceAllGoalsAchieved = getValue(
    coopStatus,
    'secondsSinceAllGoalsAchieved',
    'seconds_since_all_goals_achieved'
  );

  if (allGoalsAchieved) return true;
  if (Number.isFinite(secondsRemaining) && secondsRemaining <= 0) return true;
  return Number.isFinite(secondsSinceAllGoalsAchieved) && secondsSinceAllGoalsAchieved > 0;
}

function toStatusLabel({ isSavedCoop, auditPassed, isFinished }) {
  const labels = [];

  if (!isSavedCoop) {
    labels.push('⚠︎ ');
  }

  labels.push(auditPassed ? '✓' : '✗');
  labels.push(isFinished ? '🏳' : '⌛︎ ');
  return labels.join(' ');
}

async function isFreeCoop(contractId, coopCode, cache) {
  const key = coopCode.toLowerCase();
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await getCoopAvailability(contractId, coopCode);
  const status = result?.error
    ? { state: 'unknown', error: result.error }
    : { state: result?.free ? 'free' : 'occupied', error: null };

  cache.set(key, status);
  return status;
}

async function resolveCoopState(contractId, coopCode, cache) {
  const status = await isFreeCoop(contractId, coopCode, cache);
  if (status.state !== 'unknown') {
    return status;
  }

  return {
    state: 'occupied',
    assumedOccupied: true,
    reason: status.error ?? 'availability-check-failed',
  };
}

function pushCandidate(candidates, added, coopCode) {
  const normalized = coopCode.toLowerCase();
  if (added.has(normalized)) {
    return;
  }

  added.add(normalized);
  candidates.push(coopCode);
}

async function collectIncrementSeries({ contractId, baseCode, cache, candidates, added }) {
  for (let prefix = 2; prefix <= MAX_INCREMENT_PREFIX; prefix += 1) {
    const coopCode = `${prefix}${baseCode}`;
    const status = await resolveCoopState(contractId, coopCode, cache);

    if (status.state === 'free') {
      return;
    }

    pushCandidate(candidates, added, coopCode);
  }
}

async function buildCoopsToCheck(contractId) {
  const baseCodes = buildExtendedPlusCodes();
  const savedCoops = new Set(listCoops(contractId).map(coop => String(coop).toLowerCase()));
  const candidates = [];
  const added = new Set();
  const freeCache = new Map();

  await Promise.all(baseCodes.map(async baseCode => {
    const baseStatus = await resolveCoopState(contractId, baseCode, freeCache);

    if (baseStatus.state === 'free') {
      return;
    }

    pushCandidate(candidates, added, baseCode);

    await collectIncrementSeries({
      contractId,
      baseCode,
      cache: freeCache,
      candidates,
      added,
    });
  }));

  return { candidates, savedCoops };
}

export async function buildBnLeaderboardReport({ contractId }) {
  const normalizedContractId = String(contractId ?? '').trim();
  if (!normalizedContractId) {
    return { ok: false, reason: 'missing-contract' };
  }

  const contracts = await fetchContractSummaries();
  const selectedContract = contracts.find(contract => contract.id === normalizedContractId);

  if (!selectedContract) {
    return { ok: false, reason: 'unknown-contract' };
  }

  const { candidates, savedCoops } = await buildCoopsToCheck(normalizedContractId);
  const entries = [];
  const unchecked = [];

  await Promise.all(candidates.map(async coop => {
    let coopStatus;

    try {
      coopStatus = await getCoopStatus(normalizedContractId, coop);
    } catch (error) {
      unchecked.push({ coop, reason: error?.message ?? String(error), stage: 'status' });
      return;
    }

    const contributors = Array.isArray(coopStatus?.contributors) ? coopStatus.contributors : [];
    if (!Array.isArray(contributors) || contributors.length === 0) {
      return;
    }

    const isBnCoop = hasKnownMembersForContributors({
      contributors,
      contractId: normalizedContractId,
      coopCode: coop,
    });
    if (!isBnCoop) {
      return;
    }

    const auditFailures = collectAuditFailures(contributors);
    const auditPassed = auditFailures.length === 0;
    const isSavedCoop = savedCoops.has(coop.toLowerCase());
    const isFinished = isCoopFinished(coopStatus);
    const rawDurationSeconds = calculateTotalDurationSeconds(selectedContract, coopStatus, contributors);
    const { durationSeconds, durationLabel } = normalizeDuration(rawDurationSeconds);
    const totalTokens = calculateTotalTokens(contributors);
    const deliveryRatePerHour = calculateTotalDeliveryRatePerHour(contributors);

    entries.push({
      coop,
      durationSeconds,
      durationLabel,
      tokens: totalTokens,
      tokensLabel: formatInteger(totalTokens),
      deliveryRatePerHour,
      deliveryRateLabel: formatRatePerHour(deliveryRatePerHour),
      auditFailures,
      status: toStatusLabel({ isSavedCoop, auditPassed, isFinished }),
    });
  }));

  entries.sort((a, b) => {
    const left = Number.isFinite(a.durationSeconds) ? a.durationSeconds : Number.POSITIVE_INFINITY;
    const right = Number.isFinite(b.durationSeconds) ? b.durationSeconds : Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return a.coop.localeCompare(b.coop);
  });

  const uniqueUnchecked = [];
  const seenUnchecked = new Set();
  for (const item of unchecked) {
    const key = `${item.coop}::${item.reason ?? ''}`;
    if (seenUnchecked.has(key)) continue;
    seenUnchecked.add(key);
    uniqueUnchecked.push(item);
  }

  return {
    ok: true,
    contractId: normalizedContractId,
    contractName: selectedContract.name || selectedContract.id,
    entries,
    unchecked: uniqueUnchecked,
  };
}

export async function listBnLeaderboardContractOptions() {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));

  return sorted
    .map(contract => ({
      name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
      description: contract.name ? contract.id : undefined,
    }))
    .slice(0, 25);
}

export async function searchBnLeaderboardContractOptions(focused) {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));
  const lower = String(focused ?? '').toLowerCase();

  return sorted
    .filter(contract => {
      const id = contract.id?.toLowerCase() ?? '';
      const name = contract.name?.toLowerCase() ?? '';
      return id.includes(lower) || name.includes(lower);
    })
    .slice(0, 15)
    .map(contract => ({
      name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
      description: contract.name ? contract.id : undefined,
    }));
}

export default {
  buildBnLeaderboardReport,
  listBnLeaderboardContractOptions,
  searchBnLeaderboardContractOptions,
};
