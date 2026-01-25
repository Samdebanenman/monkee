import { describe, expect, it } from 'vitest';

import { findContractMatch } from '../../../../utils/predictmaxcs/contracts.js';

describe('utils/predictmaxcs/contracts', () => {
  const contracts = [
    { id: 'C1', name: 'First Contract' },
    { id: 'egg2', name: 'Mega Coop' },
  ];

  it('returns null when query is empty or invalid', () => {
    expect(findContractMatch(null, 'C1')).toBeNull();
    expect(findContractMatch(contracts, '')).toBeNull();
    expect(findContractMatch(contracts, '   ')).toBeNull();
  });

  it('matches contract by exact id or name', () => {
    expect(findContractMatch(contracts, 'c1')).toEqual(contracts[0]);
    expect(findContractMatch(contracts, 'MEGA COOP')).toEqual(contracts[1]);
  });

  it('matches contract by partial text', () => {
    expect(findContractMatch(contracts, 'mega')).toEqual(contracts[1]);
    expect(findContractMatch(contracts, 'first')).toEqual(contracts[0]);
  });
});
