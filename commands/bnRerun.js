import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
	groupPlayersByHour,
	WEEK_DAYS,
} from '../services/bnPlayerService.js';
import { fetchActiveContracts } from '../services/contractService.js';
import { getContractById } from '../utils/database/contractsRepository.js';
import { formatHourRanges } from '../utils/eggStandartTime.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
	findPlannerPlayersForRerun,
	getRegisteredPlannerUser,
	listPlannerContracts,
} from '../services/ggplannerService.js';

export const data = new SlashCommandBuilder()
	.setName('bn-rerun')
	.setDescription('Find available players for a BN rerun.')
	.addStringOption((option) =>
		option
			.setName('contract')
			.setDescription('The contract you want to run.')
			.setRequired(true)
			.setAutocomplete(true),
	)
	.addStringOption((option) =>
		option
			.setName('day')
			.setDescription('The day of the week for the rerun.')
			.setRequired(true)
			.addChoices(
				...WEEK_DAYS.map((day) => ({
					name: day.label,
					value: day.value,
				})),
			),
	)
	.addBooleanOption((option) =>
		option
			.setName('ultra_only')
			.setDescription(
				'Filter by only Ultra users',
			)
			.setRequired(false)
	)
	.addStringOption((option) =>
		option
			.setName('hours')
			.setDescription(
				'Optional list of game hours to filter (e.g., +0,-2,+4).',
			)
			.setRequired(false),
	);

function parseRequestedHours(hoursInput) {
	return String(hoursInput || '')
		.split(',')
		.map((value) => Number.parseInt(value.trim(), 10))
		.filter((value) => !Number.isNaN(value));
}

async function replyRegisteredOnly(interaction) {
	await interaction.editReply(
		createTextComponentMessage(
			'You are not registered in GGPlanner yet. Please log in and get approved first.',
		),
	);
}

async function resolveRerunUser(interaction) {
	const callerUser = await getRegisteredPlannerUser(interaction.user.id);
	if (!callerUser) {
		return { error: 'caller-not-registered' };
	}
	return { requiredUser: callerUser };
}

function buildHourSlotPlayers(hourPlayers, requiredUserId) {
	const requiredPlayer = hourPlayers.find(
		(player) => player.discord_id === requiredUserId,
	);
	if (!requiredPlayer) {
		return null;
	}
	const otherPlayers = hourPlayers.filter(
		(player) => player.discord_id !== requiredUserId,
	);
	return { requiredPlayer, otherPlayers };
}

function buildFinalPlayers({ requiredPlayer, otherPlayers }) {
	for (let i = otherPlayers.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[otherPlayers[i], otherPlayers[j]] = [otherPlayers[j], otherPlayers[i]];
	}

	return [requiredPlayer, ...otherPlayers].filter(Boolean);
}

function buildAvailableSlots({ playersByHour, requiredUserId, contract }) {
	const availableSlots = [];
	for (const [hour, hourPlayers] of playersByHour.entries()) {
		const playerSet = buildHourSlotPlayers(hourPlayers, requiredUserId);
		if (!playerSet) {
			continue;
		}

		const finalPlayers = buildFinalPlayers({
			requiredPlayer: playerSet.requiredPlayer,
			otherPlayers: playerSet.otherPlayers,
		});
		if (finalPlayers.length < contract.max_coop_size) {
			continue;
		}

		availableSlots.push({
			hour,
			players: finalPlayers,
			playerCount: finalPlayers.length,
			totalTE: finalPlayers
				.slice(0, contract.max_coop_size)
				.reduce((sum, player) => sum + (Number.parseInt(player.te, 10) || 0), 0),
		});
	}
	return availableSlots;
}

function groupSlotsByPlayers(availableSlots) {
	const groupedSlots = new Map();
	for (const slot of availableSlots) {
		const playerIds = [...slot.players]
			.sort((a, b) => b.discord_id.localeCompare(a.discord_id))
			.map((player) => player.discord_id)
			.join(',');

		if (!groupedSlots.has(playerIds)) {
			groupedSlots.set(playerIds, {
				hours: [],
				players: slot.players,
				playerCount: slot.playerCount,
				totalTE: slot.totalTE,
			});
		}
		groupedSlots.get(playerIds).hours.push(slot.hour);
	}
	return Array.from(groupedSlots.values());
}

export async function execute(interaction) {
	await interaction.deferReply();

	const contractId = interaction.options.getString('contract', true);
	const day = interaction.options.getString('day', true);
	const hoursInput = interaction.options.getString('hours');
	const isUltraOnly = interaction.options.getBoolean('ultra_only') || false;
	const hours = parseRequestedHours(hoursInput);

	const rerunUsers = await resolveRerunUser(interaction);
	if (rerunUsers.error === 'caller-not-registered') {
		await replyRegisteredOnly(interaction);
		return;
	}
	const requiredUser = rerunUsers.requiredUser;

	const contract = await getContractById(contractId);
	if (!contract) {
		await interaction.editReply(
			createTextComponentMessage(
				`Could not find contract info for \`${contractId}\`. Make sure it's a valid contract.`,
			),
		);
		return;
	}

	const plannerContracts = await listPlannerContracts({ includeInactive: false });
	const plannerContract = plannerContracts.find(
		(item) => String(item.contractId || '').trim() === contractId,
	);
	if (!plannerContract?.id) {
		await interaction.editReply(
			createTextComponentMessage(
				`No active GGPlanner contract mapping found for \`${contractId}\`.`,
			),
		);
		return;
	}

	const plannerContractId = String(plannerContract.id);

	const players = await findPlannerPlayersForRerun(plannerContractId, day, hours, isUltraOnly);

	if (players.length === 0) {
		const dayLabel =
			WEEK_DAYS.find((d) => d.value === day)?.label || `Day ${day}`;
		await interaction.editReply(
			createTextComponentMessage(
				`No players found for \`${contractId}\` on ${dayLabel}.`,
			),
		);
		return;
	}

	const playersByHour = groupPlayersByHour(players);
	const availableSlots = buildAvailableSlots({
		playersByHour,
		requiredUserId: requiredUser.discord_id,
		contract,
	});

	if (availableSlots.length === 0) {
		await interaction.editReply(
			createTextComponentMessage(
				`No time slots on the selected day have enough players (${contract.max_coop_size}) for \`${contract.name}\`.`,
			),
		);
		return;
	}

	// Group slots that have the exact same set of players
	const finalSlots = groupSlotsByPlayers(availableSlots);
	finalSlots.sort((a, b) => b.playerCount - a.playerCount);
	const title = `Rerun Slots for \`${contract.name}\``;

	const dayLabel = WEEK_DAYS.find((d) => d.value === day)?.label;
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setDescription(
			`Showing available slots for **${dayLabel}** with at least **${contract.max_coop_size}** players.`,
		)
		.setColor('#0099FF')
		.setTimestamp();
	embed.setFooter({ text: 'Slots sorted by most players' });

	const topSlots = finalSlots.slice(0, 5);
	for (const slot of topSlots) {
		let playerList;
		playerList = slot.players
			.map((p) => `\`${p.discord_name ?? p.discord_id}\` - ${p.deflector} - ${p.te}`)
			.join('\n');

		const hourLabels = formatHourRanges(slot.hours);

		const title = `${hourLabels} - ${slot.playerCount} Players`;

		embed.addFields({
			name: title,
			value: playerList || 'No players to show.',
			inline: false,
		});
	}

	if (finalSlots.length > 5) {
		embed.addFields({
			name: '...',
			value: `${finalSlots.length - 5} more groups of players available.`,
		});
	}

	await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	const focusedValue = focusedOption.value.toLowerCase();

	if (focusedOption.name === 'contract') {
		try {
			const { seasonal } = await fetchActiveContracts({
				allowRefresh: false,
			});
			const contracts = seasonal.map(([name, id]) => ({
				name: `${name} (${id})`,
				value: id,
			}));
			const filtered = contracts
				.filter(
					(contract) =>
						contract.name.toLowerCase().includes(focusedValue) ||
						contract.value.toLowerCase().includes(focusedValue),
				)
				.slice(0, 25);

			await interaction.respond(filtered);
		} catch (error) {
			console.error(
				'Error fetching recent contracts for autocomplete:',
				error,
			);
			await interaction.respond([]);
		}
	}
}

export default { data, execute, autocomplete };
