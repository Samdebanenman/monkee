import { getCoopContributors, listAllCoops } from './coopService.js';
import { getMembersForCoop } from '../utils/database/coopsRepository.js';
import { getMembersByIgns } from '../utils/database/membersRepository.js';

const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 10;
const DEPARTED_PLAYER = '[departed]';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeConcurrency(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CONCURRENCY;
  return Math.min(parsed, MAX_CONCURRENCY);
}

function getUniqueContributorIgns(contributors) {
  const uniqueIgns = new Map();

  for (const contributor of contributors) {
    const ign = normalizeText(contributor?.userName ?? contributor?.user_name);
    const key = ign.toLowerCase();
    if (!ign || key === DEPARTED_PLAYER || uniqueIgns.has(key)) continue;
    uniqueIgns.set(key, ign);
  }

  return [...uniqueIgns.values()];
}

function findMissingIgns(contributorIgns, linkedDiscordIds) {
  const linkedIds = new Set(linkedDiscordIds.map(id => normalizeText(id)).filter(Boolean));
  const memberRows = getMembersByIgns(contributorIgns);
  const membersByIgn = new Map();

  for (const member of memberRows) {
    const key = normalizeText(member.ign).toLowerCase();
    if (!key) continue;

    const matches = membersByIgn.get(key) ?? [];
    matches.push(normalizeText(member.discord_id));
    membersByIgn.set(key, matches);
  }

  return contributorIgns.filter(ign => {
    const matchingIds = membersByIgn.get(ign.toLowerCase()) ?? [];
    return !matchingIds.some(discordId => linkedIds.has(discordId));
  });
}

async function auditCoop(coop) {
  const contractId = normalizeText(coop?.contract ?? coop?.contractId);
  const coopId = normalizeText(coop?.coop ?? coop?.coopId);

  try {
    const contributors = await getCoopContributors(contractId, coopId);
    if (!Array.isArray(contributors)) {
      throw new TypeError('Coop contributors response was not an array');
    }

    const contributorIgns = getUniqueContributorIgns(contributors);
    const linkedDiscordIds = getMembersForCoop(contractId, coopId);
    const missingIgns = findMissingIgns(contributorIgns, linkedDiscordIds);

    return {
      contractId,
      coopId,
      status: missingIgns.length === 0 ? 'full' : 'incomplete',
      assignedCount: contributorIgns.length - missingIgns.length,
      expectedCount: contributorIgns.length,
      missingIgns,
    };
  } catch (error) {
    console.error(`Failed to audit coop ${contractId}/${coopId}:`, error);
    return {
      contractId,
      coopId,
      status: 'error',
      assignedCount: 0,
      expectedCount: 0,
      missingIgns: [],
    };
  }
}

export async function auditIncompleteCoops({
  coops = listAllCoops(),
  concurrency = DEFAULT_CONCURRENCY,
  onProgress = null,
} = {}) {
  const items = Array.isArray(coops) ? coops : [];
  const results = new Array(items.length);
  const workerCount = Math.min(normalizeConcurrency(concurrency), items.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      const result = await auditCoop(items[index]);
      results[index] = result;
      completed += 1;

      if (typeof onProgress === 'function') {
        await onProgress({ completed, total: items.length, result });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    checked: items.length,
    incomplete: results.filter(result => result.status === 'incomplete'),
    errors: results.filter(result => result.status === 'error'),
  };
}

export default { auditIncompleteCoops };
