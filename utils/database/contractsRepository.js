import db from './client.js';

const upsertContractStmt = db.prepare(`
  INSERT INTO contracts (
    contract_id,
    name,
    release,
    season,
    egg,
    max_coop_size,
    coop_duration_seconds,
    egg_goal,
    minutes_per_token,
    modifier_type,
    modifier_value,
    grade_specs_json
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(contract_id) DO UPDATE SET
    name = excluded.name,
    release = excluded.release,
    season = excluded.season,
    egg = excluded.egg,
    max_coop_size = excluded.max_coop_size,
    coop_duration_seconds = excluded.coop_duration_seconds,
    egg_goal = excluded.egg_goal,
    minutes_per_token = excluded.minutes_per_token,
    modifier_type = excluded.modifier_type,
    modifier_value = excluded.modifier_value,
    grade_specs_json = excluded.grade_specs_json
`);

const getAllContractsStmt = db.prepare(`
  SELECT
    contract_id AS id,
    name,
    season,
    egg,
    release,
    max_coop_size,
    coop_duration_seconds,
    egg_goal,
    minutes_per_token,
    modifier_type,
    modifier_value,
    grade_specs_json
  FROM contracts
  ORDER BY release DESC
`);

const getContractReleaseStmt = db.prepare('SELECT release FROM contracts WHERE contract_id = ?');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function normalizeOptional(value) {
  return value == null ? null : String(value);
}

function toNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function serializeGradeSpecs(value) {
  if (!Array.isArray(value)) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseGradeSpecs(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function upsertContractRow(row) {
  const id = normalizeId(row.id);
  if (!id) return;

  const name = normalizeOptional(row.name);
  const release = typeof row.release === 'number' ? row.release : 0;
  const season = normalizeOptional(row.season);
  const egg = normalizeOptional(row.egg);
  const maxCoopSize = toNumberOrNull(row.maxCoopSize);
  const coopDurationSeconds = toNumberOrNull(row.coopDurationSeconds);
  const eggGoal = toNumberOrNull(row.eggGoal);
  const minutesPerToken = toNumberOrNull(row.minutesPerToken);
  const modifierType = normalizeOptional(row.modifierType);
  const modifierValue = toNumberOrNull(row.modifierValue);
  const gradeSpecsJson = serializeGradeSpecs(row.gradeSpecs);

  upsertContractStmt.run(
    id,
    name,
    release,
    season,
    egg,
    maxCoopSize,
    coopDurationSeconds,
    eggGoal,
    minutesPerToken,
    modifierType,
    modifierValue,
    gradeSpecsJson
  );
}
const getContractByIdStmt = db.prepare('SELECT * FROM contracts WHERE contract_id = ?');

const getContractSizeStmt = db.prepare('SELECT max_coop_size FROM contracts WHERE contract_id = ?');

export function upsertContracts(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const tx = db.transaction((items) => {
    for (const row of items) {
      upsertContractRow(row);
    }
  });

  tx(rows);
}

export function getStoredContracts() {
  const rows = getAllContractsStmt.all() ?? [];
  return rows
    .map(({
      id,
      name,
      season,
      egg,
      release,
      max_coop_size,
      coop_duration_seconds,
      egg_goal,
      minutes_per_token,
      modifier_type,
      modifier_value,
      grade_specs_json,
    }) => ({
      id,
      name,
      season,
      egg,
      release,
      maxCoopSize: max_coop_size,
      coopDurationSeconds: coop_duration_seconds,
      eggGoal: egg_goal,
      minutesPerToken: minutes_per_token,
      modifierType: modifier_type,
      modifierValue: modifier_value,
      gradeSpecs: parseGradeSpecs(grade_specs_json),
    }));
}

export function getContractRelease(contractId) {
  if (!contractId) return null;
  const row = getContractReleaseStmt.get(String(contractId).trim());
  return row ? row.release : null;
}

export function getContractById(contractId) {
  if (!contractId) return null;
  const row = getContractByIdStmt.get(String(contractId).trim());
  return row ? row : null;
}

export function getContractSize(contractId) {
  if (!contractId) return null;
  const row = getContractSizeStmt.get(String(contractId).trim());
  return row ? row.max_coop_size : null;
}
