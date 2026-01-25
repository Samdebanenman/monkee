import { beforeEach, describe, expect, it, vi } from 'vitest';
import zlib from 'node:zlib';

const { postMock, loadProto, state } = vi.hoisted(() => {
  const state = { responseQueue: [], authMessage: null };
  const postMock = vi.fn();

  const makeRequestType = () => ({
    create: (payload) => payload,
    verify: () => null,
    encode: () => ({ finish: () => Buffer.from('req') }),
  });

  const makeAuthenticatedType = () => ({
    decode: () => state.authMessage ?? { compressed: false, message: Buffer.from('') },
  });

  const makeResponseType = () => ({
    decode: () => state.responseQueue.shift() ?? {},
  });

  const lookupType = (name) => {
    if (name === 'ei.GetPeriodicalsRequest') return makeRequestType();
    if (name === 'ei.AuthenticatedMessage') return makeAuthenticatedType();
    return makeResponseType();
  };

  const loadProto = vi.fn(async () => ({ lookupType }));

  return { postMock, loadProto, state };
});

vi.mock('axios', () => ({
  default: {
    post: (...args) => postMock(...args),
  },
}));

vi.mock('protobufjs', () => ({
  default: {
    load: loadProto,
  },
}));

vi.mock('../../../utils/database/index.js', () => ({
  upsertColeggtibles: vi.fn(),
}));

import { fetchAndCacheColeggtibles } from '../../../utils/coleggtibles.js';
import { upsertColeggtibles } from '../../../utils/database/index.js';

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

describe('utils/coleggtibles', () => {
  it('fetches and caches coleggtibles', async () => {
    const compressed = zlib.deflateSync(Buffer.from('payload'));
    state.authMessage = { compressed: true, message: compressed };
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

    postMock.mockResolvedValue({ data: Buffer.from('resp').toString('base64') });

    const result = await fetchAndCacheColeggtibles();

    expect(result.length).toBe(1);
    expect(upsertColeggtibles).toHaveBeenCalledTimes(1);
    const rows = upsertColeggtibles.mock.calls[0][0];
    expect(rows[0].identifier).toBe('egg1');
    expect(rows[0].buffs.length).toBe(2);
  });

  it('returns empty list when no custom eggs exist', async () => {
    state.authMessage = { compressed: false, message: Buffer.from('') };
    state.responseQueue.push({ contracts: { customEggs: [] } });
    postMock.mockResolvedValue({ data: Buffer.from('resp').toString('base64') });

    const result = await fetchAndCacheColeggtibles();

    expect(result).toEqual([]);
    expect(upsertColeggtibles).not.toHaveBeenCalled();
  });
});
