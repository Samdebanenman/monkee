import { getKafka } from './kafkaClient.js';

const requestTopic = process.env.SIM_REQUEST_TOPIC ?? 'sim-requests';

let producer;
let producerReady;

async function getProducer() {
  if (producer) return producer;
  if (!producerReady) {
    producer = getKafka().producer();
    producerReady = producer.connect().then(() => producer);
  }
  return producerReady;
}

export async function enqueueSimulationJob(job) {
  if (!job || !job.jobId) {
    throw new Error('Simulation job missing jobId.');
  }
  const sender = await getProducer();
  await sender.send({
    topic: requestTopic,
    messages: [
      {
        key: job.jobId,
        value: JSON.stringify(job),
      },
    ],
  });
}

export async function enqueueSimulationJobs(jobs = []) {
  const batch = Array.isArray(jobs) ? jobs.filter(job => job && job.jobId) : [];
  if (!batch.length) return;
  const sender = await getProducer();
  await sender.send({
    topic: requestTopic,
    messages: batch.map(job => ({
      key: job.jobId,
      value: JSON.stringify(job),
    })),
  });
}
