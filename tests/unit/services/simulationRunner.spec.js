import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../sim-core/src/predictmaxcs/simulation.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    simulateScenariosParallel: vi.fn(actual.simulateScenariosParallel),
  };
});

import { runPredictCs, runPredictMaxCs } from '../../../services/simulationRunner.js';
import { getAssumptions } from '../../../sim-core/src/predictmaxcs/model.js';
import { simulateScenariosParallel } from '../../../sim-core/src/predictmaxcs/simulation.js';

const createOptions = () => ({
  interaction: {
    editReply: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
  },
  contractLabel: 'Local simulation',
  players: 2,
  durationSeconds: 10,
  targetEggs: 1e12,
  tokenTimerMinutes: 5,
  giftMinutes: 5,
  gg: false,
  colleggtiblesRows: [],
  assumptions: getAssumptions([100, 100]),
  playerArtifacts: [{}, {}],
  playerIhrArtifacts: [{}, {}],
  playerTe: [100, 100],
  boostOrderMode: 'input',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('on-demand simulation runner', () => {
  it('runs PredictCS through every optimization phase and publishes its result before resolving', async () => {
    const options = createOptions();
    const model = await runPredictCs(options);

    expect(simulateScenariosParallel.mock.calls.map(([batch]) => batch.length)).toEqual([8, 8, 8, 1]);
    expect(model.tokensByPlayer).toHaveLength(2);
    expect(model.playerSummaries.summaries).toHaveLength(2);
    expect(options.interaction.editReply.mock.calls[0][0].content).toContain('(0/25)');
    const messages = options.interaction.editReply.mock.calls.map(([message]) => message);
    expect(messages.some(message => message.content?.includes('(25/25)'))).toBe(true);
    expect(messages.at(-1).embeds[0].data.title).toBe('PredictCS (Local simulation)');
  });

  it.each([
    [null, [16, 8, 8, 8, 8, 2], 50],
    [false, [16, 8, 8, 1], 33],
    [true, [16, 8, 8, 1], 33],
  ])('runs PredictMaxCS with SIAB override %s', async (siabOverride, batchSizes, total) => {
    const options = { ...createOptions(), siabOverride };
    const model = await runPredictMaxCs(options);

    expect(simulateScenariosParallel.mock.calls.map(([batch]) => batch.length)).toEqual(batchSizes);
    expect(model.tokensByPlayer).toHaveLength(2);
    expect(model.playerSummaries.summaries).toHaveLength(2);
    if (siabOverride !== null) expect(model.usePlayer1Siab).toBe(siabOverride);
    const messages = options.interaction.editReply.mock.calls.map(([message]) => message);
    expect(messages.some(message => message.content?.includes(`(${total}/${total})`))).toBe(true);
    expect(messages.at(-1).embeds[0].data.title).toBe('PredictMaxCS (Local simulation)');
  });

  it('keeps overlapping prediction calls and their replies independent', async () => {
    const first = { ...createOptions(), contractLabel: 'First', players: 1, playerArtifacts: [{}], playerTe: [100] };
    const second = { ...createOptions(), contractLabel: 'Second' };
    const [firstModel, secondModel] = await Promise.all([runPredictCs(first), runPredictCs(second)]);

    expect(firstModel.playerSummaries.summaries).toHaveLength(1);
    expect(secondModel.playerSummaries.summaries).toHaveLength(2);
    expect(first.interaction.editReply.mock.lastCall[0].embeds[0].data.title).toBe('PredictCS (First)');
    expect(second.interaction.editReply.mock.lastCall[0].embeds[0].data.title).toBe('PredictCS (Second)');
  });

  it('propagates simulation failures to the command without publishing a result', async () => {
    const options = createOptions();
    simulateScenariosParallel.mockRejectedValueOnce(new Error('Worker failed'));

    await expect(runPredictCs(options)).rejects.toThrow('Worker failed');
    expect(simulateScenariosParallel).toHaveBeenCalledTimes(1);
    expect(options.interaction.editReply.mock.calls.every(([message]) => !message.embeds)).toBe(true);
    expect(options.interaction.followUp).not.toHaveBeenCalled();
  });
});
