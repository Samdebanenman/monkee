import { forEachSequential } from '../utils/async.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, SlashCommandBuilder } from 'discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { extractDiscordId, chunkContent, createTextComponentMessage } from '../services/discord.js';
import { linkAltAccount, unlinkAltAccount } from '../services/coopService.js';
import { setIgnForMember, setMembersActiveStatus, syncMembersFromApiEntries, fetchMembersPayloadFromApi,
  getInactiveMembers, prepareMemberRemoval, removeMembers } from '../services/memberService.js';
const MAX_DETAIL_ROWS = 5;
const REMOVAL_CONFIRMATION_TIMEOUT_MS = 60_000;

function formatMemberLine(member, mention = true) {
  const identifier = mention ? `<@${member.discord_id}>` : member.discord_id;
  const name = String(member.discord_name || 'Unknown Discord name').replaceAll(/[\r\n`]/g, ' ');
  return `${identifier} \`${name}\``;
}

async function handleCheckInactive(interaction) {
  await interaction.deferReply({ flags: 64 });
  const members = getInactiveMembers();
  const lines = members.length > 0
    ? ['Inactive members:', ...members.map(member => formatMemberLine(member))]
    : ['No inactive members found.'];
  await sendSummaryChunks(interaction, lines);
}

function parseRemovalTargets(input) {
  const ids = new Set();
  const invalid = [];
  for (const token of String(input ?? '').split(/[\s,]+/).filter(Boolean)) {
    const match = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(token);
    if (match) ids.add(match[1] ?? match[2]);
    else invalid.push(token);
  }
  return { ids: [...ids], invalid };
}

function removalButtons(step) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`member:removeplayer:${step}:confirm`)
      .setLabel(step === 1 ? 'Yes, continue' : 'Yes, remove players')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`member:removeplayer:${step}:cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

async function requestRemovalConfirmation(interaction, members, step) {
  const heading = step === 1
    ? 'Are you sure you want to remove the following players?'
    : 'Are you really sure you want to remove the following players? This cannot be undone.';
  const chunks = chunkContent([
    heading,
    ...members.map(member => formatMemberLine(member, false)),
    '',
    'Their member records and all associated member-coop entries will be permanently deleted. This cannot be undone.',
    'Linked alts are kept and unlinked unless also listed above.',
  ], { maxLength: 3500 });
  await forEachSequential(chunks.slice(0, -1), chunk =>
    interaction.followUp(createTextComponentMessage(chunk, { flags: 64 })));
  const message = await interaction.followUp(createTextComponentMessage(chunks.at(-1), {
    flags: 64, components: [removalButtons(step)],
  }));
  let button;
  try {
    button = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: REMOVAL_CONFIRMATION_TIMEOUT_MS,
      filter: candidate => candidate.user.id === interaction.user.id
        && [`member:removeplayer:${step}:confirm`, `member:removeplayer:${step}:cancel`].includes(candidate.customId),
    });
  } catch (error) {
    if (error.code !== 'InteractionCollectorError') throw error;
    await interaction.webhook.editMessage(message.id,
      createTextComponentMessage('Confirmation expired. No players were removed.'));
    return false;
  }

  if (button.customId === `member:removeplayer:${step}:cancel`) {
    await button.update(createTextComponentMessage('Removal cancelled. No players were removed.'));
    return false;
  }
  if (!(await requireMamaBird(button))) {
    await interaction.webhook.editMessage(message.id,
      createTextComponentMessage('Removal cancelled: you are no longer a Mama Bird. No players were removed.'));
    return false;
  }
  await button.update(createTextComponentMessage(`Confirmation ${step} received.`));
  return true;
}

async function handleRemovePlayer(interaction) {
  const { ids, invalid } = parseRemovalTargets(interaction.options.getString('mention'));
  if (ids.length === 0 || invalid.length > 0) {
    await interaction.reply(createTextComponentMessage(
      'Provide only valid Discord mentions or IDs, separated by spaces or commas. No players were removed.', { flags: 64 }));
    return;
  }
  const { members, missing } = prepareMemberRemoval(ids);
  if (missing.length > 0) {
    const chunks = chunkContent(['These players were not found in the database:', ...missing,
      'No players were removed. Correct the list and try again.']);
    await interaction.reply(createTextComponentMessage(chunks[0], { flags: 64 }));
    await forEachSequential(chunks.slice(1), chunk =>
      interaction.followUp(createTextComponentMessage(chunk, { flags: 64 })));
    return;
  }

  await interaction.reply(createTextComponentMessage('Confirm the removal in both messages below.', { flags: 64 }));
  if (!(await requestRemovalConfirmation(interaction, members, 1))) return;
  if (!(await requestRemovalConfirmation(interaction, members, 2))) return;

  const { removed, skipped } = removeMembers({ members });
  const lines = [`Permanently removed ${removed.length} player(s) and their member-coop entries.`,
    ...removed.map(member => formatMemberLine(member, false))];
  if (skipped.length > 0) {
    lines.push('', 'Not removed because their records changed or were already deleted:',
      ...skipped.map(member => formatMemberLine(member, false)));
  }
  await sendSummaryChunks(interaction, lines);
}

function formatConflict(conflict) {
  const others = (conflict.conflictDiscordIds ?? [])
    .map(id => `<@${id}>`)
    .join(', ') || 'unknown member(s)';
  return `- IGN \`${conflict.ign}\` for <@${conflict.discordId}> conflicts with ${others}`;
}

function formatInvalid(entry) {
  const idText = entry.discordId ? `<@${entry.discordId}>` : '`(missing id)`';
  const ignText = entry.ign ? `\`${entry.ign}\`` : '`(missing ign)`';
  return `- ${idText} ${ignText}`;
}

function formatSkipped(entry) {
  return formatInvalid(entry);
}

async function loadMembersPayload(interaction) {
  try {
    return await fetchMembersPayloadFromApi();
  } catch (err) {
    await interaction.editReply(
      createTextComponentMessage(`Failed to fetch member data: ${err.message ?? err}`, { flags: 64 })
    );
    return null;
  }
}

function appendSection(lines, items, title, formatter) {
  if (!items || items.length === 0) return;

  lines.push('', title);
  for (const entry of items.slice(0, MAX_DETAIL_ROWS)) {
    lines.push(formatter(entry));
  }
}

function formatFailure(entry) {
  const reason = entry.reason ? ` (${entry.reason})` : '';
  return `${formatInvalid(entry)}${reason}`;
}

function buildSummaryLines(summary) {
  const lines = [
    `processed ${summary.total} records`,
    `updated: ${summary.updated}`,
    `unchanged: ${summary.unchanged}`,
    `conflicts: ${summary.conflicts.length}`,
    `invalid: ${summary.invalid.length}`,
    `skipped: ${summary.skipped.length}`,
    `failures: ${summary.failures.length}`,
  ];

  appendSection(lines, summary.conflicts, 'conflicts (first few):', formatConflict);
  appendSection(lines, summary.invalid, 'invalid entries (first few):', formatInvalid);
  appendSection(lines, summary.skipped, 'skipped (first few):', formatSkipped);
  appendSection(lines, summary.failures, 'failures (first few):', formatFailure);

  return lines;
}

async function sendSummaryChunks(interaction, lines) {
  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.editReply(createTextComponentMessage(first, { flags: 64 }));
  await forEachSequential(rest, async chunk => {
    await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
  });
}

function parseTargetIdentifiers(rawTargets) {
  if (!rawTargets) {
    return { ids: [], invalid: [] };
  }

  const tokens = rawTargets
    .split(/[\s,]+/)
    .map(token => token.trim())
    .filter(Boolean);

  const ids = new Set();
  const invalid = [];

  for (const token of tokens) {
    const id = extractDiscordId(token);
    if (!id) {
      invalid.push(token);
      continue;
    }
    ids.add(id);
  }

  return { ids: [...ids], invalid };
}

function formatMentions(ids) {
  return ids.map(id => `<@${id}>`).join(', ');
}

async function handleSetAlt(interaction) {
  const mainInput = interaction.options.getString('main');
  const altInput = interaction.options.getString('alt');

  const mainId = extractDiscordId(mainInput);
  const altId = extractDiscordId(altInput);

  if (!mainId || !altId) {
    await interaction.reply(
      createTextComponentMessage('Please provide valid Discord IDs or mentions for both main and alt.', { flags: 64 })
    );
    return;
  }

  const result = linkAltAccount({ main: mainId, alt: altId });

  if (!result.ok) {
    let reason;
    switch (result.reason) {
      case 'invalid-input':
        reason = 'Missing main or alt ID.';
        break;
      case 'same-id':
        reason = 'Main and alt cannot be the same ID.';
        break;
      case 'main-is-alt':
        reason = 'The specified main is already marked as an alt of another account.';
        break;
      case 'alt-already-linked':
        reason = 'That alt is already linked to a different main. Remove it first.';
        break;
      case 'already-set':
        reason = 'That alt is already linked to the specified main.';
        break;
      case 'alt-has-children':
        reason = 'That account already has alts linked to it and cannot be set as an alt.';
        break;
      default:
        reason = result.reason ? `Unable to link alt: ${result.reason}.` : 'Unable to link alt.';
        break;
    }

    await interaction.reply(createTextComponentMessage(reason, { flags: 64 }));
    return;
  }

  const details = result.details ?? {};
  const mainDiscord = details.main?.discord_id ?? mainId;
  const altDiscord = details.alt?.discord_id ?? altId;

  await interaction.reply(
    createTextComponentMessage(`Linked <@${altDiscord}> as an alt of <@${mainDiscord}>.`, { flags: 64 })
  );
}

async function handleRemoveAlt(interaction) {
  const mainInput = interaction.options.getString('main');
  const altInput = interaction.options.getString('alt');

  const mainId = extractDiscordId(mainInput);
  const altId = extractDiscordId(altInput);

  if (!mainId || !altId) {
    await interaction.reply(
      createTextComponentMessage('Please provide valid Discord IDs or mentions for both main and alt.', { flags: 64 })
    );
    return;
  }

  const result = unlinkAltAccount({ main: mainId, alt: altId });
  if (!result.ok) {
    let reason;
    switch (result.reason) {
      case 'invalid-input':
        reason = 'Missing main or alt ID.';
        break;
      case 'not-found':
        reason = 'Main or alt account was not found in the database.';
        break;
      case 'not-linked':
        reason = 'That alt is not currently linked to the specified main.';
        break;
      default:
        reason = result.reason ? `Unable to remove alt: ${result.reason}.` : 'Unable to remove alt link.';
        break;
    }

    await interaction.reply(createTextComponentMessage(reason, { flags: 64 }));
    return;
  }

  const details = result.details ?? {};
  const mainDiscord = details.main?.discord_id ?? mainId;
  const altDiscord = details.alt?.discord_id ?? altId;

  await interaction.reply(
    createTextComponentMessage(`Removed alt link: <@${altDiscord}> is no longer linked to <@${mainDiscord}>.`, { flags: 64 })
  );
}

async function handleSetIgn(interaction) {
  const userInput = interaction.options.getString('user');
  const ignInput = interaction.options.getString('ign');

  const targetId = extractDiscordId(userInput);
  if (!targetId) {
    await interaction.reply(createTextComponentMessage('Please provide a valid Discord ID or mention.', { flags: 64 }));
    return;
  }

  const result = setIgnForMember({ targetDiscordId: targetId, ign: ignInput });
  if (!result.ok) {
    let message;
    switch (result.reason) {
      case 'invalid-ign':
        message = 'Please provide a non-empty IGN.';
        break;
      case 'conflict':
        if (result.conflictDiscordIds?.length) {
          const mentions = result.conflictDiscordIds.map(id => `<@${id}>`).join(', ');
          message = `IGN already linked to ${mentions}.`;
        } else {
          message = 'IGN already linked to another member.';
        }
        break;
      case 'not-found':
        message = `No existing member record for <@${targetId}>. Add them to the database first.`;
        break;
      case 'invalid-id':
        message = 'Unable to find a member for that Discord ID.';
        break;
      default:
        message = `Failed to set IGN: ${result.reason ?? 'unknown error'}.`;
        break;
    }

    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  if (result.status === 'unchanged') {
    await interaction.reply(
      createTextComponentMessage(`IGN for <@${targetId}> is already set to \`${result.ign}\`.`, { flags: 64 })
    );
    return;
  }

  await interaction.reply(
    createTextComponentMessage(`Set IGN for <@${targetId}> to \`${result.ign}\`.`, { flags: 64 })
  );
}

async function handleUpdateMembers(interaction) {
  await interaction.deferReply({ flags: 64 });

  const payload = await loadMembersPayload(interaction);
  if (!payload) return;

  const summary = syncMembersFromApiEntries(payload);

  const lines = buildSummaryLines(summary);
  await sendSummaryChunks(interaction, lines);
}

async function handleSetActive(interaction) {
  const targetsInput = interaction.options.getString('targets');
  const activeValue = interaction.options.getBoolean('active');

  const { ids, invalid } = parseTargetIdentifiers(targetsInput);

  if (ids.length === 0) {
    await interaction.reply(
      createTextComponentMessage('Provide at least one valid Discord ID or mention to update.', { flags: 64 })
    );
    return;
  }

  const result = setMembersActiveStatus({ targetDiscordIds: ids, active: activeValue });
  if (!result.ok) {
    let message = 'Failed to update active status.';
    if (result.reason === 'invalid-active') {
      message = 'Provide whether members should be active (true or false).';
    } else if (result.reason === 'no-targets') {
      message = 'Provide at least one member to update.';
    }

    await interaction.reply(createTextComponentMessage(message, { flags: 64 }));
    return;
  }

  const lines = [`Set active=${activeValue ? 'true' : 'false'} for ${ids.length} member(s).`];

  if (result.updated.length > 0) {
    lines.push(`updated: ${formatMentions(result.updated)}`);
  }

  if (result.created.length > 0) {
    lines.push(`created: ${formatMentions(result.created)}`);
  }

  if (result.unchanged.length > 0) {
    lines.push(`unchanged: ${formatMentions(result.unchanged)}`);
  }

  if (invalid.length > 0) {
    lines.push(`ignored invalid tokens: ${invalid.join(', ')}`);
  }

  if (result.failures.length > 0) {
    const details = result.failures
      .map(item => {
        let s = "<@" + item.discordId + ">";
        if (item.reason) s += " (" + item.reason + ")";
        return s;
      })
      .join(', ');

    lines.push(`failures: ${details}`);
  }

  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.reply(createTextComponentMessage(first, { flags: 64 }));
  await forEachSequential(rest, async chunk => {
    await interaction.followUp(createTextComponentMessage(chunk, { flags: 64 }));
  });
}

export const data = new SlashCommandBuilder()
  .setName('member')
  .setDescription('Manage member records')
  .addSubcommand(subcommand => subcommand
    .setName('checkinactive')
    .setDescription('List members marked inactive in the database'))
  .addSubcommand(subcommand => subcommand
    .setName('removeplayer')
    .setDescription('Permanently remove players and their member-coop entries')
    .addStringOption(option => option
      .setName('mention')
      .setDescription('One or more Discord mentions or IDs, separated by spaces or commas')
      .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('setalt')
      .setDescription('Link an alt account to a main account')
      .addStringOption(option =>
        option
          .setName('main')
          .setDescription('Main account (mention or ID)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('alt')
          .setDescription('Alt account (mention or ID)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('removealt')
      .setDescription('Remove an alt link from a main account')
      .addStringOption(option =>
        option
          .setName('main')
          .setDescription('Main account (mention or ID)')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('alt')
          .setDescription('Alt account (mention or ID)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setign')
      .setDescription('Link an IGN to a Discord user')
      .addStringOption(option =>
        option
          .setName('user')
          .setDescription('Discord mention or ID to link')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('ign')
          .setDescription('In-game name to assign')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('updatemembers')
      .setDescription('Sync member IGNs from the Maj API dataset')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setactive')
      .setDescription('Set whether members are active')
      .addStringOption(option =>
        option
          .setName('targets')
          .setDescription('Space or comma separated Discord mentions or IDs')
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option
          .setName('active')
          .setDescription('Set to true to mark active, false to mark inactive')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'checkinactive':
      await handleCheckInactive(interaction);
      break;
    case 'removeplayer':
      await handleRemovePlayer(interaction);
      break;
    case 'setalt':
      await handleSetAlt(interaction);
      break;
    case 'removealt':
      await handleRemoveAlt(interaction);
      break;
    case 'setign':
      await handleSetIgn(interaction);
      break;
    case 'updatemembers':
      await handleUpdateMembers(interaction);
      break;
    case 'setactive':
      await handleSetActive(interaction);
      break;
    default:
      await interaction.reply(createTextComponentMessage('Unknown member subcommand.', { flags: 64 }));
      break;
  }
}

export default { data, execute };
