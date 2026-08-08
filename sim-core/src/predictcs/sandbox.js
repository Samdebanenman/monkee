import {
  COMPASS_OPTIONS,
  DEFLECTOR_OPTIONS,
  GUSSET_OPTIONS,
  IHR_CHALICE_OPTIONS,
  IHR_DEFLECTOR_OPTIONS,
  IHR_MONOCLE_OPTIONS,
  IHR_SIAB_OPTIONS,
  METRO_OPTIONS,
  DEFAULT_COMPASS,
  DEFAULT_DEFLECTOR,
  DEFAULT_GUSSET,
  DEFAULT_IHR_CHALICE,
  DEFAULT_IHR_DEFLECTOR,
  DEFAULT_IHR_MONOCLE,
  DEFAULT_IHR_SIAB,
  DEFAULT_METRO,
} from './artifacts.js';

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SUPPORTED_VERSIONS = new Set(['v_1', 'v_2', 'v_3', 'v_4', 'v_5']);
const DURATION_MULTIPLIERS = [60 * 60 * 24, 60 * 60, 60, 1];
const EGG_MULTIPLIERS = [1e15, 1e18, 1e12];

function base62Decode(value) {
  let result = 0n;
  for (const char of String(value ?? '')) {
    const index = BASE62_CHARS.indexOf(char);
    if (index < 0) return null;
    result = result * 62n + BigInt(index);
  }
  return result;
}

function unchunk16(encoded) {
  const raw = String(encoded ?? '');
  if (!raw) return null;
  if (raw.length < 10) {
    const decoded = base62Decode(raw);
    return decoded == null ? null : decoded.toString();
  }

  const len = 9;
  const n = Math.floor(raw.length / len);
  let output = '';

  for (let i = 0; i < n; i += 1) {
    const chunk = raw.slice(i * len, len + i * len);
    const decoded = base62Decode(chunk);
    if (decoded == null) return null;
    output += decoded.toString().slice(1);
  }

  const tail = raw.slice(n * len);
  if (tail) {
    const decoded = base62Decode(tail);
    if (decoded == null) return null;
    output += decoded.toString().slice(1);
  }

  return output;
}

function decodeSandboxPayload(raw) {
  const payload = String(raw ?? '').trim();
  if (!payload) return null;

  let dataString = payload;
  try {
    const url = new URL(payload);
    dataString = url.searchParams.get('data') ?? payload;
  } catch {
    // not a URL; assume raw data string
  }

  if (!dataString) return null;

  const version = dataString.slice(0, 3);
  if (!SUPPORTED_VERSIONS.has(version)) return null;

  const body = dataString.slice(3);
  const [dataB64, data2] = body.split('=');
  if (!dataB64 || !data2) return null;

  let decodedData;
  try {
    decodedData = decodeURIComponent(Buffer.from(dataB64, 'base64').toString('utf8'));
  } catch {
    return null;
  }

  return { version, decodedData, data2 };
}

function parseSandboxNumber(value) {
  const raw = String(value ?? '').replace('p', '.');
  const number = Number(raw);
  return Number.isFinite(number) ? number : 0;
}

function parseIndex(value) {
  const num = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(num) ? num : null;
}

function pickOption(options, index, fallbackName) {
  const fallback = options.find(option => option.name === fallbackName) ?? options[0];
  const picked = Number.isInteger(index) ? options[index] : null;
  return picked ?? fallback;
}

function readTwoDigits(buffer, offset) {
  if (offset + 1 >= buffer.length) return null;
  const value = Number.parseInt(`${buffer[offset]}${buffer[offset + 1]}`, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseSandboxUrl(raw) {
  const decoded = decodeSandboxPayload(raw);
  if (!decoded) {
    return { error: 'Invalid sandbox URL or data payload.' };
  }

  const { version, decodedData, data2 } = decoded;
  const normalizedVersion = version.replace('_', '-');
  const usesCompressedPlayers = version.includes('_');
  const dataParts = String(decodedData).split('-');
  const dataOffset = usesCompressedPlayers ? 1 : 0;
  const singleStr = String(dataParts[dataOffset] ?? '').split('');
  const numPlayers = Number.parseInt(dataParts[dataOffset + 7] ?? '', 10);

  if (!Number.isFinite(numPlayers) || numPlayers <= 0) {
    return { error: 'Invalid player count in sandbox data.' };
  }

  const expanded = unchunk16(data2);
  if (!expanded || expanded.length < 2) {
    return { error: 'Invalid player artifact data.' };
  }

  const flagsAndArtifacts = expanded.slice(1).split('');

  let dataIndex = dataOffset + 8;
  if (normalizedVersion !== 'v-1') {
    dataIndex += 1; // btvTarget
  }

  const playerGroups = [];
  const playerTe = [];

  if (usesCompressedPlayers) {
    let playersInGroups = 0;
    while (playersInGroups < numPlayers) {
      const count = parseIndex(dataParts[dataIndex]);
      if (!Number.isInteger(count) || count <= 0 || playersInGroups + count > numPlayers
        || dataIndex + 2 >= dataParts.length) {
        return { error: 'Invalid grouped player data.' };
      }

      const te = parseSandboxNumber(dataParts[dataIndex + 2]);
      playerGroups.push({ count, te });
      playerTe.push(...new Array(count).fill(te));
      playersInGroups += count;
      dataIndex += 3; // count + tokens + TE
    }
  } else {
    for (let i = 0; i < numPlayers; i += 1) {
      dataIndex += 1; // player name
      dataIndex += 1; // tokens

      let te = 0;
      if (normalizedVersion === 'v-4' || normalizedVersion === 'v-5') {
        te = parseSandboxNumber(dataParts[dataIndex]);
        dataIndex += 1;
      }

      playerGroups.push({ count: 1, te });
      playerTe.push(te);
    }
  }

  let flagIndex = 0;
  const playerArtifacts = [];
  const playerIhrArtifacts = [];

  for (const group of playerGroups) {
    flagIndex += 2; // mirror + shipping
    if (normalizedVersion !== 'v-1') {
      flagIndex += 1; // sink
      if (normalizedVersion !== 'v-2') {
        flagIndex += 1; // creator
      }
    }

    const metroIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const compassIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const gussetIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const deflectorIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;

    const chaliceIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const monocleIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const ihrDeflectorIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;
    const siabIndex = readTwoDigits(flagsAndArtifacts, flagIndex);
    flagIndex += 2;

    const artifacts = {
      deflector: pickOption(DEFLECTOR_OPTIONS, deflectorIndex, DEFAULT_DEFLECTOR),
      metro: pickOption(METRO_OPTIONS, metroIndex, DEFAULT_METRO),
      compass: pickOption(COMPASS_OPTIONS, compassIndex, DEFAULT_COMPASS),
      gusset: pickOption(GUSSET_OPTIONS, gussetIndex, DEFAULT_GUSSET),
    };

    const ihrArtifacts = {
      chalice: pickOption(IHR_CHALICE_OPTIONS, chaliceIndex, DEFAULT_IHR_CHALICE),
      monocle: pickOption(IHR_MONOCLE_OPTIONS, monocleIndex, DEFAULT_IHR_MONOCLE),
      deflector: pickOption(IHR_DEFLECTOR_OPTIONS, ihrDeflectorIndex, DEFAULT_IHR_DEFLECTOR),
      siab: pickOption(IHR_SIAB_OPTIONS, siabIndex, DEFAULT_IHR_SIAB),
    };

    for (let i = 0; i < group.count; i += 1) {
      playerArtifacts.push({ ...artifacts });
      playerIhrArtifacts.push({ ...ihrArtifacts });
    }
  }

  const durUnitIndex = parseIndex(singleStr[4]);
  const eggUnitIndex = parseIndex(singleStr[3]);
  const durationValue = parseSandboxNumber(dataParts[dataOffset + 3]);
  const targetValue = parseSandboxNumber(dataParts[dataOffset + 4]);
  const tokenTimerMinutes = parseSandboxNumber(dataParts[dataOffset + 5]);

  const durationMultiplier = Number.isFinite(durUnitIndex) ? DURATION_MULTIPLIERS[durUnitIndex] : null;
  const eggMultiplier = Number.isFinite(eggUnitIndex) ? EGG_MULTIPLIERS[eggUnitIndex] : null;

  const durationSeconds = Number.isFinite(durationMultiplier)
    ? durationValue * durationMultiplier
    : null;
  const targetEggs = Number.isFinite(eggMultiplier)
    ? targetValue * eggMultiplier
    : null;

  return {
    players: numPlayers,
    playerArtifacts,
    playerIhrArtifacts,
    playerTe,
    contractInfo: {
      durationSeconds,
      targetEggs,
      tokenTimerMinutes,
      players: numPlayers,
    },
  };
}
