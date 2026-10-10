// Offline fixture for validating Docker transport on the production Node version.
import { health } from '../../utils/healthMonitor.js';
import { startHealthServer } from '../../utils/healthServer.js';

health.initialized = true;
for (const name of health.components.keys()) health.record(name, { latencyMs: 12 });
if (process.env.HEALTH_FIXTURE_STATUS === 'degraded') {
  for (let index = 0; index < 3; index++) health.record('gameApi', { ok: false, reason: 'Request timed out' });
}
if (process.env.HEALTH_FIXTURE_STATUS === 'down') health.record('processing', { ok: false, down: true });
health.start({ isReady: () => true, ws: { ping: 85 } }, {
  env: {}, processingProbe: async () => process.env.HEALTH_FIXTURE_STATUS !== 'down',
});
health.register('unusedFeature');
health.every(5000, () => {
  health.record('database', { latencyMs: 12 });
  health.record('discordRest', { latencyMs: 12 });
  health.record('gameApi', process.env.HEALTH_FIXTURE_STATUS === 'degraded'
    ? { ok: false, reason: 'Request timed out' } : { latencyMs: 12 });
});
const server = await startHealthServer({}, { monitor: health });
server.ref();
