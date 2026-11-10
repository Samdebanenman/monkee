import {
  addExtendedCoopPrefix,
  removeExtendedCoopPrefix,
  listExtendedCoopPrefixes,
} from '../utils/database/coopCodesRepository.js';

const COOP_CODE_PATTERN = /^[a-z][a-z0-9-]+oo$/;

function parseCode(input) {
  const code = String(input ?? '').trim();
  return COOP_CODE_PATTERN.test(code) ? code : null;
}

export function addExtendedCoopCode(input) {
  const code = parseCode(input);
  if (!code) return { ok: false, reason: 'invalid-code' };
  const added = addExtendedCoopPrefix(code.slice(0, -2));
  return { ok: added, code, reason: added ? undefined : 'already-exists' };
}

export function removeExtendedCoopCode(input) {
  const code = parseCode(input);
  if (!code) return { ok: false, reason: 'invalid-code' };
  const removed = removeExtendedCoopPrefix(code.slice(0, -2));
  return { ok: removed, code, reason: removed ? undefined : 'not-found' };
}

export function listExtendedCoopCodes() {
  return listExtendedCoopPrefixes().map(prefix => `${prefix}oo`);
}

export function includeExtendedCoopCodes(defaultCodes, searchlist = 'default') {
  return searchlist === 'extended'
    ? [...new Set([...defaultCodes, ...listExtendedCoopCodes()])]
    : defaultCodes;
}
