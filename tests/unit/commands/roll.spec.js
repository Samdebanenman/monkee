import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/roll.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/roll', () => {
  it('rejects invalid dice input', async () => {
    const interaction = createInteraction({
      options: createOptions({ integers: { eyes: 1, amount: 0 } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('at least a 2-sided');
  });

  it('caps amount to 25 and animates rolls', async () => {
    vi.useFakeTimers();

    const interaction = createInteraction({
      options: createOptions({ integers: { eyes: 6, amount: 50 } }),
    });

    const promise = execute(interaction);
    await vi.runAllTimersAsync();
    await promise;

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledTimes(14);
    const embed = interaction.editReply.mock.calls.at(-1)[0].embeds[0].toJSON();
    expect(embed.fields).toHaveLength(25);
    for (const field of embed.fields) {
      expect(Number(field.value.replace('Rolled: ', ''))).toBeGreaterThanOrEqual(1);
      expect(Number(field.value.replace('Rolled: ', ''))).toBeLessThanOrEqual(6);
    }

    vi.useRealTimers();
  });
});
