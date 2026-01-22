import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { ArtifactEmoji } from '../Enums.js';

const DEFLECTOR_TIERS = [
  { label: 'quant-scrub', percent: 0 },
  { label: 'epic+', percent: 19 },
  { label: 'legendary', percent: 20 },
];

const BOOSTED_SET = {
  metro: { elrMult: 1.35, slots: 3 },
  compass: { srMult: 1.5, slots: 2 },
  gusset: { chickMult: 1.25, slots: 3 },
  deflector: { slots: 2 },
};

const IHR_SET = {
  chalice: { ihrMult: 1.4, slots: 3 },
  monocle: { ihrMult: 1.3, slots: 3 },
  siabPercent: 100,
  deflector: { slots: 2 },
};

const COLLECTIBLES = {
  elrMult: 1.05,
  shipMult: 1.1025,
  ihrMult: 1.05,
  chickenMult: 1.05,
};

const BASES = {
  baseELR: 332640,
  baseShip: 2978359222414.5 * 2400,
  baseChickens: 11340000000,
  baseIHR: 7440,
};

export const data = new SlashCommandBuilder()
  .setName('predictmaxcs')
  .setDescription('Predict max CS with best-gear assumptions and token pacing.')
  .addStringOption(option =>
    option
      .setName('contract')
      .setDescription('Contract id or name (autofills missing values)')
      .setAutocomplete(true)
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('token_speed')
      .setDescription('Token gift speed per player (e.g., 6m, 11m, 15m)')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('gg')
      .setDescription('Double tokens per gift (GG)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const contractInput = interaction.options.getString('contract');
  const tokenSpeedInput = interaction.options.getString('token_speed');
  const gg = interaction.options.getBoolean('gg') ?? false;

  let contractMatch = null;
  const contracts = await fetchContractSummaries();
  contractMatch = findContractMatch(contracts, contractInput);
  if (!contractMatch) {
    return interaction.reply(createTextComponentMessage('Unknown contract. Use a valid contract id or name.', { flags: 64 }));
  }

  const players = Number.isFinite(contractMatch?.maxCoopSize) ? contractMatch.maxCoopSize : null;
  const durationSeconds = Number.isFinite(contractMatch?.coopDurationSeconds) ? contractMatch.coopDurationSeconds : null;
  const targetEggs = Number.isFinite(contractMatch?.eggGoal) ? contractMatch.eggGoal : null;
  const tokenTimerMinutes = Number.isFinite(contractMatch?.minutesPerToken) ? contractMatch.minutesPerToken : null;

  const giftMinutes = parseDurationToMinutes(tokenSpeedInput);

  const missingFields = [];
  if (!Number.isFinite(players) || players <= 0) missingFields.push('players');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) missingFields.push('duration');
  if (!Number.isFinite(targetEggs) || targetEggs <= 0) missingFields.push('target');
  if (!Number.isFinite(tokenTimerMinutes) || tokenTimerMinutes <= 0) missingFields.push('token_timer');

  if (missingFields.length > 0) {
    return interaction.reply(createTextComponentMessage(
      `Missing or invalid contract data: ${missingFields.join(', ')}. Choose a contract with those fields.`,
      { flags: 64 },
    ));
  }

  if (!Number.isFinite(giftMinutes) || giftMinutes <= 0) {
    return interaction.reply(createTextComponentMessage('Invalid token speed input.', { flags: 64 }));
  }

  const assumptions = getAssumptions();
  const model = buildModel(players, durationSeconds, targetEggs, tokenTimerMinutes, giftMinutes, gg, assumptions);
  const contractLabel = contractMatch?.name || contractMatch?.id || contractInput;
  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(`Players: ${players} | Duration: ${secondsToHuman(durationSeconds)} | Target: ${formatEggs(targetEggs)}`);

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictMaxCS (${contractLabel})`
      : 'PredictMaxCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await interaction.reply({ embeds: [first] });
  for (const embed of rest) {
    await interaction.followUp({ embeds: [embed] });
  }
}

function getAssumptions() {
  return {
    te: 100,
    tokensPerPlayer: 6,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };
}

function buildModel(players, durationSeconds, targetEggs, tokenTimerMinutes, giftMinutes, gg, assumptions) {
  const maxChickens = BASES.baseChickens
    * BOOSTED_SET.gusset.chickMult
    * COLLECTIBLES.chickenMult
    + (assumptions.swapBonus ? getSwapChickenJump(players) : 0);
  const baseELR = BASES.baseELR * BOOSTED_SET.metro.elrMult * COLLECTIBLES.elrMult;
  const baseShip = BASES.baseShip * BOOSTED_SET.compass.srMult * COLLECTIBLES.shipMult;
  const baseIHR = BASES.baseIHR
    * Math.pow(1.01, assumptions.te)
    * COLLECTIBLES.ihrMult
    * IHR_SET.chalice.ihrMult
    * IHR_SET.monocle.ihrMult
    * Math.pow(1.04, getIhrStoneSlots());

  const baseElrPerPlayer = maxChickens * baseELR;
  const baseSrPerPlayer = baseShip;
  const totalSlots = BOOSTED_SET.metro.slots + BOOSTED_SET.compass.slots + BOOSTED_SET.gusset.slots + BOOSTED_SET.deflector.slots;

  const baselineDeflectors = Array.from(
    { length: players },
    () => DEFLECTOR_TIERS.at(-1).percent,
  );
  const baselineOtherDefl = (players - 1) * DEFLECTOR_TIERS.at(-1).percent;
  const baselineElrForStones = baseElrPerPlayer * (1 + baselineOtherDefl / 100);
  const stoneLayout = optimizeStones(baselineElrForStones, baseSrPerPlayer, totalSlots);
  const elrWithStones = baseElrPerPlayer * Math.pow(1.05, stoneLayout.numTach);
  const srWithStones = baseSrPerPlayer * Math.pow(1.05, stoneLayout.numQuant);
  const elrPerChickenWithStones = baseELR * Math.pow(1.05, stoneLayout.numTach);
  const elrPerChickenNoStones = baseELR;
  const srNoStones = baseSrPerPlayer;

  const requiredDeflector = Math.max(0, ((srWithStones / elrWithStones) - 1) * 100);

  const hasFixedTokens = Number.isFinite(assumptions.tokensPerPlayer) && assumptions.tokensPerPlayer > 0;
  const tokensForPrediction = hasFixedTokens
    ? assumptions.tokensPerPlayer
    : getTokensForPrediction(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens);
  const baseScenario = simulateScenario({
    players,
    playerDeflectors: baselineDeflectors,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    maxChickens,
    tokensPerPlayer: tokensForPrediction,
    siabPercent: assumptions.siabPercent,
    cxpMode: assumptions.cxpMode,
  });
  const tokenUpgrade = optimizeLateBoostTokens({
    players,
    baseTokens: tokensForPrediction,
    altTokens: 8,
    baselineScenario: baseScenario,
    baselineDeflectors,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    maxChickens,
    siabPercent: assumptions.siabPercent,
    cxpMode: assumptions.cxpMode,
  });

  const baselineScenario = tokenUpgrade.scenario ?? baseScenario;
  const deflectorPlan = buildDeflectorPlan(baselineDeflectors, DEFLECTOR_TIERS);

  const tokenPlan = buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens);

  return {
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    maxChickens,
    baseIHR,
    baseElrPerPlayer,
    baseSrPerPlayer,
    elrPerChickenWithStones,
    srWithStones,
    stoneLayout,
    requiredDeflector,
    deflectorPlan,
    baselineScenario,
    playerSummaries: baselineScenario,
    tokensForPrediction,
    hasFixedTokens,
    tokenPlan,
    tokensByPlayer: tokenUpgrade.tokensByPlayer,
    tokenUpgrade,
  };
}
function simulateScenario(options) {
  const {
    players,
    playerDeflectors,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    maxChickens,
    tokensPerPlayer,
    siabPercent,
    cxpMode,
  } = options;

  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  const durationDays = durationSeconds / 86400;
  const fairShare = targetEggs / players;
  const tokenTimerSeconds = tokenTimerMinutes * 60;
  const giftSeconds = giftMinutes * 60;
  const ggMult = gg ? 2 : 1;
  const updateRate = 1;

  const tokensPerPlayerList = Array.isArray(tokensPerPlayer)
    ? tokensPerPlayer
    : Array.from({ length: playerDeflectors.length }, () => tokensPerPlayer);
  const states = playerDeflectors.map((deflector, index) => ({
    index: index + 1,
    deflector,
    otherDefl: totalDeflector - deflector,
    tokens: Number.isFinite(tokensPerPlayerList[index]) ? tokensPerPlayerList[index] : tokensPerPlayer,
    boostMulti: 1,
    chickens: 0,
    maxChickens,
    eggsDelivered: 0,
    btv: 0,
    maxHab: false,
    timeToBoost: null,
  }));

  const totals = runSimulationLoop({
    states,
    players,
    targetEggs,
    durationSeconds,
    updateRate,
    tokenTimerSeconds,
    giftSeconds,
    ggMult,
    baseIHR,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    siabPercent,
    cxpMode,
  });

  const completionTime = Math.min(totals.tElapsed, durationSeconds);
  const summaries = states.map(player => buildPlayerSummary({
    player,
    fairShare,
    completionTime,
    durationSeconds,
    durationDays,
    players,
    cxpMode,
  }));

  const maxCS = summaries.reduce((max, entry) => Math.max(max, entry.cs), 0);
  const minCS = summaries.reduce((min, entry) => Math.min(min, entry.cs), Infinity);
  const meanCS = summaries.reduce((sum, entry) => sum + entry.cs, 0) / summaries.length;

  return {
    playerDeflectors,
    summaries,
    maxCS,
    minCS,
    meanCS,
    completionTime,
  };
}

function runSimulationLoop(options) {
  const {
    states,
    players,
    targetEggs,
    durationSeconds,
    updateRate,
    tokenTimerSeconds,
    giftSeconds,
    ggMult,
    baseIHR,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    siabPercent,
    cxpMode,
  } = options;

  let tElapsed = 0;
  let eggsDelivered = 0;
  let tokensUsed = 0;
  let numberBoosting = 0;
  let allBoosting = false;

  while (eggsDelivered < targetEggs && tElapsed < durationSeconds) {
    const updateTotals = updatePlayers({
      states,
      updateRate,
      baseIHR,
      elrPerChickenNoStones,
      elrPerChickenWithStones,
      srNoStones,
      srWithStones,
      siabPercent,
      cxpMode,
    });
    const totalTokens = computeTotalTokens({
      tElapsed,
      players,
      giftSeconds,
      tokenTimerSeconds,
      ggMult,
    });

    if (!allBoosting) {
      const boostResult = applyNextBoost({
        states,
        numberBoosting,
        totalTokens,
        tokensUsed,
        tElapsed,
      });
      numberBoosting = boostResult.numberBoosting;
      tokensUsed = boostResult.tokensUsed;
      allBoosting = numberBoosting >= states.length;
    }

    eggsDelivered = updateTotals.eggsDelivered;
    tElapsed += updateRate;
  }

  return { tElapsed, eggsDelivered };
}

function updatePlayers(options) {
  const {
    states,
    updateRate,
    baseIHR,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    siabPercent,
    cxpMode,
  } = options;

  let notMaxHabs = 0;
  states.forEach(player => {
    if (!player.maxHab) {
      const increase = baseIHR * 12 * player.boostMulti / 60 * updateRate;
      player.chickens = Math.min(player.chickens + increase, player.maxChickens);
      if (player.chickens === player.maxChickens) {
        player.maxHab = true;
      }
    }

    const elrPerChicken = player.maxHab ? elrPerChickenWithStones : elrPerChickenNoStones;
    const shipRate = player.maxHab ? srWithStones : srNoStones;
    const layRate = player.chickens * elrPerChicken * (1 + player.otherDefl / 100);
    const deliveryRate = Math.min(layRate, shipRate);
    player.eggsDelivered += updateRate * deliveryRate / 3600;
    player.btv += updateRate * getBtvRate(player.deflector, siabPercent, cxpMode);

    if (!player.maxHab) notMaxHabs += 1;
  });

  const eggsDelivered = states.reduce((sum, player) => sum + player.eggsDelivered, 0);
  return { notMaxHabs, eggsDelivered };
}

function computeTotalTokens(options) {
  const {
    tElapsed,
    players,
    giftSeconds,
    tokenTimerSeconds,
    ggMult,
  } = options;

  let totalTokens = 0;
  if (giftSeconds > 0) {
    totalTokens += Math.floor(tElapsed * players / giftSeconds) * ggMult;
  }
  if (tokenTimerSeconds > 0) {
    totalTokens += Math.floor(tElapsed / tokenTimerSeconds) * players;
  }
  return totalTokens;
}

function applyNextBoost(options) {
  const {
    states,
    numberBoosting,
    totalTokens,
    tokensUsed,
    tElapsed,
  } = options;

  const currentPlayer = states[numberBoosting];
  if (!currentPlayer) {
    return { numberBoosting, tokensUsed };
  }

  if (currentPlayer.tokens <= (totalTokens - tokensUsed)) {
    currentPlayer.boostMulti = calcBoostMulti(currentPlayer.tokens);
    if (currentPlayer.timeToBoost == null) {
      currentPlayer.timeToBoost = tElapsed;
    }
    return {
      numberBoosting: numberBoosting + 1,
      tokensUsed: tokensUsed + currentPlayer.tokens,
    };
  }

  return { numberBoosting, tokensUsed };
}

function buildPlayerSummary(options) {
  const {
    player,
    fairShare,
    completionTime,
    durationSeconds,
    durationDays,
    players,
    cxpMode,
  } = options;

  const contributionRatio = fairShare > 0 ? player.eggsDelivered / fairShare : 0;
  const btvRat = completionTime > 0 ? player.btv / completionTime : 0;
  const teamwork = getTeamwork(btvRat, players, durationDays, Math.min(players - 1, 20), 0, cxpMode);
  const cs = getCS(contributionRatio, durationSeconds, completionTime, teamwork);

  return {
    index: player.index,
    deflector: player.deflector,
    contributionRatio,
    teamwork,
    cs,
    completionTime,
    timeToBoost: player.timeToBoost,
  };
}

function buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens) {
  const tokenRate = (players / tokenTimerMinutes) + (gg ? 2 : 1) * (players / giftMinutes);
  const options = [4, 5, 6, 8];
  const results = options.map(tokens => {
    const boostMulti = calcBoostMulti(tokens);
    const minutesToTokens = tokens / tokenRate;
    const minutesToMax = maxChickens / (baseIHR * 12 * boostMulti);
    const totalMinutes = minutesToTokens + minutesToMax;
    const efficiency = boostMulti / tokens;
    return {
      tokens,
      boostMulti,
      minutesToTokens,
      minutesToMax,
      totalMinutes,
      efficiency,
    };
  });

  const bestEfficiency = results.reduce((best, current) => {
    if (!best) return current;
    if (current.efficiency > best.efficiency) return current;
    if (current.efficiency === best.efficiency && current.totalMinutes < best.totalMinutes) return current;
    return best;
  }, null);

  const bestTime = results.reduce((best, current) => {
    if (!best) return current;
    if (current.totalMinutes < best.totalMinutes) return current;
    return best;
  }, null);

  return { tokenRate, results, bestEfficiency, bestTime };
}

function getTokensForPrediction(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens) {
  const plan = buildTokenPlan(tokenTimerMinutes, giftMinutes, gg, players, baseIHR, maxChickens);
  return plan.bestTime?.tokens ?? 6;
}

function optimizeLateBoostTokens(options) {
  const {
    players,
    baseTokens,
    altTokens,
    baselineScenario,
    baselineDeflectors,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    maxChickens,
    siabPercent,
    cxpMode,
  } = options;

  const baseScenario = baselineScenario ?? simulateScenario({
    players,
    playerDeflectors: baselineDeflectors,
    elrPerChickenNoStones,
    elrPerChickenWithStones,
    srNoStones,
    srWithStones,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    baseIHR,
    maxChickens,
    tokensPerPlayer: baseTokens,
    siabPercent,
    cxpMode,
  });

  const baseCs = baseScenario.summaries[0]?.cs ?? 0;
  let bestCs = baseCs;
  let bestCount = 0;
  let bestScenario = baseScenario;

  for (let count = 1; count <= players; count += 1) {
    const tokensByPlayer = Array.from({ length: players }, (_, index) => {
      const isLate = index >= players - count;
      return isLate ? altTokens : baseTokens;
    });

    const scenario = simulateScenario({
      players,
      playerDeflectors: baselineDeflectors,
      elrPerChickenNoStones,
      elrPerChickenWithStones,
      srNoStones,
      srWithStones,
      durationSeconds,
      targetEggs,
      tokenTimerMinutes,
      giftMinutes,
      gg,
      baseIHR,
      maxChickens,
      tokensPerPlayer: tokensByPlayer,
      siabPercent,
      cxpMode,
    });

    const cs = scenario.summaries[0]?.cs ?? 0;
    if (cs > bestCs) {
      bestCs = cs;
      bestCount = count;
      bestScenario = scenario;
    } else {
      break;
    }
  }

  const tokensByPlayer = Array.from({ length: players }, (_, index) => {
    const isLate = index >= players - bestCount;
    return isLate ? altTokens : baseTokens;
  });

  return {
    bestCount,
    baseCs,
    bestCs,
    tokensByPlayer,
    scenario: bestScenario,
  };
}

function minimizeDeflectors(players, baselineMinCS, tiers, elrBase, srBase, durationSeconds, targetEggs) {
  const highestTier = tiers[tiers.length - 1];
  const playerDeflectors = Array.from({ length: players }, () => highestTier.percent);

  let improved = true;
  while (improved) {
    improved = false;
    for (let playerIndex = 0; playerIndex < players; playerIndex += 1) {
      const currentPercent = playerDeflectors[playerIndex];
      const currentTierIndex = tiers.findIndex(tier => tier.percent === currentPercent);
      if (currentTierIndex <= 0) continue;

      for (let lowerIndex = currentTierIndex - 1; lowerIndex >= 0; lowerIndex -= 1) {
        const nextPercent = tiers[lowerIndex].percent;
        playerDeflectors[playerIndex] = nextPercent;

        const scenario = computeScenario(players, playerDeflectors, elrBase, srBase, durationSeconds, targetEggs);
        if (scenario.minCS >= baselineMinCS) {
          improved = true;
          break;
        }

        playerDeflectors[playerIndex] = currentPercent;
      }
    }
  }

  return computeScenario(players, playerDeflectors, elrBase, srBase, durationSeconds, targetEggs);
}

function buildDeflectorPlan(playerDeflectors, tiers) {
  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  const tierCounts = new Map();
  playerDeflectors.forEach(value => {
    const tier = tiers.find(entry => entry.percent === value);
    if (!tier) return;
    tierCounts.set(tier.label, (tierCounts.get(tier.label) ?? 0) + 1);
  });

  const tiersSummary = Array.from(tierCounts.entries())
    .map(([label, count]) => ({
      tier: tiers.find(entry => entry.label === label),
      count,
    }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.tier.percent - a.tier.percent);

  const minTier = [...tiersSummary].sort((a, b) => a.tier.percent - b.tier.percent)[0]?.tier ?? tiers[0];

  return {
    totalDeflector,
    minTier,
    tiers: tiersSummary,
  };
}

function getEligibleDeflectorTiers(players, tiers, requiredOtherDeflector) {
  const sorted = [...tiers].sort((a, b) => a.percent - b.percent);
  if (players <= 1) return sorted;
  return sorted.filter(tier => (tier.percent * (players - 1)) >= requiredOtherDeflector);
}

function canUseAllTier(players, tier, requiredOtherDeflector) {
  if (!tier) return false;
  if (players <= 1) return true;
  return (tier.percent * (players - 1)) >= requiredOtherDeflector;
}

function canUseSwapMix(players, highestTier, nextTier, requiredOtherDeflector) {
  if (!highestTier || !nextTier) return false;
  if (players <= 1) return true;
  const otherForHighest = (players - 2) * highestTier.percent + nextTier.percent;
  const otherForNext = (players - 1) * highestTier.percent;
  return Math.min(otherForHighest, otherForNext) >= requiredOtherDeflector;
}

function getMaxQuantScrubs(players, basePercent, requiredOtherDeflector) {
  if (players <= 1) return 0;
  if (!basePercent || basePercent <= 0) return 0;
  const minBaseNeeded = Math.ceil(requiredOtherDeflector / basePercent);
  const maxScrubs = (players - 1) - minBaseNeeded;
  return Math.max(0, Math.min(players, maxScrubs));
}

function getUnusedDeflectorPercent(players, playerDeflectors, maxChickens, elrPerChickenWithStones, srWithStones) {
  if (players < 2) {
    return Math.round(playerDeflectors.reduce((sum, value) => sum + value, 0));
  }

  const totalDeflector = playerDeflectors.reduce((sum, value) => sum + value, 0);
  let minRatio = Number.POSITIVE_INFINITY;
  let minDeflMultiplier = 1;

  playerDeflectors.forEach(deflector => {
    const otherDefl = totalDeflector - deflector;
    const layRate = maxChickens * elrPerChickenWithStones * (1 + otherDefl / 100);
    const ratio = layRate / srWithStones;
    if (ratio < minRatio) {
      minRatio = ratio;
      minDeflMultiplier = otherDefl / 100 + 1;
    }
  });

  if (minRatio < 1) return 0;
  const unused = (minDeflMultiplier - 1) * 100 - (minDeflMultiplier / minRatio - 1) * 100;
  return Math.min(Math.floor(unused), Math.round(totalDeflector));
}

function optimizeStones(elr, sr, totalSlots) {
  let numTach = 0;
  let numQuant = 0;
  let curElr = elr;
  let curSr = sr;

  for (let i = 0; i < totalSlots; i += 1) {
    if (curElr < curSr) {
      curElr *= 1.05;
      numTach += 1;
    } else {
      curSr *= 1.05;
      numQuant += 1;
    }
  }

  return {
    elr: curElr,
    sr: curSr,
    numTach,
    numQuant,
    totalSlots,
  };
}

function getCS(contributionRatio, originalLength, completionTime, tw) {
  let cs = 1 + originalLength / 259200;
  cs *= 7;
  const fac = contributionRatio > 2.5
    ? 0.02221 * Math.min(contributionRatio, 12.5) + 4.386486
    : 3 * Math.pow(contributionRatio, 0.15) + 1;
  cs *= fac;
  cs *= 4 * Math.pow((1 - completionTime / originalLength), 3) + 1;
  cs *= (0.19 * tw + 1);
  cs *= 1.05;
  cs = Math.ceil(cs * 187.5);
  return cs;
}

function getTeamwork(btvRat, numPlayers, durDays, crt, T, new2p0) {
  let B = Math.min(btvRat, 2);
  crt = Math.min(crt, 20);
  const fCR = Math.max(12 / numPlayers / durDays, 0.3);
  let CR = Math.min(fCR * crt, 6);
  if (new2p0) {
    CR = numPlayers > 1 ? 5 : 0;
    T = 0;
  }
  return (5 * B + CR + T) / 19;
}

function getBtvRate(deflectorPercent, siabPercent, new2p0) {
  const btvRate = new2p0
    ? 12.5 * Math.min(deflectorPercent, 12) + 0.75 * Math.min(siabPercent, 50)
    : 7.5 * (deflectorPercent + siabPercent / 10);
  return btvRate / 100;
}

function calcBoostMulti(tokens) {
  switch (tokens) {
    case 1:
      return (4 * 10) * 2;
    case 2:
      return (100 + 4 * 10);
    case 3:
      return (100 + 3 * 10) * 2;
    case 4:
      return (1000 + 4 * 10);
    case 5:
      return (1000 + 3 * 10) * 2;
    case 6:
      return (1000 + 2 * 10) * 4;
    case 7:
      return (1000 + 10) * 6;
    case 8:
      return (1000 + 3 * 10) * 10;
    case 9:
      return (1000 + 2 * 10) * 12;
    case 10:
      return (1000 + 10) * 14;
    case 11:
      return (1000) * 16;
    case 12:
      return (1000 + 3 * 10) * 50;
    default:
      return 50;
  }
}

function parseDurationToSeconds(input) {
  const parsed = parseNumberAndUnit(input);
  if (!parsed) return Number.NaN;
  const { value, unit } = parsed;
  const normalized = unit.toLowerCase();
  switch (normalized) {
    case 's':
    case 'sec':
    case 'secs':
    case 'second':
    case 'seconds':
      return value;
    case 'm':
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      return value * 60;
    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      return value * 3600;
    case 'd':
    case 'day':
    case 'days':
      return value * 86400;
    case 'w':
    case 'week':
    case 'weeks':
      return value * 7 * 86400;
    case 'mo':
    case 'mon':
    case 'month':
    case 'months':
      return value * 30 * 86400;
    default:
      return Number.NaN;
  }
}

function parseDurationToMinutes(input) {
  const seconds = parseDurationToSeconds(input);
  if (!Number.isFinite(seconds)) return Number.NaN;
  return seconds / 60;
}

function parseEggAmount(input) {
  const parsed = parseNumberAndUnit(input);
  if (!parsed) return Number.NaN;
  const { value, unit } = parsed;
  if (!unit) return value;
  if (unit === 'T' || unit === 't') return value * 1e12;
  if (unit === 'q') return value * 1e15;
  if (unit === 'Q') return value * 1e18;
  return value;
}

function parseNumberAndUnit(input) {
  if (!input) return null;
  const trimmed = String(input).split('/')[0].trim();
  const sanitized = trimmed.replaceAll(',', '');
  const match = /^(\d*\.?\d+)\s*([a-zA-Z]+)?$/.exec(sanitized);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2] ?? '',
  };
}

function findContractMatch(contracts, query) {
  if (!Array.isArray(contracts) || !query) return null;
  const trimmed = String(query).trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();

  const exactId = contracts.find(contract => String(contract.id).toLowerCase() === normalized);
  if (exactId) return exactId;

  const exactName = contracts.find(contract => String(contract.name || '').toLowerCase() === normalized);
  if (exactName) return exactName;

  return contracts.find(contract =>
    String(contract.id || '').toLowerCase().includes(normalized)
    || String(contract.name || '').toLowerCase().includes(normalized)
  ) ?? null;
}

function formatDeflectorDisplay(deflectorPercent) {
  if (deflectorPercent === DEFLECTOR_TIERS[0].percent) {
    return `${ArtifactEmoji.NEO_MEDALLION_4} QS`;
  }
  if (deflectorPercent === DEFLECTOR_TIERS.at(-1)?.percent) {
    return `${ArtifactEmoji.DEFLECTOR_4} L`;
  }
  if (deflectorPercent === DEFLECTOR_TIERS.at(-2)?.percent) {
    return `${ArtifactEmoji.DEFLECTOR_4} E`;
  }
  return `${ArtifactEmoji.DEFLECTOR_4} ${deflectorPercent}%`;
}

function buildPlayerTableLines(model, assumptions) {
  const {
    players,
    durationSeconds,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    maxChickens,
    elrPerChickenWithStones,
    srWithStones,
    stoneLayout,
    requiredDeflector,
    deflectorPlan,
    baselineScenario,
    playerSummaries,
    tokensForPrediction,
    hasFixedTokens,
    tokensByPlayer,
    tokenUpgrade,
  } = model;

  const deflectorPlanText = deflectorPlan.tiers
    .map(tier => `${tier.count}x ${tier.tier.label} (${tier.tier.percent}%)`)
    .join(', ');
  const requiredOtherDeflector = Math.ceil(requiredDeflector);
  const highestTier = DEFLECTOR_TIERS.at(-1);
  const nextTier = DEFLECTOR_TIERS.at(-2);
  const canAllNextTier = canUseAllTier(players, nextTier, requiredOtherDeflector);
  const canAllHighest = canUseAllTier(players, highestTier, requiredOtherDeflector);
  const canSwapOne = canUseSwapMix(players, highestTier, nextTier, requiredOtherDeflector);
  const baselineUnusedDeflector = getUnusedDeflectorPercent(
    players,
    baselineScenario.playerDeflectors,
    maxChickens,
    elrPerChickenWithStones,
    srWithStones,
  );
  const percentDrop = highestTier && nextTier ? highestTier.percent - nextTier.percent : 0;
  const epicSlackCount = canAllHighest && percentDrop > 0
    ? Math.min(players, Math.max(0, Math.floor(baselineUnusedDeflector / percentDrop)))
    : 0;
  const baseTier = canAllNextTier ? nextTier : highestTier;
  let recommendedPlan = deflectorPlanText;
  if (canAllNextTier && nextTier) {
    recommendedPlan = `${players}x ${nextTier.label}`;
  } else if (epicSlackCount > 0 && highestTier && nextTier) {
    recommendedPlan = `${players - epicSlackCount}x ${highestTier.label} + ${epicSlackCount}x ${nextTier.label}`;
  } else if (canSwapOne && highestTier && nextTier) {
    recommendedPlan = `${players - 1}x ${highestTier.label} + 1x ${nextTier.label}`;
  } else if (canAllHighest && highestTier) {
    recommendedPlan = `${players}x ${highestTier.label}`;
  }

  const displayDeflectors = playerSummaries.summaries.map(summary => summary.deflector);
  if (canAllNextTier && nextTier) {
    for (let i = 0; i < displayDeflectors.length; i += 1) {
      displayDeflectors[i] = nextTier.percent;
    }
  } else if (epicSlackCount > 0 && highestTier && nextTier) {
    for (let i = displayDeflectors.length - epicSlackCount; i < displayDeflectors.length; i += 1) {
      if (i >= 0) displayDeflectors[i] = nextTier.percent;
    }
  } else if (canSwapOne && highestTier && nextTier && displayDeflectors.length > 0) {
    displayDeflectors[displayDeflectors.length - 1] = nextTier.percent;
  } else if (canAllHighest && highestTier) {
    for (let i = 0; i < displayDeflectors.length; i += 1) {
      displayDeflectors[i] = highestTier.percent;
    }
  }

  const canQuantScrub = baselineUnusedDeflector > 25 && (canAllHighest || canAllNextTier);
  let scrubCount = 0;
  let scrubBaseTier = baseTier;
  if (canQuantScrub) {
    const highestScrubs = canAllHighest && highestTier
      ? getMaxQuantScrubs(players, highestTier.percent, requiredOtherDeflector)
      : 0;
    const nextScrubs = canAllNextTier && nextTier
      ? getMaxQuantScrubs(players, nextTier.percent, requiredOtherDeflector)
      : 0;

    if (highestScrubs >= nextScrubs && highestTier) {
      scrubCount = highestScrubs;
      scrubBaseTier = highestTier;
    } else if (nextTier) {
      scrubCount = nextScrubs;
      scrubBaseTier = nextTier;
    }

    if (scrubCount > 0 && scrubBaseTier) {
      recommendedPlan = `${players - scrubCount}x ${scrubBaseTier.label} + ${scrubCount}x quant-scrub`;
      for (let i = 0; i < displayDeflectors.length; i += 1) {
        displayDeflectors[i] = scrubBaseTier.percent;
      }
      for (let i = displayDeflectors.length - scrubCount; i < displayDeflectors.length; i += 1) {
        if (i >= 0) displayDeflectors[i] = DEFLECTOR_TIERS[0].percent;
      }
    }
  }

  const unusedDeflector = getUnusedDeflectorPercent(
    players,
    displayDeflectors,
    maxChickens,
    elrPerChickenWithStones,
    srWithStones,
  );

  const adjustedSummaries = playerSummaries.summaries.map((summary, index) => {
    const deflectorPercent = displayDeflectors[index];
    const btvRat = getBtvRate(deflectorPercent, assumptions.siabPercent, assumptions.cxpMode);
    const teamwork = getTeamwork(btvRat, players, durationSeconds / 86400, Math.min(players - 1, 20), 0, assumptions.cxpMode);
    const cs = getCS(summary.contributionRatio, durationSeconds, summary.completionTime, teamwork);
    return {
      ...summary,
      deflector: deflectorPercent,
      teamwork,
      cs,
    };
  });

  const adjustedMaxCS = adjustedSummaries.reduce((max, entry) => Math.max(max, entry.cs), 0);
  const adjustedMinCS = adjustedSummaries.reduce((min, entry) => Math.min(min, entry.cs), Infinity);
  const adjustedMeanCS = adjustedSummaries.reduce((sum, entry) => sum + entry.cs, 0) / adjustedSummaries.length;

  const tokenEmoji = ArtifactEmoji.TOKEN;

  const effectiveTokens = Array.isArray(tokensByPlayer) && tokensByPlayer.length === players
    ? tokensByPlayer
    : Array.from({ length: players }, () => tokensForPrediction);
  const lateBoostText = tokenUpgrade?.bestCount
    ? ` | last ${tokenUpgrade.bestCount} use ${tokenUpgrade.tokensByPlayer[players - 1]} toks`
    : '';

  const displayRows = adjustedSummaries.map((summary, index) => ({
    summary,
    deflector: displayDeflectors[index],
    tokens: effectiveTokens[index],
  }));

  const lines = [
    `Token timer: ${formatMinutes(tokenTimerMinutes)} | gift speed: ${formatMinutes(giftMinutes)} | GG: ${gg ? 'on' : 'off'}`,
    `Tokens to boost: ${tokenEmoji} ${tokensForPrediction}${hasFixedTokens ? '' : ' (fastest max-habs)'}${lateBoostText}`,
    `Deflector needed (other total): ~${requiredOtherDeflector}% | Unused: ~${Math.max(0, Math.floor(unusedDeflector))}%`,
    `Recommended: ${recommendedPlan}${canQuantScrub ? ' (quant-scrub OK)' : ''}`,
    `CS: max ${Math.round(adjustedMaxCS)} | mean ${Math.round(adjustedMeanCS)} | min ${Math.round(adjustedMinCS)}`,
    '',
    'player | def | tach | quant | tokens | cs',
    ...displayRows.map(row => {
      const { summary, deflector, tokens } = row;
      const isScrub = deflector === DEFLECTOR_TIERS[0].percent;
      const extraTach = isScrub && stoneLayout.numTach > stoneLayout.numQuant ? 1 : 0;
      const extraQuant = isScrub && stoneLayout.numQuant >= stoneLayout.numTach ? 1 : 0;
      const tachText = `${ArtifactEmoji.TACHYON_4} ${stoneLayout.numTach + extraTach}`;
      const quantText = `${ArtifactEmoji.QUANTUM_4} ${stoneLayout.numQuant + extraQuant}`;
      const tokenText = `${tokenEmoji} ${tokens}`;
      return `Player ${summary.index} | ${formatDeflectorDisplay(deflector)} | ${tachText} | ${quantText} | ${tokenText} | ${Math.round(summary.cs)}`;
    }),
  ];

  return lines;
}

function formatEggs(value) {
  if (value >= 1e18) return `${(value / 1e18).toFixed(2)}Q`;
  if (value >= 1e15) return `${(value / 1e15).toFixed(2)}q`;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  return value.toLocaleString();
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return 'N/A';
  if (minutes >= 60 * 24) return `${(minutes / 1440).toFixed(2)}d`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(2)}h`;
  return `${minutes.toFixed(1)}m`;
}

function secondsToHuman(seconds) {
  if (!Number.isFinite(seconds)) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getIhrStoneSlots() {
  return IHR_SET.chalice.slots + IHR_SET.monocle.slots + IHR_SET.deflector.slots + 2;
}

function getSwapChickenJump(players) {
  return 5e8 * Math.max(players - 1, 0);
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused()?.toLowerCase?.() ?? '';
  const contracts = await fetchContractSummaries();
  const filtered = contracts
    .filter(contract =>
      String(contract.id || '').toLowerCase().includes(focused)
      || String(contract.name || '').toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map(contract => ({
      name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
    }));

  await interaction.respond(filtered);
}