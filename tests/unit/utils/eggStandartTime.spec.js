import { describe, expect, it } from 'vitest';
import {
	convertEstToUtc,
	convertUtcToEst,
	formatHourRanges,
	normalizeEggHour,
	ORDERED_EGG_HOURS,
} from '../../../utils/eggStandartTime.js';

describe('utils/eggStandartTime', () => {
	it('keeps the canonical egg hour order at +0..+12,-11..-1', () => {
		expect(ORDERED_EGG_HOURS).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
			-11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1,
		]);
	});

	it('normalizes the wrap boundary to +12 instead of -12', () => {
		expect(normalizeEggHour(-12)).toBe(12);
		expect(normalizeEggHour(12)).toBe(12);
		expect(convertUtcToEst(5)).toBe(12);
		expect(convertUtcToEst(6)).toBe(-11);
	});

	it('round-trips every canonical egg hour through UTC', () => {
		for (const hour of ORDERED_EGG_HOURS) {
			const [utcHour] = convertEstToUtc([hour]);
			expect(convertUtcToEst(utcHour)).toBe(hour);
		}
	});

	it('formats ranges in canonical order across the +12/-11 boundary', () => {
		const utcHours = convertEstToUtc([11, 12, -11, -10]);
		expect(formatHourRanges(utcHours)).toBe('+11 to -10');
	});
});
