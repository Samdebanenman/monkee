import { SlashCommandBuilder } from 'discord.js';
import {
	createScheduleComponents,
	DEFLECTOR_CHOICES,
} from '../services/bnPlayerService.js';
import { fetchActiveContracts } from '../services/contractService.js';
import { createTextComponentMessage } from '../services/discord.js';
import {
	getRegisteredPlannerUser,
	getScheduleFromAvailability,
	updatePlannerScheduleForDay,
	updatePlannerUser,
} from '../services/ggplannerService.js';

export const data = new SlashCommandBuilder()
	.setName('bn-me')
	.setDescription('Update your reruns infos.')
	.addSubcommand((subcommand) =>
		subcommand
			.setName('update')
			.setDescription('Update your player info in GGPlanner.')
			.addStringOption((option) =>
				option
					.setName('def')
					.setDescription('Your best deflector.')
					.addChoices(...DEFLECTOR_CHOICES),
			)
			.addIntegerOption((option) =>
				option
					.setName('te')
					.setDescription('Your TE amount (0-490).')
					.setMinValue(0)
					.setMaxValue(490)
			)
			.addBooleanOption((option) =>
				option
					.setName('ultra')
					.setDescription('Do you have Ultra? (Yes/No)')
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName('contracts')
			.setDescription('Update your selected contracts.')
			.addStringOption((option) =>
				option
					.setName('contract')
					.setDescription('Contract to toggle selection.')
					.setRequired(true)
					.setAutocomplete(true),
			)
			.addBooleanOption((option) =>
				option
					.setName('wanted')
					.setDescription('Do you want to run this contract?')
					.setRequired(true),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName('schedule')
			.setDescription('Update your available hours for this week.'),
	);

export async function autocomplete(interaction) {
	const focusedOption = interaction.options.getFocused(true);
	if (focusedOption.name === 'contract') {
		try {
			const focusedValue = focusedOption.value.toLowerCase();

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

export async function execute(interaction) {
	const subcommand = interaction.options.getSubcommand();
	const user = await getRegisteredPlannerUser(interaction.user.id);
	if (!user) {
		await interaction.reply(
			createTextComponentMessage(
				'You are not registered in GGPlanner yet. Please log in to GGPlanner with Discord and ask for approval first.',
				{ flags: 64 },
			),
		);
		return;
	}
	switch (subcommand) {
		case 'update':
			await handleUpdatePlayerInfos(interaction);
			break;
		case 'contracts':
			await handleUpdatePlayerContracts(interaction);
			break;
		case 'schedule':
			await handleUpdatePlayerSchedule(interaction);
			break;
		default:
			await interaction.reply(
				createTextComponentMessage(
					`Unknown subcommand: ${subcommand}`,
					{ flags: 64 },
				),
			);
	}
}

async function handleUpdatePlayerInfos(interaction) {
	try {
		const user = {
			discordId: interaction.user.id,
			discordName: interaction.user.username,
			te: interaction.options.getInteger('te'),
			deflector: interaction.options.getString('def'),
			hasUltra: interaction.options.getBoolean('ultra'),
		};
		const hasDeflector = user.deflector != null;
		const hasTe = user.te != null;
		const hasUltra = user.hasUltra != null;
		if (!hasDeflector && !hasTe && !hasUltra) {
			await interaction.reply(
				createTextComponentMessage(`You need to update at least one field.`, { flags: 64 }),
			);
			return;
		}

		await updatePlannerUser(user.discordId, {
			username: user.discordName,
			te: user.te,
			deflector: user.deflector,
			ultra: user.hasUltra,
		});

		let replyMessage = `## ✅ **${user.discordName}**, your BN info has been saved successfully!`;
		if (user.te != null) replyMessage += `\n- TE: **${user.te}**`;
		if (user.deflector) replyMessage += `\n- Deflector: **${user.deflector}**`;
		if (user.hasUltra != null) replyMessage += `\n- Ultra: **${user.hasUltra ? 'Yes' : 'No'}**`;


		await interaction.reply(
			createTextComponentMessage(replyMessage, { flags: 64 }),
		);
	} catch (error) {
		console.error('Error on handleUpdatePlayerInfos:', error);
		await interaction.reply(
			createTextComponentMessage(
				'An error occurred while trying to save your infos. Please try again later.',
				{ flags: 64 },
			),
		);
	}
}

async function handleUpdatePlayerContracts(interaction) {
	await interaction.deferReply({ flags: 64 });
	try {
		const wanted = interaction.options.getBoolean('wanted', true);
		const contractId = interaction.options.getString('contract', true);
		const member = await getRegisteredPlannerUser(interaction.user.id);
		if (!member) {
			await interaction.editReply(
				createTextComponentMessage(
					'You are not registered in GGPlanner yet. Please log in and get approved first.',
					{ flags: 64 },
				),
			);
			return;
		}

		const contracts = new Set(member.contracts);
		if (wanted) {
			contracts.add(contractId);
		} else {
			contracts.delete(contractId);
		}

		await updatePlannerUser(interaction.user.id, {
			contracts: Array.from(contracts),
		});

		const replyMessage = `## ✅ **${interaction.user.username}**, your selected contracts have been updated!`;

		await interaction.editReply(
			createTextComponentMessage(replyMessage, { flags: 64 }),
		);
	} catch (error) {
		if (error?.message?.toLowerCase().includes('contract not found')) {
			await interaction.editReply(
				createTextComponentMessage(
					'Contract not found. Please select a valid contract from the list.',
					{ flags: 64 },
				),
			);
			return;
		}
		console.error('Error on handleUpdatePlayerContracts:', error);
		await interaction.editReply(
			createTextComponentMessage(
				'An error occurred while updating your contracts. Please try again later.',
				{ flags: 64 },
			),
		);
	}
}

async function handleUpdatePlayerSchedule(interaction) {
	await interaction.deferReply({ flags: 64 });
	let selectedDay = 1;
	let timeMode = 'egg';
	let member = await getRegisteredPlannerUser(interaction.user.id);
	if (!member) {
		await interaction.editReply(
			createTextComponentMessage(
				'You are not registered in GGPlanner yet. Please log in and get approved first.',
				{ flags: 64 },
			),
		);
		return;
	}
	let schedule = getScheduleFromAvailability(member.availability);
	const localLabelMap = new Map();

	const reply = await interaction.editReply({
		content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
		components: await createScheduleComponents(selectedDay, schedule, {
			timeMode,
			localHourLabels: localLabelMap,
		}),
	});

	const collector = reply.createMessageComponentCollector({
		time: 300_000,
		filter: (i) => i.user.id === interaction.user.id,
	});
	collector.on('error', async (error) => {
		console.error('Collector error:', error);
	});
	collector.on('collect', async (i) => {
		try {
			if (i.customId.startsWith('day_')) {
				selectedDay = Number.parseInt(i.customId.split('_')[1], 10);
				await i.update({
					content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
					components: await createScheduleComponents(
						selectedDay,
						schedule,
						{ timeMode, localHourLabels: localLabelMap },
					),
				});
			} else if (i.customId === 'hour_select') {
				const selectedHours = i.values.map((v) => Number.parseInt(v, 10));
				member = await updatePlannerScheduleForDay(
					interaction.user.id,
					selectedDay,
					selectedHours,
				);
				schedule = getScheduleFromAvailability(member.availability);

				await i.update({
					content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
					components: await createScheduleComponents(
						selectedDay,
						schedule,
						{ timeMode, localHourLabels: localLabelMap },
					),
				});
			} else if (i.customId === 'toggle_time') {
				timeMode = timeMode === 'local' ? 'egg' : 'local';
				await i.update({
					content: `Hey ${interaction.user.toString()}, select a day to set your available hours.`,
					components: await createScheduleComponents(
						selectedDay,
						schedule,
						{ timeMode, localHourLabels: localLabelMap },
					),
				});
			} else if (i.customId === 'finish_schedule') {
				await i.update({
					components: [],
					content: `✅ Thanks ${interaction.user.toString()}! Your schedule has been updated.`,
				});
				collector.stop();
			}
		} catch (error) {
			console.error('Error processing interaction:', error);
			const errorPayload = {
				content: 'An error occurred while processing your request.',
				components: [],
				flags: 64,
			};
			if (i.replied || i.deferred) {
				await i
					.followUp(errorPayload)
					.catch((e) => console.error('Follow-up error failed:', e));
			} else {
				await i
					.reply(errorPayload)
					.catch((e) => console.error('Reply error failed:', e));
			}
		}
	});
	collector.on('end', async (_, reason) => {
		if (reason === 'time') {
			await interaction.editReply({
				content: 'Schedule editor has timed out.',
				components: [],
			});
		}
	});
}

export default { data, execute, autocomplete };
