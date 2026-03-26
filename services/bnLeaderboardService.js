import { fetchContractSummaries } from './contractService.js';
import { getCoopAvailability, getCoopStatus, listCoops } from './coopService.js';
import { hasKnownMembersForContributors } from './memberService.js';
import { BnLeaderboardEntryBuilder } from './bnLeaderboard/entryBuilder.js';

const CODE_SUFFIXES = ['oo', 'ooo'];
const MAX_INCREMENT_PREFIX = 100;

const entryBuilder = new BnLeaderboardEntryBuilder();

function buildExtendedPlusCodes() {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(97 + index));
  const digits = Array.from({ length: 10 }, (_, index) => String(index));
  const prefixes = [...letters, '-', ...digits];
  return prefixes.flatMap(prefix => CODE_SUFFIXES.map(suffix => `${prefix}${suffix}`));
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
  const savedCoopList = listCoops(contractId).map(coop => String(coop).trim()).filter(Boolean);
  const savedCoops = new Set(savedCoopList.map(coop => coop.toLowerCase()));
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

  for (const savedCoop of savedCoopList) {
    pushCandidate(candidates, added, savedCoop);
  }

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

    const isSavedCoop = savedCoops.has(coop.toLowerCase());
    const isBnCoop = hasKnownMembersForContributors({
      contributors,
      contractId: normalizedContractId,
      coopCode: coop,
    });

    if (!isBnCoop && !isSavedCoop) {
      return;
    }

    const entry = entryBuilder.build({
      contract: selectedContract,
      coopStatus,
      coop,
      isSavedCoop,
    });

    if (entry) {
      entries.push(entry);
    }
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
