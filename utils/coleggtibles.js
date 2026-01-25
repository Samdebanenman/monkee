import axios from 'axios';
import protobuf from 'protobufjs';
import zlib from 'node:zlib';
import { upsertColeggtibles } from './database/index.js';

const PROTO_PATH = './ei.proto';
const PERIODICALS_ENDPOINT = 'https://www.auxbrain.com/ei/get_periodicals';
const REQUEST_TIMEOUT_MS = 80_000;

const REQUEST_CLIENT_VERSION = 999;
const REQUEST_BUILD = '111313';
const REQUEST_VERSION = '1.35';
const REQUEST_PLATFORM = 'DROID';
const REQUEST_RINFO_CLIENT_VERSION = 70;

let cachedProto = null;

async function loadProtoTypes() {
  if (cachedProto) return cachedProto;
  const root = await protobuf.load(PROTO_PATH);
  cachedProto = {
    GetPeriodicalsRequest: root.lookupType('ei.GetPeriodicalsRequest'),
    AuthenticatedMessage: root.lookupType('ei.AuthenticatedMessage'),
    PeriodicalsResponse: root.lookupType('ei.PeriodicalsResponse'),
  };
  return cachedProto;
}

function mapBuffs(buffs = []) {
  if (!Array.isArray(buffs)) return [];
  return buffs
    .map(buff => ({
      dimension: Number.isFinite(buff?.dimension) ? buff.dimension : null,
      value: Number.isFinite(buff?.value) ? buff.value : null,
    }))
    .filter(buff => buff.dimension !== null || buff.value !== null);
}

function mapCustomEgg(egg) {
  if (!egg) return null;
  const identifier = egg.identifier ? String(egg.identifier).trim() : '';
  if (!identifier) return null;

  return {
    identifier,
    name: egg.name == null ? null : String(egg.name),
    iconUrl: egg.icon?.url ? String(egg.icon.url) : null,
    buffs: mapBuffs(egg.buffs),
  };
}

async function fetchPeriodicalsResponse() {
  const userId = process.env.EID;
  if (!userId) {
    throw new Error('EID is not set');
  }

  const { GetPeriodicalsRequest, AuthenticatedMessage, PeriodicalsResponse } = await loadProtoTypes();

  const payload = GetPeriodicalsRequest.create({
    userId,
    currentClientVersion: REQUEST_CLIENT_VERSION,
    contractsUnlocked: true,
    artifactsUnlocked: true,
    rinfo: {
      eiUserId: userId,
      clientVersion: REQUEST_RINFO_CLIENT_VERSION,
      version: REQUEST_VERSION,
      build: REQUEST_BUILD,
      platform: REQUEST_PLATFORM,
    },
  });

  const errMsg = GetPeriodicalsRequest.verify(payload);
  if (errMsg) {
    throw new Error(`Payload verify failed: ${errMsg}`);
  }

  const requestBuffer = GetPeriodicalsRequest.encode(payload).finish();
  const requestBase64 = Buffer.from(requestBuffer).toString('base64');

  const response = await axios.post(
    PERIODICALS_ENDPOINT,
    { data: requestBase64 },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'text',
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  const responseBuffer = Buffer.from(String(response.data), 'base64');
  const authenticated = AuthenticatedMessage.decode(responseBuffer);
  const messageBuffer = authenticated?.compressed
    ? zlib.inflateSync(Buffer.from(authenticated.message ?? []))
    : Buffer.from(authenticated.message ?? []);
  return PeriodicalsResponse.decode(messageBuffer);
}

export async function fetchAndCacheColeggtibles() {
  const periodicals = await fetchPeriodicalsResponse();
  const contracts = periodicals?.contracts ?? null;
  const customEggs = contracts?.customEggs ?? contracts?.custom_eggs ?? [];

  if (!Array.isArray(customEggs) || customEggs.length === 0) {
    return [];
  }

  const rows = customEggs
    .map(mapCustomEgg)
    .filter(Boolean);

  upsertColeggtibles(rows);
  return rows;
}

export default {
  fetchAndCacheColeggtibles,
};
