import { AttachmentBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
  fetchBackupData,
  getArtifacts,
  UserBackupEmptyError,
  visualiseArtifacts,
} from '../services/inventoryVisualizer/index.js';

const PLAYER_ID_OPTION = 'eid';
const VIRTUE_OPTION = 'virtue';
const RARER_ITEMS_FIRST_OPTION = 'rarer_items_first';
const PUBLIC_OPTION = 'public';

export const data = new SlashCommandBuilder()
  .setName('inventoryvisualiser')
  .setDescription('Render an Egg, Inc. artifact inventory image from a player id.')
  .addStringOption(option =>
    option
      .setName(PLAYER_ID_OPTION)
      .setDescription('your EID **YOUR EID WILL BE SHOWN IN MY LOGS. (I Promise I will not share it with anyone else. :P)**')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName(VIRTUE_OPTION)
      .setDescription('Use the Virtue artifact inventory instead of the main inventory')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName(RARER_ITEMS_FIRST_OPTION)
      .setDescription('Sort rarer items first. Default: true')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName(PUBLIC_OPTION)
      .setDescription('Post the generated inventory publicly. **YOUR EID WILL BE SHOWN IN COMMAND.** Default: false')
      .setRequired(false)
  );

function sanitizeFilenamePart(value) {
  return String(value ?? 'inventory')
    .trim()
    .replaceAll(/[^a-z0-9_-]/gi, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'inventory';
}

function buildSuccessContent({ backup, playerId, artifactData, imageData, virtue }) {
  const playerName = backup?.userName || backup?.user_name || playerId;
  const { summary } = artifactData;
  const rarity = summary.totalsByRarity;
  const lines = [
    `Inventory visualiser for ${playerName}`,
    `${summary.totalQuantity.toLocaleString('en-US')} items across ${summary.visualSlots.toLocaleString('en-US')} visual slots${virtue ? ' (Virtue)' : ''}.`,
    `Legendary ${rarity.legendary.toLocaleString('en-US')} | Epic ${rarity.epic.toLocaleString('en-US')} | Rare ${rarity.rare.toLocaleString('en-US')} | Common ${rarity.common.toLocaleString('en-US')}`,
  ];

  const warningCount = artifactData.warnings.length + imageData.warnings.length;
  if (warningCount > 0) {
    lines.push(`Rendered with ${warningCount} warning${warningCount === 1 ? '' : 's'}.`);
  }

  return lines.join('\n');
}

function getErrorMessage(error, playerId) {
  if (error instanceof UserBackupEmptyError) {
    return `No usable backup was returned for ${playerId}.`;
  }

  return `Failed to render inventory for ${playerId}: ${error?.message ?? String(error)}`;
}

export async function execute(interaction) {
  const playerId = interaction.options.getString(PLAYER_ID_OPTION, true).trim();
  const virtue = interaction.options.getBoolean(VIRTUE_OPTION) ?? false;
  const rarerItemsFirst = interaction.options.getBoolean(RARER_ITEMS_FIRST_OPTION) ?? true;
  const publicOutput = interaction.options.getBoolean(PUBLIC_OPTION) ?? false;

  await interaction.deferReply(publicOutput ? {} : { flags: MessageFlags.Ephemeral });

  try {
    const backupData = await fetchBackupData(playerId);
    const artifactData = getArtifacts(backupData.backup, { virtue, rarerItemsFirst });
    const imageData = await visualiseArtifacts(artifactData.grid);
    const filename = `${sanitizeFilenamePart(backupData.playerId)}-${virtue ? 'virtue-' : ''}inventory.png`;
    const attachment = new AttachmentBuilder(imageData.buffer, { name: filename });

    await interaction.editReply({
      content: buildSuccessContent({
        backup: backupData.backup,
        playerId: backupData.playerId,
        artifactData,
        imageData,
        virtue,
      }),
      files: [attachment],
      allowedMentions: { parse: [], users: [], roles: [] },
    });
  } catch (error) {
    await interaction.editReply(
      createTextComponentMessage(getErrorMessage(error, playerId), {
        allowedMentions: { parse: [], users: [], roles: [] },
      }),
    );
  }
}

export default { data, execute };
