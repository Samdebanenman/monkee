import { describe, expect, it } from 'vitest';
import {
  getAstronomicalSeasonRange,
  getCurrentAstronomicalSeason,
  parseSeasonKey,
} from '../../../utils/seasons.js';

const seconds = (year, monthIndex, day) => Date.UTC(year, monthIndex, day) / 1000;

describe('utils/seasons', () => {
  it('parses valid season keys and normalizes autumn', () => {
    expect(parseSeasonKey('summer_2026')).toEqual({ label: 'summer', year: 2026 });
    expect(parseSeasonKey('autumn_2026')).toEqual({ label: 'fall', year: 2026 });
    expect(parseSeasonKey('invalid')).toBeNull();
  });

  it('builds contiguous fall and winter ranges', () => {
    const fall = getAstronomicalSeasonRange('fall_2026');
    const winter = getAstronomicalSeasonRange('winter_2027');

    expect(fall).toEqual({
      start: seconds(2026, 8, 22),
      endExclusive: seconds(2026, 11, 21),
    });
    expect(winter.start).toBe(fall.endExclusive);
    expect(winter.endExclusive).toBe(seconds(2027, 2, 20));
  });

  it('resolves the current season on both sides of the winter boundary', () => {
    expect(getCurrentAstronomicalSeason(seconds(2026, 11, 20)).key).toBe('fall_2026');
    expect(getCurrentAstronomicalSeason(seconds(2026, 11, 21)).key).toBe('winter_2027');
    expect(getCurrentAstronomicalSeason(seconds(2026, 0, 1)).key).toBe('winter_2026');
  });
});
