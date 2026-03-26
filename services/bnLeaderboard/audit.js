import { getArray, getValue, toNumber } from './common.js';

const REQUIRED_RESEARCH_LEVELS = new Map([
  ['comfy_nests', 50],
  ['hab_capacity1', 8],
  ['leafsprings', 30],
  ['vehicle_reliablity', 2],
  ['hen_house_ac', 50],
  ['microlux', 10],
  ['lightweight_boxes', 40],
  ['excoskeletons', 2],
  ['improved_genetics', 30],
  ['traffic_management', 2],
  ['driver_training', 30],
  ['egg_loading_bots', 2],
  ['super_alloy', 50],
  ['quantum_storage', 20],
  ['time_compress', 20],
  ['hover_upgrades', 25],
  ['grav_plating', 25],
  ['autonomous_vehicles', 5],
  ['dark_containment', 25],
  ['timeline_diversion', 50],
  ['wormhole_dampening', 25],
  ['micro_coupling', 5],
  ['neural_net_refine', 25],
  ['hyper_portalling', 25],
  ['relativity_optimization', 10],
]);

function auditResearchLevels(commonResearch) {
  const levels = new Map();
  for (const item of commonResearch) {
    const id = String(item?.id ?? '').trim();
    const level = toNumber(item?.level);
    if (!id || level == null) continue;
    levels.set(id, level);
  }

  for (const [id, level] of REQUIRED_RESEARCH_LEVELS.entries()) {
    if (levels.get(id) !== level) return false;
  }

  return true;
}

export class BnLeaderboardAuditService {
  constructor({ artifactsService }) {
    this.artifactsService = artifactsService;
  }

  auditContributor(contributor) {
    const productionParams = contributor?.productionParams ?? contributor?.production_params ?? {};
    const farmInfo = contributor?.farmInfo ?? contributor?.farm_info ?? {};
    const failures = [];

    const farmPopulation = getValue(productionParams, 'farmPopulation', 'farm_population');
    const farmCapacity = getValue(productionParams, 'farmCapacity', 'farm_capacity');
    if (farmPopulation == null || farmCapacity == null || farmPopulation !== farmCapacity) {
      failures.push('full habs');
    }

    const habs = getArray(farmInfo, 'habs', 'habs');
    if (habs.length !== 4 || habs.some(hab => Number(hab) !== 18)) {
      failures.push('habs');
    }

    const vehicles = getArray(farmInfo, 'vehicles', 'vehicles');
    const trainLength = getArray(farmInfo, 'trainLength', 'train_length');
    if (vehicles.length !== 17 || vehicles.some(vehicle => Number(vehicle) !== 11)
      || trainLength.length !== 17 || trainLength.some(length => Number(length) !== 10)) {
      failures.push('vehicles');
    }

    const silosOwned = getValue(farmInfo, 'silosOwned', 'silos_owned');
    if (silosOwned !== 10) {
      failures.push('silos');
    }

    const commonResearch = getArray(farmInfo, 'commonResearch', 'common_research');
    if (!auditResearchLevels(commonResearch)) {
      failures.push('research');
    }

    const equippedArtifacts = getArray(farmInfo, 'equippedArtifacts', 'equipped_artifacts');
    if (!this.artifactsService.auditArtifacts(equippedArtifacts)) {
      failures.push('artifacts');
    }

    const stoneFailure = this.artifactsService.auditStoneSetup(productionParams, equippedArtifacts);
    if (stoneFailure) {
      failures.push('stones');
    }

    return failures;
  }

  collectAuditFailures(contributors) {
    if (!Array.isArray(contributors) || contributors.length === 0) {
      return [{ contributor: 'unknown', reasons: ['no contributors'] }];
    }

    const details = [];
    for (const contributor of contributors) {
      const contributorName = String(contributor?.userName ?? contributor?.user_name ?? 'unknown').trim() || 'unknown';
      const reasons = this.auditContributor(contributor);
      if (reasons.length > 0) {
        details.push({ contributor: contributorName, reasons });
      }
    }

    return details;
  }
}
