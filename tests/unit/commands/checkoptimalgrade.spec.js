import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../services/discord.js', () => ({
  chunkContent: lines => [Array.isArray(lines) ? lines.join('\n') : String(lines)],
  createTextComponentMessage: content => ({ content }),
}));

vi.mock('../../../services/contractService.js', () => ({
  fetchContractSummaries: vi.fn(),
  fetchActiveContracts: vi.fn(),
}));

vi.mock('../../../services/optimalGradeService.js', () => ({
  checkOptimalGrade: vi.fn(),
}));

import { autocomplete, data, execute } from '../../../commands/checkoptimalgrade.js';
import { fetchActiveContracts, fetchContractSummaries } from '../../../services/contractService.js';
import { checkOptimalGrade } from '../../../services/optimalGradeService.js';

const contract = {
  id: 'c1',
  name: 'Contract One',
  release: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchContractSummaries.mockResolvedValue([contract]);
  fetchActiveContracts.mockResolvedValue({ seasonal: [['Contract One', 'c1']], leggacy: [] });
  checkOptimalGrade.mockResolvedValue({
    ok: true,
    contractId: 'c1',
    contractName: 'Contract One',
    noteworthyGrades: ['AA'],
    grades: [
      { grade: 'AAA', predictedScore: 100, bestVariant: 'SIAB', noSiab: 90, siab: 100 },
      { grade: 'AA', predictedScore: 97, bestVariant: 'no SIAB', noSiab: 97, siab: 95 },
    ],
  });
});

describe('commands/checkoptimalgrade', () => {
  it('defines the requested command and optional output mode', () => {
    const json = data.toJSON();
    expect(json.name).toBe('checkoptimalgrade');
    expect(json.options.find(option => option.name === 'output').required).toBe(false);
  });

  it('returns a short noteworthy-grade verdict by default', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1' } }),
    });

    await execute(interaction);

    expect(checkOptimalGrade).toHaveBeenCalledWith(contract);
    const final = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(final).toContain('worth looking into');
    expect(final).toContain('AA');
  });

  it('includes each predicted grade score in long output', async () => {
    const interaction = createInteraction({
      options: createOptions({ strings: { contract: 'c1', output: 'long' } }),
    });

    await execute(interaction);

    const final = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(final).toContain('AAA: **100 CS**');
    expect(final).toContain('AA: **97 CS**');
  });

  it('prefills all, active, and active-contract options before typing', async () => {
    const interaction = createInteraction({
      options: createOptions({ focused: '', focusedOptionName: 'contract' }),
    });

    await autocomplete(interaction);

    const options = interaction.respond.mock.calls[0][0];
    expect(options.map(option => option.name)).toEqual([
      'All contracts',
      'Currently active contracts',
      'Contract One (c1)',
    ]);
  });

  it('switches to database search once typing starts', async () => {
    const interaction = createInteraction({
      options: createOptions({ focused: 'one', focusedOptionName: 'contract' }),
    });

    await autocomplete(interaction);

    expect(fetchContractSummaries).toHaveBeenCalled();
    expect(interaction.respond.mock.calls[0][0]).toEqual([
      { name: 'Contract One (c1)', value: 'c1' },
    ]);
  });
});
