export function buildCoopUrl(contractId, coopId) {
  const contract = String(contractId ?? '').trim();
  const coop = String(coopId ?? '').trim();
  return `https://eicoop-carpet.netlify.app/${encodeURIComponent(contract)}/${encodeURIComponent(coop)}`;
}

export default { buildCoopUrl };
