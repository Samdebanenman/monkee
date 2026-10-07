import { simulateScenariosParallel } from '../sim-core/src/predictmaxcs/simulation.js';
import { createDiscordProgressReporter } from './discord.js';
import {
  advancePredictMaxCs,
  createPredictMaxCsRun,
  handlePredictMaxCsResult,
} from './simulation/predictMaxCs.js';
import {
  advancePredictCs,
  createPredictCsRun,
  handlePredictCsResult,
} from './simulation/predictCs.js';

async function runPrediction(options, { createRun, handleResult, advance }) {
  const simulation = await createRun(options);
  const reportProgress = createDiscordProgressReporter(options.interaction, {
    intervalMs: 2000,
    prefix: simulation.type === 'predictcs' ? 'PredictCS' : 'PredictMaxCS',
    width: 20,
  });
  const startedAt = Date.now();
  let completed = 0;

  await reportProgress({
    completed,
    total: simulation.expectedSimulationCount,
    phase: simulation.phase,
    force: true,
  });

  while (simulation.pending > 0) {
    const batch = simulation.scenarios;
    let progressUpdates = Promise.resolve();
    let acceptingProgress = true;
    let results;

    try {
      results = await simulateScenariosParallel(batch.map(entry => entry.scenario), {
        maxWorkers: options.maxWorkers ?? 4,
        onProgress: progress => {
          if (!acceptingProgress) return;
          const count = completed + progress.completed;
          const update = {
            ...progress,
            completed: count,
            total: simulation.expectedSimulationCount,
            phase: simulation.phase,
            simsPerSecond: count / Math.max(0.001, (Date.now() - startedAt) / 1000),
          };
          // Serialize Discord edits and drain them before publishing the result.
          progressUpdates = progressUpdates
            .then(() => reportProgress(update))
            .catch(error => console.error('Failed to update simulation progress:', error));
        },
      });
    } finally {
      acceptingProgress = false;
      await progressUpdates;
    }

    results.forEach((result, index) => {
      handleResult(simulation, { ...result, context: batch[index].context });
    });
    completed += results.length;
    simulation.pending = 0;

    const model = await advance(simulation);
    if (simulation.phase === 'final' && simulation.pending === 0) {
      return model;
    }
  }
}

export function runPredictMaxCs(options) {
  return runPrediction(options, {
    createRun: createPredictMaxCsRun,
    handleResult: handlePredictMaxCsResult,
    advance: advancePredictMaxCs,
  });
}

export function runPredictCs(options) {
  return runPrediction(options, {
    createRun: createPredictCsRun,
    handleResult: handlePredictCsResult,
    advance: advancePredictCs,
  });
}
