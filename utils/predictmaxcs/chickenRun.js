import { IHR_SET } from './constants.js';

export function getChickenRunAskPop(options) {
  const {
    maxChickens,
    baseIHR,
    boostMulti,
    players,
  } = options;

  if (!Number.isFinite(maxChickens) || maxChickens <= 0) return 0;
  const safePlayers = Number.isFinite(players) ? players : 0;
  const safeBoost = Number.isFinite(boostMulti) && boostMulti > 0 ? boostMulti : 1;
  const safeIHR = Number.isFinite(baseIHR) && baseIHR > 0 ? baseIHR : 0;
  const chaliceMult = Number.isFinite(IHR_SET?.chalice?.ihrMult) ? IHR_SET.chalice.ihrMult : 1;
  const monocleMult = Number.isFinite(IHR_SET?.monocle?.ihrMult) ? IHR_SET.monocle.ihrMult : 1;
  const slotCount = (IHR_SET?.chalice?.slots ?? 0)
    + (IHR_SET?.monocle?.slots ?? 0)
    + (IHR_SET?.deflector?.slots ?? 0)
    + 2;
  const stoneMult = Math.pow(1.04, Math.max(0, slotCount));
  const ihrSetMultiplier = chaliceMult * monocleMult * stoneMult;
  const crIHR = ihrSetMultiplier > 0 ? safeIHR / ihrSetMultiplier : safeIHR;
  const offlineLoss = crIHR * 12 * safeBoost;
  const denominator = 1 + 0.05 * safePlayers;
  if (denominator <= 0) return 0;
  return Math.max(0, (maxChickens - offlineLoss) / denominator);
}