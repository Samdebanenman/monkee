import { describe, expect, it, vi } from 'vitest';
import { forEachSequential } from '../../../utils/async.js';

describe('forEachSequential', () => {
  it('waits for each operation before starting the next', async () => {
    let finishFirst;
    const first = new Promise(resolve => { finishFirst = resolve; });
    const operation = vi.fn(item => item === 'first' ? first : undefined);
    const running = forEachSequential(['first', 'second'], operation);

    expect(operation).toHaveBeenCalledExactlyOnceWith('first');
    finishFirst();
    await running;
    expect(operation.mock.calls).toEqual([['first'], ['second']]);
  });

  it('stops subsequent operations and propagates a rejection', async () => {
    const error = new Error('send failed');
    const operation = vi.fn().mockRejectedValue(error);

    await expect(forEachSequential(['first', 'second'], operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledExactlyOnceWith('first');
  });
});
