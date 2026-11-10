import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({
  requireMamaBird: vi.fn(),
  isUserMamaBird: vi.fn(),
}));
vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));
vi.mock('../../../services/coopCodeService.js', () => ({
  addExtendedCoopCode: vi.fn(),
  removeExtendedCoopCode: vi.fn(),
  listExtendedCoopCodes: vi.fn(),
}));

import { requireMamaBird, isUserMamaBird } from '../../../utils/permissions.js';
import { addExtendedCoopCode, removeExtendedCoopCode, listExtendedCoopCodes } from '../../../services/coopCodeService.js';
import { execute as add } from '../../../commands/addcoopcode.js';
import { execute as remove, autocomplete } from '../../../commands/removecoopcode.js';

beforeEach(() => {
  vi.resetAllMocks();
  requireMamaBird.mockResolvedValue(true);
  isUserMamaBird.mockReturnValue(true);
});

describe('coop code management commands', () => {
  it.each([add, remove])('requires Mama Bird permission before changing codes', async execute => {
    requireMamaBird.mockResolvedValue(false);
    await execute(createInteraction({ options: createOptions({ strings: { code: 'customoo' } }) }));
    expect(addExtendedCoopCode).not.toHaveBeenCalled();
    expect(removeExtendedCoopCode).not.toHaveBeenCalled();
  });

  it.each([
    [add, addExtendedCoopCode, { ok: true, code: 'customoo' }, 'Added'],
    [add, addExtendedCoopCode, { ok: false, code: 'customoo', reason: 'already-exists' }, 'already'],
    [add, addExtendedCoopCode, { ok: false, reason: 'invalid-code' }, 'must match'],
    [remove, removeExtendedCoopCode, { ok: true, code: 'customoo' }, 'Removed'],
    [remove, removeExtendedCoopCode, { ok: false, code: 'customoo', reason: 'not-found' }, 'not in'],
    [remove, removeExtendedCoopCode, { ok: false, reason: 'invalid-code' }, 'choose a saved'],
  ])('reports the code management result %#', async (execute, service, result, message) => {
    service.mockReturnValue(result);
    const interaction = createInteraction({ options: createOptions({ strings: { code: 'customoo' } }) });
    await execute(interaction);
    expect(service).toHaveBeenCalledWith('customoo');
    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining(message), flags: 64 });
  });

  it('autocompletes the saved list and searches beyond the first 25 codes', async () => {
    const codes = Array.from({ length: 30 }, (_, i) => `custom${i}oo`);
    listExtendedCoopCodes.mockReturnValue(codes);
    const empty = createInteraction();
    await autocomplete(empty);
    expect(empty.respond).toHaveBeenCalledWith(codes.slice(0, 25).map(code => ({ name: code, value: code })));
    const search = createInteraction({ options: createOptions({ focused: 'custom29' }) });
    await autocomplete(search);
    expect(search.respond).toHaveBeenCalledWith([{ name: 'custom29oo', value: 'custom29oo' }]);
  });

  it('returns no autocomplete choices to users without Mama Bird permission', async () => {
    isUserMamaBird.mockReturnValue(false);
    const interaction = createInteraction();
    await autocomplete(interaction);
    expect(interaction.respond).toHaveBeenCalledWith([]);
    expect(listExtendedCoopCodes).not.toHaveBeenCalled();
  });
});
