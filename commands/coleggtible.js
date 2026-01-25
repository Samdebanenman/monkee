import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import { GameDimensionLabels } from '../Enums.js';
import { getStoredColeggtibles } from '../utils/database/index.js';

function formatBuff(buff) {
  const dimensionLabel = GameDimensionLabels[buff.dimension] ?? String(buff.dimension ?? 'UNKNOWN');
  const valueText = buff.value == null ? 'n/a' : String(buff.value);
  const levelText = buff.rewardsLevel ? `#${buff.rewardsLevel}` : '#?';
  return `${levelText} ${dimensionLabel}: ${valueText}`;
}

export const data = new SlashCommandBuilder()
  .setName('coleggtible')
  .setDescription('View a coleggtible, its icon, and buffs.')
  .addStringOption(option =>
    option
      .setName('coleggtible')
      .setDescription('Choose a coleggtible')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const rows = getStoredColeggtibles();
    if (!rows.length) {
      await interaction.editReply(
        createTextComponentMessage('No coleggtibles found in the database.', { flags: 64 })
      );
      return;
    }

    const selected = interaction.options.getString('coleggtible', true);
    const entry = rows.find(row => row.identifier === selected) ?? null;
    if (!entry) {
      await interaction.editReply(
        createTextComponentMessage('Coleggtible not found.', { flags: 64 })
      );
      return;
    }

    const name = entry.name || entry.identifier || 'Unknown';
    const buffs = Array.isArray(entry.buffs) && entry.buffs.length
      ? entry.buffs.map(formatBuff).join('\n')
      : 'No buffs found.';

    const embed = new EmbedBuilder()
      .setTitle(name)
      .setDescription(buffs);

    if (entry.iconUrl) {
      embed.setImage(entry.iconUrl);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.editReply(
      createTextComponentMessage(`⚠️ ${message}`, { flags: 64 })
    );
  }
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused()?.toLowerCase?.() ?? '';
  const rows = getStoredColeggtibles();
  const options = rows
    .map(entry => ({
      name: entry.name || entry.identifier,
      value: entry.identifier,
    }))
    .filter(option => option.name?.toLowerCase?.().includes(focused))
    .slice(0, 25);

  await interaction.respond(options);
}

export default { data, execute, autocomplete };
