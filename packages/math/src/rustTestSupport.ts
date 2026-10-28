import { expect } from 'vitest';

export const rustTestSupport = {
  assertRangeError(action: () => void, message: string): void {
    expect(action).toThrowError(new RangeError(message));
  },
  sequenceRandom(values: readonly number[]): () => number {
    let index = 0;
    return () => {
      expect(index, 'sequenceRandom exhausted').toBeLessThan(values.length);
      return values[index++];
    };
  },
};
