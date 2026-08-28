import {
  canPlayVideoType,
  explainVideoCapabilityBackend,
  getVideoCapabilityBackend,
  hasVideoCapabilityHostBackend,
  resetVideoCapabilityBackendForTest,
  setVideoCapabilityBackend,
} from '@flighthq/video/contract';

import { enableHostWebVideoCapability } from './webVideoCapability';

afterEach(() => {
  resetVideoCapabilityBackendForTest();
  vi.restoreAllMocks();
});

describe('enableHostWebVideoCapability', () => {
  it('enables without allocating an element', () => {
    const createElement = vi.spyOn(document, 'createElement');
    enableHostWebVideoCapability();
    expect(hasVideoCapabilityHostBackend()).toBe(true);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('explicitly keeps enabled-web empty probes allocation- and host-call-free', () => {
    const createElement = vi.spyOn(document, 'createElement');
    enableHostWebVideoCapability();
    const host = getVideoCapabilityBackend();
    const canPlayType = vi.spyOn(host, 'canPlayType');

    expect(canPlayVideoType('')).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
    expect(canPlayType).not.toHaveBeenCalled();
  });

  it.each([
    ['', false],
    ['maybe', true],
    ['probably', true],
    ['invalid', false],
  ] as const)('normalizes the browser result %j to %j', (result, expected) => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue(result as CanPlayTypeResult);
    enableHostWebVideoCapability();
    expect(canPlayVideoType('video/mp4')).toBe(expected);
    expect(explainVideoCapabilityBackend()).toMatchObject({
      operation: 'canPlayType',
      viability: 'available',
    });
  });

  it('normalizes DOM exceptions to false and records unavailability', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    enableHostWebVideoCapability();
    expect(canPlayVideoType('video/mp4')).toBe(false);
    expect(explainVideoCapabilityBackend()).toMatchObject({
      operation: 'canPlayType',
      viability: 'runtime-api-unavailable',
    });
  });

  it('installs a hidden host beneath a custom backend without probing the DOM', () => {
    const createElement = vi.spyOn(document, 'createElement');
    setVideoCapabilityBackend({ canPlayType: () => false });
    enableHostWebVideoCapability();
    expect(hasVideoCapabilityHostBackend()).toBe(true);
    expect(canPlayVideoType('video/mp4')).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });

  it('preserves host identity on repeat and creates a fresh host after video reset', () => {
    enableHostWebVideoCapability();
    const first = getVideoCapabilityBackend();
    enableHostWebVideoCapability();
    expect(getVideoCapabilityBackend()).toBe(first);
    resetVideoCapabilityBackendForTest();
    enableHostWebVideoCapability();
    expect(getVideoCapabilityBackend()).not.toBe(first);
  });

  it.each([
    { name: 'false', backend: { canPlayType: () => false } },
    {
      name: 'throw',
      backend: {
        canPlayType(): boolean {
          throw new Error('custom failed');
        },
      },
    },
  ])('keeps a custom $name result terminal without touching the DOM', ({ backend }) => {
    const createElement = vi.spyOn(document, 'createElement');
    setVideoCapabilityBackend(backend);
    enableHostWebVideoCapability();
    expect(canPlayVideoType('video/mp4')).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });
});
