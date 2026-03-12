import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction } from './helpers.js';

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
}));

vi.mock('../../../utils/database/coleggtiblesRepository.js', () => ({
  getStoredColeggtibles: vi.fn(() => []),
}));

vi.mock('../../../services/discord.js', () => ({
  createTextComponentMessage: vi.fn((content, options) => ({ content, ...options })),
}));

vi.mock('../../../sim-core/src/predictmaxcs/model.js', () => ({
  getAssumptions: vi.fn((teValues = [100]) => ({ te: 100, teValues })),
}));

vi.mock('../../../services/simQueue.js', () => ({
  enqueueSimulationJob: vi.fn(async () => {}),
}));

import { execute, autocomplete } from '../../../commands/predictmaxcs.js';
import { fetchContractSummaries } from '../../../services/contractService.js';
import { createTextComponentMessage } from '../../../services/discord.js';
import { enqueueSimulationJob } from '../../../services/simQueue.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const createOptions = ({ contract = 'c1', tokenSpeed = 5, te = null, gg = null, siab = null, focused = '' } = {}) => ({
  getString: (name) => {
    if (name === 'contract') return contract;
    if (name === 'te') return te;
    return null;
  },
  getNumber: (name) => {
    if (name === 'token_speed') return tokenSpeed;
    return null;
  },
  getBoolean: (name) => {
    if (name === 'gg') return gg;
    if (name === 'siab') return siab;
    return null;
  },
  getFocused: () => focused,
});

describe('commands/predictmaxcs', () => {
  it('replies when contract is unknown', async () => {
    fetchContractSummaries.mockResolvedValue([]);
    const interaction = createInteraction({ options: createOptions({ contract: 'missing' }) });

    await execute(interaction);

    expect(createTextComponentMessage).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('replies when token speed is invalid', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ tokenSpeed: -1 }) });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });

  it('queues a job for valid input', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 2, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ gg: true, te: '120', siab: false }) });

    await execute(interaction);

    expect(enqueueSimulationJob).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('rejects TE lists that do not match player count', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'Test', maxCoopSize: 3, coopDurationSeconds: 3600, eggGoal: 1000, minutesPerToken: 4 },
    ]);
    const interaction = createInteraction({ options: createOptions({ te: '100,200' }) });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
  });

  it('filters autocomplete suggestions', async () => {
    fetchContractSummaries.mockResolvedValue([
      { id: 'c1', name: 'First' },
      { id: 'c2', name: 'Second' },
    ]);

    const interaction = createInteraction({ options: createOptions({ focused: 'first' }) });
    interaction.respond = vi.fn(async () => {});

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalled();
    const results = interaction.respond.mock.calls[0][0];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe('c1');
  });
});

