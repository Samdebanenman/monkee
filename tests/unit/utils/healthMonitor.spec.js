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
    now += 6000;
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: null });
    monitor.record('discord', { ok: false, down: true });
    expect(monitor.snapshot()).toMatchObject({ status: 'down', coreAvailable: false });
  });

  it('separates optional monitoring gaps from established core liveness', () => {
    let now = 10000;
    healthy({ now: () => now });
    monitor.register('planner', { staleMs: 10 });
    expect(monitor.snapshot()).toMatchObject({ status: 'unknown', coreAvailable: true });
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
