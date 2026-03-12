import { SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import { getQueueProgress } from '../services/simProgress.js';

export const data = new SlashCommandBuilder()
  .setName('predictstatus')
  .setDescription('Show overall simulation queue progress from Kafka offsets.');

export async function execute(interaction) {
  try {
    const progress = await getQueueProgress();
    const content = `Queue progress: ${progress.percent}% (${progress.completed}/${progress.total} completed).`;
    await interaction.reply(createTextComponentMessage(content, { flags: 64 }));
  } catch (error) {
    console.error('Failed to fetch queue progress:', error);
    await interaction.reply(createTextComponentMessage('Failed to fetch queue progress.', { flags: 64 }));
  }
}
