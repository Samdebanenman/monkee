import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { HealthMonitor, failureReason } from '../../../utils/healthMonitor.js';

let monitor;
afterEach(() => { monitor?.stop(); vi.useRealTimers(); vi.restoreAllMocks(); });

function healthy(options = {}) {
  monitor = new HealthMonitor({ env: {}, ...options });
  monitor.initialized = true;
  for (const name of monitor.components.keys()) monitor.record(name, { latencyMs: 10 });
  return monitor;
}

describe('application health', () => {
  it('does not claim initialization or unmeasured dependencies succeeded', () => {
    monitor = new HealthMonitor({ env: {} });
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: null });
    expect(monitor.snapshot().components.gameApi.lastSuccess).toBeNull();
  });

  it('reports normal operation and independent component measurements', () => {
    expect(healthy().snapshot()).toMatchObject({ status: 'operational', coreAvailable: true,
      components: { database: { latencyMs: 10, consecutiveFailures: 0, status: 'operational' } } });
  });

  it.each([['application', 300], ['discord', 1200], ['database', 200], ['gameApi', 4000], ['discordRest', 2500]])(
    'reports slow %s as degraded', (component, latencyMs) => {
      healthy().record(component, { latencyMs });
      expect(monitor.snapshot()).toMatchObject({ status: 'degraded', coreAvailable: true });
    });

  it.each(['gameApi', 'database', 'discordRest'])(
    'retains core availability during %s outages and requires recovery evidence', component => {
      healthy({ env: { HEALTH_FAILURE_THRESHOLD: '2', HEALTH_RECOVERY_THRESHOLD: '2' } });
      monitor.record(component, { ok: false, reason: 'Request timed out' });
      expect(monitor.snapshot().components[component].status).toBe('degraded');
      monitor.record(component, { ok: false, reason: 'Request timed out' });
      expect(monitor.snapshot()).toMatchObject({ status: 'degraded', coreAvailable: true });
      expect(monitor.snapshot().components[component].status).toBe('down');
      monitor.record(component);
      expect(monitor.snapshot().components[component].status).toBe('degraded');
      monitor.record(component);
      expect(monitor.snapshot().status).toBe('operational');
    });

  it('makes stale measurements unknown, retaining a fresh confirmed critical failure', () => {
    let now = 10000;
    healthy({ now: () => now });
    now += 8000;
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: null });
    monitor.record('discord', { ok: false, down: true });
    expect(monitor.snapshot()).toMatchObject({ status: 'down', coreAvailable: false });
  });

  it('separates optional monitoring gaps from established core liveness', () => {
    let now = 10000;
    healthy({ now: () => now });
    monitor.register('planner', { staleMs: 10, measurementType: 'active' });
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: true });
  });

  it('keeps passive inactivity separate from active availability', () => {
    healthy();
    monitor.register('planner');
    expect(monitor.snapshot()).toMatchObject({ status: 'operational', coreAvailable: true,
      components: { planner: { status: 'unknown', measurementType: 'passive' } } });
    monitor.record('planner', { ok: false, down: true });
    expect(monitor.snapshot().status).toBe('operational');
  });

  it('does not trust future-dated measurements after a clock adjustment', () => {
    let now = 20000;
    healthy({ now: () => now });
    now -= 6000;
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: null });
  });

  it('actively measures every core dependency through 24 idle hours', async () => {
    vi.useFakeTimers();
    monitor = new HealthMonitor({ env: {}, now: () => Date.now(), clock: () => Date.now() });
    monitor.initialized = true;
    const probes = {};
    for (const name of ['database', 'gameApi', 'discordRest']) probes[name] = vi.fn(
      () => monitor.observe(name, async () => true));
    monitor.start({ isReady: () => true, ws: { ping: 85 } }, {
      databaseProbe: probes.database, gameProbe: probes.gameApi, restProbe: probes.discordRest,
      env: { HEALTH_EVENT_LOOP_PROBE_MS: '30000', HEALTH_PROCESSING_PROBE_MS: '30000', HEALTH_DISCORD_PROBE_MS: '30000' },
    });
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    const report = monitor.snapshot();
    expect(report.status).toBe('operational');
    for (const component of Object.values(report.components)) {
      expect(component.lastSuccess).not.toBeNull();
      expect(Date.now() - Date.parse(component.lastMeasurement)).toBeLessThanOrEqual(component.intervalMs);
    }
    expect(probes.discordRest).toHaveBeenCalledTimes(289);
    expect(probes.gameApi).toHaveBeenCalledTimes(289);
  }, 15000);

  it('preserves attempt, failure, success, measurement and status-change times', async () => {
    let time = 10000;
    healthy({ now: () => time, clock: () => time });
    await monitor.observe('gameApi', async () => { time += 100; throw new Error('private'); }).catch(() => {});
    let state = monitor.snapshot().components.gameApi;
    expect(Date.parse(state.lastAttempt)).toBe(10000);
    expect(Date.parse(state.lastFailure)).toBe(10100);
    expect(Date.parse(state.lastSuccess)).toBe(10000);
    expect(Date.parse(state.lastMeasurement)).toBe(10100);
    expect(Date.parse(state.lastStatusChange)).toBe(10100);
    time += 100;
    monitor.record('gameApi');
    monitor.record('gameApi');
    state = monitor.snapshot().components.gameApi;
    expect(Date.parse(state.lastFailure)).toBe(10100);
    expect(Date.parse(state.lastSuccess)).toBe(10200);
  });

  it('records probe initialization failures and retries without overlapping', async () => {
    vi.useFakeTimers();
    healthy({ now: () => Date.now(), clock: () => Date.now() });
    let fail = true;
    const operation = vi.fn(async () => {
      if (fail) throw new Error('import failed');
      monitor.record('database');
    });
    monitor.start({ isReady: () => true, ws: { ping: 85 } }, { databaseProbe: operation,
      env: { HEALTH_DATABASE_PROBE_MS: '1000', HEALTH_FAILURE_THRESHOLD: '2' } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(monitor.snapshot().components.database.status).toBe('down');
    fail = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(monitor.snapshot().components.database.status).toBe('operational');
  });

  it('detects slow in-flight operations without cancelling or overlapping probes', async () => {
    let time = 10000;
    healthy({ now: () => time, clock: () => time });
    let release;
    const operation = vi.fn(() => monitor.observe('gameApi', () => new Promise(resolve => { release = resolve; })));
    const first = monitor.probe('gameApi', operation);
    time += 4000;
    expect(monitor.snapshot().components.gameApi).toMatchObject({ status: 'degraded', reason: 'Request still pending' });
    await monitor.probe('gameApi', operation);
    expect(operation).toHaveBeenCalledTimes(1);
    release('result');
    await first;
    expect(monitor.components.get('gameApi').pending).toBe(0);
  });

  it('keeps instrumentation failures from changing application results or errors', async () => {
    healthy();
    vi.spyOn(monitor, 'record').mockImplementation(() => { throw new Error('monitor broken'); });
    expect(monitor.observeSync('database', () => 42)).toBe(42);
    await expect(monitor.observe('gameApi', async () => 42)).resolves.toBe(42);
    const error = new Error('operation broken');
    await expect(monitor.observe('gameApi', async () => { throw error; })).rejects.toBe(error);
  });

  it('sanitizes timeouts, contention, HTTP and connection failures', () => {
    expect(failureReason({ code: 'SQLITE_BUSY', message: 'secret SQL' })).toBe('Database contention');
    expect(failureReason({ name: 'TimeoutError' })).toBe('Request timed out');
    expect(failureReason({ response: { status: 503 } })).toBe('HTTP 503');
    expect(failureReason({ code: 'ECONNREFUSED' })).toBe('Connection failed');
    expect(failureReason({ cause: { code: 'ENOTFOUND' } })).toBe('Connection failed');
    expect(failureReason({ cause: { code: 'UND_ERR_BODY_TIMEOUT' } })).toBe('Request timed out');
    expect(failureReason(new Error('token=secret'))).toBe('Operation failed');
  });

  it('allows reconnect grace and requires repeated recovery', async () => {
    vi.useFakeTimers();
    const client = Object.assign(new EventEmitter(), { isReady: () => true, ws: { ping: 85 } });
    healthy({ now: () => Date.now(), clock: () => Date.now() });
    monitor.start(client, { env: { HEALTH_DISCORD_GRACE_MS: '5000' } });
    client.emit('shardReconnecting', 0);
    expect(monitor.snapshot().components.discord.reconnectAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.snapshot()).toMatchObject({ status: 'degraded', coreAvailable: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(monitor.snapshot()).toMatchObject({ status: 'down', coreAvailable: false });
    client.emit('shardResume', 0, 0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.snapshot().status).toBe('degraded');
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.snapshot().status).toBe('operational');
  });

  it('detects event loop stalls and slow gateway heartbeats using local timers', async () => {
    vi.useFakeTimers();
    let offset = 0;
    healthy({ now: () => Date.now(), clock: () => Date.now() + offset });
    monitor.start({ isReady: () => true, ws: { ping: 1500 } }, { env: {} });
    offset = 6000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(monitor.snapshot()).toMatchObject({ status: 'down', coreAvailable: false,
      components: { application: { reason: 'Event loop stalled' }, discord: { status: 'degraded' } } });
  });

  it('keeps startup and unavailable heartbeat measurements unknown', async () => {
    vi.useFakeTimers();
    let ready = false;
    healthy({ now: () => Date.now(), clock: () => Date.now() });
    monitor.start({ isReady: () => ready, ws: { ping: -1 } }, { env: {} });
    await vi.advanceTimersByTimeAsync(4000);
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: null });
    ready = true;
    await vi.advanceTimersByTimeAsync(4000);
    expect(monitor.snapshot().components.discord.status).toBe('unknown');
  });
});
