import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../services/memberService.js', () => ({
  setSeasonPushee: vi.fn(),
  removeSeasonPushee: vi.fn(),
  getSeasonPushees: vi.fn(),
}));

vi.mock('../../../services/seasonService.js', () => ({
  listSeasons: vi.fn(),
}));

import { data as setData, execute as executeSet, autocomplete as autocompleteSet } from '../../../commands/setseasonpushee.js';
import { data as removeData, execute as executeRemove, autocomplete as autocompleteRemove } from '../../../commands/removeseasonpushee.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import { getSeasonPushees, removeSeasonPushee, setSeasonPushee } from '../../../services/memberService.js';
import { listSeasons } from '../../../services/seasonService.js';

beforeEach(() => {
  vi.clearAllMocks();
  requireMamaBird.mockResolvedValue(true);
  listSeasons.mockReturnValue(['fall_2025', 'summer_2025']);
});

describe('setseasonpushee command', () => {
  it('serializes both command definitions', () => {
    expect(setData.toJSON().name).toBe('setseasonpushee');
    expect(removeData.toJSON().name).toBe('removeseasonpushee');
  });

  it('sets a selected Discord user for a season', async () => {
    setSeasonPushee.mockReturnValue({
      ok: true,
      status: 'updated',
      discordId: '12345678901234567',
      season: 'fall_2025',
    });
    const interaction = createInteraction({
      options: createOptions({
        strings: { season: 'fall_2025' },
        users: { user: { id: '12345678901234567' } },
      }),
    });

    await executeSet(interaction);

    expect(setSeasonPushee).toHaveBeenCalledWith({
      targetDiscordId: '12345678901234567',
      season: 'fall_2025',
    });
    expect(interaction.reply.mock.calls[0][0].content).toContain('Set <@12345678901234567>');
  });

  it('autocompletes known seasons', async () => {
    const interaction = createInteraction({ options: createOptions({ focused: 'fall' }) });
    await autocompleteSet(interaction);
    expect(interaction.respond.mock.calls[0][0]).toEqual([
      { name: 'fall_2025', value: 'fall_2025' },
    ]);
  });
});

describe('removeseasonpushee command', () => {
  it('autocompletes users assigned to the selected season', async () => {
    getSeasonPushees.mockReturnValue([
      {
        discord_id: '12345678901234567',
        discord_name: 'Sam',
        ign: 'monkee',
        pushee: 'fall_2025',
      },
    ]);
    const interaction = createInteraction({
      options: createOptions({
        strings: { season: 'fall_2025' },
        focused: 'sam',
        focusedOptionName: 'user',
      }),
    });

    await autocompleteRemove(interaction);

    expect(getSeasonPushees).toHaveBeenCalledWith('fall_2025');
    expect(interaction.respond.mock.calls[0][0][0]).toEqual({
      name: 'Sam / monkee - 12345678901234567',
      value: '12345678901234567',
    });
  });

  it('clears the selected pushee assignment', async () => {
    removeSeasonPushee.mockReturnValue({
      ok: true,
      discordId: '12345678901234567',
      season: 'fall_2025',
    });
    const interaction = createInteraction({
      options: createOptions({
        strings: { season: 'fall_2025', user: '12345678901234567' },
      }),
    });

    await executeRemove(interaction);

    expect(removeSeasonPushee).toHaveBeenCalledWith({
      targetDiscordId: '12345678901234567',
      season: 'fall_2025',
    });
    expect(interaction.reply.mock.calls[0][0].content).toContain('Removed <@12345678901234567>');
  });
});
