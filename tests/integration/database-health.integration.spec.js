import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let directory, module, health, locker;
const previousPath = process.env.COOPS_DB_PATH;
beforeEach(async () => {
  vi.resetModules();
  directory = mkdtempSync(path.join(tmpdir(), 'monkee-health-'));
  process.env.COOPS_DB_PATH = path.join(directory, 'test.db');
  ({ health } = await import('../../utils/healthMonitor.js'));
  health.configure({ HEALTH_DATABASE_TIMEOUT_MS: '10' });
  module = await import('../../utils/database/client.js');
  module.default.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
});
afterEach(() => {
  if (locker?.open) { locker.exec('ROLLBACK'); locker.close(); }
  locker = undefined;
  if (module.default.open) module.default.close();
  if (previousPath == null) delete process.env.COOPS_DB_PATH;
  else process.env.COOPS_DB_PATH = previousPath;
  rmSync(directory, { recursive: true, force: true });
});

describe('SQLite health using the existing connection', () => {
  it('reads a real table and restores the normal lock timeout', () => {
    const timeout = module.default.pragma('busy_timeout', { simple: true });
    module.probeDatabase();
    expect(health.snapshot().components.database.status).toBe('operational');
    expect(module.default.pragma('busy_timeout', { simple: true })).toBe(timeout);
  });

  it('detects lock contention without waiting for the normal five-second timeout', () => {
    locker = new Database(process.env.COOPS_DB_PATH);
    locker.exec('BEGIN EXCLUSIVE');
    expect(() => module.probeDatabase()).toThrow();
    expect(health.snapshot().components.database).toMatchObject({ status: 'degraded', reason: 'Database contention' });
    expect(module.default.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('does not erase write failures merely because a read probe succeeds', () => {
    const write = module.default.prepare('INSERT INTO meta(key,value) VALUES(?,?)');
    module.default.pragma('busy_timeout = 10');
    locker = new Database(process.env.COOPS_DB_PATH);
    locker.exec('BEGIN IMMEDIATE');
    for (let index = 0; index < 3; index++) expect(() => write.run('a', 'b')).toThrow();
    module.probeDatabase();
    expect(health.snapshot().components.database.status).toBe('down');
    locker.exec('ROLLBACK'); locker.close(); locker = undefined;
    write.run('a', 'b');
    expect(health.snapshot().components.database.status).toBe('degraded');
    module.default.prepare('DELETE FROM meta').run();
    expect(health.snapshot().components.database.status).toBe('operational');
  });

  it('records unavailable connections as failures', () => {
    module.default.close();
    for (let index = 0; index < 3; index++) expect(() => module.probeDatabase()).toThrow();
    expect(health.snapshot().components.database.status).toBe('down');
  });
});
