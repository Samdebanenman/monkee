import { getKafka } from './kafkaClient.js';

const requestTopic = process.env.SIM_REQUEST_TOPIC ?? 'sim-requests';
const maxBatchBytes = Number(process.env.SIM_REQUEST_MAX_BATCH_BYTES ?? 900000);
const maxBatchMessages = Number(process.env.SIM_REQUEST_MAX_BATCH_MESSAGES ?? 200);
const messageOverheadBytes = 64;

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

function buildProducerMessage(job) {
  const key = String(job.jobId);
  const value = JSON.stringify(job);
  const estimatedBytes = Buffer.byteLength(key, 'utf8')
    + Buffer.byteLength(value, 'utf8')
    + messageOverheadBytes;
  return {
    key,
    value,
    estimatedBytes,
  };
}

function toSizedMessages(jobs = []) {
  return jobs
    .filter(job => job?.jobId)
    .map(buildProducerMessage);
}

function splitIntoBatches(messages) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const message of messages) {
    if (message.estimatedBytes > maxBatchBytes) {
      throw new Error(
        `Simulation job ${message.key} is too large (${message.estimatedBytes} bytes), exceeds limit ${maxBatchBytes} bytes.`,
      );
    }

    const overByteLimit = currentBytes + message.estimatedBytes > maxBatchBytes;
    const overMessageLimit = current.length >= maxBatchMessages;
    if (current.length > 0 && (overByteLimit || overMessageLimit)) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push({ key: message.key, value: message.value });
    currentBytes += message.estimatedBytes;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export async function enqueueSimulationJob(job) {
  if (!job?.jobId) {
    throw new Error('Simulation job missing jobId.');
  }
  await enqueueSimulationJobs([job]);
}

export async function enqueueSimulationJobs(jobs = []) {
  const messages = toSizedMessages(Array.isArray(jobs) ? jobs : []);
  if (!messages.length) return;

  const batches = splitIntoBatches(messages);
  const sender = await getProducer();
  for (const batch of batches) {
    await sender.send({
      topic: requestTopic,
      messages: batch,
    });
  }
}
