import { SlashCommandBuilder } from 'discord.js';
import { createTextComponentMessage } from '../services/discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { findContractMatch } from '../sim-core/src/predictmaxcs/contracts.js';
import { getAssumptions } from '../sim-core/src/predictmaxcs/model.js';
import { getStoredColeggtibles } from '../utils/database/coleggtiblesRepository.js';
import { startPredictMaxCsOrchestration } from '../services/simOrchestrator.js';

const DEFAULT_TE = 100;
const TE_MIN = 0;
const TE_MAX = 490;

function parseTeInput(teInput, players) {
  const playerCount = Number.isFinite(players) && players > 0 ? Math.floor(players) : 0;
  const makeDefault = () => Array.from({ length: playerCount }, () => DEFAULT_TE);

  if (teInput == null || teInput === '') {
    return { values: makeDefault(), error: null };
  }

  const parts = String(teInput)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { values: makeDefault(), error: null };
  }

  const numbers = parts.map(part => Number(part));
  if (numbers.some(value => !Number.isFinite(value))) {
    return { values: null, error: 'TE must be a number or comma-separated list of numbers.' };
  }

  if (numbers.length === 1) {
    const [value] = numbers;
    if (value < TE_MIN || value > TE_MAX) {
      return { values: null, error: `TE must be between ${TE_MIN} and ${TE_MAX}.` };
    }
    return { values: Array.from({ length: playerCount }, () => value), error: null };
  }

  if (playerCount > 0 && numbers.length !== playerCount) {
    return { values: null, error: `Provide exactly ${playerCount} TE values or a single shared value.` };
  }

  const invalid = numbers.find(value => value < TE_MIN || value > TE_MAX);
  if (Number.isFinite(invalid)) {
    return { values: null, error: `TE must be between ${TE_MIN} and ${TE_MAX}.` };
  }

  return { values: numbers, error: null };
}

export const data = new SlashCommandBuilder()
  .setName('predictmaxcs')
  .setDescription('Predict max CS with best-gear assumptions and token pacing.')
  .addStringOption(option =>
    option
      .setName('contract')
      .setDescription('Contract id or name (autofills missing values)')
      .setAutocomplete(true)
      .setRequired(true)
  )
  .addNumberOption(option =>
    option
      .setName('token_speed')
      .setDescription('Token gift speed per player (minutes)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('te')
      .setDescription('TE per player: comma-separated list matching player count, or a single value (0-490). Default: 100')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('gg')
      .setDescription('Double tokens per gift (GG)')
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('siab')
      .setDescription('Force SIAB on/off (default: auto)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const contractInput = interaction.options.getString('contract');
  const tokenSpeedInput = interaction.options.getNumber('token_speed');
  const teInput = interaction.options.getString('te');
  const gg = interaction.options.getBoolean('gg') ?? false;
  const siabOverride = interaction.options.getBoolean('siab');

  let contractMatch = null;
  const contracts = await fetchContractSummaries();
  contractMatch = findContractMatch(contracts, contractInput);
  if (!contractMatch) {
    return interaction.reply(createTextComponentMessage('Unknown contract. Use a valid contract id or name.', { flags: 64 }));
  }

  const players = Number.isFinite(contractMatch?.maxCoopSize) ? contractMatch.maxCoopSize : null;
  const durationSeconds = Number.isFinite(contractMatch?.coopDurationSeconds) ? contractMatch.coopDurationSeconds : null;
  const targetEggs = Number.isFinite(contractMatch?.eggGoal) ? contractMatch.eggGoal : null;
  const tokenTimerMinutes = Number.isFinite(contractMatch?.minutesPerToken) ? contractMatch.minutesPerToken : null;

  const giftMinutes = tokenSpeedInput;

  const missingFields = [];
  if (!Number.isFinite(players) || players <= 0) missingFields.push('players');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) missingFields.push('duration');
  if (!Number.isFinite(targetEggs) || targetEggs <= 0) missingFields.push('target');
  if (!Number.isFinite(tokenTimerMinutes) || tokenTimerMinutes <= 0) missingFields.push('token_timer');

  if (missingFields.length > 0) {
    return interaction.reply(createTextComponentMessage(
      `Missing or invalid contract data: ${missingFields.join(', ')}. Choose a contract with those fields.`,
      { flags: 64 },
    ));
  }

  if (!Number.isFinite(giftMinutes) || giftMinutes <= 0) {
    return interaction.reply(createTextComponentMessage('Invalid token speed input.', { flags: 64 }));
  }

  const { values: teValues, error: teError } = parseTeInput(teInput, players);
  if (teError) {
    return interaction.reply(createTextComponentMessage(teError, { flags: 64 }));
  }

  const assumptions = getAssumptions(teValues);
  const contractLabel = contractMatch?.name || contractMatch?.id || contractInput;
  const coleggRows = getStoredColeggtibles();

  await interaction.deferReply();
  await interaction.editReply(createTextComponentMessage('Running PredictMaxCS simulations...', { flags: 64 }));

  await startPredictMaxCsOrchestration({
    interaction,
    contractLabel,
    players,
    durationSeconds,
    targetEggs,
    tokenTimerMinutes,
    giftMinutes,
    gg,
    assumptions,
    coleggtiblesRows: coleggRows,
    siabOverride,
    modifierType: contractMatch?.modifierType ?? null,
    modifierValue: contractMatch?.modifierValue ?? null,
  });
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused()?.toLowerCase?.() ?? '';
  const contracts = await fetchContractSummaries();
  const filtered = contracts
    .filter(contract =>
      String(contract.id || '').toLowerCase().includes(focused)
      || String(contract.name || '').toLowerCase().includes(focused)
    )
    .slice(0, 25)
    .map(contract => ({
      name: contract.name ? `${contract.name} (${contract.id})` : contract.id,
      value: contract.id,
    }));

  await interaction.respond(filtered);
}

