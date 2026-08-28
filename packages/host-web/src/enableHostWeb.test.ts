import { hasVideoCapabilityHostBackend, resetVideoCapabilityBackendForTest } from '@flighthq/video/contract';

import { enableHostWeb } from './enableHostWeb';

afterEach(() => {
  resetVideoCapabilityBackendForTest();
});

describe('enableHostWeb', () => {
  it('does not throw on first call', () => {
    expect(() => enableHostWeb()).not.toThrow();
    expect(hasVideoCapabilityHostBackend()).toBe(true);
  });

  it('is idempotent', () => {
    enableHostWeb();
    expect(() => enableHostWeb()).not.toThrow();
  });
});
