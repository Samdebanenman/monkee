import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { health, observedFetch } from '../../../utils/healthMonitor.js';
import { getProtoType, postAuxbrain, probeGameApi } from '../../../utils/auxbrain.js';
import { fetchBackupData } from '../../../services/inventoryVisualizer/fetchBackupData.js';
import axios from 'axios';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
beforeEach(() => {
  axios.post.mockReset();
  health.components.delete('gameApi');
  health.components.delete('discordRest');
  health.configure({});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function periodicalsResponse() {
  await getProtoType('ei.GetPeriodicalsRequest');
  const responseType = await getProtoType('ei.PeriodicalsResponse');
  const envelope = await getProtoType('ei.AuthenticatedMessage');
  return { data: Buffer.from(envelope.encode({
    message: responseType.encode({ sales: {} }).finish(),
  }).finish()).toString('base64') };
}

describe('actual dependency request measurements', () => {
  it('counts a game request across fallback hosts as one logical result', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNRESET' }).mockResolvedValueOnce({ data: 'result' });
    await expect(postAuxbrain('/ei/query_coop', 'payload')).resolves.toEqual({ data: 'result' });
    expect(health.snapshot().components.gameApi).toMatchObject({ status: 'operational', consecutiveFailures: 0 });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('detects repeated timeouts and recovers after successful requests', async () => {
    axios.post.mockRejectedValue({ code: 'ECONNABORTED', message: 'secret payload' });
    for (let index = 0; index < 3; index++) await expect(postAuxbrain('/ei/query_coop', 'payload')).rejects.toBeDefined();
    expect(health.snapshot().components.gameApi).toMatchObject({ status: 'down', consecutiveFailures: 3,
      reason: 'Request timed out' });
    expect(JSON.stringify(health.snapshot())).not.toContain('secret payload');
    axios.post.mockResolvedValue({ data: 'result' });
    await postAuxbrain('/ei/query_coop', 'payload');
    expect(health.snapshot().components.gameApi.status).toBe('degraded');
    await postAuxbrain('/ei/query_coop', 'payload');
    expect(health.snapshot().components.gameApi.status).toBe('operational');
  });

  it('observes the separate inventory game API path', async () => {
    axios.post.mockRejectedValue({ response: { status: 503 } });
    await expect(fetchBackupData('EI1234567890123456')).rejects.toBeDefined();
    expect(health.snapshot().components.gameApi).toMatchObject({ status: 'degraded', reason: 'HTTP 503' });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('rejects empty probe responses and does not turn decoding failures into successes', async () => {
    const original = process.env.EID;
    process.env.EID = 'EI1234567890123456';
    try {
      axios.post.mockResolvedValue({ data: '' });
      for (let index = 0; index < 3; index++) await expect(probeGameApi()).rejects.toThrow('Empty API response');
      expect(health.snapshot().components.gameApi).toMatchObject({ status: 'down', consecutiveFailures: 3 });
    } finally {
      if (original == null) delete process.env.EID; else process.env.EID = original;
    }
  });

  it('does not probe without game credentials or claim a successful check', async () => {
    const original = process.env.EID;
    delete process.env.EID;
    try {
      await probeGameApi();
      expect(axios.post).not.toHaveBeenCalled();
      expect(health.components.has('gameApi')).toBe(false);
    } finally { if (original != null) process.env.EID = original; }
  });

  it('applies the configured deadline to the whole probe, including fallback, and ignores late success', async () => {
    const response = await periodicalsResponse();
    vi.stubEnv('EID', 'EI1234567890123456');
    vi.useFakeTimers();
    vi.spyOn(health, 'clock').mockImplementation(() => Date.now());
    health.configure({ HEALTH_GAME_API_TIMEOUT_MS: '5000' });
    axios.post.mockImplementationOnce(() => new Promise((_, reject) => {
      setTimeout(() => reject({ code: 'ECONNABORTED' }), 4000);
    })).mockImplementationOnce(() => new Promise(resolve => {
      setTimeout(() => resolve(response), 4000);
    }));
    const running = probeGameApi();
    const assertion = expect(running).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(4999);
    expect(health.snapshot().components.gameApi).toMatchObject({ status: 'unknown', lastMeasurement: null });
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    const timedOut = health.snapshot().components.gameApi;
    expect(timedOut).toMatchObject({ status: 'degraded', latencyMs: 5000,
      reason: 'Request timed out', consecutiveFailures: 1 });
    expect(axios.post).toHaveBeenCalledTimes(2);
    for (const call of axios.post.mock.calls) expect(call[2].timeout).toBe(5000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(health.components.get('gameApi').pending).toBe(0);
    expect(health.snapshot().components.gameApi).toEqual(timedOut);
  });

  it('keeps lightweight probes and concurrent expensive game requests from corrupting newer measurements', async () => {
    const response = await periodicalsResponse();
    vi.stubEnv('EID', 'EI1234567890123456');
    vi.useFakeTimers();
    vi.spyOn(health, 'clock').mockImplementation(() => Date.now());
    health.record('gameApi', { latencyMs: 302 });
    const previous = health.snapshot().components.gameApi;
    // The health request and a later normal request both finish while still
    // another normal request remains in flight for 15 seconds.
    axios.post.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(response), 4000)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: 'large' }), 15000)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({ data: 'newer' }), 2221)));
    const probe = health.probe('gameApi', probeGameApi);
    await vi.advanceTimersByTimeAsync(0);
    const expensive = postAuxbrain('/ei/query_coop', 'large payload');
    await vi.advanceTimersByTimeAsync(100);
    const latest = postAuxbrain('/ei/query_coop', 'payload');
    await vi.advanceTimersByTimeAsync(302);
    expect(health.snapshot().components.gameApi).toEqual(previous);
    await vi.advanceTimersByTimeAsync(1919);
    await expect(latest).resolves.toEqual({ data: 'newer' });
    const newer = health.snapshot().components.gameApi;
    expect(newer).toMatchObject({ status: 'operational', latencyMs: 2221 });
    await vi.advanceTimersByTimeAsync(1679);
    await probe;
    expect(health.snapshot().components.gameApi).toEqual(newer);
    await vi.advanceTimersByTimeAsync(11000);
    await expect(expensive).resolves.toEqual({ data: 'large' });
    expect(health.snapshot().components.gameApi).toEqual(newer);
    expect(axios.post).toHaveBeenCalledTimes(3);
    expect(axios.post.mock.calls[0][2].timeout).toBe(5000);
    expect(axios.post.mock.calls[1][2].timeout).toBe(80000);
    expect(axios.post.mock.calls[2][2].timeout).toBe(80000);
  });

  it('observes HTTP errors without changing the response received by the caller', async () => {
    const response = { ok: false, status: 429 };
    await expect(observedFetch('discordRest', async () => response)).resolves.toBe(response);
    expect(health.snapshot().components.discordRest).toMatchObject({ status: 'degraded', reason: 'HTTP 429' });
  });
});
