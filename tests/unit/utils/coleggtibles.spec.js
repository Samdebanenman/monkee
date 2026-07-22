import { beforeEach, describe, expect, it, vi } from 'vitest';
const { auxbrainMock, state } = vi.hoisted(() => {
  const state = { responseQueue: [], messageBuffer: Buffer.from('') };

  const makeRequestType = () => ({
    create: (payload) => payload,
    verify: () => null,
    encode: () => ({ finish: () => Buffer.from('req') }),
  });

  const makeResponseType = () => ({
    decode: () => state.responseQueue.shift() ?? {},
  });

  const getProtoType = vi.fn(async (name) => {
    if (name === 'ei.GetPeriodicalsRequest') return makeRequestType();
    return makeResponseType();
  });

  const auxbrainMock = {
    getProtoType,
    encodeProtoRequest: vi.fn(() => 'encoded'),
    postAuxbrain: vi.fn(async () => ({ data: 'response' })),
    decodeAuthenticatedPayload: vi.fn(async () => ({ messageBuffer: state.messageBuffer })),
    AUXBRAIN_ENDPOINTS: { GET_PERIODICALS: 'https://example.test' },
    CLIENT_INFO: {
      CLIENT_VERSION: 999,
      BUILD: '111313',
      VERSION: '1.35',
      PLATFORM: 'DROID',
      RINFO_CLIENT_VERSION: 70,
    },
  };

  return { auxbrainMock, state };
});

vi.mock('../../../utils/auxbrain.js', () => auxbrainMock);

vi.mock('../../../utils/database/index.js', () => ({
  upsertColleggtibles: vi.fn(),
}));

import { fetchAndCacheColleggtibles } from '../../../utils/colleggtibles.js';
import { upsertColleggtibles } from '../../../utils/database/index.js';

const ORIGINAL_EID = process.env.EID;

beforeEach(() => {
  vi.clearAllMocks();
  state.responseQueue = [];
  state.authMessage = null;
  process.env.EID = 'test-eid';
});

afterEach(() => {
  process.env.EID = ORIGINAL_EID;
});

describe('utils/colleggtibles', () => {
  it('fetches and caches colleggtibles', async () => {
    state.messageBuffer = Buffer.from('payload');
    state.responseQueue.push({
      contracts: {
        customEggs: [
          {
            identifier: 'egg1',
            name: 'Egg One',
            icon: { url: 'https://example.test/icon.png' },
            buffs: [
              { dimension: 1, value: 1.05 },
              { dimension: null, value: 1.1 },
            ],
          },
        ],
      },
    });

    const result = await fetchAndCacheColleggtibles();

    expect(result.length).toBe(1);
    expect(upsertColleggtibles).toHaveBeenCalledTimes(1);
    const rows = upsertColleggtibles.mock.calls[0][0];
    expect(rows[0].identifier).toBe('egg1');
    expect(rows[0].buffs.length).toBe(2);
  });

  it('returns empty list when no custom eggs exist', async () => {
    state.messageBuffer = Buffer.from('');
    state.responseQueue.push({ contracts: { customEggs: [] } });

    const result = await fetchAndCacheColleggtibles();

    expect(result).toEqual([]);
    expect(upsertColleggtibles).not.toHaveBeenCalled();
  });
});
