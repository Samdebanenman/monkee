import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/database/contractHistoryRepository.js', () => ({
  getContractHistoryForMember: vi.fn(),
}));

import {
  buildContractHistoryFilter,
  fetchContractHistory,
} from '../../../services/contractHistoryService.js';
import { getContractHistoryForMember } from '../../../utils/database/contractHistoryRepository.js';

const NOW = Date.UTC(2026, 7, 10, 12, 0, 0) / 1000;

beforeEach(() => {
  vi.clearAllMocks();
  getContractHistoryForMember.mockReturnValue([]);
});

describe('services/contractHistoryService', () => {
  it('defaults to the previous month', () => {
    const filter = buildContractHistoryFilter(undefined, NOW);

    expect(filter.scope).toBe('1-month');
    expect(filter.timeline).toBe('1 month');
    expect(filter.criteria.releasedAfter).toBe(Date.UTC(2026, 6, 10, 12, 0, 0) / 1000);
  });

  it('builds the three-month filter', () => {
    const filter = buildContractHistoryFilter('3-months', NOW);

    expect(filter.criteria.releasedAfter).toBe(Date.UTC(2026, 4, 10, 12, 0, 0) / 1000);
  });

  it('distinguishes seasonal and all contracts for the current season', () => {
    expect(buildContractHistoryFilter('this-season-seasonal', NOW).criteria).toMatchObject({
      season: 'summer_2026',
      seasonalOnly: true,
    });

    expect(buildContractHistoryFilter('this-season-all', NOW).criteria).toMatchObject({
      releasedAfter: Date.UTC(2026, 5, 21) / 1000,
      releasedBefore: Date.UTC(2026, 8, 22) / 1000,
    });
  });

  it('supports total seasonal and total all scopes', () => {
    expect(buildContractHistoryFilter('total-seasonal', NOW).criteria).toEqual({ seasonalOnly: true });
    expect(buildContractHistoryFilter('total-all', NOW).criteria).toEqual({});
  });

  it('fetches rows using the resolved filter', () => {
    getContractHistoryForMember.mockReturnValue([{ contractId: 'c1' }]);

    const report = fetchContractHistory({ discordId: '123', scope: 'total-all', nowSeconds: NOW });

    expect(getContractHistoryForMember).toHaveBeenCalledWith('123', {});
    expect(report.timeline).toBe('total - all');
    expect(report.rows).toEqual([{ contractId: 'c1' }]);
    expect(report).not.toHaveProperty('criteria');
  });
});
