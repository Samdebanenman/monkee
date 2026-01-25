import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../utils/database/index.js', () => ({
  getStoredColeggtibles: vi.fn(),
}));

import { execute, autocomplete } from '../../../commands/coleggtible.js';
import { getStoredColeggtibles } from '../../../utils/database/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/coleggtible', () => {
  it('renders an embed for a selected coleggtible', async () => {
    getStoredColeggtibles.mockReturnValue([
      {
        identifier: 'egg1',
        name: 'Egg One',
        iconUrl: 'https://example.test/icon.png',
        buffs: [{ rewardsLevel: 1, dimension: 1, value: 1.05 }],
      },
    ]);

    const interaction = createInteraction({
      options: createOptions({ strings: { coleggtible: 'egg1' } }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.flags).toBeUndefined();
    expect(payload.embeds).toBeDefined();
    expect(payload.embeds[0].data.description).toContain('EARNINGS');
    expect(payload.embeds[0].data.image?.url).toBe('https://example.test/icon.png');
  });

  it('returns ephemeral error when no coleggtibles exist', async () => {
    getStoredColeggtibles.mockReturnValue([]);

    const interaction = createInteraction({
      options: createOptions({ strings: { coleggtible: 'egg1' } }),
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.flags).toBe(64);
    expect(payload.content).toContain('No coleggtibles');
  });

  it('autocompletes coleggtible names', async () => {
    getStoredColeggtibles.mockReturnValue([
      { identifier: 'egg1', name: 'Egg One' },
      { identifier: 'egg2', name: 'Another Egg' },
    ]);

    const interaction = createInteraction({
      options: createOptions({ focused: 'egg' }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    const options = interaction.respond.mock.calls[0][0];
    expect(options.length).toBe(2);
  });
});
