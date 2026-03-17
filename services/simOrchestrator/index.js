import { onSimulationResult } from '../simResultsConsumer.js';
import { getAssumptions } from '../../sim-core/src/predictmaxcs/model.js';
import { createDiscordProgressReporter } from '../discord.js';
import {
  advancePredictMaxCs,
  handlePredictMaxCsResult,
  startPredictMaxCsOrchestration as startPredictMaxCsOrchestrationImpl,
} from './predictMaxCs.js';
import {
  advancePredictCs,
  handlePredictCsResult,
  startPredictCsOrchestration as startPredictCsOrchestrationImpl,
} from './predictCs.js';

const orchestrations = new Map();

function initProgressTracker(orchestration) {
  orchestration.progressReporter = createDiscordProgressReporter(orchestration.interaction, {
    intervalMs: 2000,
    prefix: orchestration.type === 'predictcs' ? 'PredictCS' : 'PredictMaxCS',
    width: 20,
  });
  orchestration.progressTracker = {
    lastCompleted: 0,
    lastCheckedAt: Date.now(),
  };
}

async function reportProgress(orchestration, { force = false } = {}) {
  if (!orchestration?.progressReporter) return;

  const completed = orchestration.completedJobIds?.size ?? 0;
  const totalFromScenarioIds = orchestration.scenarioIds?.size ?? 0;
  const total = Math.max(completed, Number(orchestration.expectedJobCount) || 0, totalFromScenarioIds);
  const tracker = orchestration.progressTracker ?? {
    lastCompleted: completed,
    lastCheckedAt: Date.now(),
  };
  const now = Date.now();
  const elapsedSeconds = Math.max(0.001, (now - (tracker.lastCheckedAt || now)) / 1000);
  const deltaCompleted = Math.max(0, completed - (tracker.lastCompleted || 0));
  const simsPerSecond = deltaCompleted / elapsedSeconds;

  tracker.lastCompleted = completed;
  tracker.lastCheckedAt = now;
  orchestration.progressTracker = tracker;

  await orchestration.progressReporter({
    completed,
    total,
    phase: orchestration.phase,
    simsPerSecond,
    force,
  });
}

function markCompletedJob(orchestration, result) {
  if (!orchestration.completedJobIds) {
    orchestration.completedJobIds = new Set();
  }
  if (result?.jobId && orchestration.completedJobIds.has(result.jobId)) {
    return false;
  }
  if (result?.jobId) {
    orchestration.completedJobIds.add(result.jobId);
  }
  return true;
}

function isOrchestrationFinished(orchestration) {
  return orchestration.phase === 'final' && orchestration.pending === 0;
}

async function processPredictMaxCsResult(orchestration, result) {
  handlePredictMaxCsResult(orchestration, result);
  await advancePredictMaxCs(orchestration);
  if (isOrchestrationFinished(orchestration)) {
    orchestrations.delete(orchestration.id);
    return;
  }
  await reportProgress(orchestration);
}

async function processPredictCsResult(orchestration, result) {
  handlePredictCsResult(orchestration, result);
  await advancePredictCs(orchestration);
  if (isOrchestrationFinished(orchestration)) {
    orchestrations.delete(orchestration.id);
    return;
  }
  await reportProgress(orchestration);
}

onSimulationResult(async (result) => {
  const orchestration = orchestrations.get(result.orchestrationId);
  if (!orchestration) return;
  try {
    if (!markCompletedJob(orchestration, result)) {
      return;
    }

    orchestration.pending = Math.max(0, orchestration.pending - 1);

    if (orchestration.type === 'predictmaxcs') {
      await processPredictMaxCsResult(orchestration, result);
      return;
    }

    if (orchestration.type === 'predictcs') {
      await processPredictCsResult(orchestration, result);
    }
  } catch (error) {
    console.error(`Simulation orchestration failed (${orchestration.type}:${orchestration.id}):`, error);
    try {
      if (orchestration.interaction?.deferred || orchestration.interaction?.replied) {
        await orchestration.interaction.followUp({
          content: `Simulation orchestration failed during ${orchestration.phase}: ${error?.message ?? String(error)}`,
          flags: 64,
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify orchestration failure:', notifyError);
    }
    orchestrations.delete(orchestration.id);
  }
});

export async function startPredictMaxCsOrchestration(options) {
  const orchestration = await startPredictMaxCsOrchestrationImpl(options);
  initProgressTracker(orchestration);
  orchestrations.set(orchestration.id, orchestration);
  await reportProgress(orchestration, { force: true });
  return orchestration.id;
}

export async function startPredictCsOrchestration(options) {
  const orchestration = await startPredictCsOrchestrationImpl(options);
  initProgressTracker(orchestration);
  orchestrations.set(orchestration.id, orchestration);
  await reportProgress(orchestration, { force: true });
  return orchestration.id;
}

export function getPredictMaxCsAssumptions(teValues) {
  return getAssumptions(teValues);
}
