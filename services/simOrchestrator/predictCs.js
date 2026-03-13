import { randomUUID } from 'node:crypto';
import { EmbedBuilder } from 'discord.js';
import { chunkContent } from '../discord.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../../sim-core/src/predictmaxcs/display.js';
import {
  buildFinalModelFromPredictCs,
  buildPredictCsVariant,
  buildScenarioJob,
  enqueueScenarioBatch,
  scorePredictCsResult,
  tokenCandidates,
} from './shared.js';

async function handlePhaseUniform(orchestration) {
  const scenarios = [];
  tokenCandidates.forEach(candidate => {
    const tokensByPlayer = Array.from({ length: orchestration.players }, () => candidate);
    const scenario = {
      players: orchestration.players,
      playerDeflectors: orchestration.playerDeflectors,
      playerConfigs: orchestration.playerConfigs,
      durationSeconds: orchestration.durationSeconds,
      targetEggs: orchestration.targetEggs,
      tokenTimerMinutes: orchestration.tokenTimerMinutes,
      giftMinutes: orchestration.giftMinutes,
      gg: orchestration.gg,
      baseIHR: orchestration.avgIHR,
      tokensPerPlayer: tokensByPlayer,
      cxpMode: orchestration.assumptions.cxpMode,
      boostOrder: orchestration.boostOrder,
    };

    scenarios.push(buildScenarioJob({
      orchestrationId: orchestration.id,
      scenarioId: randomUUID(),
      context: {
        phase: 'uniform',
        tokenCandidate: candidate,
      },
      scenario,
    }));
  });

  await enqueueScenarioBatch(orchestration, scenarios);
}

async function handlePhaseSweep(orchestration) {
  const scenarios = [];
  for (let playerIndex = 0; playerIndex < orchestration.players; playerIndex += 1) {
    tokenCandidates.forEach(candidate => {
      const tokensByPlayer = orchestration.uniformTokens.slice();
      tokensByPlayer[playerIndex] = candidate;
      const scenario = {
        players: orchestration.players,
        playerDeflectors: orchestration.playerDeflectors,
        playerConfigs: orchestration.playerConfigs,
        durationSeconds: orchestration.durationSeconds,
        targetEggs: orchestration.targetEggs,
        tokenTimerMinutes: orchestration.tokenTimerMinutes,
        giftMinutes: orchestration.giftMinutes,
        gg: orchestration.gg,
        baseIHR: orchestration.avgIHR,
        tokensPerPlayer: tokensByPlayer,
        cxpMode: orchestration.assumptions.cxpMode,
        boostOrder: orchestration.boostOrder,
      };

      scenarios.push(buildScenarioJob({
        orchestrationId: orchestration.id,
        scenarioId: randomUUID(),
        context: {
          phase: 'sweep',
          playerIndex,
          tokenCandidate: candidate,
        },
        scenario,
      }));
    });
  }

  await enqueueScenarioBatch(orchestration, scenarios);
}

async function handlePhaseFinal(orchestration) {
  const scenario = {
    players: orchestration.players,
    playerDeflectors: orchestration.playerDeflectors,
    playerConfigs: orchestration.playerConfigs,
    durationSeconds: orchestration.durationSeconds,
    targetEggs: orchestration.targetEggs,
    tokenTimerMinutes: orchestration.tokenTimerMinutes,
    giftMinutes: orchestration.giftMinutes,
    gg: orchestration.gg,
    baseIHR: orchestration.avgIHR,
    tokensPerPlayer: orchestration.selectedTokens,
    cxpMode: orchestration.assumptions.cxpMode,
    boostOrder: orchestration.boostOrder,
  };

  await enqueueScenarioBatch(orchestration, [buildScenarioJob({
    orchestrationId: orchestration.id,
    scenarioId: randomUUID(),
    context: { phase: 'final' },
    scenario,
  })]);
}

async function finalize(orchestration) {
  const model = buildFinalModelFromPredictCs(orchestration);
  const outputLines = buildPlayerTableLines(model, orchestration.assumptions);
  outputLines.unshift(
    `Players: ${orchestration.players} | Duration: ${secondsToHuman(orchestration.durationSeconds)} | Target: ${formatEggs(orchestration.targetEggs)}`,
  );

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictCS (${orchestration.contractLabel})`
      : 'PredictCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await orchestration.interaction.editReply({ content: '', embeds: [first] });
  for (const embed of rest) {
    await orchestration.interaction.followUp({ embeds: [embed] });
  }
}

export async function startPredictCsOrchestration(options) {
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
    coleggtiblesRows,
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
    coleggtiblesRows,
  });

  const orchestration = {
    id: randomUUID(),
    type: 'predictcs',
    interaction,
    contractLabel,
    ...variant,
    phase: 'uniform',
    pending: 0,
    uniformScores: new Map(),
    sweepScores: new Map(),
  };

  await handlePhaseUniform(orchestration);
  return orchestration;
}

export function handlePredictCsResult(orchestration, result) {
  const context = result.context ?? {};
  const score = scorePredictCsResult(result, orchestration);
  if (context.phase === 'uniform') {
    orchestration.uniformScores.set(context.tokenCandidate, score);
  } else if (context.phase === 'sweep') {
    const bucket = orchestration.sweepScores.get(context.playerIndex) ?? new Map();
    bucket.set(context.tokenCandidate, score);
    orchestration.sweepScores.set(context.playerIndex, bucket);
  } else if (context.phase === 'final') {
    orchestration.finalScenario = result;
    orchestration.finalScore = score;
  }
}

export async function advancePredictCs(orchestration) {
  if (orchestration.pending > 0) return;

  if (orchestration.phase === 'uniform') {
    let bestCandidate = tokenCandidates[0];
    let bestScore = -Infinity;
    orchestration.uniformScores.forEach((score, candidate) => {
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });
    orchestration.uniformTokens = Array.from({ length: orchestration.players }, () => bestCandidate);

    await handlePhaseSweep(orchestration);
    orchestration.phase = 'sweep';
    return;
  }

  if (orchestration.phase === 'sweep') {
    orchestration.selectedTokens = Array.from({ length: orchestration.players }, (_, index) => {
      const bucket = orchestration.sweepScores.get(index) ?? new Map();
      let bestCandidate = orchestration.uniformTokens[index] ?? tokenCandidates[0];
      let bestScore = -Infinity;
      bucket.forEach((score, candidate) => {
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      });
      return bestCandidate;
    });

    await handlePhaseFinal(orchestration);
    orchestration.phase = 'final';
    return;
  }

  if (orchestration.phase === 'final') {
    await finalize(orchestration);
  }
}
