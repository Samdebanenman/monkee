import { createServer } from 'node:http';
import { once } from 'node:events';

// Run on the bot's event loop so a stalled bot cannot answer the probe.
export async function startHealthServer(client, { port = Number(process.env.HEALTHCHECK_PORT ?? 3000), monitor } = {}) {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/health') {
      response.writeHead(404);
      response.end();
      return;
    }

    try {
      const snapshot = monitor ? monitor.snapshot() : { status: client.isReady() ? 'ok' : 'not-ready' };
      const ready = monitor ? snapshot.coreAvailable === true : snapshot.status === 'ok';
      response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(snapshot));
    } catch {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'unknown' }));
    }
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  server.unref();
  return server;
}
