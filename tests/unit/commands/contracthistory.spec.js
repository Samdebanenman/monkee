import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  MAX_DISCORD_COMPONENT_LENGTH: 4000,
  chunkContent: input => [Array.isArray(input) ? input.join('\n') : String(input)],
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
  extractDiscordId: value => /\d{17,20}/.exec(String(value ?? ''))?.[0] ?? null,
}));

vi.mock('../../../utils/database/contractHistoryRepository.js', () => ({
  getContractHistoryForMember: vi.fn(),
}));

vi.mock('../../../services/contractHistoryService.js', async () => {
  const actual = await vi.importActual('../../../services/contractHistoryService.js');
  return { ...actual, fetchContractHistory: vi.fn() };
});

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

import { data, execute } from '../../../commands/contracthistory.js';
import { fetchContractHistory } from '../../../services/contractHistoryService.js';
import { requireMamaBird } from '../../../utils/permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
  requireMamaBird.mockResolvedValue(true);
  fetchContractHistory.mockReturnValue({ timeline: '1 month', rows: [] });
});

describe('commands/contracthistory', () => {
  it('declares the requested optional choices', () => {
    const command = data.toJSON();
    const user = command.options.find(option => option.name === 'user');
    const history = command.options.find(option => option.name === 'history');

    expect(user.required).toBe(false);
    expect(history.required).toBe(false);
    expect(history.choices.map(choice => choice.name)).toEqual([
      '1 month',
      '3 months',
      'this season - seasonal',
      'this season - all',
      'total - seasonal',
      'total - all',
    ]);
  });

  it('shows the invoking user one month by default', async () => {
    const interaction = createInteraction({
      userId: '123456789012345678',
      options: createOptions(),
    });

    await execute(interaction);

    expect(requireMamaBird).not.toHaveBeenCalled();
    expect(fetchContractHistory).toHaveBeenCalledWith({
      discordId: '123456789012345678',
      scope: '1-month',
    });
    expect(interaction.reply.mock.calls[0][0].content).toBe(
      "<@123456789012345678>'s contract history of the past 1 month\n- No coops found.",
    );
  });

  it('restricts the user option to Mama Birds', async () => {
    requireMamaBird.mockResolvedValue(false);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@234567890123456789>' } }),
    });

    await execute(interaction);

    expect(fetchContractHistory).not.toHaveBeenCalled();
  });

  it('accepts a mention and selected history for a Mama Bird', async () => {
    fetchContractHistory.mockReturnValue({
      timeline: 'total - all',
      rows: [{
        contractId: 'c1',
        coopId: 'coop-one',
        egg: 'QUANTUM',
        release: 1770000000,
        season: 'winter_2026',
      }],
    });
    const interaction = createInteraction({
      options: createOptions({
        strings: {
          user: '<@234567890123456789>',
          history: 'total-all',
        },
      }),
    });

    await execute(interaction);

    expect(fetchContractHistory).toHaveBeenCalledWith({
      discordId: '234567890123456789',
      scope: 'total-all',
    });
    const content = interaction.reply.mock.calls[0][0].content;
    expect(content).toContain("<@234567890123456789>'s contract history of the past total - all");
    expect(content).toContain('c1 [coop-one](<https://eicoop-carpet.netlify.app/c1/coop-one>)');
  });

  it('rejects an invalid user value after checking permissions', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { user: 'not-a-user' } }),
    });

    await execute(interaction);

    expect(requireMamaBird).toHaveBeenCalled();
    expect(fetchContractHistory).not.toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('valid Discord user');
  });
});
