import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/database/coopCodesRepository.js', () => ({
  listExtendedCoopPrefixes: vi.fn(() => []),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../services/coopService.js', () => ({
  checkCoopForKnownPlayers: vi.fn(),
  getCoopAvailability: vi.fn(),
  listCoops: vi.fn(),
}));

import { execute } from '../../../commands/checkifpc.js';
import { listExtendedCoopPrefixes } from '../../../utils/database/coopCodesRepository.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { checkCoopForKnownPlayers, getCoopAvailability, listCoops } from '../../../services/coopService.js';

beforeEach(() => {
  vi.clearAllMocks();
  listExtendedCoopPrefixes.mockReturnValue([]);
});

describe('commands/checkifpc', () => {
  it('checks saved extended codes and their numbered restarts', async () => {
    listExtendedCoopPrefixes.mockReturnValue(['custom-9']);
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers.mockResolvedValue({ ok: true, matched: [] });
    getCoopAvailability.mockImplementation(async (_contract, code) => ({
      free: !['custom-9oo', '1custom-9oo', '2custom-9oo', '3custom-9oo'].includes(code),
    }));
    await execute(createInteraction({
      options: createOptions({ strings: { contract: 'c1', searchlist: 'extended' } }),
    }));
    for (const code of ['custom-9oo', '1custom-9oo', '2custom-9oo', '3custom-9oo']) {
      expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', code);
    }
    expect(getCoopAvailability).toHaveBeenCalledWith('c1', 'aoo');
    expect(getCoopAvailability).toHaveBeenCalledWith('c1', '4custom-9oo');
    expect(getCoopAvailability).not.toHaveBeenCalledWith('c1', '5custom-9oo');
  });

  it('checks default base codes', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    getCoopAvailability.mockImplementation(async (_contractId, coopCode) => ({ coopCode, free: true }));
    listCoops.mockReturnValue([]);

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    const prefixes = [...'abcdefghijklmnopqrstuvwxyz', '-'];
    const expectedCodes = prefixes.map(prefix => `${prefix}oo`);
    expect(getCoopAvailability.mock.calls.map(([, coopCode]) => coopCode)).toEqual(expectedCodes);
    expect(checkCoopForKnownPlayers).not.toHaveBeenCalled();
    expect(listExtendedCoopPrefixes).not.toHaveBeenCalled();
  });

  it('rejects empty contract input', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: '' } }),
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Please choose a contract');
  });

  it('reports cooptracker link when known players are found', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    getCoopAvailability.mockImplementation(async (_contractId, coopCode) => {
      if (coopCode === 'aoo') return { coopCode, free: false };
      if (coopCode === '1aoo') return { coopCode, free: true };
      if (coopCode === '-oo') return { coopCode, free: false };
      if (coopCode === '1-oo') return { coopCode, free: true };
      return { coopCode, free: true };
    });
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers
      .mockResolvedValueOnce({ ok: true, matched: [{ ign: 'Player1', discordId: '123' }], missing: [] })
      .mockResolvedValue({ ok: true, matched: [], missing: [] });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });
    interaction.channel.isTextBased = () => true;
    interaction.channel.isDMBased = () => true;

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(checkCoopForKnownPlayers).toHaveBeenCalled();
    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', '-oo');

    const edits = interaction.editReply.mock.calls
      .map(call => call?.[0]?.content ?? '')
      .join('\n');
    expect(edits).toContain('https://eicoop-carpet.netlify.app/c1/');
  });

  it('checks incremented coops until first free code', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers.mockResolvedValue({ ok: true, matched: [], missing: [] });

    getCoopAvailability.mockImplementation(async (_contractId, coopCode) => {
      if (coopCode === '-oo') return { coopCode, free: false };
      if (coopCode === '1-oo') return { coopCode, free: false };
      if (coopCode === '2-oo') return { coopCode, free: false };
      if (coopCode === '3-oo') return { coopCode, free: true };
      return { coopCode, free: true };
    });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', '-oo');
    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', '1-oo');
    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', '2-oo');
    expect(checkCoopForKnownPlayers).not.toHaveBeenCalledWith('c1', '3-oo');
    expect(getCoopAvailability).toHaveBeenCalledWith('c1', '3-oo');
    expect(getCoopAvailability).not.toHaveBeenCalledWith('c1', '4-oo');
  });

  it('continues the incremented series through 4 when earlier codes are occupied', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers.mockResolvedValue({ ok: true, matched: [], missing: [] });
    getCoopAvailability.mockImplementation(async (_contractId, coopCode) => ({
      coopCode,
      free: !['-oo', '1-oo', '2-oo', '3-oo', '4-oo'].includes(coopCode),
    }));

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    for (const coopCode of ['-oo', '1-oo', '2-oo', '3-oo', '4-oo']) {
      expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', coopCode);
    }
    expect(getCoopAvailability).toHaveBeenCalledWith('c1', '5-oo');
    expect(checkCoopForKnownPlayers).not.toHaveBeenCalledWith('c1', '5-oo');
  });

  it('checks 2-prefix even when 1-prefix is free', async () => {
    fetchContractSummaries.mockResolvedValue([{ id: 'c1', name: 'Contract 1' }]);
    listCoops.mockReturnValue([]);
    checkCoopForKnownPlayers.mockResolvedValue({ ok: true, matched: [], missing: [] });

    getCoopAvailability.mockImplementation(async (_contractId, coopCode) => {
      if (coopCode === 'coo') return { coopCode, free: false };
      if (coopCode === '1coo') return { coopCode, free: true };
      if (coopCode === '2coo') return { coopCode, free: false };
      if (coopCode === '3coo') return { coopCode, free: false };
      return { coopCode, free: true };
    });

    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', 'coo');
    expect(checkCoopForKnownPlayers).toHaveBeenCalledWith('c1', '2coo');
    expect(checkCoopForKnownPlayers).not.toHaveBeenCalledWith('c1', '3coo');
  });
});
