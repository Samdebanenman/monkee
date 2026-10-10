import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startHealthServer } from '../../utils/healthServer.js';
import { HealthMonitor } from '../../utils/healthMonitor.js';

const runFile = promisify(execFile);
const probePath = fileURLToPath(new URL('../../healthcheck.js', import.meta.url));
let server;

afterEach(async () => {
  if (server?.listening) {
    const closed = new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
    server.closeAllConnections();
    await closed;
  }
  server = undefined;
});

function probe(port = server.address().port) {
  return runFile(process.execPath, [probePath], {
    env: { ...process.env, HEALTHCHECK_PORT: String(port) },
    timeout: 4500,
  });
}

async function serve(handler) {
  server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}

describe('Monkee health check', () => {
  it('exports Docker snapshots and preserves liveness during noncritical outages', async () => {
    const monitor = new HealthMonitor({ env: {} });
    monitor.initialized = true;
    for (const name of monitor.components.keys()) monitor.record(name);
    server = await startHealthServer({}, { monitor, port: 0 });
    expect(JSON.parse((await probe()).stdout).status).toBe('operational');
    for (let index = 0; index < 3; index++) monitor.record('gameApi', { ok: false, reason: 'Request timed out' });
    const result = await probe();
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'degraded', coreAvailable: true,
      components: { gameApi: { status: 'down' } } });
    monitor.record('application', { ok: false, down: true });
    await expect(probe()).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('"status":"down"') });
  });

  it('does not fail Docker solely because passive optional evidence is unknown', async () => {
    const monitor = new HealthMonitor({ env: {} });
    monitor.initialized = true;
    for (const name of monitor.components.keys()) monitor.record(name);
    monitor.register('planner');
    server = await startHealthServer({}, { monitor, port: 0 });
    expect(JSON.parse((await probe()).stdout)).toMatchObject({ status: 'operational', coreAvailable: true,
      components: { planner: { status: 'unknown', measurementType: 'passive' } } });
  });

  it('fails Docker while application initialization is incomplete', async () => {
    server = await startHealthServer({}, { monitor: new HealthMonitor({ env: {} }), port: 0 });
    await expect(probe()).rejects.toMatchObject({ code: 1 });
  });

  it('succeeds when the bot responds and follows Discord readiness changes', async () => {
    let ready = false;
    server = await startHealthServer({ isReady: () => ready }, { port: 0 });

    await expect(probe()).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('Health endpoint unavailable') });
    ready = true;
    await expect(probe()).resolves.toMatchObject({ stderr: '' });
    ready = false;
    await expect(probe()).rejects.toMatchObject({ code: 1 });
  });

  it('fails when the bot is not listening', async () => {
    server = await startHealthServer({ isReady: () => true }, { port: 0 });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    await expect(probe(port)).rejects.toMatchObject({ code: 1 });
  });

  it('fails when the bot accepts a call but never responds', async () => {
    await serve(() => {});
    await expect(probe()).rejects.toMatchObject({ code: 1, killed: false });
  });

  it('fails when the response body stalls', async () => {
    await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{');
    });
    await expect(probe()).rejects.toMatchObject({ code: 1, killed: false });
  });

  it.each(['{"status":"not-ready"}', 'invalid json'])(
    'rejects an invalid success response: %s', async body => {
      await serve((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(body);
      });
      await expect(probe()).rejects.toMatchObject({ code: 1 });
    },
  );
});
