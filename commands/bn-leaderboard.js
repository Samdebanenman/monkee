import { SlashCommandBuilder } from 'discord.js';
import {
  buildBnLeaderboardReport,
  listBnLeaderboardContractOptions,
  searchBnLeaderboardContractOptions,
} from '../services/bnLeaderboardService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const CONTRACT_OPTION = 'contract';
const MAX_INLINE_ROW_WIDTH = 35;
const ROW_SEPARATOR = ' | ';
const SEPARATOR_WIDTH = ROW_SEPARATOR.length;
const MAX_CONTENT_WIDTH = MAX_INLINE_ROW_WIDTH - (SEPARATOR_WIDTH * 3);

const TIME_COLUMNS = [
  { key: 'coop', label: 'coop', min: 4, max: 7, mode: 'coop' },
  { key: 'duration', label: 'duration', min: 6, max: 8, mode: 'compact' },
  { key: 'rate', label: 'rate', min: 4, max: 6, mode: 'compact' },
  { key: 'status', label: 'status', min: 2, max: 6, mode: 'status' },
];

const CS_COLUMNS = [
  { key: 'coop', label: 'coop', min: 4, max: 7, mode: 'coop' },
  { key: 'max', label: 'max', min: 3, max: 6, mode: 'compact' },
  { key: 'mean', label: 'mean', min: 4, max: 6, mode: 'compact' },
  { key: 'status', label: 'status', min: 2, max: 6, mode: 'status' },
];

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
    '-# `✓` = audit passed',
    '-# `✗` = audit failed',
    '-# `⚠︎` = coop is not logged',
    '-# `⌛︎` = coop still running',
    '-# `🏳` = coop completed',
  ];
}

function compactValue(value, width) {
  const text = String(value ?? '');
  if (text.length <= width) {
    return text;
  }

  if (width <= 3) {
    return text.slice(0, width);
  }

  return `${text.slice(0, width - 3)}...`;
}

function formatCoopValue(value, width) {
  const text = String(value ?? '');
  if (text.length <= width) {
    return text;
  }

  if (width >= 7) {
    return `${text.slice(0, 4)}...`;
  }

  return compactValue(text, width);
}

function formatStatusValue(value, width) {
  const compact = String(value ?? '').replaceAll(/\s+/g, '');
  return compactValue(compact, width);
}

function normalizeCell(value, column) {
  if (column.mode === 'coop') {
    return formatCoopValue(value, column.width);
  }

  if (column.mode === 'status') {
    return formatStatusValue(value, column.width);
  }

  return compactValue(value, column.width);
}

function buildInlineRow(values, columns) {
  const row = values
    .map((value, index) => {
      const column = columns[index];
      const compact = normalizeCell(value, column);
      return compact.padEnd(column.width);
    })
    .join(ROW_SEPARATOR);

  return row.length > MAX_INLINE_ROW_WIDTH
    ? row.slice(0, MAX_INLINE_ROW_WIDTH)
    : row;
}

function computeColumnWidths(columns, rows) {
  const widths = columns.map((column, index) => {
    const labelLength = String(column.label ?? '').length;
    const valuesLength = rows.reduce((max, row) => {
      const value = String(row[index] ?? '');
      return Math.max(max, value.length);
    }, 0);
    const natural = Math.max(labelLength, valuesLength, column.min ?? 1);
    return Math.min(column.max ?? natural, natural);
  });

  let total = widths.reduce((sum, width) => sum + width, 0);
  while (total > MAX_CONTENT_WIDTH) {
    let reduced = false;
    let candidateIndex = -1;
    let candidateWidth = -1;

    for (let index = 0; index < widths.length; index += 1) {
      const minWidth = columns[index].min ?? 1;
      if (widths[index] <= minWidth) {
        continue;
      }
      if (widths[index] > candidateWidth) {
        candidateIndex = index;
        candidateWidth = widths[index];
      }
    }

    if (candidateIndex === -1) {
      break;
    }

    widths[candidateIndex] -= 1;
    total -= 1;
    reduced = true;

    if (!reduced) {
      break;
    }
  }

  return columns.map((column, index) => ({ ...column, width: widths[index] }));
}

function buildCoopUrl(contractId, coop) {
  const encodedContractId = encodeURIComponent(String(contractId ?? '').trim());
  return `https://eicoop-carpet.netlify.app/${encodedContractId}/${encodeURIComponent(coop)}`;
}

function formatTimeLeaderboardLines(entries, contractId) {
  const rows = entries.map(entry => [
    String(entry.coop ?? ''),
    String(entry.durationLabel ?? '--'),
    String(entry.deliveryRateLabel ?? '0'),
    String(entry.status ?? ''),
  ]);
  const columns = computeColumnWidths(TIME_COLUMNS, rows);

  const lines = ['Fastest Coops', `⧉ \`${buildInlineRow(columns.map(column => column.label), columns)}\``];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const row = buildInlineRow(rows[index], columns);

    const coopUrl = buildCoopUrl(contractId, entry.coop);
    lines.push(`[⧉](${coopUrl}) \`${row}\``);
  }

  return lines;
}

function formatCsLeaderboardLines(entries, contractId) {
  const sortedEntries = [...entries].sort((left, right) => {
    const leftMax = Number.isFinite(left.maxCs) ? left.maxCs : Number.NEGATIVE_INFINITY;
    const rightMax = Number.isFinite(right.maxCs) ? right.maxCs : Number.NEGATIVE_INFINITY;
    if (leftMax !== rightMax) return rightMax - leftMax;

    const leftMean = Number.isFinite(left.meanCs) ? left.meanCs : Number.NEGATIVE_INFINITY;
    const rightMean = Number.isFinite(right.meanCs) ? right.meanCs : Number.NEGATIVE_INFINITY;
    if (leftMean !== rightMean) return rightMean - leftMean;

    return String(left.coop ?? '').localeCompare(String(right.coop ?? ''));
  });

  const rows = sortedEntries.map(entry => [
    String(entry.coop ?? ''),
    String(entry.maxCsLabel ?? '--'),
    String(entry.meanCsLabel ?? '--'),
    String(entry.status ?? ''),
  ]);
  const columns = computeColumnWidths(CS_COLUMNS, rows);

  const lines = ['', 'CS Leaderboard', `⧉ \`${buildInlineRow(columns.map(column => column.label), columns)}\``];

  for (let index = 0; index < sortedEntries.length; index += 1) {
    const entry = sortedEntries[index];
    const row = buildInlineRow(rows[index], columns);

    const coopUrl = buildCoopUrl(contractId, entry.coop);
    lines.push(`[⧉](${coopUrl}) \`${row}\``);
  }

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

  const auditFailureLines = formatAuditFailureLines(report.entries);
  const statusLegendLines = formatStatusLegendLines();

  const leaderboardLines = [
    ...formatTimeLeaderboardLines(report.entries, report.contractId),
    ...formatCsLeaderboardLines(report.entries, report.contractId),
    '',
    ...statusLegendLines,
    ...(auditFailureLines.length > 0 ? ['', ...auditFailureLines] : []),
  ];
  const chunks = chunkContent(leaderboardLines);
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
