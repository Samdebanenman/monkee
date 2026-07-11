import {
  ARTIFACT_NAME_IDS,
  ARTIFACT_TIERS,
  ARTIFACT_TYPE,
  LEVEL,
  RARITY,
} from './artifactMetadata.js';

const VISUAL_ORDER = Object.freeze([
  ARTIFACT_NAME_IDS.LIGHT_OF_EGGENDIL,
  ARTIFACT_NAME_IDS.BOOK_OF_BASAN,
  ARTIFACT_NAME_IDS.TACHYON_DEFLECTOR,
  ARTIFACT_NAME_IDS.SHIP_IN_A_BOTTLE,
  ARTIFACT_NAME_IDS.TITANIUM_ACTUATOR,
  ARTIFACT_NAME_IDS.DILITHIUM_MONOCLE,
  ARTIFACT_NAME_IDS.QUANTUM_METRONOME,
  ARTIFACT_NAME_IDS.PHOENIX_FEATHER,
  ARTIFACT_NAME_IDS.THE_CHALICE,
  ARTIFACT_NAME_IDS.INTERSTELLAR_COMPASS,
  ARTIFACT_NAME_IDS.CARVED_RAINSTICK,
  ARTIFACT_NAME_IDS.BEAK_OF_MIDAS,
  ARTIFACT_NAME_IDS.MERCURYS_LENS,
  ARTIFACT_NAME_IDS.NEODYMIUM_MEDALLION,
  ARTIFACT_NAME_IDS.ORNATE_GUSSET,
  ARTIFACT_NAME_IDS.TUNGSTEN_ANKH,
  ARTIFACT_NAME_IDS.AURELIAN_BROOCH,
  ARTIFACT_NAME_IDS.VIAL_MARTIAN_DUST,
  ARTIFACT_NAME_IDS.DEMETERS_NECKLACE,
  ARTIFACT_NAME_IDS.LUNAR_TOTEM,
  ARTIFACT_NAME_IDS.PUZZLE_CUBE,
  ARTIFACT_NAME_IDS.PROPHECY_STONE,
  ARTIFACT_NAME_IDS.CLARITY_STONE,
  ARTIFACT_NAME_IDS.DILITHIUM_STONE,
  ARTIFACT_NAME_IDS.LIFE_STONE,
  ARTIFACT_NAME_IDS.QUANTUM_STONE,
  ARTIFACT_NAME_IDS.SOUL_STONE,
  ARTIFACT_NAME_IDS.TERRA_STONE,
  ARTIFACT_NAME_IDS.TACHYON_STONE,
  ARTIFACT_NAME_IDS.LUNAR_STONE,
  ARTIFACT_NAME_IDS.SHELL_STONE,
  ARTIFACT_NAME_IDS.SOLAR_TITANIUM,
  ARTIFACT_NAME_IDS.TAU_CETI_GEODE,
  ARTIFACT_NAME_IDS.GOLD_METEORITE,
  ARTIFACT_NAME_IDS.PROPHECY_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.CLARITY_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.LIFE_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.TERRA_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.DILITHIUM_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.SOUL_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.QUANTUM_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.TACHYON_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.SHELL_STONE_FRAGMENT,
  ARTIFACT_NAME_IDS.LUNAR_STONE_FRAGMENT,
]);

const LEVEL_IDS = Object.freeze(LEVEL);
const RARITY_IDS = Object.freeze(RARITY);
const METADATA_BY_SPEC = new Map(ARTIFACT_TIERS.map(tier => [specKey(tier.name, tier.level), tier]));
const VISUAL_ORDER_INDEX = new Map(VISUAL_ORDER.map((name, index) => [name, index]));

function specKey(name, level) {
  return `${name}:${level}`;
}

function stoneKey(stone) {
  return `${stone.name}:${stone.level}:${stone.rarity}`;
}

function normalizeEnumValue(value, lookup, fallback = null) {
  if (Number.isFinite(value)) {
    return Number(value);
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return fallback;
  }

  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }

  return lookup[raw.toUpperCase()] ?? fallback;
}

function normalizeCount(value) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count);
}

function fallbackMetadata(spec, warnings) {
  const name = normalizeEnumValue(spec?.name, ARTIFACT_NAME_IDS, ARTIFACT_NAME_IDS.UNKNOWN);
  const level = normalizeEnumValue(spec?.level, LEVEL_IDS, LEVEL_IDS.INFERIOR);
  const metadata = {
    name,
    level,
    type: ARTIFACT_TYPE.ARTIFACT,
    tier: Number.isFinite(level) ? level + 1 : 1,
    familyOrder: Number.MAX_SAFE_INTEGER,
    family: `Artifact ${name}`,
    displayName: `Unknown artifact ${name}:${level}`,
    iconFile: null,
  };

  warnings.push(`unknown artifact spec ${name}:${level}`);
  return metadata;
}

function normalizeArtifactSpec(spec, warnings = []) {
  if (!spec) {
    return null;
  }

  const name = normalizeEnumValue(spec.name, ARTIFACT_NAME_IDS);
  const level = normalizeEnumValue(spec.level, LEVEL_IDS);
  const rarity = normalizeEnumValue(spec.rarity, RARITY_IDS, RARITY.COMMON);

  if (!Number.isFinite(name) || !Number.isFinite(level)) {
    warnings.push(`invalid artifact spec ${JSON.stringify(spec)}`);
    return null;
  }

  const metadata = METADATA_BY_SPEC.get(specKey(name, level)) ?? fallbackMetadata({ name, level }, warnings);
  return {
    name,
    level,
    rarity: Number.isFinite(rarity) ? rarity : RARITY.COMMON,
    metadata,
    displayName: metadata.displayName,
    iconFile: metadata.iconFile,
    tier: metadata.tier,
    family: metadata.family,
    type: metadata.type,
  };
}

function createInventoryRecord(metadata) {
  return {
    name: metadata.name,
    level: metadata.level,
    metadata,
    haveRarity: [0, 0, 0, 0],
    slotted: 0,
  };
}

function createInventoryStore() {
  const store = new Map();
  for (const metadata of ARTIFACT_TIERS) {
    store.set(specKey(metadata.name, metadata.level), createInventoryRecord(metadata));
  }
  return store;
}

function getInventoryRecord(store, artifact, warnings) {
  const key = specKey(artifact.name, artifact.level);
  if (!store.has(key)) {
    store.set(key, createInventoryRecord(artifact.metadata ?? fallbackMetadata(artifact, warnings)));
  }
  return store.get(key);
}

function addArtifactToInventory(store, artifact, count, warnings) {
  if (!artifact || count <= 0) {
    return null;
  }

  const record = getInventoryRecord(store, artifact, warnings);
  const rarity = Math.max(0, Math.min(3, artifact.rarity ?? RARITY.COMMON));
  record.haveRarity[rarity] += count;
  return record;
}

function getArtifactInventoryItems(artifactsDb, virtue) {
  if (virtue) {
    return artifactsDb?.virtueAfxDb?.inventoryItems ?? [];
  }

  return artifactsDb?.inventoryItems ?? [];
}

function normalizeStoneList(stones, warnings) {
  if (!Array.isArray(stones)) {
    return [];
  }

  return stones
    .map(stone => normalizeArtifactSpec(stone, warnings))
    .filter(Boolean)
    .sort((left, right) => stoneKey(left).localeCompare(stoneKey(right)));
}

function sortInventoryRecords(left, right) {
  const leftOrder = VISUAL_ORDER_INDEX.get(left.name) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = VISUAL_ORDER_INDEX.get(right.name) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const leftFamily = left.metadata.familyOrder ?? Number.MAX_SAFE_INTEGER;
  const rightFamily = right.metadata.familyOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftFamily !== rightFamily) {
    return leftFamily - rightFamily;
  }

  return (right.level ?? 0) - (left.level ?? 0);
}

function buildGridItem(record, rarity, count, stones = []) {
  const metadata = record.metadata;
  return {
    name: record.name,
    level: record.level,
    rarity,
    count,
    stones,
    type: metadata.type,
    tier: metadata.tier,
    family: metadata.family,
    displayName: metadata.displayName,
    iconFile: metadata.iconFile,
  };
}

function buildGrid({ store, stonedArtifacts, rarerItemsFirst }) {
  const stonedBySpecAndRarity = new Map();
  for (const artifact of stonedArtifacts) {
    const key = `${artifact.name}:${artifact.level}:${artifact.rarity}`;
    if (!stonedBySpecAndRarity.has(key)) {
      stonedBySpecAndRarity.set(key, new Map());
    }

    const loadoutKey = artifact.stones.map(stoneKey).join('|');
    const loadouts = stonedBySpecAndRarity.get(key);
    const existing = loadouts.get(loadoutKey);
    if (existing) {
      existing.count += artifact.count;
    } else {
      loadouts.set(loadoutKey, { ...artifact });
    }
  }

  const records = [...store.values()]
    .filter(record => record.haveRarity.some(count => count > 0))
    .sort(sortInventoryRecords);

  const grid = [];
  for (const record of records) {
    for (const rarity of [RARITY.LEGENDARY, RARITY.EPIC, RARITY.RARE]) {
      const loadouts = stonedBySpecAndRarity.get(`${record.name}:${record.level}:${rarity}`);
      const stoned = loadouts ? [...loadouts.values()] : [];
      for (const artifact of stoned) {
        grid.push(buildGridItem(record, rarity, artifact.count, artifact.stones));
      }

      const stonedCount = stoned.reduce((total, artifact) => total + artifact.count, 0);
      const unstonedCount = record.haveRarity[rarity] - stonedCount;
      if (unstonedCount > 0) {
        grid.push(buildGridItem(record, rarity, unstonedCount));
      }
    }

    const commonCount = record.haveRarity[RARITY.COMMON] - record.slotted;
    if (commonCount > 0) {
      grid.push(buildGridItem(record, RARITY.COMMON, commonCount));
    }
  }

  if (rarerItemsFirst) {
    grid.sort((left, right) => right.rarity - left.rarity);
  }

  return grid;
}

function summarizeGrid(grid) {
  const totalsByRarity = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };

  let totalQuantity = 0;
  let stonedArtifacts = 0;

  for (const item of grid) {
    totalQuantity += item.count;
    if (item.stones.length > 0) {
      stonedArtifacts += 1;
    }

    if (item.rarity === RARITY.LEGENDARY) totalsByRarity.legendary += item.count;
    else if (item.rarity === RARITY.EPIC) totalsByRarity.epic += item.count;
    else if (item.rarity === RARITY.RARE) totalsByRarity.rare += item.count;
    else totalsByRarity.common += item.count;
  }

  return {
    totalQuantity,
    visualSlots: grid.length,
    stonedArtifacts,
    totalsByRarity,
  };
}

export function getArtifacts(backup, options = {}) {
  const {
    virtue = false,
    rarerItemsFirst = true,
  } = options;

  const artifactsDb = backup?.artifactsDb;

  const warnings = [];
  const store = createInventoryStore();
  const stonedArtifacts = [];

  for (const item of getArtifactInventoryItems(artifactsDb, virtue)) {
    const completeArtifact = item?.artifact;
    const count = normalizeCount(item?.quantity ?? 1);
    const host = normalizeArtifactSpec(completeArtifact?.spec, warnings);
    if (!host || count <= 0) {
      continue;
    }

    addArtifactToInventory(store, host, count, warnings);

    const stones = normalizeStoneList(completeArtifact?.stones, warnings);
    for (const stone of stones) {
      const record = addArtifactToInventory(store, stone, count, warnings);
      if (record) {
        record.slotted += count;
      }
    }

    if (stones.length > 0) {
      stonedArtifacts.push({ ...host, count, stones });
    }
  }

  const grid = buildGrid({ store, stonedArtifacts, rarerItemsFirst });
  return {
    grid,
    summary: summarizeGrid(grid),
    warnings,
  };
}
