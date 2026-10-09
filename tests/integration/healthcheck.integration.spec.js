import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startHealthServer } from '../../utils/healthServer.js';

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
  it('succeeds when the bot responds and follows Discord readiness changes', async () => {
    let ready = false;
    server = await startHealthServer({ isReady: () => ready }, { port: 0 });

    await expect(probe()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('HTTP 503') });
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
