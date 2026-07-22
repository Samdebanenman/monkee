import { beforeEach, describe, expect, it, vi } from 'vitest';

const { statementMap, makeStmt } = vi.hoisted(() => {
  const statementMap = new Map();
  const makeStmt = (sql) => {
    const stmt = {
      sql,
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    };
    statementMap.set(sql, stmt);
    return stmt;
  };

  return { statementMap, makeStmt };
});

vi.mock('../../../utils/database/client.js', () => ({
  default: {
    prepare: (sql) => statementMap.get(sql) ?? makeStmt(sql),
    transaction: (fn) => (items) => fn(items),
  },
}));

import { upsertColleggtibles, getStoredColleggtibles } from '../../../utils/database/colleggtiblesRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  for (const stmt of statementMap.values()) {
    stmt.run.mockReset();
    stmt.get.mockReset();
    stmt.all.mockReset();
    stmt.all.mockReturnValue([]);
  }
});

describe('database/colleggtiblesRepository', () => {
  it('no-ops on empty upserts', () => {
    upsertColleggtibles([]);
  });

  it('upserts colleggtibles and stores buffs', () => {
    const upsertStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT INTO colleggtibles'));
    const deleteStmt = [...statementMap.values()].find(s => s.sql.includes('DELETE FROM colleggtible_buffs'));
    const insertStmt = [...statementMap.values()].find(s => s.sql.includes('INSERT INTO colleggtible_buffs'));

    upsertColleggtibles([
      {
        identifier: ' egg1 ',
        name: 'Egg One',
        iconUrl: 'https://example.test/icon.png',
        buffs: [
          { dimension: 1, value: 1.05 },
          { dimension: 2, value: 1.1 },
        ],
      },
      { identifier: '' },
    ]);

    expect(upsertStmt.run).toHaveBeenCalledTimes(1);
    expect(upsertStmt.run).toHaveBeenCalledWith('egg1', 'Egg One', 'https://example.test/icon.png');
    expect(deleteStmt.run).toHaveBeenCalledWith('egg1');
    expect(insertStmt.run).toHaveBeenCalledTimes(2);
    expect(insertStmt.run).toHaveBeenNthCalledWith(1, 'egg1', 1, 1, 1.05);
    expect(insertStmt.run).toHaveBeenNthCalledWith(2, 'egg1', 2, 2, 1.1);
  });

  it('returns stored colleggtibles with buffs', () => {
    const listStmt = [...statementMap.values()].find(s => s.sql.includes('SELECT identifier, name, icon_url'));

    listStmt.all.mockReturnValue([
      { identifier: 'egg1', name: 'Egg One', icon_url: 'https://example.test/icon.png' },
    ]);
    for (const stmt of statementMap.values()) {
      if (stmt.sql.includes('FROM colleggtible_buffs')) {
        stmt.all.mockReturnValue([
          { rewardslevel: 1, dimension: 1, value: 1.05 },
        ]);
      }
    }

    const rows = getStoredColleggtibles();
    expect(rows.length).toBe(1);
    expect(rows[0].buffs.length).toBe(1);
    expect(rows[0].buffs[0].rewardsLevel).toBe(1);
  });
});
