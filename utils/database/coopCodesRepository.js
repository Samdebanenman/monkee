import './schema.js';
import db from './client.js';

const insertStmt = db.prepare('INSERT INTO extended_coop_codes (prefix) VALUES (?) ON CONFLICT(prefix) DO NOTHING');
const deleteStmt = db.prepare('DELETE FROM extended_coop_codes WHERE prefix = ?');
const listStmt = db.prepare('SELECT prefix FROM extended_coop_codes ORDER BY prefix');

export function addExtendedCoopPrefix(prefix) {
  return insertStmt.run(prefix).changes > 0;
}

export function removeExtendedCoopPrefix(prefix) {
  return deleteStmt.run(prefix).changes > 0;
}

export function listExtendedCoopPrefixes() {
  return listStmt.all().map(row => row.prefix);
}
