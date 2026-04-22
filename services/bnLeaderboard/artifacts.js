import { getArray, getValue } from './common.js';

const REQUIRED_CORE_ARTIFACT_NAMES = new Set([
  'QUANTUM_METRONOME',
  'INTERSTELLAR_COMPASS',
]);
const HOLDER_ARTIFACT_NAMES = new Set([
  'LUNAR_TOTEM',
  'NEODYMIUM_MEDALLION',
  'DEMETERS_NECKLACE',
  'THE_CHALICE',
  'TUNGSTEN_ANKH',
  'AURELIAN_BROOCH',
  'PUZZLE_CUBE',
  'DILITHIUM_MONOCLE',
]);
const FLEXIBLE_ARTIFACT_NAMES = new Set([
  'TACHYON_DEFLECTOR',
  'SHIP_IN_A_BOTTLE',
  'ORNATE_GUSSET',
  ...HOLDER_ARTIFACT_NAMES,
]);

const ALLOWED_STONE_NAMES = new Set(['TACHYON_STONE', 'QUANTUM_STONE']);
const STONE_NAME_BY_ENUM = new Map([
  [1, 'TACHYON_STONE'],
  [36, 'QUANTUM_STONE'],
]);

const ARTIFACT_NAME_BY_ENUM = new Map([
  [0, 'LUNAR_TOTEM'],
  [3, 'NEODYMIUM_MEDALLION'],
  [6, 'DEMETERS_NECKLACE'],
  [9, 'THE_CHALICE'],
  [12, 'TUNGSTEN_ANKH'],
  [21, 'AURELIAN_BROOCH'],
  [23, 'PUZZLE_CUBE'],
  [26, 'TACHYON_DEFLECTOR'],
  [24, 'QUANTUM_METRONOME'],
  [27, 'INTERSTELLAR_COMPASS'],
  [25, 'SHIP_IN_A_BOTTLE'],
  [8, 'ORNATE_GUSSET'],
  [28, 'DILITHIUM_MONOCLE'],
]);

const ARTIFACT_STONE_SLOT_CAPS = new Map([
  ['TACHYON_DEFLECTOR', 2],
  ['QUANTUM_METRONOME', 3],
  ['INTERSTELLAR_COMPASS', 2],
  ['SHIP_IN_A_BOTTLE', 2],
  ['ORNATE_GUSSET', 3],
  ['LUNAR_TOTEM', 3],
  ['NEODYMIUM_MEDALLION', 3],
  ['DEMETERS_NECKLACE', 3],
  ['THE_CHALICE', 3],
  ['TUNGSTEN_ANKH', 3],
  ['AURELIAN_BROOCH', 3],
  ['PUZZLE_CUBE', 3],
  ['DILITHIUM_MONOCLE', 3],
]);

const RARITY_SLOT_CAPS = new Map([
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
]);

const STONE_LEVEL_NORMAL = 2;

const ARTIFACT_LEVEL_ORDER = {
  INFERIOR: 1,
  LESSER: 2,
  NORMAL: 3,
  GREATER: 4,
};

const ARTIFACT_RARITY_ORDER = {
  COMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
};

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

  return 3;
}

function levelRank(level) {
  if (Number.isFinite(level)) {
    const normalized = Number(level);
    if (normalized >= 0 && normalized <= 3) {
      return normalized + 1;
    }
  }
  return ARTIFACT_LEVEL_ORDER[String(level ?? '').toUpperCase()] ?? 0;
}

function rarityRank(rarity) {
  if (Number.isFinite(rarity)) {
    const normalized = Number(rarity);
    if (normalized >= 0 && normalized <= 3) {
      return normalized + 1;
    }
  }
  return ARTIFACT_RARITY_ORDER[String(rarity ?? '').toUpperCase()] ?? 0;
}

function getDeflectorPercent(level, rarity) {
  const l = levelRank(level);
  const r = rarityRank(rarity);
  if (l >= 4) {
    if (r >= 4) return 20;
    if (r >= 3) return 19;
    if (r >= 2) return 17;
    return 15;
  }
  if (l >= 3) {
    return r >= 2 ? 13 : 12;
  }
  if (l >= 2) return 8;
  if (l >= 1) return 5;
  return 0;
}

function getSiabPercent(level, rarity) {
  const l = levelRank(level);
  const r = rarityRank(rarity);
  if (l >= 4) {
    if (r >= 4) return 100;
    if (r >= 3) return 90;
    if (r >= 2) return 80;
    return 70;
  }
  if (l >= 3) {
    return r >= 2 ? 60 : 50;
  }
  return 0;
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

  for (const artifact of equippedArtifacts) {
    const artifactStones = Array.isArray(artifact?.stones) ? artifact.stones : [];
    const slotCap = getArtifactStoneSlotCap(artifact);

    const normalizedStones = artifactStones.map(stone => {
      const spec = stone?.spec ?? stone ?? {};
      const name = normalizeStoneName(spec?.name);
      const level = normalizeStoneLevel(spec?.level);
      return { name, level };
    });

    totalAllowedSlots += slotCap;
    totalEquippedStones += artifactStones.length;

    if (artifactStones.length > slotCap) {
      return {
        stones,
        totalAllowedSlots,
        totalEquippedStones,
        hasOverfilledArtifact: true,
      };
    }

    for (const stone of normalizedStones) {
      stones.push(stone);
    }
  }

  return {
    stones,
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
  if (Number.isFinite(elrRaw) && Number.isFinite(elrScaled) && Number.isFinite(sr) && sr > 0) {
    const rawDistance = Math.abs(sr - elrRaw);
    const scaledDistance = Math.abs(sr - elrScaled);
    if (scaledDistance < rawDistance) {
      elrEffective = elrScaled;
    }
  }

  return { elrEffective };
}

function getStoneMismatchAdvice({ stones, totalAllowedSlots, totalEquippedStones, elrEffective, sr }) {
  const totalStones = stones.length;
  const quantumStones = stones.filter(stone => stone.name === 'QUANTUM_STONE').length;
  const shippingCapped = elrEffective > sr;
  const allSlotsFilled = totalEquippedStones === totalAllowedSlots;

  if (shippingCapped && allSlotsFilled && quantumStones === totalStones) {
    return null;
  }

  if (!shippingCapped && allSlotsFilled && quantumStones === 0) {
    return null;
  }

  if (shippingCapped) {
    return 'sr/elr mismatch >5%; swap one stone toward QUANTUM_STONE';
  }

  return 'sr/elr mismatch >5%; swap one stone toward TACHYON_STONE';
}

export class BnLeaderboardArtifactsService {
  getBestArtifactPercentsForCs(farmInfo) {
    const equipped = getArray(farmInfo, 'equippedArtifacts', 'equipped_artifacts');
    let deflectorPercent = 0;
    let siabPercent = 0;

    for (const artifact of equipped) {
      const spec = artifact?.spec ?? {};
      const name = String(normalizeArtifactName(spec?.name) ?? '').toUpperCase();

      if (name === 'TACHYON_DEFLECTOR') {
        deflectorPercent = Math.max(deflectorPercent, getDeflectorPercent(spec?.level, spec?.rarity));
        continue;
      }

      if (name === 'SHIP_IN_A_BOTTLE') {
        siabPercent = Math.max(siabPercent, getSiabPercent(spec?.level, spec?.rarity));
      }
    }

    return { deflectorPercent, siabPercent };
  }

  auditArtifacts(equippedArtifacts) {
    const normalizedNames = equippedArtifacts
      .map(artifact => normalizeArtifactName(artifact?.spec?.name))
      .filter(Boolean);

    const foundNames = new Set(normalizedNames);
    const hasCoreArtifacts = [...REQUIRED_CORE_ARTIFACT_NAMES].every(name => foundNames.has(name));
    const flexibleArtifacts = normalizedNames.filter(name => FLEXIBLE_ARTIFACT_NAMES.has(name));

    return hasCoreArtifacts && flexibleArtifacts.length >= 2;
  }

  auditStoneSetup(productionParams, equippedArtifacts) {
    const {
      stones,
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

    return getStoneMismatchAdvice({
      stones,
      totalAllowedSlots,
      totalEquippedStones,
      elrEffective,
      sr,
    });
  }
}
