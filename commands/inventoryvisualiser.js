import {
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
  fetchBackupData,
  getArtifacts,
  isValidPlayerId,
  UserBackupEmptyError,
  visualiseArtifacts,
} from '../services/inventoryVisualizer/index.js';

const PLAYER_ID_INPUT = 'eid';
const VIRTUE_OPTION = 'virtue';
const RARER_ITEMS_FIRST_OPTION = 'rarer_items_first';
const PUBLIC_OPTION = 'public';
const MODAL_ID_PREFIX = 'inventoryvisualiser:eid';

export const data = new SlashCommandBuilder()
  .setName('inventoryvisualiser')
  .setDescription('Render an Egg, Inc. artifact inventory image.')
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
      .setDescription('Post the generated inventory publicly. Default: false')
      .setRequired(false)
  );

function getSafePlayerName(backup, playerId) {
  const playerName = String(backup?.userName || backup?.user_name || '').trim();
  const normalizedPlayerId = String(playerId ?? '').trim();

  if (!playerName || (normalizedPlayerId && playerName.toLowerCase().includes(normalizedPlayerId.toLowerCase()))) {
    return 'Egg, Inc. player';
  }

  return playerName;
}

function buildSuccessContent({ backup, playerId, artifactData, imageData, virtue }) {
  const playerName = getSafePlayerName(backup, playerId);
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

function getErrorMessage(error) {
  if (error instanceof UserBackupEmptyError) {
    return 'No usable backup was returned for that EID.';
  }

  return 'Failed to render inventory. Check the EID and try again.';
}

function buildEidModal({ virtue, rarerItemsFirst, publicOutput }) {
  const eidInput = new TextInputBuilder()
    .setCustomId(PLAYER_ID_INPUT)
    .setLabel('Egg, Inc. EID')
    .setPlaceholder('EI1234567890123456')
    .setStyle(TextInputStyle.Short)
    .setMinLength(18)
    .setMaxLength(18)
    .setRequired(true);

  const modalId = [
    MODAL_ID_PREFIX,
    virtue ? '1' : '0',
    rarerItemsFirst ? '1' : '0',
    publicOutput ? '1' : '0',
  ].join(':');

  return new ModalBuilder()
    .setCustomId(modalId)
    .setTitle('Inventory visualiser')
    .addComponents(new ActionRowBuilder().addComponents(eidInput));
}

function parseModalOptions(customId) {
  const parts = String(customId ?? '').split(':');
  if (parts.length !== 5 || parts.slice(0, 2).join(':') !== MODAL_ID_PREFIX) {
    return null;
  }

  const flags = parts.slice(2);
  if (flags.some(flag => flag !== '0' && flag !== '1')) {
    return null;
  }

  return {
    virtue: flags[0] === '1',
    rarerItemsFirst: flags[1] === '1',
    publicOutput: flags[2] === '1',
  };
}

export async function execute(interaction) {
  const virtue = interaction.options.getBoolean(VIRTUE_OPTION) ?? false;
  const rarerItemsFirst = interaction.options.getBoolean(RARER_ITEMS_FIRST_OPTION) ?? true;
  const publicOutput = interaction.options.getBoolean(PUBLIC_OPTION) ?? false;

  await interaction.showModal(buildEidModal({ virtue, rarerItemsFirst, publicOutput }));
}

export async function handleModalSubmit(interaction) {
  const options = parseModalOptions(interaction.customId);
  if (!options) return false;

  const playerId = interaction.fields.getTextInputValue(PLAYER_ID_INPUT).trim();
  const { virtue, rarerItemsFirst, publicOutput } = options;

  if (!isValidPlayerId(playerId)) {
    await interaction.reply(createTextComponentMessage(
      'EID must be `EI` followed by 16 digits, for example `EI1234567890123456`.',
      { flags: MessageFlags.Ephemeral },
    ));
    return true;
  }

  await interaction.deferReply(publicOutput ? {} : { flags: MessageFlags.Ephemeral });

  try {
    const backupData = await fetchBackupData(playerId);
    const artifactData = getArtifacts(backupData.backup, { virtue, rarerItemsFirst });
    const imageData = await visualiseArtifacts(artifactData.grid);
    const filename = `${virtue ? 'virtue-' : ''}inventory.png`;
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
      createTextComponentMessage(getErrorMessage(error), {
        allowedMentions: { parse: [], users: [], roles: [] },
      }),
    );
  }

  return true;
}

export default { data, execute, handleModalSubmit };
