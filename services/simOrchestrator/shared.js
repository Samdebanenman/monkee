import { randomUUID } from 'node:crypto';
import { computeAdjustedSummaries } from '../../sim-core/src/predictmaxcs/simulation.js';
import {
  BOOSTED_SET,
  DEFLECTOR_TIERS,
  IHR_SET,
  getContractAdjustedBases,
  getDynamicColeggtibles,
} from '../../sim-core/src/predictmaxcs/constants.js';
import { getIhrStoneSlots, getSwapChickenJump, optimizeStones, buildPlayerConfigs } from '../../sim-core/src/predictmaxcs/model.js';
import { buildDeflectorDisplay, buildDeflectorPlan, getRequiredOtherDeflector } from '../../sim-core/src/predictmaxcs/deflector.js';
import { buildBoostOrder } from '../../sim-core/src/predictcs/model.js';
import { TOKEN_CANDIDATES } from '../../sim-core/src/predictmaxcs/model.js';
import { enqueueSimulationJobs } from '../simQueue.js';

export const tokenCandidates = TOKEN_CANDIDATES;

export function normalizeTeValues(values, players, fallbackTe = 0) {
  const playerCount = Number.isFinite(players) && players > 0 ? Math.floor(players) : 0;
  if (!Array.isArray(values) || values.length === 0) {
    return Array.from({ length: playerCount }, () => fallbackTe);
  }
  if (values.length === playerCount) return values;
  if (values.length === 1) {
    return Array.from({ length: playerCount }, () => values[0]);
  }
  if (playerCount > 0) {
    return Array.from({ length: playerCount }, (_, index) => {
      const value = values[index];
      return Number.isFinite(value) ? value : fallbackTe;
    });
  }
  return values;
}

export function buildPlayerIhrs(teValues, bases, coleggtibles) {
  const safeValues = Array.isArray(teValues) && teValues.length ? teValues : [0];
  return safeValues.map(value => bases.baseIHR
    * Math.pow(1.01, value)
    * coleggtibles.ihrMult
    * IHR_SET.chalice.ihrMult
    * IHR_SET.monocle.ihrMult
    * Math.pow(1.04, getIhrStoneSlots()));
}

export function scorePredictMaxCsResult(result, context) {
  const adjusted = computeAdjustedSummaries({
    summaries: result.summaries,
    displayDeflectors: context.deflectorDisplay.displayDeflectors,
    durationSeconds: context.durationSeconds,
    players: context.players,
    assumptions: context.assumptions,
  });
  return adjusted.adjustedSummaries?.[0]?.cs ?? 0;
}

export function scorePredictCsResult(result, context) {
  const adjusted = computeAdjustedSummaries({
    summaries: result.summaries,
    displayDeflectors: context.deflectorDisplay.displayDeflectors,
    durationSeconds: context.durationSeconds,
    players: context.players,
    assumptions: context.assumptions,
  });

  let score = adjusted.adjustedMeanCS;
  const normalizedPushCount = Number.isInteger(context.pushCount)
    ? Math.max(0, Math.min(context.pushCount, adjusted.adjustedSummaries.length))
    : 0;
  if (normalizedPushCount > 0) {
    const boostOrderList = Array.isArray(context.boostOrder)
      ? context.boostOrder
      : Array.from({ length: context.players }, (_, index) => index);
    const orderedScores = boostOrderList
      .slice(0, normalizedPushCount)
      .map(playerIndex => adjusted.adjustedSummaries[playerIndex]?.cs)
      .filter(value => Number.isFinite(value));
    if (orderedScores.length > 0) {
      score = orderedScores.reduce((sum, value) => sum + value, 0) / orderedScores.length;
    }
  }

  return score;
}

export function buildScenarioJob({ orchestrationId, scenarioId, context, scenario }) {
  return {
    jobId: scenarioId,
    type: 'simulate',
    createdAt: Date.now(),
    payload: {
      orchestrationId,
      context,
      scenario,
    },
  };
}

export async function enqueueScenarioBatch(orchestration, scenarios) {
  if (!orchestration.scenarioIds) {
    orchestration.scenarioIds = new Set();
  }
  for (const scenario of scenarios) {
    if (scenario?.jobId) {
      orchestration.scenarioIds.add(scenario.jobId);
    }
  }
  orchestration.pending += scenarios.length;
  await enqueueSimulationJobs(scenarios);
}

export function buildPredictMaxCsVariant(options) {
  const {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    usePlayer1Siab,
    modifierType,
    modifierValue,
    coleggtiblesRows,
  } = options;

  const coleggtibles = getDynamicColeggtibles(coleggtiblesRows ?? null);
  const bases = getContractAdjustedBases({ modifierType, modifierValue });
  const teValues = normalizeTeValues(assumptions?.teValues, players, assumptions?.te ?? 0);
  const playerIHRs = buildPlayerIhrs(teValues, bases, coleggtibles);
  const baseIHR = playerIHRs.reduce((sum, value) => sum + value, 0) / Math.max(1, playerIHRs.length);

  const maxChickensBase = bases.baseChickens
    * BOOSTED_SET.gusset.chickMult
    * coleggtibles.chickenMult
    + (assumptions.swapBonus ? getSwapChickenJump(players) : 0);
  const baseELR = bases.baseELR * BOOSTED_SET.metro.elrMult * coleggtibles.elrMult;
  const baseShip = bases.baseShip * BOOSTED_SET.compass.srMult * coleggtibles.shipMult;

  const baseElrPerPlayer = maxChickensBase * baseELR;
  const baseSrPerPlayer = baseShip;
  const totalSlots = BOOSTED_SET.metro.slots + BOOSTED_SET.compass.slots + BOOSTED_SET.gusset.slots + BOOSTED_SET.deflector.slots;

  const baselineDeflectors = Array.from(
    { length: players },
    () => DEFLECTOR_TIERS.at(-1).percent,
  );
  const baselineOtherDefl = (players - 1) * DEFLECTOR_TIERS.at(-1).percent;
  const baselineElrForStones = baseElrPerPlayer * (1 + baselineOtherDefl / 100);
  const stoneLayout = optimizeStones(baselineElrForStones, baseSrPerPlayer, totalSlots);

  const playerConfigs = buildPlayerConfigs({
    coleggtibles,
    players,
    maxChickens: maxChickensBase,
    baseChickens: bases.baseChickens,
    baseELR,
    baseShip,
    totalSlots,
    baselineOtherDefl,
    playerIHRs,
    usePlayer1Siab,
  });

  const requiredDeflector = getRequiredOtherDeflector(playerConfigs);
  const deflectorDisplay = buildDeflectorDisplay({
    players,
    baselineDeflectors,
    requiredOtherDeflector: Math.ceil(requiredDeflector),
    playerConfigs,
  });

  return {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    modifierType,
    modifierValue,
    playerConfigs,
    playerIHRs,
    baseIHR,
    maxChickensBase,
    baseElrPerPlayer,
    baseSrPerPlayer,
    stoneLayout,
    baselineDeflectors,
    deflectorDisplay,
    requiredDeflector,
    usePlayer1Siab,
  };
}

export function buildPredictCsVariant(options) {
  const {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    playerArtifacts,
    playerIhrArtifacts,
    playerTe,
    boostOrderMode,
    siabEnabled,
    pushCount,
    modifierType,
    modifierValue,
    coleggtiblesRows,
  } = options;

  const coleggtibles = getDynamicColeggtibles(coleggtiblesRows ?? null);
  const bases = getContractAdjustedBases({ modifierType, modifierValue });
  const avgTe = playerTe.reduce((sum, value) => sum + value, 0) / Math.max(1, playerTe.length);
  const assumptions = {
    te: Math.round(avgTe),
    teValues: playerTe,
    tokensPerPlayer: 0,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };

  const totalDeflector = playerArtifacts.reduce((sum, entry) => sum + (entry.deflector?.deflectorPercent ?? 0), 0);
  const playerConfigs = playerArtifacts.map((entry, index) => {
    const ihrArtifacts = playerIhrArtifacts?.[index] ?? {};
    const deflector = entry.deflector ?? { deflectorPercent: 0, slots: 0 };
    const metro = entry.metro ?? { elrMult: 1, slots: 0 };
    const compass = entry.compass ?? { srMult: 1, slots: 0 };
    const gusset = entry.gusset ?? { chickMult: 1, slots: 0, siabPercent: 0 };
    const chalice = ihrArtifacts.chalice ?? null;
    const monocle = ihrArtifacts.monocle ?? null;
    const ihrDeflector = ihrArtifacts.deflector ?? null;
    const ihrSiab = ihrArtifacts.siab ?? null;
    const boostedSiabPercent = gusset.siabPercent ?? 0;
    const ihrSiabPercent = ihrSiab?.siabPercent ?? 0;
    const te = Number.isFinite(playerTe?.[index]) ? playerTe[index] : 0;

    const maxChickens = bases.baseChickens * coleggtibles.chickenMult * gusset.chickMult;
    const baseELR = bases.baseELR * coleggtibles.elrMult * metro.elrMult;
    const baseShip = bases.baseShip * coleggtibles.shipMult * compass.srMult;
    const baseIHR = bases.baseIHR
      * Math.pow(1.01, te)
      * coleggtibles.ihrMult
      * (Number.isFinite(chalice?.ihrMult) ? chalice.ihrMult : IHR_SET.chalice.ihrMult)
      * (Number.isFinite(monocle?.ihrMult) ? monocle.ihrMult : IHR_SET.monocle.ihrMult)
      * Math.pow(1.04, getIhrStoneSlots());

    const otherDefl = totalDeflector - deflector.deflectorPercent;
    const totalSlots = (deflector.slots ?? 0) + (metro.slots ?? 0) + (compass.slots ?? 0) + (gusset.slots ?? 0);
    const elrForStones = maxChickens * baseELR * (1 + otherDefl / 100);
    const stoneLayout = optimizeStones(elrForStones, baseShip, totalSlots);

    return {
      maxChickens,
      ihr: baseIHR,
      elrPerChickenNoStones: baseELR,
      elrPerChickenWithStones: baseELR * Math.pow(1.05, stoneLayout.numTach),
      srNoStones: baseShip,
      srWithStones: baseShip * Math.pow(1.05, stoneLayout.numQuant),
      stoneLayout,
      siabPercent: siabEnabled
        ? Math.max(boostedSiabPercent, ihrSiabPercent)
        : 0,
      siabAlwaysOn: siabEnabled && boostedSiabPercent > 0,
    };
  });

  const playerDeflectors = playerArtifacts.map(entry => entry.deflector?.deflectorPercent ?? 0);
  const playerIHRs = playerConfigs.map(config => config.ihr);
  const avgIHR = playerIHRs.reduce((sum, value) => sum + value, 0) / Math.max(1, playerIHRs.length);

  const deflectorDisplay = {
    displayDeflectors: playerDeflectors,
    recommendedPlan: '',
    unusedDeflector: 0,
    canQuantScrub: false,
  };

  const boostOrder = buildBoostOrder(boostOrderMode, playerTe);

  return {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    boostOrder,
    pushCount,
    playerConfigs,
    playerArtifacts,
    playerIHRs,
    avgIHR,
    playerDeflectors,
    deflectorDisplay,
    modifierType,
    modifierValue,
  };
}

export function buildFinalModelFromPredictMaxCs(orchestration, winner) {
  return {
    players: orchestration.players,
    durationSeconds: orchestration.durationSeconds,
    targetEggs: orchestration.targetEggs,
    tokenTimerMinutes: orchestration.tokenTimerMinutes,
    giftMinutes: orchestration.giftMinutes,
    gg: orchestration.gg,
    assumptions: orchestration.assumptions,
    modifierType: orchestration.modifierType,
    modifierValue: orchestration.modifierValue,
    maxChickens: winner.maxChickensBase,
    baseIHR: winner.baseIHR,
    playerIHRs: winner.playerIHRs,
    baseElrPerPlayer: winner.baseElrPerPlayer,
    baseSrPerPlayer: winner.baseSrPerPlayer,
    elrPerChickenWithStones: 0,
    srWithStones: 0,
    stoneLayout: winner.stoneLayout,
    requiredDeflector: winner.requiredDeflector,
    deflectorPlan: buildDeflectorPlan(winner.baselineDeflectors, DEFLECTOR_TIERS),
    baselineScenario: winner.finalScenario,
    playerSummaries: winner.finalScenario,
    tokensForPrediction: winner.uniformTokens?.[0] ?? 0,
    hasFixedTokens: false,
    tokenPlan: null,
    tokensByPlayer: winner.selectedTokens,
    tokenUpgrade: null,
    usePlayer1Siab: winner.usePlayer1Siab,
    siabScoreDelta: orchestration.siabScoreDelta ?? null,
    playerConfigs: winner.playerConfigs,
    deflectorDisplay: winner.deflectorDisplay,
  };
}

export function buildFinalModelFromPredictCs(orchestration) {
  return {
    players: orchestration.players,
    durationSeconds: orchestration.durationSeconds,
    targetEggs: orchestration.targetEggs,
    tokenTimerMinutes: orchestration.tokenTimerMinutes,
    giftMinutes: orchestration.giftMinutes,
    gg: orchestration.gg,
    assumptions: orchestration.assumptions,
    modifierType: orchestration.modifierType,
    modifierValue: orchestration.modifierValue,
    maxChickens: 0,
    baseIHR: orchestration.avgIHR,
    playerIHRs: orchestration.playerIHRs,
    baseElrPerPlayer: 0,
    baseSrPerPlayer: 0,
    elrPerChickenWithStones: 0,
    srWithStones: 0,
    stoneLayout: orchestration.playerConfigs[0]?.stoneLayout ?? { numTach: 0, numQuant: 0 },
    requiredDeflector: 0,
    deflectorPlan: buildDeflectorPlan(orchestration.playerDeflectors, DEFLECTOR_TIERS),
    baselineScenario: orchestration.finalScenario,
    playerSummaries: orchestration.finalScenario,
    tokensForPrediction: orchestration.uniformTokens?.[0] ?? 0,
    hasFixedTokens: true,
    tokenPlan: null,
    tokensByPlayer: orchestration.selectedTokens,
    tokenUpgrade: null,
    usePlayer1Siab: orchestration.usePlayer1Siab,
    siabScoreDelta: 0,
    playerConfigs: orchestration.playerConfigs,
    playerArtifacts: orchestration.playerArtifacts,
    deflectorDisplay: orchestration.deflectorDisplay,
  };
}
