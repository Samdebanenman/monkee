import db from './client.js';
import { normalizeDiscordId } from './membersRepository.js';

const getContractHistoryForMemberStmt = db.prepare(`
  WITH RECURSIVE
  ancestors(internal_id, discord_id, main_id) AS (
    SELECT internal_id, discord_id, main_id
    FROM members
    WHERE discord_id = ?
    UNION
    SELECT parent.internal_id, parent.discord_id, parent.main_id
    FROM members parent
    JOIN ancestors child ON parent.internal_id = child.main_id
  ),
  root(internal_id, discord_id) AS (
    SELECT internal_id, discord_id
    FROM ancestors
    WHERE main_id IS NULL
    LIMIT 1
  ),
  family(internal_id, discord_id, is_main) AS (
    SELECT internal_id, discord_id, 1
    FROM root
    UNION
    SELECT child.internal_id, child.discord_id, 0
    FROM members child
    JOIN family parent ON child.main_id = parent.internal_id
  )
  SELECT
    c.id AS coop_internal_id,
    c.contract AS contract_id,
    c.coop AS coop_id,
    NULLIF(TRIM(k.egg), '') AS egg,
    COALESCE(NULLIF(c.created_at, 0), NULLIF(k.release, 0), 0) AS release,
    NULLIF(TRIM(k.season), '') AS season,
    MAX(CASE WHEN f.is_main = 1 THEN 1 ELSE 0 END) AS main_participated,
    MAX(CASE WHEN f.is_main = 0 THEN 1 ELSE 0 END) AS alt_participated
  FROM family f
  JOIN member_coops mc ON mc.member_id = f.internal_id
  JOIN coops c ON c.id = mc.coop_id
  LEFT JOIN contracts k ON k.contract_id = c.contract
  WHERE (? IS NULL OR COALESCE(NULLIF(c.created_at, 0), NULLIF(k.release, 0), 0) >= ?)
    AND (? IS NULL OR COALESCE(NULLIF(c.created_at, 0), NULLIF(k.release, 0), 0) < ?)
    AND (? = 0 OR NULLIF(TRIM(COALESCE(k.season, '')), '') IS NOT NULL)
    AND (? IS NULL OR k.season = ?)
  GROUP BY
    c.id,
    c.contract,
    c.coop,
    NULLIF(TRIM(k.egg), ''),
    COALESCE(NULLIF(c.created_at, 0), NULLIF(k.release, 0), 0),
    NULLIF(TRIM(k.season), '')
  ORDER BY release DESC, contract_id ASC, coop_id ASC
`);

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

export function getContractHistoryForMember(
  discordId,
  {
    releasedAfter = null,
    releasedBefore = null,
    seasonalOnly = false,
    season = null,
  } = {},
) {
  const normalizedDiscordId = normalizeDiscordId(discordId);
  if (!normalizedDiscordId) return [];

  const after = Number.isFinite(releasedAfter) ? Math.floor(releasedAfter) : null;
  const before = Number.isFinite(releasedBefore) ? Math.floor(releasedBefore) : null;
  const normalizedSeason = normalizeText(season) || null;

  return getContractHistoryForMemberStmt
    .all(
      normalizedDiscordId,
      after,
      after,
      before,
      before,
      seasonalOnly ? 1 : 0,
      normalizedSeason,
      normalizedSeason,
    )
    .map(row => ({
      contractId: normalizeText(row.contract_id),
      coopId: normalizeText(row.coop_id),
      egg: normalizeText(row.egg) || null,
      release: Number(row.release) || 0,
      season: normalizeText(row.season) || null,
      isAltOnly: Number(row.alt_participated) === 1 && Number(row.main_participated) !== 1,
    }));
}

export default { getContractHistoryForMember };
