import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { createTextComponentMessage } from '../services/discord.js';
import { setSeasonPushee } from '../services/memberService.js';
import { listSeasons } from '../services/seasonService.js';

export const data = new SlashCommandBuilder()
  .setName('setseasonpushee')
  .setDescription('Set a member as a pushee for a season')
  .addStringOption(option =>
    option
      .setName('season')
      .setDescription('Season identifier (e.g., fall_2025)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Member to set as the season pushee')
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const season = interaction.options.getString('season', true);
  const user = interaction.options.getUser('user', true);
  const result = setSeasonPushee({ targetDiscordId: user?.id, season });

  if (!result.ok) {
    const message = result.reason === 'invalid-season'
      ? 'Please provide a valid season such as `fall_2025`.'
      : `Failed to set season pushee: ${result.reason ?? 'unknown error'}.`;
    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  const message = result.status === 'unchanged'
    ? `<@${result.discordId}> is already a pushee for \`${result.season}\`.`
    : `Set <@${result.discordId}> as a pushee for \`${result.season}\`.`;
  await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
}

export async function autocomplete(interaction) {
  const focused = String(interaction.options.getFocused() ?? '').toLowerCase();
  const choices = listSeasons()
    .filter(season => season.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(season => ({ name: season, value: season }));
  await interaction.respond(choices);
}

export default { data, execute, autocomplete };
