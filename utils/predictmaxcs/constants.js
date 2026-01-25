import { getStoredColeggtibles } from '../database/index.js';
import { GameDimension } from '../../Enums.js';

export const DEFLECTOR_TIERS = [
  { label: 'quant-scrub', percent: 0 },
  { label: 'epic+', percent: 19 },
  { label: 'legendary', percent: 20 },
];

export const BOOSTED_SET = {
  metro: { elrMult: 1.35, slots: 3 },
  compass: { srMult: 1.5, slots: 2 },
  gusset: { chickMult: 1.25, slots: 3 },
  deflector: { slots: 2 },
};

export const IHR_SET = {
  chalice: { ihrMult: 1.4, slots: 3 },
  monocle: { ihrMult: 1.3, slots: 3 },
  siabPercent: 100,
  deflector: { slots: 2 },
};

const DEFAULT_COLEGGTIBLES = {
  elrMult: 1,
  shipMult: 1,
  ihrMult: 1,
  chickenMult: 1,
};

function combineMultiplier(current, next) {
  if (!Number.isFinite(next) || next <= 0) return current;
  return current * next;
}

function getBestBuffsByDimension(buffs) {
  const bestByDimension = new Map();
  for (const buff of buffs) {
    const dimension = Number.isFinite(buff.dimension) ? buff.dimension : null;
    const value = Number.isFinite(buff.value) ? buff.value : null;
    if (dimension == null || value == null) continue;
    const prev = bestByDimension.get(dimension);
    if (prev == null || value > prev) {
      bestByDimension.set(dimension, value);
    }
  }
  return bestByDimension;
}

function applyBestBuffs(totals, bestByDimension) {
  const dimensionMap = [
    { dimension: GameDimension.EGG_LAYING_RATE, key: 'elrMult' },
    { dimension: GameDimension.SHIPPING_CAPACITY, key: 'shipMult' },
    { dimension: GameDimension.INTERNAL_HATCHERY_RATE, key: 'ihrMult' },
    { dimension: GameDimension.HAB_CAPACITY, key: 'chickenMult' },
  ];

  for (const { dimension, key } of dimensionMap) {
    totals[key] = combineMultiplier(totals[key], bestByDimension.get(dimension));
  }
}

export function getDynamicColeggtibles() {
  const rows = getStoredColeggtibles();
  if (!Array.isArray(rows) || rows.length === 0) return { ...DEFAULT_COLEGGTIBLES };

  const totals = { ...DEFAULT_COLEGGTIBLES };

  for (const egg of rows) {
    const buffs = Array.isArray(egg.buffs) ? egg.buffs : [];
    if (!buffs.length) continue;

    const bestByDimension = getBestBuffsByDimension(buffs);
    applyBestBuffs(totals, bestByDimension);
  }

  return totals;
}

export const BASES = {
  baseELR: 332640,
  baseShip: 2978359222414.5 * 2400,
  baseChickens: 11340000000,
  baseIHR: 7440,
};
