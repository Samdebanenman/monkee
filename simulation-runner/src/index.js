import { Kafka } from 'kafkajs';
import { simulateScenario } from '../../sim-core/src/predictmaxcs/simulation.js';

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
const admin = kafka.admin();

async function ensureTopics() {
  const partitions = Number(process.env.SIM_TOPIC_PARTITIONS ?? 8);
  const topics = [requestTopic, resultTopic];
  await admin.connect();
  const existing = await admin.listTopics();
  const missing = topics.filter(topic => !existing.includes(topic));
  if (missing.length > 0) {
    await admin.createTopics({
      topics: missing.map(topic => ({
        topic,
        numPartitions: partitions,
        replicationFactor: 1,
      })),
      waitForLeaders: true,
    });
  }
  await admin.disconnect();
}

async function processJob(job) {
  if (job.type !== 'simulate') {
    throw new Error(`Unsupported job type: ${job.type}`);
  }
  const payload = job.payload ?? {};
  const scenario = payload.scenario;
  if (!scenario) {
    throw new Error('Missing scenario payload');
  }

  const result = simulateScenario(scenario);
  return {
    ...result,
    orchestrationId: payload.orchestrationId,
    context: payload.context ?? {},
  };
}

async function start() {
  await ensureTopics();
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
