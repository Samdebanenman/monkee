import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  chunkContent: (input, options = {}) => {
    const text = Array.isArray(input) ? input.join('\n') : String(input);
    const prefix = options.wrap?.prefix ?? '';
    const suffix = options.wrap?.suffix ?? '';
    return [`${prefix}${text}${suffix}`];
  },
}));

vi.mock('../../../services/bnLeaderboardService.js', () => ({
  buildBnLeaderboardReport: vi.fn(),
  listBnLeaderboardContractOptions: vi.fn(),
  searchBnLeaderboardContractOptions: vi.fn(),
}));

import { execute, autocomplete } from '../../../commands/bn-leaderboard.js';
import {
  buildBnLeaderboardReport,
  listBnLeaderboardContractOptions,
  searchBnLeaderboardContractOptions,
} from '../../../services/bnLeaderboardService.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/bn-leaderboard', () => {
  it('rejects empty contract input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: '' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Please choose a contract');
  });

  it('renders leaderboard report from service', async () => {
    buildBnLeaderboardReport.mockResolvedValue({
      ok: true,
      contractId: 'video-games',
      contractName: 'Contract One',
      entries: [
        {
          coop: 'moo',
          durationLabel: '12h0m',
          deliveryRateLabel: '1.20bTqQ/hour',
          maxCs: 86217,
          maxCsLabel: '86,217',
          meanCs: 86116,
          meanCsLabel: '86,116',
          status: '✗',
          auditFailures: [{ contributor: 'p1', reasons: ['required artifacts missing'] }],
        },
        {
          coop: 'zoo',
          durationLabel: '13h0m',
          deliveryRateLabel: '980.00q/hour',
          maxCs: 51122,
          maxCsLabel: '51,122',
          meanCs: 49877,
          meanCsLabel: '49,877',
          status: '✓',
          auditFailures: [],
        },
      ],
      unchecked: [{ coop: 'loo', reason: 'status 500' }],
    });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(buildBnLeaderboardReport).toHaveBeenCalledWith({ contractId: 'c1' });

    const message = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(message).toContain('# BN Leaderboard');
    expect(message).toContain('Contract One');
    expect(message).toContain('moo');
    expect(message).toContain('zoo');
    expect(message).toContain('Fastest Coops');
    expect(message).toContain('CS Leaderboard');
    expect(message).toContain('rate');
    expect(message).toContain('duration');
    expect(message).toContain('max');
    expect(message).toContain('mean');
    expect(message).toContain('status');
    expect(message).toContain('1.2...');
    expect(message).toContain('✗');
    expect(message).toContain('✓');
    expect(message).toContain('[⧉](https://eicoop-carpet.netlify.app/video-games/moo)');
    expect(message).toContain('[⧉](https://eicoop-carpet.netlify.app/video-games/zoo)');
    expect(message).toContain('Audit failures by coop:');
    expect(message).toContain('moo');
    expect(message).toContain('-# `✓` = audit passed');
    expect(message).toContain('-# `✗` = audit failed');
    expect(message).not.toContain('Unchecked coops (API issues):');

    const inlineRows = [...message.matchAll(/`([^`]*)`/g)].map(match => match[1]);
    expect(inlineRows.length).toBeGreaterThan(0);
    for (const row of inlineRows) {
      expect(row.length).toBeLessThanOrEqual(35);
    }

    const followups = interaction.followUp.mock.calls.map(call => call?.[0]?.content ?? '').join('\n');
    expect(followups).toContain('Unchecked coops (API issues):');
    expect(followups).toContain('loo');
    expect(followups).not.toContain('Audit failures by coop:');
    expect(followups).not.toContain('-# `✓` = audit passed');
    expect(followups).not.toContain('-# `✗` = audit failed');
  });

  it('handles unknown contract from service', async () => {
    buildBnLeaderboardReport.mockResolvedValue({ ok: false, reason: 'unknown-contract' });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'bad' } }),
    });

    await execute(interaction);

    const message = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(message).toContain('Unknown contract id');
  });

  it('autocomplete uses service methods', async () => {
    listBnLeaderboardContractOptions.mockResolvedValue([{ name: 'A', value: 'a' }]);
    searchBnLeaderboardContractOptions.mockResolvedValue([{ name: 'B', value: 'b' }]);

    const emptyInteraction = createInteraction({
      options: createOptions({ focused: '' }),
    });
    await autocomplete(emptyInteraction);
    expect(listBnLeaderboardContractOptions).toHaveBeenCalled();
    expect(emptyInteraction.respond).toHaveBeenCalledWith([{ name: 'A', value: 'a' }]);

    const searchInteraction = createInteraction({
      options: createOptions({ focused: 'egg' }),
    });
    await autocomplete(searchInteraction);
    expect(searchBnLeaderboardContractOptions).toHaveBeenCalledWith('egg');
    expect(searchInteraction.respond).toHaveBeenCalledWith([{ name: 'B', value: 'b' }]);
  });
});
