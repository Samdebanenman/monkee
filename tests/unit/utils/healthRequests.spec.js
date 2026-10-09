import { beforeEach, describe, expect, it, vi } from 'vitest';
import { health, observedFetch } from '../../../utils/healthMonitor.js';
import { postAuxbrain, probeGameApi } from '../../../utils/auxbrain.js';
import { fetchBackupData } from '../../../services/inventoryVisualizer/fetchBackupData.js';
import axios from 'axios';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
beforeEach(() => {
  axios.post.mockReset();
  health.components.delete('gameApi');
  health.components.delete('discordRest');
  health.configure({});
});

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

  it('observes HTTP errors without changing the response received by the caller', async () => {
    const response = { ok: false, status: 429 };
    await expect(observedFetch('discordRest', async () => response)).resolves.toBe(response);
    expect(health.snapshot().components.discordRest).toMatchObject({ status: 'degraded', reason: 'HTTP 429' });
  });
});
