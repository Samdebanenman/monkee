import { SlashCommandBuilder } from 'discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { checkCoopForKnownPlayers, findFreeCoopCodes, listCoops } from '../services/coopService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';

const CODE_OPTION_DEFAULT = 'default';
const CODE_OPTION_EXTENDED = 'extended';
const CODE_OPTION_EXTENDED_PLUS = 'extended_plus';
const CONTRACT_OPTION = 'contract';
const SEARCHLIST_OPTION = 'searchlist';

function buildCoopCodes(mode = CODE_OPTION_DEFAULT) {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(97 + index));
  const digits = Array.from({ length: 10 }, (_, index) => String(index));

  const normalizedMode = [CODE_OPTION_EXTENDED, CODE_OPTION_EXTENDED_PLUS].includes(mode)
    ? mode
    : CODE_OPTION_DEFAULT;

  const prefixes = normalizedMode === CODE_OPTION_DEFAULT ? letters : [...letters, ...digits];
  const suffixes = normalizedMode === CODE_OPTION_EXTENDED_PLUS ? ['oo', 'ooo'] : ['oo'];

  return prefixes.flatMap(prefix => suffixes.map(suffix => `${prefix}${suffix}`));
}

export const data = new SlashCommandBuilder()
  .setName('checkifpc')
  .setDescription('Check non-free coops for known players')
  .addStringOption(option =>
    option
      .setName(CONTRACT_OPTION)
      .setDescription('Which contract to check (type to search or choose a preset)')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName(SEARCHLIST_OPTION)
      .setDescription('Which coop codes to check')
      .setRequired(false)
      .addChoices(
        { name: 'default', value: CODE_OPTION_DEFAULT },
        { name: 'extended', value: CODE_OPTION_EXTENDED },
        { name: 'extended+', value: CODE_OPTION_EXTENDED_PLUS },
      )
  );

export async function execute(interaction) {
  const codesOption = interaction.options.getString(SEARCHLIST_OPTION) ?? CODE_OPTION_DEFAULT;
  const contractInput = (interaction.options.getString(CONTRACT_OPTION) ?? '').trim();

  if (!contractInput) {
    await interaction.reply(createTextComponentMessage('Please choose a contract to check.', { flags: 64 }));
    return;
  }

  const coopCodesToCheck = buildCoopCodes(codesOption);
  const summaries = await fetchContractSummaries();
  const nameById = new Map(summaries.map(c => [c.id, c.name || c.id]));

  await interaction.deferReply();

  const displayName = nameById.get(contractInput) || contractInput;
  const selectedContracts = [[displayName, contractInput]];

  if (!selectedContracts.length) {
    await interaction.editReply(createTextComponentMessage('No contracts matched your selection.', { flags: 64 }));
    return;
  }

  const resultsLines = [];
  for (const [name, id] of selectedContracts) {
    const { filteredResults } = await findFreeCoopCodes(id, coopCodesToCheck);
    const freeSet = new Set(filteredResults);
    const nonFree = coopCodesToCheck.filter(code => !freeSet.has(code));
    const existing = listCoops(id);
    const existingSet = new Set(existing.map(coop => String(coop).toLowerCase()));
    const candidates = nonFree.filter(code => !existingSet.has(code.toLowerCase()));
    const skippedCount = nonFree.length - candidates.length;

    resultsLines.push(`**${name}**`);

    if (nonFree.length === 0) {
      resultsLines.push('All checked coops appear to be free.', '');
      continue;
    }

    if (candidates.length === 0) {
      resultsLines.push(`All ${nonFree.length} non-free coops are already in the database.`, '');
      continue;
    }

    const matches = [];
    for (const coop of candidates) {
      const matchResult = await checkCoopForKnownPlayers(id, coop);
      if (!matchResult.ok) continue;
      if (matchResult.matched.length > 0) {
        matches.push({ coop, matched: matchResult.matched });
      }
    }

    if (matches.length === 0) {
      const skippedText = skippedCount ? ` (skipped ${skippedCount} saved)` : '';
      resultsLines.push(`No known players found in ${candidates.length} non-free coops${skippedText}.`, '');
      continue;
    }

    const skippedText = skippedCount ? ` (skipped ${skippedCount} saved)` : '';
    resultsLines.push(
      `Found ${matches.length} coop${matches.length === 1 ? '' : 's'} with known players out of ${candidates.length} checked${skippedText}.`
    );

    for (const match of matches) {
      const uniqueIgns = [...new Set(match.matched.map(entry => entry.ign).filter(Boolean))];
      const preview = uniqueIgns.slice(0, 6).map(ign => `\`${ign}\``).join(', ');
      const remaining = uniqueIgns.length - 6;
      const ignText = uniqueIgns.length
        ? `Known: ${preview}${remaining > 0 ? ` (+${remaining} more)` : ''}`
        : '';
      resultsLines.push(`\`${match.coop}\`${ignText ? ` - ${ignText}` : ''}`);
      resultsLines.push(`https://eicoop-carpet.netlify.app/${id}/${match.coop}`);
    }

    resultsLines.push('');
  }

  const message = resultsLines.length > 0 ? resultsLines.join('\n') : 'No data found.';
  const chunks = chunkContent(message.split('\n'));
  const [first, ...rest] = chunks;

  await interaction.editReply(createTextComponentMessage(first));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }
}

async function buildStaticContractOptions() {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));

  const options = sorted.map(contract => ({
    name: contract.name || contract.id,
    value: contract.id,
    description: contract.name ? contract.id : undefined,
  }));

  return options.slice(0, 25);
}

async function respondWithContracts(interaction, focused) {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));
  const lower = focused.toLowerCase();
  const filtered = sorted
    .filter(contract => {
      const id = contract.id?.toLowerCase() ?? '';
      const name = contract.name?.toLowerCase() ?? '';
      return id.includes(lower) || name.includes(lower);
    })
    .slice(0, 15)
    .map(contract => {
      const label = contract.name || contract.id;
      const description = contract.name ? contract.id : undefined;
      return { name: label, value: contract.id, description };
    });

  await interaction.respond(filtered);
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused() ?? '';

  if (!focusedValue.trim()) {
    const options = await buildStaticContractOptions();
    await interaction.respond(options);
    return;
  }

  // When the user starts typing, switch to contract search so they can enter any id.
  await respondWithContracts(interaction, focusedValue);
}

export default { data, execute, autocomplete };

