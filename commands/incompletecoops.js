import { SlashCommandBuilder } from 'discord.js';
import { auditIncompleteCoops } from '../services/incompleteCoopsService.js';
import {
  MAX_DISCORD_COMPONENT_LENGTH,
  chunkContent,
  createTextComponentMessage,
} from '../services/discord.js';
import { buildCoopUrl } from '../utils/coopLinks.js';
import { requireMamaBird } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('incompletecoops')
  .setDescription('Find coop players who have not been added to their stored coop');

function createPayload(content) {
  return createTextComponentMessage(content, { allowedMentions: { parse: [] } });
}

function formatCoopLink(result) {
  const link = buildCoopUrl(result.contractId, result.coopId);
  return `${result.contractId} [${result.coopId}](<${link}>)`;
}

function cleanInlineCode(value) {
  return String(value).replaceAll('`', "'");
}

function buildReport({ incomplete, errors }) {
  const lines = [];

  if (incomplete.length > 0) {
    lines.push('incomplete coops');

    for (const result of incomplete) {
      lines.push(
        `- ${formatCoopLink(result)} (${result.assignedCount}/${result.expectedCount} filled)`,
      );
      for (const ign of result.missingIgns) {
        lines.push(`  - \`${cleanInlineCode(ign)}\` is not added to the coop`);
      }
    }
  }

  if (errors.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push("can't check who's in the coop");
    lines.push(...errors.map(result => `- ${formatCoopLink(result)}`));
  }

  return lines.length > 0 ? lines : ['All stored coops are fully assigned.'];
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  await interaction.deferReply();
  let lastProgressUpdate = 0;

  try {
    const report = await auditIncompleteCoops({
      concurrency: 3,
      onProgress: async ({ completed, total }) => {
        const now = Date.now();
        if (completed !== total && now - lastProgressUpdate < 2000) return;
        lastProgressUpdate = now;

        try {
          await interaction.editReply(createPayload(`Checking coops... ${completed}/${total}`));
        } catch (error) {
          console.warn('Failed to update incomplete-coop progress:', error);
        }
      },
    });

    const chunks = chunkContent(buildReport(report), {
      maxLength: MAX_DISCORD_COMPONENT_LENGTH,
    });
    const [first, ...rest] = chunks;

    await interaction.editReply(createPayload(first));
    for (const chunk of rest) {
      await interaction.followUp(createPayload(chunk));
    }
  } catch (error) {
    console.error('Failed to audit incomplete coops:', error);
    await interaction.editReply(createPayload('The incomplete coop check failed unexpectedly.'));
  }
}

export default { data, execute };
