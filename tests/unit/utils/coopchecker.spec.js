import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auxbrainMock, state } = vi.hoisted(() => {
  const state = { responseQueue: [] };

  const makeRequestType = () => ({
    create: (payload) => payload,
    verify: () => null,
    encode: () => ({ finish: () => Buffer.from('req') }),
  });

  const makeResponseType = () => ({
    decode: () => state.responseQueue.shift() ?? {},
  });

  const getProtoType = vi.fn(async (name) => {
    if (name === 'ei.ContractCoopStatusRequest') return makeRequestType();
    return makeResponseType();
  });

  const auxbrainMock = {
    getProtoType,
    encodeProtoRequest: vi.fn(() => 'encoded'),
    postAuxbrain: vi.fn(async () => ({ data: 'response' })),
    decodeAuthenticatedPayload: vi.fn(async () => ({ messageBuffer: Buffer.from('resp') })),
    AUXBRAIN_ENDPOINTS: { COOP_STATUS: 'https://example.test' },
  };

  return { auxbrainMock, state };
});

vi.mock('../../../utils/auxbrain.js', () => auxbrainMock);

import { checkCoop, checkAllFromContractID, fetchCoopContributors } from '../../../utils/coopchecker.js';

beforeEach(() => {
  vi.clearAllMocks();
  state.responseQueue = [];
  auxbrainMock.postAuxbrain.mockResolvedValue({ data: 'response' });
});

describe('utils/coopchecker', () => {
  it('returns free status when coop is not created', async () => {
    state.responseQueue.push({});

    const result = await checkCoop('c1', 'aa');
    expect(result.free).toBe(true);
  });

  it('returns errors when request fails', async () => {
    auxbrainMock.postAuxbrain.mockRejectedValue(new Error('boom'));

    const result = await checkCoop('c1', 'aa');
    expect(result.error).toContain('boom');
  });

  it('filters free coops when checking multiple', async () => {
    state.responseQueue.push({ totalAmount: 1 }, {});

    const result = await checkAllFromContractID('c1', ['aa', 'bb']);
    expect(result.filteredResults).toEqual(['bb']);
  });

  it('fetches contributors', async () => {
    state.responseQueue.push({ contributors: [{ userName: 'Ace' }] });

    const contributors = await fetchCoopContributors('c1', 'aa');
    expect(contributors.length).toBe(1);
  });
});
