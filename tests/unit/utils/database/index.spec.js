import { describe, expect, it } from 'vitest';

import dbDefault, { db, DEFAULT_MAMABIRD_IDS } from '../../../../utils/database/index.js';

describe('utils/database/index', () => {
  it('exports default db and named db', () => {
    expect(dbDefault).toBe(db);
  });

  it('exports schema constants', () => {
    expect(DEFAULT_MAMABIRD_IDS).toBeTruthy();
  });
});
