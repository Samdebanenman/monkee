import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { REST, DefaultRestOptions } from 'discord.js';
import { health, observedDiscordRequest } from '../../utils/healthMonitor.js';

let server, rest;
afterEach(async () => {
  rest?.clearHashSweeper();
  rest?.clearHandlerSweeper();
  if (server?.listening) {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
});

describe('Discord existing REST transport', () => {
  it('preserves successful responses and observes server failures without external requests', async () => {
    let status = 200;
    server = createServer((_request, response) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ value: 'response', code: 0, message: 'fixture' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    health.components.delete('discordRest');
    rest = new REST({ api: `http://127.0.0.1:${server.address().port}`, retries: 0,
      makeRequest: (...args) => observedDiscordRequest(() => DefaultRestOptions.makeRequest(...args)),
    });
    await expect(rest.get('/fixture', { auth: false })).resolves.toMatchObject({ value: 'response' });
    expect(health.snapshot().components.discordRest.status).toBe('operational');
    status = 503;
    await expect(rest.get('/fixture', { auth: false })).rejects.toMatchObject({ status: 503 });
    expect(health.snapshot().components.discordRest).toMatchObject({ status: 'degraded', reason: 'HTTP 503' });
  });

  it('does not interpret request-scoped errors as a Discord transport outage', async () => {
    health.components.delete('discordRest');
    const response = { status: 404 };
    for (let index = 0; index < 3; index++) {
      await expect(observedDiscordRequest(async () => response)).resolves.toBe(response);
    }
    expect(health.snapshot().components.discordRest.status).toBe('operational');
  });
});
