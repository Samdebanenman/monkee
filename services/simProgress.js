import { getKafka } from './kafkaClient.js';

const requestTopic = process.env.SIM_REQUEST_TOPIC ?? 'sim-requests';
const resultTopic = process.env.SIM_RESULT_TOPIC ?? 'sim-results';

let admin;
let adminReady;

async function getAdmin() {
  if (admin) return admin;
  if (!adminReady) {
    admin = getKafka().admin();
    adminReady = admin.connect().then(() => admin);
  }
  return adminReady;
}

function sumOffsets(offsets) {
  return offsets.reduce((sum, entry) => {
    const high = Number(entry.high ?? entry.offset ?? 0);
    const low = Number(entry.low ?? 0);
    return sum + Math.max(0, high - low);
  }, 0);
}

export async function getQueueProgress() {
  const kafkaAdmin = await getAdmin();
  const [requestOffsets, resultOffsets] = await Promise.all([
    kafkaAdmin.fetchTopicOffsets(requestTopic),
    kafkaAdmin.fetchTopicOffsets(resultTopic),
  ]);

  const total = sumOffsets(requestOffsets);
  const completed = sumOffsets(resultOffsets);
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return {
    total,
    completed,
    percent,
  };
}
