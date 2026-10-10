import { forEachSequential } from '../../utils/async.js';
import { EmbedBuilder } from 'discord.js';
import { chunkContent } from '../discord.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../../sim-core/src/predictmaxcs/display.js';
import {
  buildFinalModelFromPredictCs,
  buildPredictCsVariant,
  setScenarioBatch,
  scorePredictCsResult,
  tokenCandidates,
} from './shared.js';

async function handlePhaseUniform(simulation) {
  const scenarios = [];
  tokenCandidates.forEach(candidate => {
    const tokensByPlayer = Array.from({ length: simulation.players }, () => candidate);
    const scenario = {
      players: simulation.players,
      playerDeflectors: simulation.playerDeflectors,
      playerConfigs: simulation.playerConfigs,
      durationSeconds: simulation.durationSeconds,
      targetEggs: simulation.targetEggs,
      tokenTimerMinutes: simulation.tokenTimerMinutes,
      giftMinutes: simulation.giftMinutes,
      gg: simulation.gg,
      baseIHR: simulation.avgIHR,
      tokensPerPlayer: tokensByPlayer,
      cxpMode: simulation.assumptions.cxpMode,
      boostOrder: simulation.boostOrder,
    };

    scenarios.push({
      context: {
        phase: 'uniform',
        tokenCandidate: candidate,
      },
      scenario,
    });
  });

  setScenarioBatch(simulation, scenarios);
}

async function handlePhaseSweep(simulation) {
  const scenarios = [];
  const playerIndex = simulation.sweepPlayerIndex;
  if (playerIndex >= simulation.players) return;

  tokenCandidates.forEach(candidate => {
    const tokensByPlayer = simulation.selectedTokens.slice();
    tokensByPlayer[playerIndex] = candidate;
    const scenario = {
      players: simulation.players,
      playerDeflectors: simulation.playerDeflectors,
      playerConfigs: simulation.playerConfigs,
      durationSeconds: simulation.durationSeconds,
      targetEggs: simulation.targetEggs,
      tokenTimerMinutes: simulation.tokenTimerMinutes,
      giftMinutes: simulation.giftMinutes,
      gg: simulation.gg,
      baseIHR: simulation.avgIHR,
      tokensPerPlayer: tokensByPlayer,
      cxpMode: simulation.assumptions.cxpMode,
      boostOrder: simulation.boostOrder,
    };

    scenarios.push({
      context: {
        phase: 'sweep',
        playerIndex,
        tokenCandidate: candidate,
      },
      scenario,
    });
  });

  setScenarioBatch(simulation, scenarios);
}

async function handlePhaseFinal(simulation) {
  const scenario = {
    players: simulation.players,
    playerDeflectors: simulation.playerDeflectors,
    playerConfigs: simulation.playerConfigs,
    durationSeconds: simulation.durationSeconds,
    targetEggs: simulation.targetEggs,
    tokenTimerMinutes: simulation.tokenTimerMinutes,
    giftMinutes: simulation.giftMinutes,
    gg: simulation.gg,
    baseIHR: simulation.avgIHR,
    tokensPerPlayer: simulation.selectedTokens,
    cxpMode: simulation.assumptions.cxpMode,
    boostOrder: simulation.boostOrder,
  };

  setScenarioBatch(simulation, [{
    context: { phase: 'final' },
    scenario,
  }]);
}

async function finalize(simulation) {
  const model = buildFinalModelFromPredictCs(simulation);
  const outputLines = buildPlayerTableLines(model, simulation.assumptions);
  outputLines.unshift(
    `Players: ${simulation.players} | Duration: ${secondsToHuman(simulation.durationSeconds)} | Target: ${formatEggs(simulation.targetEggs)}`,
  );

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictCS (${simulation.contractLabel})`
      : 'PredictCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await simulation.interaction.editReply({ content: '', embeds: [first] });
  await forEachSequential(rest, async embed => {
    await simulation.interaction.followUp({ embeds: [embed] });
  });
  return model;
}

export async function createPredictCsRun(options) {
  const {
    interaction,
    contractLabel,
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
    colleggtiblesRows,
  } = options;

  const variant = buildPredictCsVariant({
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
    colleggtiblesRows,
  });

  const simulation = {
    type: 'predictcs',
    interaction,
    contractLabel,
    ...variant,
    phase: 'uniform',
    pending: 0,
    expectedSimulationCount: (tokenCandidates.length * (players + 1)) + 1,
    uniformScores: new Map(),
    sweepScores: new Map(),
  };

  await handlePhaseUniform(simulation);
  return simulation;
}

export function handlePredictCsResult(simulation, result) {
  const context = result.context ?? {};
  const score = scorePredictCsResult(result, simulation);
  if (context.phase === 'uniform') {
    simulation.uniformScores.set(context.tokenCandidate, score);
  } else if (context.phase === 'sweep') {
    const bucket = simulation.sweepScores.get(context.playerIndex) ?? new Map();
    bucket.set(context.tokenCandidate, score);
    simulation.sweepScores.set(context.playerIndex, bucket);
  } else if (context.phase === 'final') {
    simulation.finalScenario = result;
    simulation.finalScore = score;
  }
}

export async function advancePredictCs(simulation) {
  if (simulation.pending > 0) return;

  if (simulation.phase === 'uniform') {
    let bestCandidate = tokenCandidates[0];
    let bestScore = -Infinity;
    simulation.uniformScores.forEach((score, candidate) => {
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });
    simulation.uniformTokens = Array.from({ length: simulation.players }, () => bestCandidate);
    simulation.selectedTokens = simulation.uniformTokens.slice();
    simulation.sweepPlayerIndex = 0;

    await handlePhaseSweep(simulation);
    simulation.phase = 'sweep';
    return;
  }

  if (simulation.phase === 'sweep') {
    const playerIndex = simulation.sweepPlayerIndex;
    const bucket = simulation.sweepScores.get(playerIndex) ?? new Map();
    let bestCandidate = simulation.selectedTokens[playerIndex] ?? tokenCandidates[0];
    let bestScore = -Infinity;
    bucket.forEach((score, candidate) => {
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });
    simulation.selectedTokens[playerIndex] = bestCandidate;

    simulation.sweepPlayerIndex += 1;
    if (simulation.sweepPlayerIndex < simulation.players) {
      await handlePhaseSweep(simulation);
      return;
    }

    await handlePhaseFinal(simulation);
    simulation.phase = 'final';
    return;
  }

  if (simulation.phase === 'final') {
    return finalize(simulation);
  }
}
