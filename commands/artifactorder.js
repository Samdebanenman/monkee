import { SlashCommandBuilder } from 'discord.js';
import { fetchContractSummaries } from '../services/contractService.js';
import { listCoops } from '../services/coopService.js';
import { chunkContent, createTextComponentMessage } from '../services/discord.js';
import { requireMamaBird } from '../utils/permissions.js';
import { fetchCoopContributors } from '../utils/coopchecker.js';
import { getProtoEnum } from '../utils/auxbrain.js';
import { ArtifactEmoji } from '../Enums.js';
import { getMembersByIgns } from '../utils/database/index.js';

const CONTRACT_OPTION = 'contract';
const COOP_OPTION = 'coop';

const QUANTUM_HOLDER_ARTIFACTS = new Set([
  'chalice',
  'medallion',
  'ankh',
  'brooch',
  'necklace',
  'cube',
  'totem',
  'monocle',
]);

const ORDER_SLOTS = [
  { key: 'deflector', names: new Set(['deflector', ...QUANTUM_HOLDER_ARTIFACTS]) },
  { key: 'siab', names: new Set(['siab']) },
  { key: 'metronome', names: new Set(['metronome']) },
  { key: 'compass', names: new Set(['compass']) },
  { key: 'gusset', names: new Set(['gusset']) },
];

const ARTIFACT_EMOJI_KEYS = {
  deflector: 'DEFLECTOR_4',
  siab: 'SIAB_4',
  metronome: 'METRONOME_4',
  compass: 'COMPASS_4',
  gusset: 'GUSSET_4',
  chalice: 'CHALICE_4',
  medallion: 'MEDALLION_4',
  ankh: 'ANKH_4',
  brooch: 'BROOCH_4',
  necklace: 'NECKLACE_4',
  cube: 'CUBE_4',
  totem: 'TOTEM_4',
  monocle: 'MONOCLE_4',
};

function toShortArtifactName(raw) {
  if (!raw) return null;
  const name = String(raw).toUpperCase();
  if (name === 'SHIP_IN_A_BOTTLE') return 'siab';
  const parts = name.split('_').filter(Boolean);
  if (parts.length === 0) return name.toLowerCase();
  return parts[parts.length - 1].toLowerCase();
}

function buildArtifactSlotIndex() {
  const slotIndex = new Map();
  for (let index = 0; index < ORDER_SLOTS.length; index += 1) {
    for (const name of ORDER_SLOTS[index].names) {
      slotIndex.set(name, index);
    }
  }
  return slotIndex;
}

const ARTIFACT_SLOT_INDEX = buildArtifactSlotIndex();

function normalizeArtifactName(rawName, artifactEnum) {
  if (rawName == null) return null;
  if (typeof rawName === 'number') {
    return artifactEnum?.valuesById?.[rawName] ?? String(rawName);
  }
  return String(rawName).trim();
}

function extractContributorArtifacts(contributor, artifactEnum) {
  const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? null;
  const equipped = farmInfo?.equippedArtifacts
    ?? farmInfo?.equipped_artifacts
    ?? farmInfo?.equipedArtifacts
    ?? farmInfo?.equiped_artifacts
    ?? [];

  if (!Array.isArray(equipped)) return [];

  return equipped
    .map(entry => normalizeArtifactName(entry?.spec?.name, artifactEnum))
    .map(toShortArtifactName)
    .filter(Boolean);
}

function buildArtifactDisplay(name) {
  const key = ARTIFACT_EMOJI_KEYS[name];
  const emoji = key ? ArtifactEmoji[key] ?? '' : '';
  return emoji || '';
}

function countInversions(indices) {
  let count = 0;
  for (let i = 0; i < indices.length; i += 1) {
    for (let j = i + 1; j < indices.length; j += 1) {
      if (indices[i] > indices[j]) count += 1;
    }
  }
  return count;
}

function minSwapsToSort(indices) {
  const pairs = indices.map((value, index) => ({ value, index }));
  pairs.sort((a, b) => a.value - b.value);

  const visited = new Array(pairs.length).fill(false);
  let swaps = 0;

  for (let i = 0; i < pairs.length; i += 1) {
    if (visited[i] || pairs[i].index === i) continue;

    let cycleSize = 0;
    let j = i;
    while (!visited[j]) {
      visited[j] = true;
      j = pairs[j].index;
      cycleSize += 1;
    }

    if (cycleSize > 1) {
      swaps += cycleSize - 1;
    }
  }

  return swaps;
}

function evaluateOrder(artifactNames) {
  const issues = [];
  const known = [];
  const indices = [];
  let issueAt = null;

  let lastSlot = -1;
  for (const name of artifactNames) {
    const slotIndex = ARTIFACT_SLOT_INDEX.get(name);
    if (slotIndex == null) {
      issues.push(`unexpected artifact ${name}`);
      continue;
    }

    known.push({ name, slotIndex });
    indices.push(slotIndex);

    if (slotIndex <= lastSlot && !issueAt) {
      issueAt = name;
    }

    lastSlot = Math.max(lastSlot, slotIndex);
  }

  if (artifactNames.length === 0) {
    issues.push('no equipped artifacts found');
  }

  if (artifactNames.length > 4) {
    issues.push('more than 4 artifacts equipped');
  }

  const expectedOrder = known
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(entry => entry.name);

  if (indices.length > 0) {
    const minIndex = Math.min(...indices);
    if (indices[0] !== minIndex) {
      issueAt = known[0]?.name ?? issueAt;
    }
  }

  const inversions = countInversions(indices);
  const minSwaps = minSwapsToSort(indices);
  const orderOk = inversions === 0 && issueAt == null;
  const ok = issues.length === 0 && orderOk;
  const issueType = minSwaps >= 2 ? 'complete' : 'ordered';

  return {
    ok,
    issueAt,
    issues,
    issueType,
    expectedOrder,
  };
}

function buildLines({ contract, coop, results }) {
  const lines = [];
  lines.push(`Artifact order check for ${contract}/${coop}`);

  if (results.length === 0) {
    lines.push('No contributors found.');
    return lines;
  }

  for (const result of results) {
    const name = result.displayName || '(unknown)';
    const orderText = result.artifacts.length
      ? result.artifacts.map(buildArtifactDisplay).join(' ')
      : '(none)';

    if (result.ok) {
      lines.push(`${name}: 🎉`);
      continue;
    }

    const expectedText = result.expectedOrder.length
      ? result.expectedOrder.map(buildArtifactDisplay).join(' ')
      : '(none)';

    let issueText = '';
    if (result.issues.length) {
      issueText = result.issues.join('; ');
    } else if (result.issueType === 'complete') {
      issueText = 'completely out of whack';
    } else if (result.issueAt) {
      issueText = `issue at ${String(result.issueAt).toLowerCase()}`;
    } else {
      issueText = 'order mismatch';
    }

    lines.push(`${name}: ${orderText} (${issueText}) -> expected ${expectedText}`);
  }

  return lines;
}

export const data = new SlashCommandBuilder()
  .setName('artifactorder')
  .setDescription('Check coop artifact order against the standard loadout.')
  .addStringOption(option =>
    option
      .setName(CONTRACT_OPTION)
      .setDescription('Contract id')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName(COOP_OPTION)
      .setDescription('Coop id')
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  if (!(await requireMamaBird(interaction))) return;

  const contract = (interaction.options.getString(CONTRACT_OPTION) ?? '').trim();
  const coop = (interaction.options.getString(COOP_OPTION) ?? '').trim();

  if (!contract || !coop) {
    await interaction.reply(createTextComponentMessage('Please provide both contract and coop.', { flags: 64 }));
    return;
  }

  await interaction.deferReply();

  let contributors;
  try {
    contributors = await fetchCoopContributors(contract, coop);
  } catch (err) {
    const message = err?.message ?? String(err);
    await interaction.editReply(
      createTextComponentMessage(`Failed to fetch coop status for ${contract}/${coop}: ${message}`, { flags: 64 })
    );
    return;
  }

  const artifactEnum = await getProtoEnum('ei.ArtifactSpec.Name');

  const igns = Array.isArray(contributors)
    ? contributors
      .map(contributor => contributor?.userName ?? contributor?.user_name ?? null)
      .filter(value => value && String(value).trim() !== '')
    : [];
  const memberRows = getMembersByIgns(igns);
  const membersByIgn = new Map(
    memberRows.map(row => [String(row.ign).trim().toLowerCase(), row.discord_id])
  );

  const results = Array.isArray(contributors)
    ? contributors.map(contributor => {
      const artifacts = extractContributorArtifacts(contributor, artifactEnum);
      const { ok, issues, issueAt, issueType, expectedOrder } = evaluateOrder(artifacts);
      const ign = contributor?.userName ?? contributor?.user_name ?? null;
      const lowerIgn = ign ? String(ign).trim().toLowerCase() : '';
      const discordId = lowerIgn ? membersByIgn.get(lowerIgn) : null;
      const displayName = discordId ? `<@${discordId}>` : (ign || contributor?.userId || contributor?.user_id || null);
      return {
        displayName,
        artifacts,
        ok,
        issues,
        issueAt,
        issueType,
        expectedOrder,
      };
    })
    : [];

  const lines = buildLines({ contract, coop, results });
  const chunks = chunkContent(lines);
  const [first, ...rest] = chunks;

  await interaction.editReply(createTextComponentMessage(first));
  for (const chunk of rest) {
    await interaction.followUp(createTextComponentMessage(chunk));
  }
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

async function respondWithCoops(interaction, focused) {
  const contract = interaction.options.getString(CONTRACT_OPTION) || '';
  if (!contract) {
    await interaction.respond([]);
    return;
  }

  const coops = listCoops(contract);
  const lower = focused.toLowerCase();
  const filtered = coops
    .filter(c => c.toLowerCase().includes(lower))
    .slice(0, 25)
    .map(c => ({ name: c, value: c }));

  await interaction.respond(filtered);
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused();
  const focusedOption = interaction.options.getFocused(true);
  const optionName = focusedOption?.name;

  if (optionName === CONTRACT_OPTION) {
    await respondWithContracts(interaction, focusedValue);
    return;
  }

  if (optionName === COOP_OPTION) {
    await respondWithCoops(interaction, focusedValue);
    return;
  }

  await interaction.respond([]);
}

export default { data, execute, autocomplete };
