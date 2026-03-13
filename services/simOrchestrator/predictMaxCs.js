import { EmbedBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { chunkContent } from '../discord.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../../sim-core/src/predictmaxcs/display.js';
import {
  buildFinalModelFromPredictMaxCs,
  buildPredictMaxCsVariant,
  buildScenarioJob,
  enqueueScenarioBatch,
  scorePredictMaxCsResult,
  tokenCandidates,
} from './shared.js';

async function handlePhaseUniform(orchestration) {
  const scenarios = [];
  orchestration.variants.forEach(variant => {
    tokenCandidates.forEach(candidate => {
      const tokensByPlayer = Array.from({ length: orchestration.players }, () => candidate);
      const scenario = {
        players: orchestration.players,
        playerDeflectors: variant.baselineDeflectors,
        playerConfigs: variant.playerConfigs,
        durationSeconds: orchestration.durationSeconds,
        targetEggs: orchestration.targetEggs,
        tokenTimerMinutes: orchestration.tokenTimerMinutes,
        giftMinutes: orchestration.giftMinutes,
        gg: orchestration.gg,
        baseIHR: variant.baseIHR,
        tokensPerPlayer: tokensByPlayer,
        cxpMode: orchestration.assumptions.cxpMode,
      };

      scenarios.push(buildScenarioJob({
        orchestrationId: orchestration.id,
        scenarioId: randomUUID(),
        context: {
          phase: 'uniform',
          variantId: variant.id,
          tokenCandidate: candidate,
        },
        scenario,
      }));
    });
  });

  await enqueueScenarioBatch(orchestration, scenarios);
}

async function handlePhaseSweep(orchestration) {
  const scenarios = [];
  const variants = orchestration.variantsToSweep;
  variants.forEach(variant => {
    for (let playerIndex = 0; playerIndex < orchestration.players; playerIndex += 1) {
      tokenCandidates.forEach(candidate => {
        const tokensByPlayer = variant.uniformTokens.slice();
        tokensByPlayer[playerIndex] = candidate;
        const scenario = {
          players: orchestration.players,
          playerDeflectors: variant.baselineDeflectors,
          playerConfigs: variant.playerConfigs,
          durationSeconds: orchestration.durationSeconds,
          targetEggs: orchestration.targetEggs,
          tokenTimerMinutes: orchestration.tokenTimerMinutes,
          giftMinutes: orchestration.giftMinutes,
          gg: orchestration.gg,
          baseIHR: variant.baseIHR,
          tokensPerPlayer: tokensByPlayer,
          cxpMode: orchestration.assumptions.cxpMode,
        };

        scenarios.push(buildScenarioJob({
          orchestrationId: orchestration.id,
          scenarioId: randomUUID(),
          context: {
            phase: 'sweep',
            variantId: variant.id,
            playerIndex,
            tokenCandidate: candidate,
          },
          scenario,
        }));
      });
    }
  });

  await enqueueScenarioBatch(orchestration, scenarios);
}

async function handlePhaseFinal(orchestration) {
  const scenarios = [];
  orchestration.variantsToFinalize.forEach(variant => {
    const scenario = {
      players: orchestration.players,
      playerDeflectors: variant.baselineDeflectors,
      playerConfigs: variant.playerConfigs,
      durationSeconds: orchestration.durationSeconds,
      targetEggs: orchestration.targetEggs,
      tokenTimerMinutes: orchestration.tokenTimerMinutes,
      giftMinutes: orchestration.giftMinutes,
      gg: orchestration.gg,
      baseIHR: variant.baseIHR,
      tokensPerPlayer: variant.selectedTokens,
      cxpMode: orchestration.assumptions.cxpMode,
    };

    scenarios.push(buildScenarioJob({
      orchestrationId: orchestration.id,
      scenarioId: randomUUID(),
      context: {
        phase: 'final',
        variantId: variant.id,
      },
      scenario,
    }));
  });

  await enqueueScenarioBatch(orchestration, scenarios);
}

async function finalize(orchestration) {
  const ranked = orchestration.variantsToFinalize
    .map(variant => ({
      variant,
      score: variant.finalScore ?? -Infinity,
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0]?.variant;
  if (!winner) return;

  const model = buildFinalModelFromPredictMaxCs(orchestration, winner);
  const outputLines = buildPlayerTableLines(model, orchestration.assumptions);
  outputLines.unshift(
    `Players: ${orchestration.players} | Duration: ${secondsToHuman(orchestration.durationSeconds)} | Target: ${formatEggs(orchestration.targetEggs)}`,
  );

  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0
      ? `PredictMaxCS (${orchestration.contractLabel})`
      : 'PredictMaxCS (cont.)')
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await orchestration.interaction.editReply({ content: '', embeds: [first] });
  for (const embed of rest) {
    await orchestration.interaction.followUp({ embeds: [embed] });
  }
}

export async function startPredictMaxCsOrchestration(options) {
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
    coleggtiblesRows,
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
    coleggtiblesRows,
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
    coleggtiblesRows,
  });
  siabVariant.id = 'siab';
  siabVariant.uniformScores = new Map();
  siabVariant.sweepScores = new Map();

  const variants = [baseVariant, siabVariant];
  const variantMap = new Map(variants.map(variant => [variant.id, variant]));

  const orchestration = {
    id: randomUUID(),
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
  };

  await handlePhaseUniform(orchestration);
  return orchestration;
}

export function handlePredictMaxCsResult(orchestration, result) {
  const context = result.context ?? {};
  const variant = orchestration.variantMap.get(context.variantId);
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

export async function advancePredictMaxCs(orchestration) {
  if (orchestration.pending > 0) return;

  if (orchestration.phase === 'uniform') {
    orchestration.variants.forEach(variant => {
      let bestCandidate = tokenCandidates[0];
      let bestScore = -Infinity;
      variant.uniformScores.forEach((score, candidate) => {
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      });
      variant.uniformTokens = Array.from({ length: orchestration.players }, () => bestCandidate);
    });

    if (orchestration.siabOverride === true) {
      orchestration.variantsToSweep = [orchestration.variantMap.get('siab')];
    } else if (orchestration.siabOverride === false) {
      orchestration.variantsToSweep = [orchestration.variantMap.get('base')];
    } else {
      orchestration.variantsToSweep = orchestration.variants;
    }

    orchestration.phase = 'sweep';
    await handlePhaseSweep(orchestration);
    return;
  }

  if (orchestration.phase === 'sweep') {
    orchestration.variantsToSweep.forEach(variant => {
      variant.selectedTokens = Array.from({ length: orchestration.players }, (_, index) => {
        const bucket = variant.sweepScores.get(index) ?? new Map();
        let bestCandidate = variant.uniformTokens[index] ?? tokenCandidates[0];
        let bestScore = -Infinity;
        bucket.forEach((score, candidate) => {
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        });
        return bestCandidate;
      });
    });

    orchestration.variantsToFinalize = orchestration.variantsToSweep;
    orchestration.phase = 'final';
    await handlePhaseFinal(orchestration);
    return;
  }

  if (orchestration.phase === 'final') {
    await finalize(orchestration);
  }
}
