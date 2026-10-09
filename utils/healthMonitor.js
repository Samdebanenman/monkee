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
    this.initialized = false;
    this.configure(env);
    this.register('application', { critical: true, slowMs: this.config.loopSlow, staleMs: 5000 });
    this.register('processing', { critical: true, slowMs: Infinity, staleMs: 5000 });
    this.register('discord', { critical: true, slowMs: this.config.gatewaySlow, staleMs: 15000 });
    this.register('database', { slowMs: this.config.databaseSlow, staleMs: 90000 });
    this.register('gameApi', { slowMs: this.config.gameSlow, staleMs: this.config.gameStale });
    this.register('discordRest', { slowMs: this.config.restSlow, staleMs: this.config.passiveStale });
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
    };
  }

  register(name, { critical = false, slowMs = 3000, staleMs = this.config.passiveStale } = {}) {
    if (!this.components.has(name)) this.components.set(name, {
      critical, slowMs, staleMs, status: 'unknown', latencyMs: null,
      lastAttempt: null, lastSuccess: null, lastResult: null, failures: 0, recoveries: 0,
      reason: 'Not measured', pending: 0, pendingSince: null,
    });
    return this.components.get(name);
  }

  record(name, { ok = true, latencyMs = null, reason = null, down = false } = {}) {
    const state = this.register(name);
    const now = this.now();
    state.lastAttempt = now;
    state.lastResult = now;
    state.latencyMs = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null;
    const slow = ok && latencyMs != null && latencyMs > state.slowMs;
    if (!ok || slow) {
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
  }

  // Instrumentation must never change operation return values or exceptions.
  safeRecord(name, measurement) {
    try { this.record(name, measurement); } catch { /* Monitoring cannot break application operations. */ }
  }

  async observe(name, operation, classify = () => ({})) {
    const state = this.register(name);
    const started = this.clock();
    state.lastAttempt = this.now();
    state.pending++;
    state.pendingSince ??= this.now();
    try {
      const result = await operation();
      this.safeRecord(name, { ...classify(result), latencyMs: this.clock() - started });
      return result;
    } catch (error) {
      this.safeRecord(name, { ok: false, latencyMs: this.clock() - started, reason: failureReason(error) });
      throw error;
    } finally {
      state.pending--;
      if (!state.pending) state.pendingSince = null;
    }
  }

  observeSync(name, operation) {
    const started = this.clock();
    try {
      const result = operation();
      this.safeRecord(name, { latencyMs: this.clock() - started });
      return result;
    } catch (error) {
      this.safeRecord(name, { ok: false, latencyMs: this.clock() - started, reason: failureReason(error) });
      throw error;
    }
  }

  async probe(name, operation) {
    if (this.pending.has(name)) return;
    this.pending.add(name);
    try { await operation(); }
    catch { /* The observed operation already recorded a sanitized failure. */ }
    finally { this.pending.delete(name); }
  }

  snapshot() {
    const now = this.now();
    const components = {};
    for (const [name, state] of this.components) {
      const stale = state.lastResult == null || now - state.lastResult > state.staleMs;
      let status = stale ? 'unknown' : state.status;
      let reason = stale ? (state.lastResult == null ? 'Not measured' : 'Monitoring result stale') : state.reason;
      if (state.pendingSince != null && now - state.pendingSince > state.slowMs && status !== 'down') {
        status = 'degraded';
        reason = 'Request still pending';
      }
      components[name] = {
        status, critical: state.critical, latencyMs: state.latencyMs, reason,
        lastAttempt: iso(state.lastAttempt), lastSuccess: iso(state.lastSuccess),
        consecutiveFailures: state.failures, consecutiveRecoveries: state.recoveries,
        ...(state.reconnectAttempts != null ? { reconnectAttempts: state.reconnectAttempts } : {}),
      };
    }
    const critical = Object.values(components).filter(item => item.critical);
    const all = Object.values(components);
    const coreAvailable = critical.some(item => item.status === 'down') ? false
      : !this.initialized || critical.some(item => item.status === 'unknown') ? null : true;
    const status = coreAvailable === false ? 'down'
      : coreAvailable == null || all.some(item => item.status === 'unknown') ? 'unknown'
      : all.some(item => item.status !== 'operational') ? 'degraded' : 'operational';
    return { contract: 'application-health/v1', status, coreAvailable,
      timestamp: iso(now), validForMs: 90000, components };
  }

  start(client, { databaseProbe, gameProbe, env = process.env } = {}) {
    this.configure(env);
    for (const [name, slowMs, staleMs] of [
      ['application', this.config.loopSlow, this.config.loopDown],
      ['discord', this.config.gatewaySlow, 15000],
      ['database', this.config.databaseSlow, 90000],
      ['gameApi', this.config.gameSlow, this.config.gameStale],
      ['discordRest', this.config.restSlow, this.config.passiveStale],
    ]) Object.assign(this.components.get(name), { slowMs, staleMs });
    let expected = this.clock() + 1000;
    let disconnectedAt = null;
    let hasConnected = client.isReady();
    const reconnecting = new Set();
    for (const event of ['shardDisconnect', 'shardReconnecting']) {
      client.on?.(event, (...args) => {
        reconnecting.add(args.at(-1));
        disconnectedAt ??= this.now();
        if (event === 'shardReconnecting') {
          const state = this.components.get('discord');
          state.reconnectAttempts = Math.min(1000000, (state.reconnectAttempts ?? 0) + 1);
        }
      });
    }
    for (const event of ['shardReady', 'shardResume']) {
      client.on?.(event, shardId => reconnecting.delete(shardId));
    }
    this.every(1000, () => {
      const tick = this.clock();
      const lag = Math.max(0, tick - expected);
      expected = tick + 1000;
      if (this.initialized) {
        this.record('application', { ok: lag < this.config.loopDown, latencyMs: lag,
          down: lag >= this.config.loopDown, reason: lag >= this.config.loopDown ? 'Event loop stalled' : null });
        // Handler registration and a live dispatch loop, not absence of commands, establish readiness.
        const processing = this.components.get('processing');
        if (processing.failures === 0) this.record('processing');
        else processing.lastResult = this.now();
      }
      const ready = client.isReady() && reconnecting.size === 0;
      if (ready) {
        hasConnected = true;
        disconnectedAt = null;
        const ping = client.ws?.ping;
        if (Number.isFinite(ping) && ping >= 0) this.record('discord', { latencyMs: ping });
        else Object.assign(this.components.get('discord'), {
          status: 'unknown', lastAttempt: this.now(), lastResult: this.now(), latencyMs: null,
          reason: 'Gateway heartbeat not measured',
        });
      } else {
        disconnectedAt ??= this.now();
        const down = this.initialized && this.now() - disconnectedAt >= this.config.disconnectGrace;
        // The grace period overrides consecutive failures for transient reconnection.
        this.record('discord', { ok: false, reason: down ? 'Discord disconnected' : 'Discord reconnecting', down });
        if (!down) this.components.get('discord').status = hasConnected ? 'degraded' : 'unknown';
      }
    });
    if (databaseProbe) this.every(30000, () => this.probe('database', databaseProbe), true);
    if (gameProbe) this.every(30000, () => {
      const state = this.components.get('gameApi');
      const interval = state.failures ? Math.min(this.config.gameInterval, 30000 * 2 ** Math.min(state.failures, 4))
        : this.config.gameInterval;
      if (!state.pending && (state.lastAttempt == null || this.now() - state.lastAttempt >= interval)) {
        return this.probe('gameApi', gameProbe);
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

  stop() { this.timers.forEach(clearInterval); this.timers = []; }
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
