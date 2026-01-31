import { SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { refreshContracts } from '../services/contractService.js';
import { fetchAndCacheColeggtibles } from '../utils/coleggtibles.js';
import { createTextComponentMessage } from '../services/discord.js';
import { listAllMembers, updateMemberDiscordNameByDiscordId } from '../utils/database/membersRepository.js';

export const data = new SlashCommandBuilder()
  .setName('forcerefresh')
  .setDescription('Force the contract refresh right now.');

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  await interaction.deferReply({ flags: 64 });

  try {
    const contracts = await refreshContracts();
    const coleggtibles = await fetchAndCacheColeggtibles();
    const discordRefresh = await refreshDiscordNames(interaction.client);
    const count = Array.isArray(contracts) ? contracts.length : 0;
    const coleggtibleCount = Array.isArray(coleggtibles) ? coleggtibles.length : 0;
    const epoch = Math.floor(Date.now() / 1000);

    await interaction.editReply(
      createTextComponentMessage(
        `Contracts refreshed. Loaded ${count} contracts and ${coleggtibleCount} coleggtibles as of <t:${epoch}:f>. Discord names refreshed: ${discordRefresh.updated} updated, ${discordRefresh.unchanged} unchanged, ${discordRefresh.failed} failed.`,
        { flags: 64 }
      )
    );
  } catch (err) {
    const message = err?.message ?? String(err);
    await interaction.editReply(
      createTextComponentMessage(`Failed to refresh contracts: ${message}`, { flags: 64 })
    );
  }
}

async function refreshDiscordNames(client) {
  const members = listAllMembers();
  const summary = {
    updated: 0,
    unchanged: 0,
    failed: 0,
  };

  for (const member of members) {
    const discordId = member?.discord_id;
    if (!discordId) {
      summary.failed += 1;
      continue;
    }

    try {
      const user = await client.users.fetch(discordId);
      const username = user?.username ?? null;

      if (!username) {
        summary.failed += 1;
        continue;
      }

      if (member.discord_name === username) {
        summary.unchanged += 1;
        continue;
      }

      updateMemberDiscordNameByDiscordId(discordId, username);
      summary.updated += 1;
    } catch (error) {
      summary.failed += 1;
    }
  }

  return summary;
}
