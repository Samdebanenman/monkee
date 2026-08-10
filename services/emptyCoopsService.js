import { autoPopulateCoopMembers } from './coopService.js';
import {
  countCoopMembers,
  listEmptyCoops as listEmptyCoopsFromDatabase,
} from '../utils/database/emptyCoopsRepository.js';

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 10;

export function fetchEmptyCoops() {
  return listEmptyCoopsFromDatabase();
}

function normalizeConcurrency(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CONCURRENCY;
  return Math.min(parsed, MAX_CONCURRENCY);
}

async function populateOneCoop(coop) {
  let autoPopulateResult;

  try {
    autoPopulateResult = await autoPopulateCoopMembers(coop.contractId, coop.coopId);
  } catch (error) {
    console.error(`Unexpected auto-populate failure for ${coop.contractId}/${coop.coopId}:`, error);
    autoPopulateResult = { ok: false, reason: 'unexpected-error' };
  }

  let memberCount = 0;
  try {
    memberCount = countCoopMembers(coop.contractId, coop.coopId);
  } catch (error) {
    console.error(`Failed to count members for ${coop.contractId}/${coop.coopId}:`, error);
  }

  let status = 'failed';
  if (coop.maxCoopSize && memberCount >= coop.maxCoopSize) {
    status = 'full';
  } else if (memberCount > 0) {
    status = 'partial';
  }

  return {
    ...coop,
    memberCount,
    status,
    reason: autoPopulateResult?.ok ? null : autoPopulateResult?.reason ?? 'unknown-error',
  };
}

export async function autoPopulateEmptyCoops({
  coops = fetchEmptyCoops(),
  concurrency = DEFAULT_CONCURRENCY,
  onProgress = null,
} = {}) {
  const items = Array.isArray(coops) ? coops : [];
  if (items.length === 0) return [];

  const results = new Array(items.length);
  const workerCount = Math.min(normalizeConcurrency(concurrency), items.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      const result = await populateOneCoop(items[index]);
      results[index] = result;
      completed += 1;

      if (typeof onProgress === 'function') {
        await onProgress({ completed, total: items.length, result });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export default { fetchEmptyCoops, autoPopulateEmptyCoops };
