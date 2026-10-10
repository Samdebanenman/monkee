import { forEachSequential } from '../../utils/async.js';
import { EmbedBuilder } from 'discord.js';
import { chunkContent } from '../discord.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../../sim-core/src/predictmaxcs/display.js';
import {
  buildFinalModelFromPredictMaxCs,
  buildPredictMaxCsVariant,
  setScenarioBatch,
  scorePredictMaxCsResult,
  tokenCandidates,
} from './shared.js';

async function handlePhaseUniform(simulation) {
  const scenarios = [];
  simulation.variants.forEach(variant => {
    tokenCandidates.forEach(candidate => {
      const tokensByPlayer = Array.from({ length: simulation.players }, () => candidate);
      const scenario = {
        players: simulation.players,
        playerDeflectors: variant.baselineDeflectors,
        playerConfigs: variant.playerConfigs,
        durationSeconds: simulation.durationSeconds,
        targetEggs: simulation.targetEggs,
        tokenTimerMinutes: simulation.tokenTimerMinutes,
        giftMinutes: simulation.giftMinutes,
        gg: simulation.gg,
        baseIHR: variant.baseIHR,
        tokensPerPlayer: tokensByPlayer,
        cxpMode: simulation.assumptions.cxpMode,
      };

      scenarios.push({
        context: {
          phase: 'uniform',
          variantId: variant.id,
          tokenCandidate: candidate,
        },
        scenario,
      });
    });
  });

  setScenarioBatch(simulation, scenarios);
}

async function handlePhaseSweep(simulation) {
  const scenarios = [];
  const variant = simulation.variantsToSweep[simulation.sweepVariantIndex];
  const playerIndex = simulation.sweepPlayerIndex;
  if (!variant || playerIndex >= simulation.players) return;

  tokenCandidates.forEach(candidate => {
    const tokensByPlayer = variant.selectedTokens.slice();
    tokensByPlayer[playerIndex] = candidate;
    const scenario = {
      players: simulation.players,
      playerDeflectors: variant.baselineDeflectors,
      playerConfigs: variant.playerConfigs,
      durationSeconds: simulation.durationSeconds,
      targetEggs: simulation.targetEggs,
      tokenTimerMinutes: simulation.tokenTimerMinutes,
      giftMinutes: simulation.giftMinutes,
      gg: simulation.gg,
      baseIHR: variant.baseIHR,
      tokensPerPlayer: tokensByPlayer,
      cxpMode: simulation.assumptions.cxpMode,
    };

    scenarios.push({
      context: {
        phase: 'sweep',
        variantId: variant.id,
        playerIndex,
        tokenCandidate: candidate,
      },
      scenario,
    });
  });

  setScenarioBatch(simulation, scenarios);
}

async function handlePhaseFinal(simulation) {
  const scenarios = [];
  simulation.variantsToFinalize.forEach(variant => {
    const scenario = {
      players: simulation.players,
      playerDeflectors: variant.baselineDeflectors,
      playerConfigs: variant.playerConfigs,
      durationSeconds: simulation.durationSeconds,
      targetEggs: simulation.targetEggs,
      tokenTimerMinutes: simulation.tokenTimerMinutes,
      giftMinutes: simulation.giftMinutes,
      gg: simulation.gg,
      baseIHR: variant.baseIHR,
      tokensPerPlayer: variant.selectedTokens,
      cxpMode: simulation.assumptions.cxpMode,
    };

    scenarios.push({
      context: {
        phase: 'final',
        variantId: variant.id,
      },
      scenario,
    });
  });

  setScenarioBatch(simulation, scenarios);
}

async function finalize(simulation) {
  const ranked = simulation.variantsToFinalize
    .map(variant => ({
      variant,
      score: variant.finalScore ?? -Infinity,
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]?.variant;
  if (!winner) return;

  const model = buildFinalModelFromPredictMaxCs(simulation, winner);
  const outputLines = buildPlayerTableLines(model, simulation.assumptions);
  outputLines.unshift(
    `Players: ${simulation.players} | Duration: ${secondsToHuman(simulation.durationSeconds)} | Target: ${formatEggs(simulation.targetEggs)}`,
  );

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictMaxCS (${simulation.contractLabel})`
      : 'PredictMaxCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await simulation.interaction.editReply({ content: '', embeds: [first] });
  await forEachSequential(rest, async embed => {
    await simulation.interaction.followUp({ embeds: [embed] });
  });
  return model;
}

export async function createPredictMaxCsRun(options) {
  const {
    interaction,
    contractLabel,
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    siabOverride,
    modifierType,
    modifierValue,
    colleggtiblesRows,
  } = options;

  const baseVariant = buildPredictMaxCsVariant({
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    usePlayer1Siab: false,
    modifierType,
    modifierValue,
    colleggtiblesRows,
  });
  baseVariant.id = 'base';
  baseVariant.uniformScores = new Map();
  baseVariant.sweepScores = new Map();

  const siabVariant = buildPredictMaxCsVariant({
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    usePlayer1Siab: true,
    modifierType,
    modifierValue,
    colleggtiblesRows,
  });
  siabVariant.id = 'siab';
  siabVariant.uniformScores = new Map();
  siabVariant.sweepScores = new Map();

  const variants = [baseVariant, siabVariant];
  const variantMap = new Map(variants.map(variant => [variant.id, variant]));
  const sweepVariantCount = siabOverride == null ? 2 : 1;
  const expectedSimulationCount = (tokenCandidates.length * 2)
    + (tokenCandidates.length * players * sweepVariantCount)
    + sweepVariantCount;

  const simulation = {
    type: 'predictmaxcs',
    interaction,
    contractLabel,
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    siabOverride,
    modifierType,
    modifierValue,
    variants,
    variantMap,
    variantsToSweep: [],
    variantsToFinalize: [],
    phase: 'uniform',
    pending: 0,
    expectedSimulationCount,
  };

  await handlePhaseUniform(simulation);
  return simulation;
}

export function handlePredictMaxCsResult(simulation, result) {
  const context = result.context ?? {};
  const variant = simulation.variantMap.get(context.variantId);
  if (!variant) return;

  const score = scorePredictMaxCsResult(result, variant);
  if (context.phase === 'uniform') {
    variant.uniformScores.set(context.tokenCandidate, score);
  } else if (context.phase === 'sweep') {
    const bucket = variant.sweepScores.get(context.playerIndex) ?? new Map();
    bucket.set(context.tokenCandidate, score);
    variant.sweepScores.set(context.playerIndex, bucket);
  } else if (context.phase === 'final') {
    variant.finalScenario = result;
    variant.finalScore = score;
  }
}

export async function advancePredictMaxCs(simulation) {
  if (simulation.pending > 0) return;

  if (simulation.phase === 'uniform') {
    simulation.variants.forEach(variant => {
      let bestCandidate = tokenCandidates[0];
      let bestScore = -Infinity;
      variant.uniformScores.forEach((score, candidate) => {
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      });
      variant.uniformTokens = Array.from({ length: simulation.players }, () => bestCandidate);
      variant.selectedTokens = variant.uniformTokens.slice();
    });

    if (simulation.siabOverride === true) {
      simulation.variantsToSweep = [simulation.variantMap.get('siab')];
    } else if (simulation.siabOverride === false) {
      simulation.variantsToSweep = [simulation.variantMap.get('base')];
    } else {
      simulation.variantsToSweep = simulation.variants;
    }

    simulation.sweepVariantIndex = 0;
    simulation.sweepPlayerIndex = 0;
    await handlePhaseSweep(simulation);
    simulation.phase = 'sweep';
    return;
  }

  if (simulation.phase === 'sweep') {
    const variant = simulation.variantsToSweep[simulation.sweepVariantIndex];
    const playerIndex = simulation.sweepPlayerIndex;
    const bucket = variant?.sweepScores.get(playerIndex) ?? new Map();
    let bestCandidate = variant?.selectedTokens[playerIndex] ?? tokenCandidates[0];
    let bestScore = -Infinity;
    bucket.forEach((score, candidate) => {
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });
    variant.selectedTokens[playerIndex] = bestCandidate;

    simulation.sweepPlayerIndex += 1;
    if (simulation.sweepPlayerIndex < simulation.players) {
      await handlePhaseSweep(simulation);
      return;
    }

    simulation.sweepVariantIndex += 1;
    simulation.sweepPlayerIndex = 0;
    if (simulation.sweepVariantIndex < simulation.variantsToSweep.length) {
      await handlePhaseSweep(simulation);
      return;
    }

    simulation.variantsToFinalize = simulation.variantsToSweep;
    await handlePhaseFinal(simulation);
    simulation.phase = 'final';
    return;
  }

  if (simulation.phase === 'final') {
    return finalize(simulation);
  }
}
