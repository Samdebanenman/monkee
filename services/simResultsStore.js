const ttlMs = Number(process.env.SIM_RESULT_TTL_MS ?? 60 * 60 * 1000);
const maxEntries = Number(process.env.SIM_RESULT_MAX_ENTRIES ?? 500);

const results = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [jobId, entry] of results.entries()) {
    if (entry.expiresAt <= now) {
      results.delete(jobId);
    }
  }
}

function pruneOverflow() {
  if (results.size <= maxEntries) return;
  const sorted = Array.from(results.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const overflow = results.size - maxEntries;
  for (let i = 0; i < overflow; i += 1) {
    results.delete(sorted[i][0]);
  }
}

export function storeResult(result) {
  if (!result?.jobId) return;
  const expiresAt = Date.now() + Math.max(1000, ttlMs || 0);
  results.set(result.jobId, { result, expiresAt });
  pruneExpired();
  pruneOverflow();
}

export function getResult(jobId) {
  if (!jobId) return null;
  pruneExpired();
  const entry = results.get(jobId);
  return entry?.result ?? null;
}
