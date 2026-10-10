// Each operation starts only after the previous one succeeds. This preserves
// Discord message order and prevents bursts against rate-limited APIs.
export async function forEachSequential(items, operation) {
  for (const item of items) {
    // eslint-disable-next-line sonarjs/S9382 -- Each operation depends on the previous operation finishing.
    await operation(item);
  }
}
