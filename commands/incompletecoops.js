import { SlashCommandBuilder } from 'discord.js';
import { fetchIncompleteCoops } from '../services/incompleteCoopsService.js';
import {
  MAX_DISCORD_COMPONENT_LENGTH,
  chunkContent,
  createTextComponentMessage,
} from '../services/discord.js';
import { buildCoopUrl } from '../utils/coopLinks.js';
import { requireMamaBird } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('incompletecoops')
  .setDescription('List stored coops that have fewer than their maximum players');

function createPayload(content) {
  return createTextComponentMessage(content, { allowedMentions: { parse: [] } });
}

function formatCoopLink(result) {
  const link = buildCoopUrl(result.contractId, result.coopId);
  return `${result.contractId} [${result.coopId}](<${link}>)`;
}

function formatCoop(result) {
  return `- ${formatCoopLink(result)} (${result.playerCount}/${result.maxPlayers} players)`;
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  try {
    const incompleteCoops = fetchIncompleteCoops();
    const lines = incompleteCoops.length > 0
      ? ['incomplete coops', ...incompleteCoops.map(formatCoop)]
      : ['All stored coops have their maximum number of players.'];
    const chunks = chunkContent(lines, {
      maxLength: MAX_DISCORD_COMPONENT_LENGTH,
    });
    const [first, ...rest] = chunks;

    await interaction.reply(createPayload(first));
    for (const chunk of rest) {
      await interaction.followUp(createPayload(chunk));
    }
  } catch (error) {
    console.error('Failed to list incomplete coops:', error);
    await interaction.reply(createPayload('The incomplete coop check failed unexpectedly.'));
  }
}

export default { data, execute };
