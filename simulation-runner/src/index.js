import { Kafka } from 'kafkajs';
import { buildModel, getAssumptions } from '../../sim-core/src/predictmaxcs/model.js';
import { buildPlayerTableLines, formatEggs, secondsToHuman } from '../../sim-core/src/predictmaxcs/display.js';
import { buildBoostOrder, buildPredictCsModel } from '../../sim-core/src/predictcs/model.js';

const rawBrokers = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const brokers = rawBrokers
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

const clientId = process.env.KAFKA_CLIENT_ID ?? 'simulation-runner';
const groupId = process.env.SIM_REQUEST_GROUP ?? 'simulation-runners';
const requestTopic = process.env.SIM_REQUEST_TOPIC ?? 'sim-requests';
const resultTopic = process.env.SIM_RESULT_TOPIC ?? 'sim-results';

const kafka = new Kafka({ clientId, brokers });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId });

async function handlePredictMaxCs(job) {
  const payload = job.payload ?? {};
  const assumptions = payload.assumptions ?? getAssumptions(payload.teValues ?? payload.te ?? 0);

  const model = await buildModel({
    players: payload.players,
    durationSeconds: payload.durationSeconds,
    targetEggs: payload.targetEggs,
    tokenTimerMinutes: payload.tokenTimerMinutes,
    giftMinutes: payload.giftMinutes,
    gg: payload.gg,
    assumptions,
    siabOverride: payload.siabOverride,
    modifierType: payload.modifierType ?? null,
    modifierValue: payload.modifierValue ?? null,
  });

  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(
    `Players: ${payload.players} | Duration: ${secondsToHuman(payload.durationSeconds)} | Target: ${formatEggs(payload.targetEggs)}`,
  );

  return {
    title: `PredictMaxCS (${payload.contractLabel ?? 'contract'})`,
    outputLines,
  };
}

async function handlePredictCs(job) {
  const payload = job.payload ?? {};
  const playerTe = Array.isArray(payload.playerTe) ? payload.playerTe : [];
  const boostOrder = buildBoostOrder(payload.boostOrderMode ?? 'input', playerTe);

  const model = await buildPredictCsModel({
    players: payload.players,
    durationSeconds: payload.durationSeconds,
    targetEggs: payload.targetEggs,
    tokenTimerMinutes: payload.tokenTimerMinutes,
    giftMinutes: payload.giftMinutes,
    gg: payload.gg,
    playerArtifacts: payload.playerArtifacts,
    playerIhrArtifacts: payload.playerIhrArtifacts,
    playerTe,
    boostOrder,
    siabEnabled: payload.siabEnabled,
    pushCount: payload.pushCount ?? 0,
    modifierType: payload.modifierType ?? null,
    modifierValue: payload.modifierValue ?? null,
  });

  const avgTe = playerTe.reduce((sum, value) => sum + value, 0) / Math.max(1, playerTe.length);
  const assumptions = {
    te: Math.round(avgTe),
    teValues: playerTe,
    tokensPerPlayer: 0,
    swapBonus: false,
    cxpMode: true,
    siabPercent: 0,
  };

  const outputLines = buildPlayerTableLines(model, assumptions);
  outputLines.unshift(
    `Players: ${payload.players} | Duration: ${secondsToHuman(payload.durationSeconds)} | Target: ${formatEggs(payload.targetEggs)}`,
  );

  return {
    title: `PredictCS (${payload.contractLabel ?? 'contract'})`,
    outputLines,
  };
}

async function processJob(job) {
  if (job.type === 'predictmaxcs') {
    return handlePredictMaxCs(job);
  }
  if (job.type === 'predictcs') {
    return handlePredictCs(job);
  }
  throw new Error(`Unsupported job type: ${job.type}`);
}

async function start() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: requestTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message?.value) return;
      let job;
      try {
        job = JSON.parse(message.value.toString());
      } catch (error) {
        console.error('Failed to parse job payload:', error);
        return;
      }

      const result = {
        jobId: job.jobId,
        type: job.type,
        createdAt: job.createdAt ?? Date.now(),
        finishedAt: Date.now(),
        status: 'ok',
      };

      try {
        const output = await processJob(job);
        Object.assign(result, output);
      } catch (error) {
        console.error('Simulation job failed:', error);
        result.status = 'error';
        result.error = error?.message ?? String(error);
      }

      await producer.send({
        topic: resultTopic,
        messages: [
          {
            key: job.jobId,
            value: JSON.stringify(result),
          },
        ],
      });
    },
  });
}

start().catch(error => {
  console.error('Simulation runner failed to start:', error);
  process.exit(1);
});
