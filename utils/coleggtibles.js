import {
  AUXBRAIN_ENDPOINTS,
  CLIENT_INFO,
  decodeAuthenticatedPayload,
  encodeProtoRequest,
  getProtoType,
  postAuxbrain,
} from './auxbrain.js';
import { upsertColeggtibles } from './database/index.js';

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

  const GetPeriodicalsRequest = await getProtoType('ei.GetPeriodicalsRequest');
  const PeriodicalsResponse = await getProtoType('ei.PeriodicalsResponse');

  const payload = GetPeriodicalsRequest.create({
    userId,
    currentClientVersion: CLIENT_INFO.CLIENT_VERSION,
    contractsUnlocked: true,
    artifactsUnlocked: true,
    rinfo: {
      eiUserId: userId,
      clientVersion: CLIENT_INFO.RINFO_CLIENT_VERSION,
      version: CLIENT_INFO.VERSION,
      build: CLIENT_INFO.BUILD,
      platform: CLIENT_INFO.PLATFORM,
    },
  });

  const requestBase64 = encodeProtoRequest(GetPeriodicalsRequest, payload);
  const response = await postAuxbrain(AUXBRAIN_ENDPOINTS.GET_PERIODICALS, requestBase64);
  const { messageBuffer } = await decodeAuthenticatedPayload(response.data, { decompress: true });
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
