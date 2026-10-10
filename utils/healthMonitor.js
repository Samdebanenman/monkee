import { performance } from 'node:perf_hooks';

const iso = value => value == null ? null : new Date(value).toISOString();
const number = (env, name, fallback) => {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Only fixed, credential-free reasons cross the health boundary.
export function failureReason(error) {
  const code = String(error?.code ?? error?.cause?.code ?? '');
  const status = error?.response?.status ?? error?.status;
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'Database contention';
  if (['ETIMEDOUT', 'ECONNABORTED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)
      || ['TimeoutError', 'AbortError'].includes(error?.name)) return 'Request timed out';
  if (status === 429) return 'Rate limited';
  if (Number.isInteger(status) && status >= 400 && status <= 599) return `HTTP ${status}`;
  if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code)) return 'Connection failed';
  if (code.startsWith('SQLITE_')) return 'Database query failed';
  return 'Operation failed';
}

export class HealthMonitor {
  constructor({ now = Date.now, clock = () => performance.now(), env = process.env } = {}) {
    this.now = now;
    this.clock = clock;
    this.components = new Map();
    this.timers = [];
    this.pending = new Set();
    this.listeners = [];
    this.initialized = false;
    this.configure(env);
    this.register('application', { critical: true, measurementType: 'active', slowMs: this.config.loopSlow, staleMs: this.config.loopStale });
    this.register('processing', { critical: true, measurementType: 'active', slowMs: this.config.processingSlow, staleMs: this.config.processingStale });
    this.register('discord', { critical: true, measurementType: 'active', slowMs: this.config.gatewaySlow, staleMs: this.config.gatewayStale });
    this.register('database', { measurementType: 'active', slowMs: this.config.databaseSlow, staleMs: this.config.databaseStale });
    this.register('gameApi', { measurementType: 'active', slowMs: this.config.gameSlow, staleMs: this.config.gameStale });
    this.register('discordRest', { measurementType: 'active', slowMs: this.config.restSlow, staleMs: this.config.restStale });
  }

  configure(env) {
    this.config = {
      failures: number(env, 'HEALTH_FAILURE_THRESHOLD', 3),
      recoveries: number(env, 'HEALTH_RECOVERY_THRESHOLD', 2),
      loopSlow: number(env, 'HEALTH_EVENT_LOOP_SLOW_MS', 250),
      loopDown: number(env, 'HEALTH_EVENT_LOOP_DOWN_MS', 5000),
      gatewaySlow: number(env, 'HEALTH_DISCORD_SLOW_MS', 1000),
      disconnectGrace: number(env, 'HEALTH_DISCORD_GRACE_MS', 90000),
      databaseSlow: number(env, 'HEALTH_DATABASE_SLOW_MS', 100),
      databaseTimeout: number(env, 'HEALTH_DATABASE_TIMEOUT_MS', 250),
      gameSlow: number(env, 'HEALTH_GAME_API_SLOW_MS', 3000),
      gameInterval: number(env, 'HEALTH_GAME_API_PROBE_MS', 300000),
      gameTimeout: number(env, 'HEALTH_GAME_API_TIMEOUT_MS', 5000),
      gameStale: number(env, 'HEALTH_GAME_API_STALE_MS', 900000),
      restSlow: number(env, 'HEALTH_DISCORD_REST_SLOW_MS', 2000),
      passiveStale: number(env, 'HEALTH_PASSIVE_STALE_MS', 3600000),
      loopInterval: number(env, 'HEALTH_EVENT_LOOP_PROBE_MS', 1000),
      loopStale: number(env, 'HEALTH_EVENT_LOOP_STALE_MS', 5000),
      processingInterval: number(env, 'HEALTH_PROCESSING_PROBE_MS', 5000),
      processingStale: number(env, 'HEALTH_PROCESSING_STALE_MS', 15000),
      processingSlow: number(env, 'HEALTH_PROCESSING_SLOW_MS', 250),
      gatewayInterval: number(env, 'HEALTH_DISCORD_PROBE_MS', 1000),
      gatewayStale: number(env, 'HEALTH_DISCORD_STALE_MS', 15000),
      databaseInterval: number(env, 'HEALTH_DATABASE_PROBE_MS', 30000),
      databaseStale: number(env, 'HEALTH_DATABASE_STALE_MS', 90000),
      restInterval: number(env, 'HEALTH_DISCORD_REST_PROBE_MS', 300000),
      restTimeout: number(env, 'HEALTH_DISCORD_REST_TIMEOUT_MS', 5000),
      restStale: number(env, 'HEALTH_DISCORD_REST_STALE_MS', 900000),
    };
    for (const key of ['loopInterval', 'processingInterval', 'gatewayInterval', 'databaseInterval', 'gameInterval', 'restInterval']) {
      this.config[key] = Math.min(86400000, Math.max(1000, this.config[key]));
    }
    for (const [stale, interval, timeout] of [
      ['loopStale', 'loopInterval', 'loopDown'], ['processingStale', 'processingInterval', 'processingSlow'],
      ['gatewayStale', 'gatewayInterval', 'gatewaySlow'], ['databaseStale', 'databaseInterval', 'databaseTimeout'],
      ['restStale', 'restInterval', 'restTimeout'], ['gameStale', 'gameInterval', 'gameTimeout'],
    ]) this.config[stale] = Math.min(604800000, Math.max(this.config[stale], 2 * this.config[interval] + this.config[timeout] * (stale === 'gameStale' ? 2 : 1)));
  }

  register(name, { critical = false, slowMs = 3000, staleMs = this.config.passiveStale, measurementType = 'passive' } = {}) {
    if (!this.components.has(name)) this.components.set(name, {
      critical, slowMs, staleMs, status: 'unknown', latencyMs: null,
      lastAttempt: null, lastSuccess: null, lastFailure: null, lastResult: null, lastStatusChange: null,
      measurementType, intervalMs: null, failures: 0, recoveries: 0, revision: 0,
      reason: 'Not measured', pending: 0, pendingSince: null,
    });
    return this.components.get(name);
  }

  record(name, { ok = true, latencyMs = null, reason = null, down = false, attemptAt, statusOverride } = {}) {
    const state = this.register(name);
    const now = this.now();
    const previousStatus = state.status;
    state.lastAttempt = attemptAt ?? now;
    state.lastResult = now;
    state.revision++;
    state.latencyMs = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null;
    const slow = ok && latencyMs != null && latencyMs > state.slowMs;
    if (!ok || slow) {
      if (!ok) state.lastFailure = now;
      state.failures = ok ? 0 : Math.min(1000000, state.failures + 1);
      state.recoveries = 0;
      state.status = down || state.failures >= this.config.failures ? 'down' : 'degraded';
      state.reason = reason ?? (slow ? 'Response latency elevated' : 'Operation failed');
      if (ok) state.lastSuccess = now;
    } else {
      state.lastSuccess = now;
      state.failures = 0;
      state.recoveries = Math.min(1000000, state.recoveries + 1);
      if (state.status === 'unknown' || state.status === 'operational'
          || state.recoveries >= this.config.recoveries) {
        state.status = 'operational';
        state.reason = null;
      } else {
        state.status = 'degraded';
        state.reason = 'Recovering';
      }
    }
    if (statusOverride) state.status = statusOverride;
    if (state.status !== previousStatus) state.lastStatusChange = now;
  }

  // Instrumentation must never change operation return values or exceptions.
  safeRecord(name, measurement) {
    try { this.record(name, measurement); } catch { /* Monitoring cannot break application operations. */ }
  }

  async observe(name, operation, classify = () => ({})) {
    const state = this.register(name);
    const started = this.clock();
    const attemptAt = state.lastAttempt = this.now();
    state.pending++;
    state.pendingSince ??= this.now();
    try {
      const result = await operation();
      this.safeRecord(name, { ...classify(result), attemptAt, latencyMs: this.clock() - started });
      return result;
    } catch (error) {
      this.safeRecord(name, { ok: false, attemptAt, latencyMs: this.clock() - started, reason: failureReason(error) });
      throw error;
    } finally {
      state.pending--;
      if (!state.pending) state.pendingSince = null;
    }
  }

  observeSync(name, operation) {
    const started = this.clock();
    const attemptAt = this.now();
    try {
      const result = operation();
      this.safeRecord(name, { attemptAt, latencyMs: this.clock() - started });
      return result;
    } catch (error) {
      this.safeRecord(name, { ok: false, attemptAt, latencyMs: this.clock() - started, reason: failureReason(error) });
      throw error;
    }
  }

  async probe(name, operation) {
    if (this.pending.has(name)) return;
    this.pending.add(name);
    const state = this.register(name);
    const revision = state.revision;
    const attemptAt = this.now();
    try { await operation(); }
    catch (error) {
      if (state.revision === revision) this.safeRecord(name, { ok: false, attemptAt, reason: failureReason(error) });
    }
    finally { this.pending.delete(name); }
  }

  snapshot() {
    const now = this.now();
    const components = {};
    for (const [name, state] of this.components) {
      const stale = state.lastResult == null || now - state.lastResult < -5000 || now - state.lastResult > state.staleMs;
      if (stale && state.status !== 'unknown') {
        state.status = 'unknown';
        state.lastStatusChange = Math.min(now, state.lastResult + state.staleMs);
      }
      let status = stale ? 'unknown' : state.status;
      let reason = stale ? (state.lastResult == null ? 'Not measured' : 'Monitoring result stale') : state.reason;
      if (state.pendingSince != null && now - state.pendingSince > state.slowMs && status !== 'down') {
        status = 'degraded';
        reason = 'Request still pending';
      }
      components[name] = {
        status, critical: state.critical, latencyMs: state.latencyMs, reason,
        lastAttempt: iso(state.lastAttempt), lastSuccess: iso(state.lastSuccess),
        lastFailure: iso(state.lastFailure), lastMeasurement: iso(state.lastResult), lastStatusChange: iso(state.lastStatusChange),
        measurementType: state.measurementType,
        ...(state.intervalMs != null ? { intervalMs: state.intervalMs } : {}),
        // Include cached probe age, Docker cadence, proxy polling, and scheduling margin.
        staleAfterMs: Math.max(180000, state.staleMs),
        consecutiveFailures: state.failures, consecutiveRecoveries: state.recoveries,
        ...(state.reconnectAttempts != null ? { reconnectAttempts: state.reconnectAttempts } : {}),
      };
    }
    const critical = Object.values(components).filter(item => item.critical);
    const all = Object.values(components).filter(item => item.measurementType !== 'passive');
    const coreAvailable = critical.some(item => item.status === 'down') ? false
      : !this.initialized || critical.some(item => item.status === 'unknown') ? null : true;
    const status = coreAvailable === false ? 'down'
      : coreAvailable == null || all.some(item => item.status === 'unknown') ? 'unknown'
      : all.some(item => item.status !== 'operational') ? 'degraded' : 'operational';
    return { contract: 'application-health/v1', status, coreAvailable,
      timestamp: iso(this.components.get('application').lastResult ?? now), validForMs: 180000, components };
  }

  start(client, { databaseProbe, gameProbe, restProbe, processingProbe = async () => this.initialized, env = process.env } = {}) {
    this.stop();
    this.configure(env);
    for (const [name, slowMs, staleMs, intervalMs] of [
      ['application', this.config.loopSlow, this.config.loopStale, this.config.loopInterval],
      ['processing', this.config.processingSlow, this.config.processingStale, this.config.processingInterval],
      ['discord', this.config.gatewaySlow, this.config.gatewayStale, this.config.gatewayInterval],
      ['database', this.config.databaseSlow, this.config.databaseStale, this.config.databaseInterval],
      ['gameApi', this.config.gameSlow, this.config.gameStale, this.config.gameInterval],
      ['discordRest', this.config.restSlow, this.config.restStale, this.config.restInterval],
    ]) Object.assign(this.components.get(name), { slowMs, staleMs, intervalMs });
    let expected = this.clock() + this.config.loopInterval;
    let disconnectedAt = null;
    let hasConnected = client.isReady();
    const reconnecting = new Set();
    for (const event of ['shardDisconnect', 'shardReconnecting']) {
      const listener = (...args) => {
        reconnecting.add(args.at(-1));
        disconnectedAt ??= this.now();
        if (event === 'shardReconnecting') {
          const state = this.components.get('discord');
          state.reconnectAttempts = Math.min(1000000, (state.reconnectAttempts ?? 0) + 1);
        }
      };
      client.on?.(event, listener);
      this.listeners.push([client, event, listener]);
    }
    for (const event of ['shardReady', 'shardResume']) {
      const listener = shardId => reconnecting.delete(shardId);
      client.on?.(event, listener);
      this.listeners.push([client, event, listener]);
    }
    this.every(this.config.loopInterval, () => {
      const tick = this.clock();
      const lag = Math.max(0, tick - expected);
      expected = tick + this.config.loopInterval;
      if (this.initialized) {
        this.record('application', { ok: lag < this.config.loopDown, latencyMs: lag,
          down: lag >= this.config.loopDown, reason: lag >= this.config.loopDown ? 'Event loop stalled' : null });
      }
    });
    this.every(this.config.processingInterval, () => {
      if (this.initialized) return this.probe('processing', () => this.observe('processing', processingProbe,
        ok => ok === false ? { ok: false, reason: 'Interaction dispatch failed' } : {}));
    }, true);
    this.every(this.config.gatewayInterval, () => {
      const ready = client.isReady() && reconnecting.size === 0;
      if (ready) {
        hasConnected = true;
        disconnectedAt = null;
        const ping = client.ws?.ping;
        if (Number.isFinite(ping) && ping >= 0) this.record('discord', { latencyMs: ping });
        else Object.assign(this.components.get('discord'), {
          status: 'unknown', lastAttempt: this.now(), lastResult: this.now(), latencyMs: null,
          lastStatusChange: this.components.get('discord').status === 'unknown'
            ? this.components.get('discord').lastStatusChange : this.now(),
          reason: 'Gateway heartbeat not measured',
        });
      } else {
        disconnectedAt ??= this.now();
        const down = this.initialized && this.now() - disconnectedAt >= this.config.disconnectGrace;
        // The grace period overrides consecutive failures for transient reconnection.
        this.record('discord', { ok: false, reason: down ? 'Discord disconnected' : 'Discord reconnecting', down,
          statusOverride: down ? 'down' : hasConnected ? 'degraded' : 'unknown' });
      }
    });
    if (databaseProbe) this.every(this.config.databaseInterval, () => this.probe('database', databaseProbe), true);
    for (const [name, operation, intervalMs] of [
      ['gameApi', gameProbe, this.config.gameInterval], ['discordRest', restProbe, this.config.restInterval],
    ]) if (operation) this.every(Math.min(30000, intervalMs), () => {
      const state = this.components.get(name);
      if (!state.pending && (state.lastAttempt == null || this.now() < state.lastAttempt || this.now() - state.lastAttempt >= intervalMs)) {
        return this.probe(name, operation);
      }
    }, true);
  }

  every(ms, operation, immediate = false) {
    const safe = () => { Promise.resolve().then(operation).catch(() => {}); };
    if (immediate) safe();
    const timer = setInterval(safe, ms);
    timer.unref();
    this.timers.push(timer);
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.listeners.forEach(([client, event, listener]) => client.off?.(event, listener));
    this.listeners = [];
  }
}

export const health = new HealthMonitor();

export function observedFetch(name, operation) {
  return health.observe(name, operation, response => response.ok ? {}
    : { ok: false, reason: `HTTP ${response.status}` });
}

export function observedDiscordRequest(operation) {
  return health.observe('discordRest', operation, response => {
    const status = response.status;
    // Missing messages, invalid user arguments and channel permissions are scoped
    // request errors, not evidence that Discord's REST transport is unavailable.
    return status === 401 || status === 429 || status >= 500
      ? { ok: false, reason: status === 429 ? 'Rate limited' : `HTTP ${status}` } : {};
  });
}
