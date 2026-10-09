const port = Number(process.env.HEALTHCHECK_PORT ?? 3000);

try {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`Monkee returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (body?.status !== 'ok') {
    throw new Error('Monkee did not return a healthy response');
  }
} catch (error) {
  console.error(`Health check failed: ${error.message}`);
  process.exitCode = 1;
}
