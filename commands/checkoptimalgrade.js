import { SlashCommandBuilder } from 'discord.js';
import { fetchActiveContracts, fetchContractSummaries } from '../services/contractService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';
import { checkOptimalGrade } from '../services/optimalGradeService.js';
import { findContractMatch } from '../sim-core/src/predictmaxcs/contracts.js';

const CONTRACT_OPTION = 'contract';
const OUTPUT_OPTION = 'output';
const ALL_CONTRACTS = '__all_contracts__';
const ACTIVE_CONTRACTS = '__active_contracts__';
const OUTPUT_SHORT = 'short';
const OUTPUT_LONG = 'long';
const GRADE_DISPLAY_ORDER = ['AAA', 'AA', 'A', 'B', 'C'];

export const data = new SlashCommandBuilder()
  .setName('checkoptimalgrade')
  .setDescription('Check whether AAA is the best-scoring grade for one or more contracts.')
  .addStringOption(option => option
    .setName(CONTRACT_OPTION)
    .setDescription('Choose all, active, an active preset, or type to search every contract')
    .setRequired(true)
    .setAutocomplete(true))
  .addStringOption(option => option
    .setName(OUTPUT_OPTION)
    .setDescription('Short verdict (default) or predicted scores for every grade')
    .setRequired(false)
    .addChoices(
      { name: 'short', value: OUTPUT_SHORT },
      { name: 'long', value: OUTPUT_LONG },
    ));

function flattenActiveContracts(active) {
  const seen = new Set();
  return [...(active?.seasonal ?? []), ...(active?.leggacy ?? [])]
    .filter(([, id]) => {
      const normalized = String(id || '').trim();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map(([name, id]) => ({ name: String(name || id), id: String(id) }));
}

function selectContracts(contractInput, contracts, activeContracts) {
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));
  if (contractInput === ALL_CONTRACTS) return sorted;
  if (contractInput === ACTIVE_CONTRACTS) {
    const activeIds = new Set(activeContracts.map(contract => contract.id));
    return sorted.filter(contract => activeIds.has(String(contract.id)));
  }
  const match = findContractMatch(sorted, contractInput);
  return match ? [match] : [];
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function formatResult(result, output) {
  const label = `\`${result.contractId}\``;
  const verdict = result.noteworthyGrades.length > 0
    ? `${label} is worth looking into, specifically for grade(s): ${result.noteworthyGrades.join(', ')}`
    : `AAA is best for ${label}`;

  if (output !== OUTPUT_LONG) return [verdict];

  const byGrade = new Map(result.grades.map(entry => [entry.grade, entry]));
  const detailLines = GRADE_DISPLAY_ORDER.map(grade => {
    const entry = byGrade.get(grade);
    if (!entry) return `- ${grade}: unavailable`;
    return `- ${grade}: **${formatNumber(entry.predictedScore)} CS** (${entry.bestVariant}; no SIAB ${formatNumber(entry.noSiab)}, SIAB ${formatNumber(entry.siab)})`;
  });
  return [verdict, ...detailLines];
}

async function sendLines(interaction, lines) {
  const chunks = chunkContent(lines, { maxLength: 3800 });
  const [first, ...rest] = chunks;
  await interaction.editReply(createTextComponentMessage(first || 'No results.'));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }
}

export async function execute(interaction) {
  const contractInput = String(interaction.options.getString(CONTRACT_OPTION) || '').trim();
  const output = interaction.options.getString(OUTPUT_OPTION) || OUTPUT_SHORT;
  if (!contractInput) {
    await interaction.reply(createTextComponentMessage('Please choose a contract selection.', { flags: 64 }));
    return;
  }

  await interaction.deferReply();
  const [contracts, active] = await Promise.all([
    fetchContractSummaries(),
    fetchActiveContracts(),
  ]);
  const activeList = flattenActiveContracts(active);
  const selected = selectContracts(contractInput, contracts, activeList);
  if (selected.length === 0) {
    await interaction.editReply(createTextComponentMessage('No contracts matched that selection.'));
    return;
  }

  const results = [];
  const failures = [];
  for (let index = 0; index < selected.length; index += 1) {
    const contract = selected[index];
    await interaction.editReply(createTextComponentMessage(
      `Checking optimal grades: ${index + 1}/${selected.length} - ${contract.name || contract.id}`,
    ));
    try {
      const result = await checkOptimalGrade(contract);
      if (result.ok) results.push(result);
      else failures.push(`\`${contract.id}\`: ${result.reason}`);
    } catch (error) {
      failures.push(`\`${contract.id}\`: ${error?.message ?? String(error)}`);
    }
  }

  const lines = [];
  for (const result of results) {
    if (lines.length > 0) lines.push('');
    lines.push(...formatResult(result, output));
  }
  if (failures.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Could not check:', ...failures.map(failure => `- ${failure}`));
  }
  await sendLines(interaction, lines);
}

async function buildPresetOptions() {
  const active = flattenActiveContracts(await fetchActiveContracts()).slice(0, 6);
  return [
    { name: 'All contracts', value: ALL_CONTRACTS },
    { name: 'Currently active contracts', value: ACTIVE_CONTRACTS },
    ...active.map(contract => ({
      name: `${contract.name} (${contract.id})`.slice(0, 100),
      value: contract.id,
    })),
  ];
}

async function searchContractOptions(focused) {
  const contracts = await fetchContractSummaries();
  const query = focused.toLowerCase();
  return [...contracts]
    .sort((a, b) => (b.release ?? 0) - (a.release ?? 0))
    .filter(contract => (
      String(contract.id || '').toLowerCase().includes(query)
      || String(contract.name || '').toLowerCase().includes(query)
    ))
    .slice(0, 25)
    .map(contract => ({
      name: `${contract.name || contract.id} (${contract.id})`.slice(0, 100),
      value: contract.id,
    }));
}

export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== CONTRACT_OPTION) {
    await interaction.respond([]);
    return;
  }

  const focused = String(focusedOption.value || '').trim();
  const options = focused ? await searchContractOptions(focused) : await buildPresetOptions();
  await interaction.respond(options);
}

export default { data, execute, autocomplete };
