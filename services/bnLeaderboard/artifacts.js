import { getArray, getValue } from './common.js';

const REQUIRED_CORE_ARTIFACT_ENUMS = new Set([26, 24, 27]);
const REQUIRED_CORE_ARTIFACT_NAMES = new Set([
  'TACHYON_DEFLECTOR',
  'QUANTUM_METRONOME',
  'INTERSTELLAR_COMPASS',
]);
const FOURTH_ARTIFACT_ENUM_OPTIONS = new Set([8, 25]);
const FOURTH_ARTIFACT_NAME_OPTIONS = new Set(['ORNATE_GUSSET', 'SHIP_IN_A_BOTTLE']);

const ALLOWED_STONE_NAMES = new Set(['TACHYON_STONE', 'QUANTUM_STONE']);
const STONE_NAME_BY_ENUM = new Map([
  [1, 'TACHYON_STONE'],
  [36, 'QUANTUM_STONE'],
]);

const ARTIFACT_NAME_BY_ENUM = new Map([
  [26, 'TACHYON_DEFLECTOR'],
  [24, 'QUANTUM_METRONOME'],
  [27, 'INTERSTELLAR_COMPASS'],
  [25, 'SHIP_IN_A_BOTTLE'],
  [8, 'ORNATE_GUSSET'],
]);

const ARTIFACT_STONE_SLOT_CAPS = new Map([
  ['TACHYON_DEFLECTOR', 2],
  ['QUANTUM_METRONOME', 3],
  ['INTERSTELLAR_COMPASS', 2],
  ['SHIP_IN_A_BOTTLE', 2],
  ['ORNATE_GUSSET', 3],
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

    const hasCoreNames = [...REQUIRED_CORE_ARTIFACT_NAMES].every(name => foundNames.has(name));
    const hasCoreEnums = [...REQUIRED_CORE_ARTIFACT_ENUMS].every(value => foundEnums.has(value));
    const hasFourthName = [...FOURTH_ARTIFACT_NAME_OPTIONS].some(name => foundNames.has(name));
    const hasFourthEnum = [...FOURTH_ARTIFACT_ENUM_OPTIONS].some(value => foundEnums.has(value));

    return (hasCoreNames && hasFourthName) || (hasCoreEnums && hasFourthEnum);
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
