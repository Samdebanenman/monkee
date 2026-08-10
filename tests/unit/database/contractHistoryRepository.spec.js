import { beforeEach, describe, expect, it, vi } from 'vitest';

const { historyStmt } = vi.hoisted(() => ({
  historyStmt: {
    all: vi.fn(() => []),
  },
}));

vi.mock('../../../utils/database/client.js', () => ({
  default: {
    prepare: vi.fn(() => historyStmt),
  },
}));

vi.mock('../../../utils/database/membersRepository.js', () => ({
  normalizeDiscordId: value => value == null ? '' : String(value).trim(),
}));

import { getContractHistoryForMember } from '../../../utils/database/contractHistoryRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  historyStmt.all.mockReturnValue([]);
});

describe('database/contractHistoryRepository', () => {
  it('returns a normalized, filtered history for a member family', () => {
    historyStmt.all.mockReturnValue([{
      contract_id: ' c1 ',
      coop_id: ' coop-one ',
      egg: ' quantum ',
      release: 123.9,
      season: ' fall_2025 ',
    }]);

    const rows = getContractHistoryForMember(' 111 ', {
      releasedAfter: 100.8,
      releasedBefore: 200.9,
      seasonalOnly: true,
      season: ' fall_2025 ',
    });

    expect(historyStmt.all).toHaveBeenCalledWith(
      '111',
      100,
      100,
      200,
      200,
      1,
      'fall_2025',
      'fall_2025',
    );
    expect(rows).toEqual([{
      contractId: 'c1',
      coopId: 'coop-one',
      egg: 'quantum',
      release: 123.9,
      season: 'fall_2025',
    }]);
  });

  it('rejects an empty member id without querying SQLite', () => {
    expect(getContractHistoryForMember('')).toEqual([]);
    expect(historyStmt.all).not.toHaveBeenCalled();
  });
});
