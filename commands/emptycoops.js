import { SlashCommandBuilder } from 'discord.js';
import { fetchEmptyCoops } from '../services/emptyCoopsService.js';
import {
  MAX_DISCORD_COMPONENT_LENGTH,
  chunkContent,
  createTextComponentMessage,
} from '../services/discord.js';
import { buildCoopUrl } from '../utils/coopLinks.js';
import { requireMamaBird } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('emptycoops')
  .setDescription('List stored coops that have no linked players');

function formatCoop({ contractId, coopId }) {
  return `- ${contractId} [${coopId}](<${buildCoopUrl(contractId, coopId)}>)`;
}

function createPayload(content) {
  return createTextComponentMessage(content, { allowedMentions: { parse: [] } });
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const coops = fetchEmptyCoops();
  if (coops.length === 0) {
    await interaction.reply(createPayload('No empty coops found.'));
    return;
  }

  const chunks = chunkContent(
    [`Empty coops (${coops.length})`, ...coops.map(formatCoop)],
    { maxLength: MAX_DISCORD_COMPONENT_LENGTH },
  );
  const [first, ...rest] = chunks;

  await interaction.reply(createPayload(first));
  for (const chunk of rest) {
    await interaction.followUp(createPayload(chunk));
  }
}

export default { data, execute };
