import { Kafka } from 'kafkajs';
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
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
const workerCountInput = Number(process.env.SIM_RUNNER_WORKERS ?? availableParallelism());
const workerCount = Number.isFinite(workerCountInput) && workerCountInput > 0
  ? Math.floor(workerCountInput)
  : 1;

const kafka = new Kafka({ clientId, brokers });
const producer = kafka.producer({ allowAutoTopicCreation: false });
const consumer = kafka.consumer({ groupId, allowAutoTopicCreation: false });
const admin = kafka.admin();

async function ensureTopics() {
  const partitions = Number(process.env.SIM_TOPIC_PARTITIONS ?? 8);
  const topics = [requestTopic, resultTopic];
  await admin.connect();
  const existingTopics = await admin.listTopics();
  const missingTopics = topics.filter(topic => !existingTopics.includes(topic));

  if (missingTopics.length > 0) {
    await admin.createTopics({
      topics: missingTopics.map(topic => ({
        topic,
        numPartitions: partitions,
        replicationFactor: 1,
      })),
      waitForLeaders: true,
    });
  }

  const topicMetadata = await admin.fetchTopicMetadata({ topics });
  const topicsToExpand = topicMetadata.topics
    .map(topic => ({
      topic: topic.name,
      currentCount: topic.partitions.length,
    }))
    .filter(topic => topic.currentCount < partitions)
    .map(topic => ({ topic: topic.topic, count: partitions }));

  if (topicsToExpand.length > 0) {
    await admin.createPartitions({
      topicPartitions: topicsToExpand,
      validateOnly: false,
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

async function startPrimary() {
  await ensureTopics();

  if (workerCount === 1) {
    console.log('Starting simulation runner with 1 worker process.');
    await start();
    return;
  }

  console.log(`Starting simulation runner with ${workerCount} worker processes.`);
  for (let index = 0; index < workerCount; index += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal = 'none') => {
    console.error(`Simulation worker ${worker.process.pid} exited (code=${code}, signal=${signal}), restarting.`);
    cluster.fork();
  });
}

if (cluster.isPrimary) {
  try {
    await startPrimary();
  } catch (error) {
    console.error('Simulation runner failed to start:', error);
    process.exit(1);
  }
} else {
  try {
    await start();
  } catch (error) {
    console.error('Simulation worker failed to start:', error);
    process.exit(1);
  }
}
