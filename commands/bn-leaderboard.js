import { SlashCommandBuilder } from 'discord.js';
import {
  buildBnLeaderboardReport,
  listBnLeaderboardContractOptions,
  searchBnLeaderboardContractOptions,
} from '../services/bnLeaderboardService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const CONTRACT_OPTION = 'contract';

function formatUncheckedLines(unchecked) {
  if (!unchecked.length) {
    return [];
  }

  const lines = ['', 'Unchecked coops (API issues):'];
  for (const item of unchecked) {
    const reason = item.reason ? ` - ${String(item.reason).slice(0, 120)}` : '';
    lines.push(`- ${item.coop}${reason}`);
  }
  return lines;
}

function formatAuditFailureLines(entries) {
  const failed = entries.filter(entry => Array.isArray(entry.auditFailures) && entry.auditFailures.length > 0);
  if (!failed.length) {
    return [];
  }

  const lines = ['Audit failures by coop:'];
  for (const entry of failed) {
    const contributorReasons = entry.auditFailures
      .map(item => `${item.contributor}: ${item.reasons.join('; ')}`)
      .join(' | ');
    lines.push(`- ${entry.coop} - ${contributorReasons}`);
  }

  return lines;
}

function toTableRows(entries) {
  const headers = {
    number: 'number',
    coop: 'coop',
    duration: 'duration',
    tokens: 'tokens',
    rate: 'delivery rate',
    status: 'status',
  };

  const maxNumber = Math.max(headers.number.length, String(entries.length).length);
  const maxCoop = Math.max(headers.coop.length, ...entries.map(entry => entry.coop.length));
  const maxDuration = Math.max(headers.duration.length, ...entries.map(entry => entry.durationLabel.length));
  const maxTokens = Math.max(headers.tokens.length, ...entries.map(entry => String(entry.tokensLabel ?? '').length));
  const maxRate = Math.max(headers.rate.length, ...entries.map(entry => String(entry.deliveryRateLabel ?? '').length));
  const maxStatus = Math.max(headers.status.length, ...entries.map(entry => entry.status.length));

  const rows = [
    `${headers.number.padEnd(maxNumber)} | ${headers.coop.padEnd(maxCoop)} | ${headers.duration.padEnd(maxDuration)} | ${headers.tokens.padEnd(maxTokens)} | ${headers.rate.padEnd(maxRate)} | ${headers.status.padEnd(maxStatus)}`
  ];

  entries.forEach((entry, index) => {
    const number = String(index + 1).padEnd(maxNumber);
    const coop = entry.coop.padEnd(maxCoop);
    const duration = entry.durationLabel.padEnd(maxDuration);
    const tokens = String(entry.tokensLabel ?? '').padEnd(maxTokens);
    const rate = String(entry.deliveryRateLabel ?? '').padEnd(maxRate);
    const status = entry.status.padEnd(maxStatus);
    rows.push(`${number} | ${coop} | ${duration} | ${tokens} | ${rate} | ${status}`);
  });

  return rows;
}

export const data = new SlashCommandBuilder()
  .setName('bn-leaderboard')
  .setDescription('Rank BN-related non-free coops by predicted completion duration')
  .addStringOption(option =>
    option
      .setName(CONTRACT_OPTION)
      .setDescription('Contract to evaluate')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  const contractId = String(interaction.options.getString(CONTRACT_OPTION) ?? '').trim();

  if (!contractId) {
    await interaction.reply(createTextComponentMessage('Please choose a contract to check.', { flags: 64 }));
    return;
  }

  await interaction.deferReply();

  const report = await buildBnLeaderboardReport({ contractId });

  if (!report.ok && report.reason === 'unknown-contract') {
    await interaction.editReply(
      createTextComponentMessage('Unknown contract id. Please choose a contract from the list.', { flags: 64 })
    );
    return;
  }

  if (!report.ok) {
    await interaction.editReply(
      createTextComponentMessage('Could not build leaderboard for this contract.', { flags: 64 })
    );
    return;
  }

  if (report.entries.length === 0) {
    const lines = ['# BN Leaderboard', report.contractName, 'No leaderboard entries found.'];
    await interaction.editReply(createTextComponentMessage(lines.join('\n')));
    const uncheckedLines = formatUncheckedLines(report.unchecked);
    if (uncheckedLines.length > 0) {
      await interaction.followUp(createTextComponentMessage(uncheckedLines.join('\n')));
    }
    return;
  }

  const tableRows = toTableRows(report.entries);
  const chunks = chunkContent(tableRows, { wrap: { prefix: '```\n', suffix: '\n```' } });
  const [firstChunk, ...restChunks] = chunks;

  await interaction.editReply(
    createTextComponentMessage(`# BN Leaderboard\n${report.contractName}\n${firstChunk}`)
  );

  for (const chunk of restChunks) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }

  const uncheckedLines = formatUncheckedLines(report.unchecked);
  if (uncheckedLines.length > 0) {
    await interaction.followUp(createTextComponentMessage(uncheckedLines.join('\n')));
  }

  const auditFailureLines = formatAuditFailureLines(report.entries);
  if (auditFailureLines.length > 0) {
    const auditChunks = chunkContent(auditFailureLines);
    for (const chunk of auditChunks) {
      await interaction.followUp(createTextComponentMessage(chunk));
    }
  }
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused() ?? '';

  if (!String(focusedValue).trim()) {
    const options = await listBnLeaderboardContractOptions();
    await interaction.respond(options);
    return;
  }

  const options = await searchBnLeaderboardContractOptions(String(focusedValue));
  await interaction.respond(options);
}

export default { data, execute, autocomplete };
