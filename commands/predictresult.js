import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';
import { getResult } from '../services/simResultsStore.js';

export const data = new SlashCommandBuilder()
  .setName('predictresult')
  .setDescription('Fetch a queued simulation result by job id.')
  .addStringOption(option =>
    option
      .setName('job_id')
      .setDescription('Job id returned by predictcs/predictmaxcs')
      .setRequired(true)
  );

export async function execute(interaction) {
  const jobId = interaction.options.getString('job_id');
  const result = getResult(jobId);

  if (!result) {
    return interaction.reply(createTextComponentMessage(
      'Result not ready yet. Try again later or check /predictstatus for queue progress.',
      { flags: 64 },
    ));
  }

  if (result.status === 'error') {
    return interaction.reply(createTextComponentMessage(
      `Simulation failed: ${result.error ?? 'unknown error'}`,
      { flags: 64 },
    ));
  }

  const outputLines = Array.isArray(result.outputLines) ? result.outputLines : [];
  const title = result.title ?? 'Simulation Result';
  const chunks = chunkContent(outputLines, { maxLength: 3800, separator: '\n' });
  const embeds = chunks.map((chunk, index) => new EmbedBuilder()
    .setTitle(index === 0 ? title : `${title} (cont.)`)
    .setDescription(chunk));

  const [first, ...rest] = embeds;
  await interaction.reply({ content: '', embeds: [first] });
  for (const embed of rest) {
    await interaction.followUp({ embeds: [embed] });
  }
}
