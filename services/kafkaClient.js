import { Kafka } from 'kafkajs';

const rawBrokers = process.env.KAFKA_BROKERS ?? 'localhost:9092';
const brokers = rawBrokers
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

const clientId = process.env.KAFKA_CLIENT_ID ?? 'monkee-app';

const kafka = new Kafka({
  clientId,
  brokers,
});

export function getKafka() {
  return kafka;
}
