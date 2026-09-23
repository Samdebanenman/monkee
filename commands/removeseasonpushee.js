import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { createTextComponentMessage } from '../services/discord.js';
import { getSeasonPushees, removeSeasonPushee } from '../services/memberService.js';
import { listSeasons } from '../services/seasonService.js';

export const data = new SlashCommandBuilder()
  .setName('removeseasonpushee')
  .setDescription('Remove a member as a pushee for a season')
  .addStringOption(option =>
    option
      .setName('season')
      .setDescription('Season identifier (e.g., fall_2025)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('user')
      .setDescription('Season pushee to remove')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const season = interaction.options.getString('season', true);
  const discordId = interaction.options.getString('user', true);
  const result = removeSeasonPushee({ targetDiscordId: discordId, season });

  if (!result.ok) {
    let message = `Failed to remove season pushee: ${result.reason ?? 'unknown error'}.`;
    if (result.reason === 'invalid-season') {
      message = 'Please provide a valid season such as `fall_2025`.';
    } else if (result.reason === 'not-pushee') {
      message = `<@${discordId}> is not assigned as a season pushee.`;
    } else if (result.reason === 'season-mismatch') {
      message = `<@${discordId}> is assigned to \`${result.assignedSeason}\`, not \`${season}\`.`;
    } else if (result.reason === 'not-found') {
      message = 'That member was not found in the database.';
    }
    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  await interaction.reply(
    createTextComponentMessage(`Removed <@${result.discordId}> as a pushee for \`${result.season}\`.`, { flags: 64 })
  );
}

function memberChoiceName(member) {
  const labels = [member.discord_name, member.ign]
    .map(value => value == null ? '' : String(value).trim())
    .filter(Boolean);
  const prefix = labels.length > 0 ? `${labels.join(' / ')} - ` : '';
  return `${prefix}${member.discord_id}`.slice(0, 100);
}

export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  const focused = String(focusedOption?.value ?? '').toLowerCase();

  if (focusedOption?.name === 'season') {
    const choices = listSeasons()
      .filter(season => season.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(season => ({ name: season, value: season }));
    await interaction.respond(choices);
    return;
  }

  if (focusedOption?.name === 'user') {
    const season = interaction.options.getString('season') ?? '';
    const choices = getSeasonPushees(season)
      .map(member => ({ name: memberChoiceName(member), value: member.discord_id }))
      .filter(choice => choice.name.toLowerCase().includes(focused) || choice.value.includes(focused))
      .slice(0, 25);
    await interaction.respond(choices);
    return;
  }

  await interaction.respond([]);
}

export default { data, execute, autocomplete };
