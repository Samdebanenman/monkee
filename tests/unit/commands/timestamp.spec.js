import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

import { execute } from '../../../commands/timestamp.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/timestamp', () => {
  it.each([
    ['1.5', 'Offsets must start with + or -'],
    ['', 'Provide an offset'],
    ['+', 'Add a numeric offset after the sign'],
    ['+abc', 'Use decimal hours'],
    ['+1:2:3', 'Use exactly one colon'],
    ['+2:', 'HH:MM offsets require both hours and minutes'],
    ['+:30', 'HH:MM offsets require both hours and minutes'],
    ['+a:30', 'Hours and minutes must be whole numbers'],
    ['+1:60', 'Minutes must be less than 60'],
  ])('rejects offset %j with %s', async (offset, message) => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset } }),
    });
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain(message);
  });

  it.each(['+0.5', '+ 0 : 30', '-0.5'])('emits a Discord timestamp for %s', async offset => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset, format: 'R' } }),
    });
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('<t:');
  });

  it('defaults to relative format when unknown format is provided', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'eitime', offset: '+0:30', format: 'X' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const content = interaction.reply.mock.calls[0][0].content;
    expect(content).toContain('EI time +0:30');
    expect(content).toContain(':R>');
  });

  it('uses followUp when interaction is deferred', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '+0.5', format: 'R' } }),
    });
    interaction.deferred = true;

    await execute(interaction);

    expect(interaction.followUp).toHaveBeenCalled();
  });

  it('returns ephemeral errors', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { mode: 'relative', offset: '1.5' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
  });
});
