import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: (content, options = {}) => ({ content, ...options }),
}));

vi.mock('../../../services/inventoryVisualizer/index.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchBackupData: vi.fn(),
    getArtifacts: vi.fn(),
  };
});

import {
  autocomplete,
  execute,
  handleModalSubmit,
} from '../../../commands/inventorynotvisualiser.js';
import {
  fetchBackupData,
  getArtifacts,
  resolveArtifactFamily,
} from '../../../services/inventoryVisualizer/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commands/inventorynotvisualiser', () => {
  it('autocompletes a short artifact name', async () => {
    const interaction = createInteraction({
      options: createOptions({ focused: 'deflector' }),
    });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Tachyon deflector' }),
    ]);
  });

  it('opens an EID modal containing the selected artifact and tier', async () => {
    const family = resolveArtifactFamily('deflector');
    const interaction = createInteraction({
      options: createOptions({
        strings: { artifact: family.id },
        integers: { tier: 4 },
      }),
    });
    interaction.showModal = vi.fn(async () => {});

    await execute(interaction);

    expect(interaction.showModal).toHaveBeenCalledOnce();
    const modal = interaction.showModal.mock.calls[0][0].toJSON();
    expect(modal.custom_id).toBe(`inventorynotvisualiser:eid:${family.id}:4`);
  });

  it('returns the selected artifact counts grouped by rarity', async () => {
    const family = resolveArtifactFamily('deflector');
    fetchBackupData.mockResolvedValue({ backup: { game: {} } });
    getArtifacts.mockReturnValue({
      grid: [
        { family: family.family, tier: 4, rarity: 0, count: 12 },
        { family: family.family, tier: 4, rarity: 1, count: 1 },
        { family: family.family, tier: 4, rarity: 3, count: 1 },
      ],
    });

    const interaction = createInteraction();
    interaction.customId = `inventorynotvisualiser:eid:${family.id}:4`;
    interaction.fields = {
      getTextInputValue: vi.fn(() => 'EI1234567890123456'),
    };

    expect(await handleModalSubmit(interaction)).toBe(true);
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: [
        'You have',
        '12 common tier 4 tachyon deflector',
        '1 rare tier 4 tachyon deflector',
        '1 legendary tier 4 tachyon deflector',
      ].join('\n'),
    }));
  });

  it('rejects an invalid EID before fetching a backup', async () => {
    const family = resolveArtifactFamily('deflector');
    const interaction = createInteraction();
    interaction.customId = `inventorynotvisualiser:eid:${family.id}:4`;
    interaction.fields = {
      getTextInputValue: vi.fn(() => 'not-an-eid'),
    };

    expect(await handleModalSubmit(interaction)).toBe(true);
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
    expect(fetchBackupData).not.toHaveBeenCalled();
  });
});
