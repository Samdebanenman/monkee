import { onSimulationResult } from '../simResultsConsumer.js';
import { getAssumptions } from '../../sim-core/src/predictmaxcs/model.js';
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

onSimulationResult(async (result) => {
  const orchestration = orchestrations.get(result.orchestrationId);
  if (!orchestration) return;

  orchestration.pending = Math.max(0, orchestration.pending - 1);

  if (orchestration.type === 'predictmaxcs') {
    handlePredictMaxCsResult(orchestration, result);
    await advancePredictMaxCs(orchestration);
    if (orchestration.phase === 'final' && orchestration.pending === 0) {
      orchestrations.delete(orchestration.id);
    }
    return;
  }

  if (orchestration.type === 'predictcs') {
    handlePredictCsResult(orchestration, result);
    await advancePredictCs(orchestration);
    if (orchestration.phase === 'final' && orchestration.pending === 0) {
      orchestrations.delete(orchestration.id);
    }
  }
});

export async function startPredictMaxCsOrchestration(options) {
  const orchestration = await startPredictMaxCsOrchestrationImpl(options);
  orchestrations.set(orchestration.id, orchestration);
  return orchestration.id;
}

export async function startPredictCsOrchestration(options) {
  const orchestration = await startPredictCsOrchestrationImpl(options);
  orchestrations.set(orchestration.id, orchestration);
  return orchestration.id;
}

export function getPredictMaxCsAssumptions(teValues) {
  return getAssumptions(teValues);
}
