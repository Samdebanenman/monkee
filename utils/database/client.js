import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { health, failureReason } from '../healthMonitor.js';
import { performance } from 'node:perf_hooks';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'data');

function resolveDatabasePath() {
  const overridePath = process.env.COOPS_DB_PATH;
  if (overridePath) {
    const absolutePath = path.isAbsolute(overridePath)
      ? overridePath
      : path.join(process.cwd(), overridePath);

    const customDir = path.dirname(absolutePath);
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return absolutePath;
  }

  if (!fs.existsSync(DEFAULT_DATA_DIR)) {
    fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
  }

  return path.join(DEFAULT_DATA_DIR, 'coops.db');
}

const DB_PATH = resolveDatabasePath();

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
let probeRead;
let writeFailure = false;

// Preserve native Statement objects and SQL behavior; do not collect SQL or values.
if (typeof db.prepare === 'function') {
  const prepare = db.prepare.bind(db);
  probeRead = () => prepare('SELECT 1 FROM meta LIMIT 1').get();
  db.prepare = function (...args) {
    const statement = prepare(...args);
    for (const method of ['get', 'all', 'run']) {
      const original = statement[method];
      statement[method] = function (...values) {
        if (writeFailure && method !== 'run') {
          // A readable database does not establish that previously failed writes recovered.
          try {
            const result = original.apply(this, values);
            health.components.get('database').lastResult = Date.now();
            health.components.get('database').lastAttempt = Date.now();
            return result;
          } catch (error) {
            health.safeRecord('database', { ok: false, reason: failureReason(error) });
            throw error;
          }
        }
        try {
          const result = health.observeSync('database', () => original.apply(this, values));
          if (method === 'run' && health.components.get('database').status === 'operational') writeFailure = false;
          return result;
        } catch (error) {
          if (method === 'run') writeFailure = true;
          throw error;
        }
      };
    }
    return statement;
  };
}

export function probeDatabase() {
  const started = performance.now();
  let previous;
  try {
    previous = db.pragma('busy_timeout', { simple: true });
    db.pragma(`busy_timeout = ${Math.round(health.config.databaseTimeout)}`);
    // Touch a real table, rather than SELECT 1 which need not read the database.
    probeRead();
    const state = health.components.get('database');
    if (writeFailure) {
      state.lastAttempt = state.lastResult = Date.now();
      state.latencyMs = Math.round(performance.now() - started);
    } else health.safeRecord('database', { latencyMs: performance.now() - started });
  } catch (error) {
    health.safeRecord('database', { ok: false, latencyMs: performance.now() - started, reason: failureReason(error) });
    throw error;
  } finally {
    if (previous != null && db.open) db.pragma(`busy_timeout = ${previous}`);
  }
}

export default db;
export { DB_PATH };
