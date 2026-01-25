import { describe, expect, it } from 'vitest';

import { parseSandboxUrl } from '../../../../utils/predictcs/sandbox.js';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const base62Encode = value => {
  let v = BigInt(value);
  if (v === 0n) return '0';
  let out = '';
  while (v > 0n) {
    const idx = Number(v % 62n);
    out = BASE62_CHARS[idx] + out;
    v /= 62n;
  }
  return out;
};

const buildSandboxPayload = ({ version, decodedData, expanded }) => {
  const encoded = Buffer.from(encodeURIComponent(decodedData), 'utf8')
    .toString('base64')
    .replace(/=+$/g, '');
  const data2 = base62Encode(expanded);
  return `${version}${encoded}=${data2}`;
};

describe('utils/predictcs/sandbox', () => {
  it('rejects invalid sandbox data', () => {
    const result = parseSandboxUrl('not-a-valid-sandbox');
    expect(result.error).toBeTruthy();
  });

  it('parses a minimal valid sandbox payload', () => {
    const decodedData = '00011-a-b-2-3-6-c-1-name-tokens';
    const expanded = `1${'0'.repeat(18)}`;
    const payload = buildSandboxPayload({
      version: 'v-1',
      decodedData,
      expanded,
    });

    const result = parseSandboxUrl(payload);
    expect(result.error).toBeUndefined();
    expect(result.players).toBe(1);
    expect(result.playerArtifacts.length).toBe(1);
    expect(result.contractInfo.durationSeconds).toBe(7200);
    expect(result.contractInfo.targetEggs).toBe(3e18);
    expect(result.contractInfo.tokenTimerMinutes).toBe(6);
  });
});
