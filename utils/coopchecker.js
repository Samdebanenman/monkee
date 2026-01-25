import {
  AUXBRAIN_ENDPOINTS,
  decodeAuthenticatedPayload,
  encodeProtoRequest,
  getProtoType,
  postAuxbrain,
} from './auxbrain.js';

const DEFAULT_USER_ID = process.env.EID;
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
    userId: DEFAULT_USER_ID,
  });

  const requestBase64 = encodeProtoRequest(ContractCoopStatusRequest, payload);
  const response = await postAuxbrain(AUXBRAIN_ENDPOINTS.COOP_STATUS, requestBase64);
  const { messageBuffer } = await decodeAuthenticatedPayload(response.data, { decompress: false });
  return ContractCoopStatusResponse.decode(messageBuffer);
}

export async function checkCoop(contractIdentifier, coopCode) {
  try {
    const status = await postCoopStatus(contractIdentifier, coopCode);
    const isCreated = Object.hasOwn(status, 'totalAmount');
    return { coopCode, free: !isCreated };
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
