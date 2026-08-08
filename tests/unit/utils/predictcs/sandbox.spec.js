import { describe, expect, it } from 'vitest';

import { parseSandboxUrl } from '../../../../sim-core/src/predictcs/sandbox.js';

const COMPRESSED_SANDBOX_URL = 'https://srsandbox-staabmia.netlify.app/?data=v_5UGxheWVyJTdDMC0xMTEwMDAxLTAtNi00LTQxMC02MC0xLTQtMXA4NzUtMS02LTgyLTEtNi05NS0xLTYtNzUtMS02LTU5=B6mEavjeEADGu9QaWsADGu9advKADGu9adu8ADY5GWj4cxzag';

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

describe('sim-core/src/predictcs/sandbox', () => {
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

  it('parses compressed player groups from current v5 sandbox links', () => {
    const result = parseSandboxUrl(COMPRESSED_SANDBOX_URL);

    expect(result.error).toBeUndefined();
    expect(result.players).toBe(4);
    expect(result.playerTe).toEqual([82, 95, 75, 59]);
    expect(result.playerArtifacts).toHaveLength(4);
    expect(result.playerIhrArtifacts).toHaveLength(4);
    expect(result.playerArtifacts.every(artifacts => artifacts.deflector.name === 'T4L Defl.')).toBe(true);
    expect(result.contractInfo).toEqual({
      durationSeconds: 4 * 24 * 60 * 60,
      targetEggs: 410e15,
      tokenTimerMinutes: 60,
      players: 4,
    });
  });
});

