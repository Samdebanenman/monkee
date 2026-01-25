import { describe, expect, it } from 'vitest';

import {
  DEFLECTOR_OPTIONS,
  METRO_OPTIONS,
  listArtifactOptions,
  parseDeflector,
  parseMetro,
  parseCompass,
  parseGusset,
  parseIhrChalice,
  parseIhrMonocle,
  parseIhrDeflector,
  parseIhrSiab,
  parseTe,
} from '../../../../utils/predictcs/artifacts.js';

describe('utils/predictcs/artifacts', () => {
  it('lists artifact options', () => {
    const text = listArtifactOptions(DEFLECTOR_OPTIONS);
    expect(text).toContain(DEFLECTOR_OPTIONS[0].name);
  });

  it('parses artifact inputs with defaults', () => {
    expect(parseDeflector('').name).toBe('T4L Defl.');
    expect(parseMetro(null).name).toBe('T4L Metro');
  });

  it('parses artifact inputs by exact or partial match', () => {
    expect(parseDeflector('T4L Defl.').deflectorPercent).toBe(20);
    expect(parseMetro('T4E Metro').elrMult).toBe(1.3);
    expect(parseCompass('T4R Compass').srMult).toBe(1.35);
    expect(parseGusset('T4C Gusset').chickMult).toBe(1.2);
  });

  it('parses IHR artifacts', () => {
    expect(parseIhrChalice('T4L Chalice').ihrMult).toBe(1.4);
    expect(parseIhrMonocle('T4C').ihrMult).toBe(1.2);
    expect(parseIhrDeflector('T3R Defl.').slots).toBe(1);
    expect(parseIhrSiab('T4R SIAB').siabPercent).toBe(80);
  });

  it('parses TE values', () => {
    expect(parseTe(' 123.4 ')).toBe(123);
    expect(parseTe('nope')).toBe(0);
    expect(parseTe('-50')).toBe(0);
  });

  it('keeps option lists stable', () => {
    expect(METRO_OPTIONS.length).toBeGreaterThan(5);
  });
});
