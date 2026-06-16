import { nullSignalEmit } from './internal';

describe('nullSignalEmit', () => {
  it('returns undefined and does nothing', () => {
    expect(nullSignalEmit()).toBeUndefined();
  });
});
