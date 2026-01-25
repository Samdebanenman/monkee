import db from './client.js';

const upsertColeggtibleStmt = db.prepare(`
  INSERT INTO coleggtibles (
    identifier,
    name,
    icon_url
  )
  VALUES (?, ?, ?)
  ON CONFLICT(identifier) DO UPDATE SET
    name = excluded.name,
    icon_url = excluded.icon_url
`);

const deleteBuffsForEggStmt = db.prepare(`
  DELETE FROM coleggtible_buffs
  WHERE egg_identifier = ?
`);

const insertBuffStmt = db.prepare(`
  INSERT INTO coleggtible_buffs (
    egg_identifier,
    rewardslevel,
    dimension,
    value
  )
  VALUES (?, ?, ?, ?)
`);

const getAllColeggtiblesStmt = db.prepare(`
  SELECT identifier, name, icon_url
  FROM coleggtibles
  ORDER BY name ASC, identifier ASC
`);

const getBuffsForEggStmt = db.prepare(`
  SELECT rewardslevel, dimension, value
  FROM coleggtible_buffs
  WHERE egg_identifier = ?
  ORDER BY rewardslevel ASC
`);

function normalizeIdentifier(value) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function normalizeOptional(value) {
  return value == null ? null : String(value);
}

function toBuffValues(buff, rewardsLevel) {
  const dimension = Number.isFinite(buff.dimension) ? buff.dimension : null;
  const value = Number.isFinite(buff.value) ? buff.value : null;
  return { rewardsLevel, dimension, value };
}

function upsertColeggtibleRow(row) {
  const identifier = normalizeIdentifier(row.identifier);
  if (!identifier) return;

  const name = normalizeOptional(row.name);
  const iconUrl = normalizeOptional(row.iconUrl);
  const buffs = Array.isArray(row.buffs) ? row.buffs : [];

  upsertColeggtibleStmt.run(identifier, name, iconUrl);
  deleteBuffsForEggStmt.run(identifier);

  for (let index = 0; index < buffs.length; index += 1) {
    const buff = buffs[index] ?? {};
    const { rewardsLevel, dimension, value } = toBuffValues(buff, index + 1);
    insertBuffStmt.run(identifier, rewardsLevel, dimension, value);
  }
}

export function upsertColeggtibles(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const tx = db.transaction((items) => {
    for (const row of items) {
      upsertColeggtibleRow(row);
    }
  });

  tx(rows);
}

export function getStoredColeggtibles() {
  const rows = getAllColeggtiblesStmt.all() ?? [];
  return rows.map(row => ({
    identifier: row.identifier,
    name: row.name,
    iconUrl: row.icon_url,
    buffs: getBuffsForEggStmt.all(row.identifier).map(buff => ({
      rewardsLevel: buff.rewardslevel,
      dimension: buff.dimension,
      value: buff.value,
    })),
  }));
}

export default {
  upsertColeggtibles,
  getStoredColeggtibles,
};
