import { getKafka } from './kafkaClient.js';
import { storeResult } from './simResultsStore.js';

const resultTopic = process.env.SIM_RESULT_TOPIC ?? 'sim-results';
const groupId = process.env.SIM_RESULT_GROUP ?? 'monkee-results';

let consumer;
let started = false;

export async function startResultConsumer() {
  if (started) return;
  started = true;
  consumer = getKafka().consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: resultTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message?.value) return;
      try {
        const payload = JSON.parse(message.value.toString());
        storeResult(payload);
      } catch (error) {
        console.error('Failed to parse simulation result:', error);
      }
    },
  });
}
