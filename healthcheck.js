const port = Number(process.env.HEALTHCHECK_PORT ?? 3000);

try {
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  if (body?.contract === 'application-health/v1') {
    const age = Date.now() - Date.parse(body.timestamp);
    if (!['operational', 'degraded', 'down', 'unknown'].includes(body.status)
        || !Number.isFinite(age) || age < -5000 || age > body.validForMs
        || !Number.isFinite(body.validForMs) || body.validForMs < 1000 || body.validForMs > 300000
        || !body.components || typeof body.components !== 'object'
        || Array.isArray(body.components) || !Object.keys(body.components).length
        || Object.values(body.components).some(component => !component
          || !['operational', 'degraded', 'down', 'unknown'].includes(component.status)
          || (body.coreAvailable === true && component.critical
            && ['down', 'unknown'].includes(component.status)))
        || (body.coreAvailable === true && !response.ok)
        || (body.status === 'down' && body.coreAvailable !== false)) {
      throw new Error('Invalid application health response');
    }
    const snapshot = JSON.stringify(body);
    if (Buffer.byteLength(snapshot) > 4000) throw new Error('Health snapshot exceeds transport limit');
    console.log(snapshot);
    if (!response.ok || body.coreAvailable !== true || body.status === 'down') process.exitCode = 1;
  } else {
    if (!response.ok) throw new Error(`Monkee returned HTTP ${response.status}`);
    if (body?.status !== 'ok') throw new Error('Monkee did not return a healthy response');
  }
} catch (error) {
  console.log(JSON.stringify({ contract: 'application-health/v1', status: 'down', coreAvailable: false,
    timestamp: new Date().toISOString(), validForMs: 90000,
    components: { application: { status: 'down', critical: true, reason: 'Health endpoint unavailable' } } }));
  // Docker combines stdout/stderr in its health log: emit exactly one JSON value.
  process.exitCode = 1;
}
