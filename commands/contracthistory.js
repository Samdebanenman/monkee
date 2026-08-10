import { SlashCommandBuilder } from 'discord.js';
import {
  DEFAULT_HISTORY_SCOPE,
  HISTORY_CHOICES,
  fetchContractHistory,
} from '../services/contractHistoryService.js';
import {
  MAX_DISCORD_COMPONENT_LENGTH,
  chunkContent,
  createTextComponentMessage,
  extractDiscordId,
} from '../services/discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { EggtoEmoji } from '../Enums.js';

export const data = new SlashCommandBuilder()
  .setName('contracthistory')
  .setDescription('Show contracts previously played by you or another player')
  .addStringOption(option =>
    option
      .setName('user')
      .setDescription('Discord user mention or ID (Mama Birds only)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('history')
      .setDescription('How much contract history to show (defaults to 1 month)')
      .setRequired(false)
      .addChoices(...HISTORY_CHOICES)
  );

function cleanText(value, fallback) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function formatContractLine(row) {
  const contractId = cleanText(row.contractId, 'unknown-contract');
  const coopId = cleanText(row.coopId, 'unknown-coop');
  const eggKey = cleanText(row.egg, 'UNKNOWN').toUpperCase();
  const eggEmoji = EggtoEmoji[eggKey] || EggtoEmoji.UNKNOWN;
  const link = `https://eicoop-carpet.netlify.app/${encodeURIComponent(contractId)}/${encodeURIComponent(coopId)}`;
  const altMarker = row.isAltOnly ? '\\*' : '';

  return `- ${eggEmoji} ${contractId} [${coopId}](<${link}>)${altMarker}`;
}

async function sendChunks(interaction, chunks) {
  const [first, ...rest] = chunks;
  const payload = content => createTextComponentMessage(content, {
    allowedMentions: { parse: [], users: [] },
  });

  await interaction.reply(payload(first));
  for (const chunk of rest) {
    await interaction.followUp(payload(chunk));
  }
}

export async function execute(interaction) {
  const userInput = interaction.options.getString('user');
  let targetId = interaction.user.id;

  if (userInput != null) {
    if (!(await requireMamaBird(interaction))) return;

    targetId = extractDiscordId(userInput);
    if (!targetId) {
      await interaction.reply(
        createTextComponentMessage('Please provide a valid Discord user mention or ID.', { flags: 64 })
      );
      return;
    }
  }

  const scope = interaction.options.getString('history') || DEFAULT_HISTORY_SCOPE;
  const report = fetchContractHistory({ discordId: targetId, scope });
  const hasAltOnlyCoop = report.rows.some(row => row.isAltOnly);

  const lines = [
    `<@${targetId}>'s contract history of the past ${report.timeline}`,
    ...(report.rows.length > 0 ? report.rows.map(formatContractLine) : ['- No coops found.']),
    ...(hasAltOnlyCoop ? ['\\*alt only coop'] : []),
  ];
  const chunks = chunkContent(lines, { maxLength: MAX_DISCORD_COMPONENT_LENGTH });
  await sendChunks(interaction, chunks);
}

export default { data, execute };
