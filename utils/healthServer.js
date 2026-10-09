import { createServer } from 'node:http';
import { once } from 'node:events';

// Run on the bot's event loop so a stalled bot cannot answer the probe.
export async function startHealthServer(client, { port = Number(process.env.HEALTHCHECK_PORT ?? 3000) } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404);
      response.end();
      return;
    }

    const ready = client.isReady();
    response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: ready ? 'ok' : 'not-ready' }));
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  server.unref();
  return server;
}
