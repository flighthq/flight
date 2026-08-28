import { explainAudioBackend, getAudioBackend, resetAudioBackendForTest } from '@flighthq/audio/contract';

import { enableHostWebAudio, resetHostWebAudioForTest } from './webAudio';

describe('enableHostWebAudio', () => {
  afterEach(() => {
    resetHostWebAudioForTest();
    resetAudioBackendForTest();
  });

  it('installs the host backend', () => {
    enableHostWebAudio();
    expect(explainAudioBackend().layer).toBe('host');
  });

  it('is idempotent', () => {
    enableHostWebAudio();
    enableHostWebAudio();
    expect(explainAudioBackend().conflict).toBe(false);
  });

  it('delegates canPlayType to the web probe', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'audio/mpeg' ? 'probably' : '',
    );
    enableHostWebAudio();
    expect(getAudioBackend().canPlayType('audio/mpeg')).toBe(true);
    expect(getAudioBackend().canPlayType('audio/x-unknown')).toBe(false);
    vi.restoreAllMocks();
  });

  it('records observation after canPlayType call', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    enableHostWebAudio();
    getAudioBackend().canPlayType('audio/mpeg');
    const explanation = explainAudioBackend();
    expect(explanation.viability).toBe('available');
    expect(explanation.operation).toBe('canPlayType');
    vi.restoreAllMocks();
  });
});

describe('resetHostWebAudioForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebAudio();
    resetHostWebAudioForTest();
    resetAudioBackendForTest();
    expect(() => enableHostWebAudio()).not.toThrow();
  });
});
