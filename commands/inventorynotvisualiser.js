import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
  countArtifactsByRarity,
  fetchBackupData,
  getArtifacts,
  isValidPlayerId,
  listArtifactFamilies,
  resolveArtifactFamily,
  UserBackupEmptyError,
} from '../services/inventoryVisualizer/index.js';

const ARTIFACT_OPTION = 'artifact';
const TIER_OPTION = 'tier';
const PLAYER_ID_INPUT = 'eid';
const MODAL_ID_PREFIX = 'inventorynotvisualiser:eid';
const RARITY_ORDER = Object.freeze(['common', 'rare', 'epic', 'legendary']);

export const data = new SlashCommandBuilder()
  .setName('inventorynotvisualiser')
  .setDescription('Count an artifact by tier and rarity in an Egg, Inc. inventory.')
  .addStringOption(option =>
    option
      .setName(ARTIFACT_OPTION)
      .setDescription('Artifact to count')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption(option =>
    option
      .setName(TIER_OPTION)
      .setDescription('Artifact tier')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(4)
  );

function buildEidModal({ family, tier }) {
  const eidInput = new TextInputBuilder()
    .setCustomId(PLAYER_ID_INPUT)
    .setLabel('Egg, Inc. EID')
    .setPlaceholder('EI1234567890123456')
    .setStyle(TextInputStyle.Short)
    .setMinLength(18)
    .setMaxLength(18)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`${MODAL_ID_PREFIX}:${family.id}:${tier}`)
    .setTitle('Inventory artifact count')
    .addComponents(new ActionRowBuilder().addComponents(eidInput));
}

function parseModalSelection(customId) {
  const parts = String(customId ?? '').split(':');
  if (parts.length !== 4 || parts.slice(0, 2).join(':') !== MODAL_ID_PREFIX) {
    return null;
  }

  const family = resolveArtifactFamily(parts[2]);
  const tier = Number(parts[3]);
  if (!family || !Number.isInteger(tier) || !family.tiers.includes(tier)) {
    return null;
  }

  return { family, tier };
}

function buildCountContent(result) {
  const artifactName = result.family.family.toLowerCase();
  const lines = ['You have'];

  for (const rarity of RARITY_ORDER) {
    const count = result.countsByRarity[rarity];
    if (count > 0) {
      lines.push(`${count.toLocaleString('en-US')} ${rarity} tier ${result.tier} ${artifactName}`);
    }
  }

  if (result.total === 0) {
    lines.push(`0 tier ${result.tier} ${artifactName}`);
  }

  return lines.join('\n');
}

function getErrorMessage(error) {
  if (error instanceof UserBackupEmptyError) {
    return 'No usable backup was returned for that EID.';
  }

  return 'Failed to check inventory. Check the EID and try again.';
}

export async function execute(interaction) {
  const family = resolveArtifactFamily(interaction.options.getString(ARTIFACT_OPTION));
  const tier = interaction.options.getInteger(TIER_OPTION);

  if (!family) {
    await interaction.reply(createTextComponentMessage(
      'Please select a valid artifact from the autocomplete list.',
      { flags: MessageFlags.Ephemeral },
    ));
    return;
  }

  if (!family.tiers.includes(tier)) {
    const availableTiers = family.tiers.join(', ');
    await interaction.reply(createTextComponentMessage(
      `${family.family} is available at tier${family.tiers.length === 1 ? '' : 's'} ${availableTiers}.`,
      { flags: MessageFlags.Ephemeral },
    ));
    return;
  }

  await interaction.showModal(buildEidModal({ family, tier }));
}

export async function autocomplete(interaction) {
  const focused = String(interaction.options.getFocused() ?? '').trim().toLowerCase();
  const matches = listArtifactFamilies()
    .filter(family =>
      !focused ||
      family.family.toLowerCase().includes(focused) ||
      family.searchTerms.some(term => term.includes(focused))
    )
    .slice(0, 25)
    .map(family => ({ name: family.family, value: family.id }));

  await interaction.respond(matches);
}

export async function handleModalSubmit(interaction) {
  const selection = parseModalSelection(interaction.customId);
  if (!selection) return false;

  const playerId = interaction.fields.getTextInputValue(PLAYER_ID_INPUT).trim();
  if (!isValidPlayerId(playerId)) {
    await interaction.reply(createTextComponentMessage(
      'EID must be `EI` followed by 16 digits, for example `EI1234567890123456`.',
      { flags: MessageFlags.Ephemeral },
    ));
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const backupData = await fetchBackupData(playerId);
    const artifactData = getArtifacts(backupData.backup);
    const result = countArtifactsByRarity(artifactData.grid, selection);

    await interaction.editReply(createTextComponentMessage(buildCountContent(result)));
  } catch (error) {
    await interaction.editReply(createTextComponentMessage(getErrorMessage(error)));
  }

  return true;
}

export default { data, execute, autocomplete, handleModalSubmit };
