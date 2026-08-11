import db from './client.js';

const listIncompleteCoopsStmt = db.prepare(`
  SELECT
    c.contract,
    c.coop,
    COUNT(mc.member_id) AS player_count,
    k.max_coop_size
  FROM coops c
  JOIN contracts k ON k.contract_id = c.contract
  LEFT JOIN member_coops mc ON mc.coop_id = c.id
  WHERE k.max_coop_size IS NOT NULL
    AND k.max_coop_size > 0
  GROUP BY c.id, c.contract, c.coop, k.max_coop_size
  HAVING COUNT(mc.member_id) < k.max_coop_size
  ORDER BY c.contract ASC, c.coop ASC
`);

export function listIncompleteCoops() {
  return listIncompleteCoopsStmt.all().map(row => ({
    contractId: String(row.contract).trim(),
    coopId: String(row.coop).trim(),
    playerCount: Number(row.player_count) || 0,
    maxPlayers: Number(row.max_coop_size),
  }));
}

export default { listIncompleteCoops };
