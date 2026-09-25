import { nullSignalEmit } from './internal.ts';

describe('nullSignalEmit', () => {
  it('returns undefined and does nothing', () => {
    expect(nullSignalEmit()).toBeUndefined();
  });
});
