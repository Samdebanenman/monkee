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

function formatStatusLegendLines() {
  return [
    'Status legend:',
    '- ✓ = audit passed',
    '- ✗ = audit failed',
    '- ⚠︎ = coop is not logged',
    '- ⌛︎ = coop still running',
    '- 🏳 = coop completed',
  ];
}

function formatLeaderboardLines(entries, contractId) {
  const encodedContractId = encodeURIComponent(String(contractId ?? '').trim());
  const headers = {
    coop: 'coop',
    duration: 'duration',
    tokens: 'tokens',
    rate: 'rate/h',
    maxCs: 'max cs',
    meanCs: 'mean cs',
    status: 'status',
  };

  const maxCoop = Math.max(headers.coop.length, ...entries.map(entry => String(entry.coop ?? '').length));
  const maxDuration = Math.max(headers.duration.length, ...entries.map(entry => String(entry.durationLabel ?? '').length));
  const maxTokens = Math.max(headers.tokens.length, ...entries.map(entry => String(entry.tokensLabel ?? '').length));
  const maxRate = Math.max(headers.rate.length, ...entries.map(entry => String(entry.deliveryRateLabel ?? '').length));
  const maxMaxCs = Math.max(headers.maxCs.length, ...entries.map(entry => String(entry.maxCsLabel ?? '--').length));
  const maxMeanCs = Math.max(headers.meanCs.length, ...entries.map(entry => String(entry.meanCsLabel ?? '--').length));
  const maxStatus = Math.max(headers.status.length, ...entries.map(entry => String(entry.status ?? '').length));

  const lines = [
    `\`${headers.coop.padEnd(maxCoop)} | ${headers.duration.padEnd(maxDuration)} | ${headers.tokens.padEnd(maxTokens)} | ${headers.rate.padEnd(maxRate)} | ${headers.maxCs.padEnd(maxMaxCs)} | ${headers.meanCs.padEnd(maxMeanCs)} | ${headers.status.padEnd(maxStatus)}\``
  ];

    entries.forEach(entry => {
    const inlineLabel = `${String(entry.coop ?? '')
      .padEnd(maxCoop)} | ${String(entry.durationLabel ?? '')
      .padEnd(maxDuration)} | ${String(entry.tokensLabel ?? '')
      .padEnd(maxTokens)} | ${String(entry.deliveryRateLabel ?? '')
      .padEnd(maxRate)} | ${String(entry.maxCsLabel ?? '')
      .padEnd(maxMaxCs)} | ${String(entry.meanCsLabel ?? '')      
      .padEnd(maxMeanCs)} | ${String(entry.status ?? '')
      .padEnd(maxStatus)}`;

    const coopUrl = `https://eicoop-carpet.netlify.app/${encodedContractId}/${encodeURIComponent(entry.coop)}`;
    lines.push(`\`${inlineLabel}\` [⧉](${coopUrl})`);
  });

  return lines;
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

  const leaderboardLines = formatLeaderboardLines(report.entries, report.contractId);
  const chunks = chunkContent(leaderboardLines);
  const [firstChunk, ...restChunks] = chunks;

  await interaction.editReply(
    createTextComponentMessage(`# BN Leaderboard\n${report.contractName}\n${firstChunk}`)
  );

  for (const chunk of restChunks) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }

  const statusLegendLines = formatStatusLegendLines();
  await interaction.followUp(createTextComponentMessage(statusLegendLines.join('\n')));

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
