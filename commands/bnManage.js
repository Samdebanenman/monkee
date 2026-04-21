import { SlashCommandBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { createTextComponentMessage } from '../services/discord.js';
import { fetchActiveContracts, fetchContractSummaries } from '../services/contractService.js';
import { listPlannerContracts, upsertPlannerContract } from '../services/ggplannerService.js';
import { requireMamaBird } from '../utils/permissions.js';

const SUBCOMMAND_CONTRACT = 'contract';
const CONTRACT_OPTION = 'contract';
const OVERWRITE_OPTION = 'overwrite';
const DURATION_OPTION = 'duration';
const LA_ZONE = 'America/Los_Angeles';

export const data = new SlashCommandBuilder()
  .setName('bn-manage')
  .setDescription('Sync BN contracts from monkee into GGPlanner.')
  .addSubcommand(subcommand =>
    subcommand
      .setName(SUBCOMMAND_CONTRACT)
      .setDescription('Create or overwrite a GGPlanner contract from a monkee contract.')
      .addStringOption(option =>
        option
          .setName(CONTRACT_OPTION)
          .setDescription('Source contract from active kev contracts (6 shown).')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName(OVERWRITE_OPTION)
          .setDescription('Optional target contract from GGPlanner to overwrite (non-deleted only).')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName(DURATION_OPTION)
          .setDescription('Duration in hours (defaults to total time to complete from selected contract).')
          .setRequired(false)
          .setMinValue(1)
      )
  );

async function listActiveMonkeeContracts() {
  const { seasonal = [], leggacy = [] } = await fetchActiveContracts();
  const combined = [...seasonal, ...leggacy];
  const uniqueById = new Map();

  for (const [name, id] of combined) {
    const contractId = String(id || '').trim();
    if (!contractId || uniqueById.has(contractId)) continue;
    uniqueById.set(contractId, {
      id: contractId,
      name: String(name || '').trim() || contractId,
    });
  }

  return Array.from(uniqueById.values());
}

function findMonkeeContract(contractSummaries, contractId) {
  return contractSummaries.find(contract => String(contract.id || '').trim() === contractId) || null;
}

function formatPlannerDayFromRelease(releaseSeconds) {
  const parsed = DateTime.fromSeconds(Number(releaseSeconds) || 0, { zone: LA_ZONE });
  if (!parsed.isValid) return null;
  return parsed.toISODate();
}

function toPlannerContractPayload({ sourceMonkeeContract, durationHours }) {
  const sourceDurationHours = Math.round((Number(sourceMonkeeContract.coopDurationSeconds) || 0) / 3600);
  const finalDurationHours = durationHours == null ? sourceDurationHours : durationHours;

  return {
    contractId: String(sourceMonkeeContract.id || '').trim(),
    name: String(sourceMonkeeContract.name || '').trim() || String(sourceMonkeeContract.id || '').trim(),
    day: formatPlannerDayFromRelease(sourceMonkeeContract.release),
    players: Number(sourceMonkeeContract.maxCoopSize) || 0,
    duration: finalDurationHours > 0 ? finalDurationHours : 0,
  };
}

async function handleContractSubcommand(interaction) {
  const sourceMonkeeId = String(interaction.options.getString(CONTRACT_OPTION, true)).trim();
  const overwritePlannerId = String(interaction.options.getString(OVERWRITE_OPTION) || '').trim();
  const durationHours = interaction.options.getInteger(DURATION_OPTION);

  const activeMonkeeContracts = await listActiveMonkeeContracts();
  const activeMonkeeContractIds = new Set(activeMonkeeContracts.map(contract => contract.id));
  if (!activeMonkeeContractIds.has(sourceMonkeeId)) {
    await interaction.editReply(
      createTextComponentMessage(`Source monkee contract \`${sourceMonkeeId}\` is not in the active contract list.`, { flags: 64 })
    );
    return;
  }

  const contractSummaries = await fetchContractSummaries();
  const sourceMonkeeContract = findMonkeeContract(contractSummaries, sourceMonkeeId);
  if (!sourceMonkeeContract) {
    await interaction.editReply(
      createTextComponentMessage(`Source monkee contract \`${sourceMonkeeId}\` was not found in the contract cache.`, { flags: 64 })
    );
    return;
  }

  const plannerContracts = overwritePlannerId ? await listPlannerContracts({ includeInactive: false }) : [];
  const overwritePlannerContract = overwritePlannerId
    ? plannerContracts.find(contract => String(contract.id) === overwritePlannerId)
    : null;

  if (overwritePlannerId && !overwritePlannerContract) {
    await interaction.editReply(
      createTextComponentMessage(`Overwrite GGPlanner contract \`${overwritePlannerId}\` was not found among non-deleted contracts.`, { flags: 64 })
    );
    return;
  }

  const plannerPayload = toPlannerContractPayload({
    sourceMonkeeContract,
    durationHours,
  });
  if (!plannerPayload.day) {
    await interaction.editReply(
      createTextComponentMessage(`Source monkee contract \`${sourceMonkeeId}\` has no valid release date.`, { flags: 64 })
    );
    return;
  }

  try {
    const savedPlannerContract = await upsertPlannerContract({
      overwriteId: overwritePlannerContract ? overwritePlannerContract.id : null,
      contract: plannerPayload,
    });

    const releaseLabel = DateTime.fromSeconds(Number(sourceMonkeeContract.release) || 0, { zone: LA_ZONE }).toFormat('yyyy-LL-dd HH:mm ZZZZ');
    const durationLabel = plannerPayload.duration > 0 ? `${plannerPayload.duration}h` : 'unknown';
    const actionLabel = overwritePlannerContract ? 'overwritten' : 'created';
    const overwriteLabel = overwritePlannerContract
      ? ` over GGPlanner contract \`${overwritePlannerContract.id}\``
      : '';

    await interaction.editReply(
      createTextComponentMessage(
        `GGPlanner contract \`${savedPlannerContract.id}\` ${actionLabel}${overwriteLabel} from monkee contract \`${sourceMonkeeId}\` (${plannerPayload.name}). Contract id: \`${plannerPayload.contractId}\`. Duration: **${durationLabel}**. Drop date (LA): **${releaseLabel}**.`,
        { flags: 64 }
      )
    );
  } catch (error) {
    await interaction.editReply(
      createTextComponentMessage(
        `Failed to sync monkee contract \`${sourceMonkeeId}\` to GGPlanner: ${error.message}`,
        { flags: 64 }
      )
    );
  }
}

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  await interaction.deferReply({ flags: 64 });

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === SUBCOMMAND_CONTRACT) {
    await handleContractSubcommand(interaction);
    return;
  }

  await interaction.editReply(
    createTextComponentMessage(`Unknown subcommand: ${subcommand}`, { flags: 64 })
  );
}

async function buildStaticContractOptions() {
  const { seasonal = [], leggacy = [] } = await fetchActiveContracts();
  const combined = [...seasonal, ...leggacy];

  const options = [
    ...combined.map(([name, id]) => ({ name: `${name} (${id})`, value: id, description: id })),
  ];

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
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name !== CONTRACT_OPTION && focusedOption.name !== OVERWRITE_OPTION) {
    await interaction.respond([]);
    return;
  }

  const focused = String(focusedOption.value || '').toLowerCase();
  let options = [];

  if (focusedOption.name === CONTRACT_OPTION) {
    const focusedValue = interaction.options.getFocused() ?? '';

    if (!focusedValue.trim()) {
      const options = await buildStaticContractOptions();
      await interaction.respond(options);
      return;
    }
    // When the user starts typing, switch to contract search so they can enter any id.
    await respondWithContracts(interaction, focusedValue);
    return;

  } else {
    const contracts = await listPlannerContracts({ includeInactive: false });
    options = contracts
      .filter(contract => contract.id)
      .filter(contract => {
        if (!focused) return true;
        return String(contract.id).toLowerCase().includes(focused)
          || String(contract.name).toLowerCase().includes(focused)
          || String(contract.contractId || '').toLowerCase().includes(focused);
      })
      .slice(0, 25)
      .map(contract => {
        const labelBase = `${contract.name || 'Unnamed'} (${contract.id})`;
        const suffix = contract.contractId ? ` -> ${contract.contractId}` : '';
        return {
          name: `${labelBase}${suffix}`,
          value: contract.id,
        };
      });
  }

  await interaction.respond(options);
}

export default { data, execute, autocomplete };
