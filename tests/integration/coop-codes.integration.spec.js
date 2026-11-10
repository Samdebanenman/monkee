import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let db;
let service;
let directory;
const previousPath = process.env.COOPS_DB_PATH;

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'monkee-coop-codes-'));
  process.env.COOPS_DB_PATH = path.join(directory, 'test.db');
  service = await import('../../services/coopCodeService.js');
  ({ default: db } = await import('../../utils/database/client.js'));
});

beforeEach(() => db.exec('DELETE FROM extended_coop_codes'));

afterAll(() => {
  db?.close();
  if (previousPath === undefined) delete process.env.COOPS_DB_PATH;
  else process.env.COOPS_DB_PATH = previousPath;
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

describe('extended coop code persistence', () => {
  it('stores only prefixes, restores exactly oo, deduplicates, and removes saved codes', () => {
    expect(service.addExtendedCoopCode('custom-9oo').ok).toBe(true);
    expect(service.addExtendedCoopCode('aooo').ok).toBe(true);
    expect(db.prepare('SELECT prefix FROM extended_coop_codes ORDER BY prefix').all())
      .toEqual([{ prefix: 'ao' }, { prefix: 'custom-9' }]);
    expect(service.addExtendedCoopCode('custom-9oo').reason).toBe('already-exists');
    expect(service.listExtendedCoopCodes()).toEqual(['aooo', 'custom-9oo']);
    expect(service.includeExtendedCoopCodes(['aoo'])).toEqual(['aoo']);
    expect(service.includeExtendedCoopCodes(['aoo', 'aooo'], 'extended'))
      .toEqual(['aoo', 'aooo', 'custom-9oo']);
    expect(service.removeExtendedCoopCode('custom-9oo').ok).toBe(true);
    expect(service.removeExtendedCoopCode('custom-9oo').reason).toBe('not-found');
    expect(service.listExtendedCoopCodes()).toEqual(['aooo']);
  });

  it.each(['', 'aoo', '0abcoo', '-abcoo', 'Abcoo', 'ab_coo', 'abc', 'abc oo', "ab'oo"])(
    'rejects invalid code %s without changing the list', code => {
      expect(service.addExtendedCoopCode(code).reason).toBe('invalid-code');
      expect(service.removeExtendedCoopCode(code).reason).toBe('invalid-code');
      expect(service.listExtendedCoopCodes()).toEqual([]);
    },
  );
});
