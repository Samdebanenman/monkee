import { ARTIFACT_TIERS, RARITY } from './artifactMetadata.js';

const RARITY_NAMES = Object.freeze([
  'common',
  'rare',
  'epic',
  'legendary',
]);

function normalizeSearchValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function createArtifactFamilies() {
  const familiesByOrder = new Map();

  for (const artifact of ARTIFACT_TIERS) {
    if (!familiesByOrder.has(artifact.familyOrder)) {
      familiesByOrder.set(artifact.familyOrder, {
        id: String(artifact.familyOrder),
        family: artifact.family,
        tiers: [],
      });
    }

    const family = familiesByOrder.get(artifact.familyOrder);
    if (!family.tiers.includes(artifact.tier)) {
      family.tiers.push(artifact.tier);
    }
  }

  const families = [...familiesByOrder.values()]
    .sort((left, right) => Number(left.id) - Number(right.id))
    .map(family => ({
      ...family,
      tiers: family.tiers.sort((left, right) => left - right),
    }));

  const lastWordCounts = new Map();
  for (const family of families) {
    const words = normalizeSearchValue(family.family).split(' ').filter(Boolean);
    const lastWord = words.at(-1);
    if (lastWord) {
      lastWordCounts.set(lastWord, (lastWordCounts.get(lastWord) ?? 0) + 1);
    }
  }

  return families.map(family => {
    const normalizedName = normalizeSearchValue(family.family);
    const words = normalizedName.split(' ').filter(Boolean);
    const aliases = new Set([normalizedName]);
    const lastWord = words.at(-1);

    if (lastWord && lastWordCounts.get(lastWord) === 1) {
      aliases.add(lastWord);
    }
    if (normalizedName.startsWith('the ')) {
      aliases.add(normalizedName.slice(4));
    }
    if (normalizedName === 'ship in a bottle') {
      aliases.add('siab');
    }

    return Object.freeze({
      ...family,
      tiers: Object.freeze([...family.tiers]),
      searchTerms: Object.freeze([...aliases]),
    });
  });
}

const ARTIFACT_FAMILIES = Object.freeze(createArtifactFamilies());

export function listArtifactFamilies() {
  return ARTIFACT_FAMILIES;
}

export function resolveArtifactFamily(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return null;

  const byId = ARTIFACT_FAMILIES.find(family => family.id === rawValue);
  if (byId) return byId;

  const normalizedValue = normalizeSearchValue(rawValue);
  const matches = ARTIFACT_FAMILIES.filter(family =>
    family.searchTerms.includes(normalizedValue)
  );

  return matches.length === 1 ? matches[0] : null;
}

export function countArtifactsByRarity(grid, { family, tier }) {
  const artifactFamily = typeof family === 'object'
    ? family
    : resolveArtifactFamily(family);
  const normalizedTier = Number(tier);

  if (!artifactFamily || !artifactFamily.tiers.includes(normalizedTier)) {
    return null;
  }

  const countsByRarity = Object.fromEntries(RARITY_NAMES.map(name => [name, 0]));

  for (const item of Array.isArray(grid) ? grid : []) {
    if (item?.family !== artifactFamily.family || item?.tier !== normalizedTier) {
      continue;
    }

    const rarityName = RARITY_NAMES[item.rarity ?? RARITY.COMMON];
    const count = Number(item.count ?? 0);
    if (rarityName && Number.isFinite(count) && count > 0) {
      countsByRarity[rarityName] += Math.floor(count);
    }
  }

  return {
    family: artifactFamily,
    tier: normalizedTier,
    total: Object.values(countsByRarity).reduce((sum, count) => sum + count, 0),
    countsByRarity,
  };
}

