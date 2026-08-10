import { SlashCommandBuilder } from 'discord.js';
import { autoPopulateEmptyCoops, fetchEmptyCoops } from '../services/emptyCoopsService.js';
import {
  MAX_DISCORD_COMPONENT_LENGTH,
  chunkContent,
  createTextComponentMessage,
} from '../services/discord.js';
import { buildCoopUrl } from '../utils/coopLinks.js';
import { requireMamaBird } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('autopopulateemptycoops')
  .setDescription('Try to auto-populate every stored coop that has no linked players');

function createPayload(content) {
  return createTextComponentMessage(content, { allowedMentions: { parse: [] } });
}

function formatLinkedCoop(result, suffix = '') {
  const link = buildCoopUrl(result.contractId, result.coopId);
  return `- ${result.contractId} [${result.coopId}](<${link}>)${suffix}`;
}

function buildReport(results) {
  const full = results.filter(result => result.status === 'full');
  const partial = results.filter(result => result.status === 'partial');
  const failed = results.filter(result => result.status === 'failed');
  const lines = [];

  if (full.length > 0) {
    lines.push('was able to autopopulate');
    lines.push(...full.map(result => `- ${result.contractId} ${result.coopId}`));
  }

  if (partial.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('was able to partially autopopulate');
    lines.push(...partial.map(result => {
      const capacity = result.maxCoopSize ?? '?';
      return formatLinkedCoop(result, ` (${result.memberCount}/${capacity})`);
    }));
  }

  if (failed.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push("wasn't able to autopopulate");
    lines.push(...failed.map(result => formatLinkedCoop(result)));
  }

  return lines;
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  await interaction.deferReply();
  const emptyCoops = fetchEmptyCoops();
  if (emptyCoops.length === 0) {
    await interaction.editReply(createPayload('No empty coops found.'));
    return;
  }

  let lastProgressUpdate = 0;

  try {
    const results = await autoPopulateEmptyCoops({
      coops: emptyCoops,
      concurrency: 3,
      onProgress: async ({ completed, total }) => {
        const now = Date.now();
        if (completed !== total && now - lastProgressUpdate < 2000) return;
        lastProgressUpdate = now;
        try {
          await interaction.editReply(
            createPayload(`Auto-populating empty coops... ${completed}/${total}`),
          );
        } catch (error) {
          console.warn('Failed to update auto-populate progress:', error);
        }
      },
    });

    const chunks = chunkContent(buildReport(results), {
      maxLength: MAX_DISCORD_COMPONENT_LENGTH,
    });
    const [first, ...rest] = chunks;

    await interaction.editReply(createPayload(first));
    for (const chunk of rest) {
      await interaction.followUp(createPayload(chunk));
    }
  } catch (error) {
    console.error('Failed to auto-populate empty coops:', error);
    await interaction.editReply(
      createPayload('The bulk auto-populate operation failed unexpectedly.'),
    );
  }
}

export default { data, execute };
