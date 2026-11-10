import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { createTextComponentMessage } from '../services/discord.js';
import { addExtendedCoopCode } from '../services/coopCodeService.js';

export const data = new SlashCommandBuilder()
  .setName('addcoopcode')
  .setDescription('Add an extended coop code (Mama Birds only)')
  .addStringOption(option => option
    .setName('code')
    .setDescription('Full lowercase coop code ending in oo, e.g. monkeeoo')
    .setRequired(true)
    .setMaxLength(100));

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const result = addExtendedCoopCode(interaction.options.getString('code'));
  let message;
  if (result.ok) {
    message = `Added \`${result.code}\` to the extended coop codes.`;
  } else if (result.reason === 'already-exists') {
    message = `\`${result.code}\` is already in the extended coop codes.`;
  } else {
    message = 'this is not a valid -oo code!';
  }
  await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
}

export default { data, execute };
