import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/ban.js';
import { requireMamaBird } from '../../../utils/permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/ban', () => {
  it('does nothing when permission check fails', async () => {
    requireMamaBird.mockResolvedValue(false);
    const interaction = createInteraction({
      options: createOptions({ strings: { user: '<@123>', reason: 'bad' } }),
    });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it.each([
    ['nope', 'bad', 'valid Discord ID'],
    ['<@123456789012345678>', '   ', 'non-empty reason'],
    ['<@123456789012345678>', 'spoilers', 'banned <@123456789012345678>'],
  ])('handles user %s with reason %j', async (user, reason, message) => {
    requireMamaBird.mockResolvedValue(true);
    const interaction = createInteraction({
      options: createOptions({ strings: { user, reason } }),
    });
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain(message);
  });
});
