import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird, isUserMamaBird } from '../utils/permissions.js';
import { createTextComponentMessage } from '../services/discord.js';
import { removeExtendedCoopCode, listExtendedCoopCodes } from '../services/coopCodeService.js';

export const data = new SlashCommandBuilder()
  .setName('removecoopcode')
  .setDescription('Remove an extended coop code (Mama Birds only)')
  .addStringOption(option => option
    .setName('code')
    .setDescription('Extended coop code to remove (type to search the full list)')
    .setRequired(true)
    .setMaxLength(100)
    .setAutocomplete(true));

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const result = removeExtendedCoopCode(interaction.options.getString('code'));
  let message;
  if (result.ok) {
    message = `Removed \`${result.code}\` from the extended coop codes.`;
  } else if (result.reason === 'not-found') {
    message = `\`${result.code}\` is not in the extended coop codes.`;
  } else {
    message = 'Please choose a saved extended coop code, including its ending oo.';
  }
  await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
}

export async function autocomplete(interaction) {
  if (!isUserMamaBird(interaction.user?.id)) {
    await interaction.respond([]);
    return;
  }
  const focused = String(interaction.options.getFocused() ?? '').trim().toLowerCase();
  const choices = listExtendedCoopCodes()
    .filter(code => code.includes(focused))
    .slice(0, 25)
    .map(code => ({ name: code, value: code }));
  await interaction.respond(choices);
}

export default { data, execute, autocomplete };
