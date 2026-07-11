import axios from 'axios';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PROTO_PATH = path.join(__dirname, '..', '..', 'ei.proto');
const BOT_FIRST_CONTACT_ENDPOINT = '/ei/bot_first_contact';
const AUXBRAIN_BASE_URLS = Object.freeze([
  'https://ctx-dot-auxbrainhome.appspot.com',
  'https://www.auxbrain.com',
]);

const FIRST_CONTACT_CLIENT = Object.freeze({
  CLIENT_VERSION: 72,
  VERSION: '1.35.7',
  BUILD: '111343',
  PLATFORM: 1,
  PLATFORM_STRING: 'IOS',
  BOT_NAME: 'monkee-inventory-visualiser',
});

const DEFAULT_TIMEOUT_MS = 80_000;
const protoRootCache = new Map();
const protoTypeCache = new Map();

export class UserBackupEmptyError extends Error {
  constructor() {
    super('Backup was empty or unavailable');
    this.name = 'UserBackupEmptyError';
  }
}

const PLAYER_ID_PATTERN = /^EI\d{16}$/;

export function isValidPlayerId(playerId) {
  return PLAYER_ID_PATTERN.test(String(playerId ?? '').trim());
}

async function getProtoRoot(protoPath = DEFAULT_PROTO_PATH) {
  const resolved = path.resolve(protoPath);
  if (!protoRootCache.has(resolved)) {
    protoRootCache.set(resolved, protobuf.load(resolved));
  }
  return protoRootCache.get(resolved);
}

async function getProtoType(typeName, protoPath = DEFAULT_PROTO_PATH) {
  const resolved = path.resolve(protoPath);
  const cacheKey = `${resolved}:${typeName}`;
  if (protoTypeCache.has(cacheKey)) {
    return protoTypeCache.get(cacheKey);
  }

  const root = await getProtoRoot(resolved);
  const type = root.lookupType(typeName);
  protoTypeCache.set(cacheKey, type);
  return type;
}

function encodeProtoRequest(type, payload) {
  const error = type.verify(payload);
  if (error) {
    throw new Error(`Payload verify failed: ${error}`);
  }

  return Buffer.from(type.encode(payload).finish()).toString('base64');
}

function buildBasicRequestInfo(eiUserId = '') {
  return {
    eiUserId,
    clientVersion: FIRST_CONTACT_CLIENT.CLIENT_VERSION,
    version: FIRST_CONTACT_CLIENT.VERSION,
    build: FIRST_CONTACT_CLIENT.BUILD,
    platform: FIRST_CONTACT_CLIENT.PLATFORM_STRING,
  };
}

function buildAuxbrainUrl(baseUrl, endpoint) {
  return `${baseUrl}${endpoint}`;
}

async function postAuxbrain(endpoint, requestBase64, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const form = new URLSearchParams({ data: requestBase64 });
  let lastError = null;

  for (const baseUrl of AUXBRAIN_BASE_URLS) {
    const url = buildAuxbrainUrl(baseUrl, endpoint);
    try {
      return await axios.post(url, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        responseType: 'text',
        timeout,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export async function fetchBackupData(playerId, options = {}) {
  const {
    protoPath = DEFAULT_PROTO_PATH,
    timeout = DEFAULT_TIMEOUT_MS,
    botName = FIRST_CONTACT_CLIENT.BOT_NAME,
  } = options;

  const normalizedPlayerId = String(playerId ?? '').trim();
  if (!isValidPlayerId(normalizedPlayerId)) {
    throw new Error('EID must be EI followed by 16 digits');
  }
  const EggIncFirstContactRequest = await getProtoType('ei.EggIncFirstContactRequest', protoPath);
  const EggIncFirstContactResponse = await getProtoType('ei.EggIncFirstContactResponse', protoPath);

  const payload = EggIncFirstContactRequest.create({
    rinfo: buildBasicRequestInfo(''),
    eiUserId: normalizedPlayerId,
    deviceId: botName,
    clientVersion: FIRST_CONTACT_CLIENT.CLIENT_VERSION,
    platform: FIRST_CONTACT_CLIENT.PLATFORM,
  });

  const requestBase64 = encodeProtoRequest(EggIncFirstContactRequest, payload);
  const response = await postAuxbrain(BOT_FIRST_CONTACT_ENDPOINT, requestBase64, { timeout });
  const responseBuffer = Buffer.from(String(response.data ?? ''), 'base64');
  const decoded = EggIncFirstContactResponse.decode(responseBuffer);

  if (decoded?.errorCode && decoded.errorCode !== 0) {
    const serverMessage = decoded.errorMessage ? `: ${decoded.errorMessage}` : '';
    throw new Error(`First contact failed (${decoded.errorCode})${serverMessage}`);
  }

  if (!decoded?.backup || !decoded.backup.game) {
    throw new UserBackupEmptyError();
  }

  return {
    playerId: normalizedPlayerId,
    response: decoded,
    backup: decoded.backup,
  };
}
