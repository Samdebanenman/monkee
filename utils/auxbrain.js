import axios from 'axios';
import protobuf from 'protobufjs';
import zlib from 'node:zlib';

export const PROTO_PATH = 'ei.proto';

export const AUXBRAIN_ENDPOINTS = {
  COOP_STATUS: 'https://www.auxbrain.com/ei/coop_status',
  GET_PERIODICALS: 'https://www.auxbrain.com/ei/get_periodicals',
};

export const AUXBRAIN_TIMEOUT_MS = 80_000;

export const CLIENT_INFO = {
  CLIENT_VERSION: 999,
  BUILD: '111313',
  VERSION: '1.35',
  PLATFORM: 'DROID',
  RINFO_CLIENT_VERSION: 70,
};

let cachedRoot = null;
const cachedTypes = new Map();
const cachedEnums = new Map();

export async function getProtoRoot() {
  if (cachedRoot) return cachedRoot;
  cachedRoot = await protobuf.load(PROTO_PATH);
  return cachedRoot;
}

export async function getProtoType(typeName) {
  if (cachedTypes.has(typeName)) return cachedTypes.get(typeName);
  const root = await getProtoRoot();
  const type = root.lookupType(typeName);
  cachedTypes.set(typeName, type);
  return type;
}

export async function getProtoEnum(enumName) {
  if (cachedEnums.has(enumName)) return cachedEnums.get(enumName);
  const root = await getProtoRoot();
  const enumValue = root.lookupEnum(enumName);
  cachedEnums.set(enumName, enumValue);
  return enumValue;
}

export function encodeProtoRequest(type, payload) {
  const errMsg = type.verify(payload);
  if (errMsg) {
    throw new Error(`Payload verify failed: ${errMsg}`);
  }
  const requestBuffer = type.encode(payload).finish();
  return Buffer.from(requestBuffer).toString('base64');
}

export async function postAuxbrain(endpoint, requestBase64, { timeout = AUXBRAIN_TIMEOUT_MS } = {}) {
  return axios.post(
    endpoint,
    { data: requestBase64 },
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'text',
      timeout,
    },
  );
}

export async function decodeAuthenticatedPayload(responseData, { decompress = true } = {}) {
  const AuthenticatedMessage = await getProtoType('ei.AuthenticatedMessage');
  const responseBuffer = Buffer.from(String(responseData ?? ''), 'base64');
  const authenticated = AuthenticatedMessage.decode(responseBuffer);
  const rawMessage = Buffer.from(authenticated?.message ?? []);
  const messageBuffer = authenticated?.compressed && decompress
    ? zlib.inflateSync(rawMessage)
    : rawMessage;
  return { authenticated, messageBuffer };
}
