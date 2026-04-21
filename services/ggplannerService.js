import { convertEstToUtc, convertUtcToEst } from '../utils/eggStandartTime.js';

const GGPLANNER_API_BASE_URL = process.env.GGPLANNER_API_BASE_URL;
const GGPLANNER_API_KEY = process.env.GGPLANNER_API_KEY;

function getPlannerApiBaseUrl() {
	const rawBaseUrl = String(GGPLANNER_API_BASE_URL || '').trim();
	if (!rawBaseUrl) {
		throw new Error('GGPlanner API is not configured. Set GGPLANNER_API_BASE_URL and GGPLANNER_API_KEY.');
	}

	if (/^https?:\/\//i.test(rawBaseUrl)) {
		return rawBaseUrl;
	}

	// Allow shorthand host:port paths in env files.
	return `http://${rawBaseUrl}`;
}

function normalizeDeflectorForBot(deflector) {
	const value = String(deflector || '').toUpperCase();
	if (value.startsWith('T4')) {
		return value;
	}
	if (['C', 'R', 'E', 'L'].includes(value)) {
		return `T4${value}`;
	}
	return 'T4C';
}

function normalizeDeflectorForPlanner(deflector) {
	const value = String(deflector || '').toUpperCase();
	if (value.startsWith('T4')) {
		return value.slice(2);
	}
	if (['C', 'R', 'E', 'L'].includes(value)) {
		return value;
	}
	return null;
}

function normalizeEggHour(hour) {
	let normalized = Number.parseInt(String(hour), 10);
	if (Number.isNaN(normalized)) return null;
	normalized %= 24;
	if (normalized < 0) normalized += 24;
	return normalized;
}

function ensureApiConfigured() {
	if (!GGPLANNER_API_BASE_URL || !GGPLANNER_API_KEY) {
		throw new Error('GGPlanner API is not configured. Set GGPLANNER_API_BASE_URL and GGPLANNER_API_KEY.');
	}
}

async function plannerRequest(action, { method = 'GET', body, query = {} } = {}) {
	ensureApiConfigured();
	const url = new URL(getPlannerApiBaseUrl());
	url.searchParams.set('action', action);
	for (const [key, value] of Object.entries(query)) {
		if (value != null) {
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url.toString(), {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${GGPLANNER_API_KEY}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error || `GGPlanner API request failed with status ${response.status}`);
	}
	return payload;
}

function normalizeUser(user) {
	if (!user) return null;
	return {
		discord_id: String(user.discordId),
		discord_name: String(user.username || 'Unknown'),
		approved: Boolean(user.approved),
		role: user.role || null,
		deflector: normalizeDeflectorForBot(user.deflector),
		te: Number.isFinite(Number(user.te)) ? Number(user.te) : 0,
		hasUltra: Boolean(user.ultra),
		contracts: Array.isArray(user.contracts) ? user.contracts.map(String) : [],
		availability: Array.isArray(user.availability) ? user.availability.map(Boolean) : new Array(168).fill(false),
		is_pushed: Boolean(user.pushed),
	};
}

function normalizePlannerContract(contract) {
	return {
		id: String(contract?.id ?? '').trim(),
		name: String(contract?.name || '').trim(),
		day: contract?.day ? String(contract.day) : null,
		duration: Number.isFinite(Number(contract?.duration)) ? Number(contract.duration) : 0,
		players: Number.isFinite(Number(contract?.players)) ? Number(contract.players) : 0,
		active: contract?.active !== false,
		contractId: String(contract?.contractId || '').trim(),
	};
}

export async function getPlannerUser(discordId) {
	const payload = await plannerRequest('user', {
		method: 'GET',
		query: { discordId: String(discordId) },
	});
	return normalizeUser(payload.user);
}

export async function getRegisteredPlannerUser(discordId) {
	const user = await getPlannerUser(discordId);
	if (!user?.approved) {
		return null;
	}
	return user;
}

export async function listRegisteredPlannerUsers() {
	const payload = await plannerRequest('users');
	const users = Array.isArray(payload?.users) ? payload.users : [];
	return users.map(normalizeUser).filter((user) => user?.approved === true);
}

export async function listPlannerContracts({ includeInactive = false, limit } = {}) {
	const query = {
		includeInactive: includeInactive ? 'true' : 'false',
	};
	if (limit != null) {
		query.limit = Number.parseInt(String(limit), 10);
	}

	const payload = await plannerRequest('contracts', {
		method: 'GET',
		query,
	});
	const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
	return contracts.map(normalizePlannerContract).filter((contract) => contract.id);
}

export async function updatePlannerUser(discordId, updates) {
	const normalizedUpdates = { ...updates };
	if (updates?.deflector !== undefined) {
		const plannerDeflector = normalizeDeflectorForPlanner(updates.deflector);
		if (plannerDeflector) {
			normalizedUpdates.deflector = plannerDeflector;
		} else {
			delete normalizedUpdates.deflector;
		}
	}
	if (updates?.ultra !== undefined) {
		normalizedUpdates.ultra = Boolean(updates.ultra);
	}
	if (updates?.pushed !== undefined) {
		normalizedUpdates.pushed = Boolean(updates.pushed);
	}

	const payload = await plannerRequest('update-member', {
		method: 'POST',
		body: {
			discordId: String(discordId),
			updates: normalizedUpdates,
		},
	});

	return normalizeUser(payload?.user);
}

function normalizePlannerContractUpsert(contract) {
	return {
		contractId: String(contract?.contractId || '').trim(),
		name: String(contract?.name || '').trim(),
		day: contract?.day ? String(contract.day) : null,
		players: Number.isFinite(Number(contract?.players)) ? Number(contract.players) : 0,
		duration: Number.isFinite(Number(contract?.duration)) ? Number(contract.duration) : 0,
	};
}

export async function upsertPlannerContract({ overwriteId, contract }) {
	const payload = await plannerRequest('upsert-contract', {
		method: 'POST',
		body: {
			overwriteId: overwriteId == null ? null : String(overwriteId),
			contract: normalizePlannerContractUpsert(contract),
		},
	});

	return normalizePlannerContract(payload?.contract);
}

export function getScheduleFromAvailability(availability) {
	const schedule = new Map();
	const safeAvailability = Array.isArray(availability)
		? availability.map(Boolean)
		: new Array(168).fill(false);

	for (let day = 1; day <= 7; day += 1) {
		const dayOffset = (day - 1) * 24;
		const selectedUtcHours = new Set();
		for (let estHour = 0; estHour < 24; estHour += 1) {
			if (safeAvailability[dayOffset + estHour]) {
				const [utcHour] = convertEstToUtc([estHour]);
				selectedUtcHours.add(utcHour);
			}
		}
		schedule.set(day, selectedUtcHours);
	}

	return schedule;
}

export async function updatePlannerScheduleForDay(discordId, day, selectedUtcHours = []) {
	const user = await getRegisteredPlannerUser(discordId);
	if (!user) {
		throw new Error('User is not registered/approved in GGPlanner.');
	}

	const dayNumber = Number.parseInt(String(day), 10);
	if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
		throw new Error('Invalid day value.');
	}

	const availability = Array.isArray(user.availability)
		? user.availability.slice(0, 168).map(Boolean)
		: new Array(168).fill(false);
	while (availability.length < 168) {
		availability.push(false);
	}

	const dayOffset = (dayNumber - 1) * 24;
	for (let hour = 0; hour < 24; hour += 1) {
		availability[dayOffset + hour] = false;
	}

	const estHours = selectedUtcHours
		.map((utcHour) => convertUtcToEst(Number.parseInt(String(utcHour), 10)))
		.map((estHour) => normalizeEggHour(estHour))
		.filter((hour) => hour != null);

	for (const estHour of estHours) {
		availability[dayOffset + estHour] = true;
	}

	return await updatePlannerUser(discordId, { availability });
}

function userCanRunContract(user, contractId, isUltraOnly) {
	if (!user.contracts.includes(String(contractId))) {
		return false;
	}
	if (isUltraOnly && !user.hasUltra) {
		return false;
	}
	return true;
}

function collectDayHoursForUser(user, dayOffset, requestedHours) {
	const estHours = [];
	for (let estHour = 0; estHour < 24; estHour += 1) {
		if (!user.availability[dayOffset + estHour]) {
			continue;
		}
		if (requestedHours.size > 0 && !requestedHours.has(estHour)) {
			continue;
		}
		estHours.push(estHour);
	}
	return estHours;
}

export async function findPlannerPlayersForRerun(contractId, day, hours = [], isUltraOnly = false) {
	const users = await listRegisteredPlannerUsers();
	const dayNumber = Number.parseInt(String(day), 10);
	if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
		return [];
	}

	const dayOffset = (dayNumber - 1) * 24;
	const requestedHours = new Set(
		hours
			.map((hour) => normalizeEggHour(hour))
			.filter((hour) => hour != null),
	);

	const players = [];
	for (const user of users) {
		if (!userCanRunContract(user, contractId, isUltraOnly)) {
			continue;
		}

		const estHours = collectDayHoursForUser(user, dayOffset, requestedHours);
		if (estHours.length === 0) {
			continue;
		}

		players.push({
			discord_id: user.discord_id,
			discord_name: user.discord_name,
			deflector: user.deflector,
			te: user.te,
			hours: convertEstToUtc(estHours),
		});
	}

	return players;
}

export default {
	getPlannerUser,
	getRegisteredPlannerUser,
	listRegisteredPlannerUsers,
	listPlannerContracts,
	upsertPlannerContract,
	updatePlannerUser,
	getScheduleFromAvailability,
	updatePlannerScheduleForDay,
	findPlannerPlayersForRerun,
};
