import db from './client.js';

const listEmptyCoopsStmt = db.prepare(`
  SELECT
    c.contract,
    c.coop,
    k.max_coop_size
  FROM coops c
  LEFT JOIN member_coops mc ON mc.coop_id = c.id
  LEFT JOIN contracts k ON k.contract_id = c.contract
  GROUP BY c.id, c.contract, c.coop, k.max_coop_size
  HAVING COUNT(mc.member_id) = 0
  ORDER BY c.contract ASC, c.coop ASC
`);

const countCoopMembersStmt = db.prepare(`
  SELECT COUNT(mc.member_id) AS member_count
  FROM coops c
  LEFT JOIN member_coops mc ON mc.coop_id = c.id
  WHERE c.contract = ? AND c.coop = ?
  GROUP BY c.id
`);

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeMaxCoopSize(value) {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? size : null;
}

export function listEmptyCoops() {
  return listEmptyCoopsStmt.all().map(row => ({
    contractId: normalizeText(row.contract),
    coopId: normalizeText(row.coop),
    maxCoopSize: normalizeMaxCoopSize(row.max_coop_size),
  }));
}

export function countCoopMembers(contractId, coopId) {
  const contract = normalizeText(contractId);
  const coop = normalizeText(coopId);
  if (!contract || !coop) return 0;

  const row = countCoopMembersStmt.get(contract, coop);
  return Number(row?.member_count) || 0;
}

export default { listEmptyCoops, countCoopMembers };
