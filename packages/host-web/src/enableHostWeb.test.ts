import { enableHostWeb } from './enableHostWeb';

describe('enableHostWeb', () => {
  it('does not throw on first call', () => {
    expect(() => enableHostWeb()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWeb();
    expect(() => enableHostWeb()).not.toThrow();
  });
});
