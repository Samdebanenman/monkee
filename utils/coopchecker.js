import {
  AUXBRAIN_ENDPOINTS,
  CLIENT_INFO,
  decodeAuthenticatedPayload,
  encodeProtoRequest,
  getProtoType,
  postAuxbrain,
} from './auxbrain.js';

const DEFAULT_USER_ID = process.env.EID;
const COOP_STATUS_ACCESS_CODE = process.env.COOP_STATUS_ACCESS_CODE;
const COOP_CODES = Object.freeze([
  ...Array.from({ length: 26 }, (_, index) => `${String.fromCodePoint(97 + index)}oo`),
  '-oo',
]);

async function postCoopStatus(contractIdentifier, coopCode) {
  const ContractCoopStatusRequest = await getProtoType('ei.ContractCoopStatusRequest');
  const ContractCoopStatusResponse = await getProtoType('ei.ContractCoopStatusResponse');

  const payload = ContractCoopStatusRequest.create({
    contractIdentifier,
    coopIdentifier: coopCode,
    userId: COOP_STATUS_ACCESS_CODE,
    clientTimestamp: Math.floor(Date.now() / 1000),
  });

  const requestBase64 = encodeProtoRequest(ContractCoopStatusRequest, payload);
  const response = await postAuxbrain(AUXBRAIN_ENDPOINTS.COOP_STATUS, requestBase64);
  const { messageBuffer } = await decodeAuthenticatedPayload(response.data, { decompress: false });
  return ContractCoopStatusResponse.decode(messageBuffer);
}

async function postQueryCoop(contractIdentifier, coopCode) {
  const QueryCoopRequest = await getProtoType('ei.QueryCoopRequest');
  const QueryCoopResponse = await getProtoType('ei.QueryCoopResponse');

  const rinfo = {
    clientVersion: CLIENT_INFO.RINFO_CLIENT_VERSION ?? CLIENT_INFO.CLIENT_VERSION,
    version: CLIENT_INFO.VERSION,
    build: CLIENT_INFO.BUILD,
    platform: CLIENT_INFO.PLATFORM,
  };

  if (DEFAULT_USER_ID) {
    rinfo.eiUserId = DEFAULT_USER_ID;
  }

  const payload = QueryCoopRequest.create({
    rinfo,
    contractIdentifier,
    coopIdentifier: coopCode,
    clientVersion: CLIENT_INFO.CLIENT_VERSION,
  });

  const requestBase64 = encodeProtoRequest(QueryCoopRequest, payload);
  const response = await postAuxbrain(AUXBRAIN_ENDPOINTS.QUERY_COOP, requestBase64);
  const { messageBuffer } = await decodeAuthenticatedPayload(response.data, { decompress: false });
  return QueryCoopResponse.decode(messageBuffer);
}

export async function checkCoop(contractIdentifier, coopCode) {
  try {
    const status = await postQueryCoop(contractIdentifier, coopCode);
    const exists = Boolean(status?.exists);
    return { coopCode, free: !exists };
  } catch (err) {
    return { coopCode, error: err?.message ?? String(err) };
  }
}

export async function checkAllFromContractID(contractIdentifier, coopCodes) {
  const codesToCheck = Array.isArray(coopCodes) && coopCodes.length > 0 ? coopCodes : COOP_CODES;
  const checks = codesToCheck.map(code => checkCoop(contractIdentifier, code));
  const results = await Promise.all(checks);

  const filteredResults = results
    .filter(result => !result.error && result.free)
    .map(result => result.coopCode);

  return { filteredResults, coopCodes: [...codesToCheck] };
}

export async function fetchCoopContributors(contractIdentifier, coopCode) {
  try {
    const status = await postCoopStatus(contractIdentifier, coopCode);
    const contributors = Array.isArray(status?.contributors) ? status.contributors : [];
    return contributors;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    error.contractIdentifier = contractIdentifier;
    error.coopCode = coopCode;
    throw error;
  }
}
