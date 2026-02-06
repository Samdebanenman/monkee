import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { checkCoopForKnownPlayers, findFreeCoopCodes, listCoops } from '../services/coopService.js';
import {
  createTextComponentMessage,
} from '../services/discord.js';

const CODE_OPTION_DEFAULT = 'default';
const CODE_OPTION_EXTENDED = 'extended';
const CODE_OPTION_EXTENDED_PLUS = 'extended_plus';
const CONTRACT_OPTION = 'contract';
const SEARCHLIST_OPTION = 'searchlist';
const DEFAULT_CONCURRENCY = 12;
const PROGRESS_BAR_WIDTH = 20;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

function buildProgressBar(completed, total, width = PROGRESS_BAR_WIDTH) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const ratio = Math.min(1, Math.max(0, (Number(completed) || 0) / safeTotal));
  const filled = Math.round(ratio * width);
  return `${'#'.repeat(filled)}${'-'.repeat(Math.max(0, width - filled))}`;
}

function formatProgressText(completed, total) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const bar = buildProgressBar(completed, total);
  return `Checking coops: [${bar}] ${percent}% (${completed}/${total})`;
}

async function asyncPool(limit, items, iterator) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const task = Promise.resolve().then(() => iterator(item));
    results.push(task);
    executing.add(task);

    const cleanup = () => executing.delete(task);
    task.then(cleanup).catch(cleanup);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

function buildCoopCodes(mode = CODE_OPTION_DEFAULT) {
  const letters = Array.from({ length: 26 }, (_, index) => String.fromCodePoint(97 + index));
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

  await interaction.reply(createTextComponentMessage(
    'Starting check.'
  ));

  const coopCodesToCheck = buildCoopCodes(codesOption);
  const summaries = await fetchContractSummaries();
  const sortedContracts = [...summaries].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));
  const nameById = new Map(sortedContracts.map(c => [c.id, c.name || c.id]));

  const displayName = nameById.get(contractInput) || contractInput;
  const selectedContracts = [[displayName, contractInput]];

  if (!selectedContracts.length) {
    await interaction.editReply(createTextComponentMessage('No contracts matched your selection.'));
    return;
  }

  const totalSteps = selectedContracts.length * coopCodesToCheck.length;
  const progress = totalSteps > 0
    ? {
        total: totalSteps,
        completed: 0,
        lastUpdatedAt: 0,
        intervalMs: PROGRESS_UPDATE_INTERVAL_MS,
        pendingUpdate: Promise.resolve(),
        update(force = false) {
          const now = Date.now();
          if (!force && now - this.lastUpdatedAt < this.intervalMs) return this.pendingUpdate;
          this.lastUpdatedAt = now;
          const content = formatProgressText(this.completed, this.total);
          this.pendingUpdate = this.pendingUpdate
            .then(() => interaction.editReply(createTextComponentMessage(content)))
            .catch(() => {});
          return this.pendingUpdate;
        },
      }
    : null;

  let completedCount = 0;
  const updateProgress = async (increment = 0) => {
    if (!progress) return;
    completedCount = Math.min(progress.total, completedCount + increment);
    progress.completed = completedCount;
    await progress.update();
  };

  if (progress) {
    await progress.update(true);
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
    await updateProgress(filteredResults.length + skippedCount);

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

    await asyncPool(DEFAULT_CONCURRENCY, candidates, async coop => {
      const matchResult = await checkCoopForKnownPlayers(id, coop);
      await updateProgress(1);
      if (!matchResult.ok) return;
      if (matchResult.matched.length > 0) {
        matches.push({ coop, matched: matchResult.matched });
      }
    });

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
  let finalMessage = message;

  if (finalMessage.length > MAX_DISCORD_MESSAGE_LENGTH) {
    const note = '\n\n(Output truncated. Narrow your search for full details.)';
    const limit = Math.max(0, MAX_DISCORD_MESSAGE_LENGTH - note.length - 3);
    finalMessage = `${finalMessage.slice(0, limit)}...${note}`;
  }

  await interaction.editReply(createTextComponentMessage(finalMessage));
}

async function buildStaticContractOptions() {
  const contracts = await fetchContractSummaries();
  const sorted = [...contracts].sort((a, b) => (b.release ?? 0) - (a.release ?? 0));

  const options = sorted.map(contract => ({
    name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
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
      const label = contract.name ? `${contract.name} (${contract.id})` : contract.id;
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
