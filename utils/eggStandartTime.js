/**
 * +0 EST is 17:00 UTC
 */
export const REFERENCE_HOUR_UTC = 17;
export const ORDERED_EGG_HOURS = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
	-11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1,
];

export function normalizeEggHour(hour) {
	let normalized = Number.parseInt(String(hour), 10);
	if (Number.isNaN(normalized)) {
		return null;
	}

	normalized %= 24;
	if (normalized < 0) {
		normalized += 24;
	}
	if (normalized > 12) {
		normalized -= 24;
	}
	return normalized;
}

function canonicalizeEggHour(hour) {
	return normalizeEggHour(hour);
}

function getEggHourSortIndex(hour) {
	const canonicalHour = canonicalizeEggHour(hour);
	const index = ORDERED_EGG_HOURS.indexOf(canonicalHour);
	return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Converts an array of Egg Inc. Standard Time hours (e.g., [0, -2, 4]) to UTC hours.
 * @param {number[]} estHours An array of EST hours.
 * @returns {number[]} An array of UTC hours.
 */
export function convertEstToUtc(estHours) {
	if (!estHours || estHours.length === 0) {
		return [];
	}
	const utcHours = [];

	for (const estHour of estHours) {
		const numericHour = Number.parseInt(String(estHour), 10);
		if (Number.isNaN(numericHour)) {
			continue;
		}
		const utcHour = (REFERENCE_HOUR_UTC + numericHour + 24) % 24;
		utcHours.push(utcHour);
	}
	return [...new Set(utcHours)];
}

/**
 * Converts an UTC hour to EST hour.
 * @param {number} utcHour An UTC hour.
 * @returns {number} An EST hour.
 */
export function convertUtcToEst(utcHour) {
	const numericUtcHour = Number.parseInt(String(utcHour), 10);
	if (Number.isNaN(numericUtcHour)) {
		return null;
	}
	return normalizeEggHour(numericUtcHour - REFERENCE_HOUR_UTC);
}

export function formatHourRanges(utcHours) {
	if (!utcHours || utcHours.length === 0) {
		return '';
	}

	const gameHours = utcHours
		.map(convertUtcToEst)
		.filter((hour) => hour != null)
		.sort((a, b) => getEggHourSortIndex(a) - getEggHourSortIndex(b));

	const ranges = [];
	let startOfRange = gameHours[0];

	for (let i = 1; i <= gameHours.length; i += 1) {
		const isRangeBreak = i === gameHours.length
			|| getEggHourSortIndex(gameHours[i]) !== getEggHourSortIndex(gameHours[i - 1]) + 1;
		if (isRangeBreak) {
			const endOfRange = gameHours[i - 1];
			const startLabel = `${startOfRange >= 0 ? '+' : ''}${startOfRange}`;

			if (startOfRange === endOfRange) {
				ranges.push(startLabel);
			} else if (getEggHourSortIndex(endOfRange) === getEggHourSortIndex(startOfRange) + 1) {
				const endLabel = `${endOfRange >= 0 ? '+' : ''}${endOfRange}`;
				ranges.push(`${startLabel},${endLabel}`);
			} else {
				const endLabel = `${endOfRange >= 0 ? '+' : ''}${endOfRange}`;
				ranges.push(`${startLabel} to ${endLabel}`);
			}

			if (i < gameHours.length) {
				startOfRange = gameHours[i];
			}
		}
	}
	return ranges.join(',');
}

export default {
	convertEstToUtc,
	convertUtcToEst,
	formatHourRanges,
	normalizeEggHour,
	ORDERED_EGG_HOURS,
};
