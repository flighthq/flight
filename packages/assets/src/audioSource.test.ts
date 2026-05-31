import { createAudioSource, getAudioContext } from './audioSource';

describe('createAudioSource', () => {
  it('returns a source with null buffer when called with no arguments', () => {
    const source = createAudioSource();
    expect(source.buffer).toBeNull();
  });
});

describe('getAudioContext', () => {
  it('returns the shared audio context', () => {
    expect(getAudioContext()).toBe(getAudioContext());
  });
});

class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';

  createBufferSource(): AudioBufferSourceNode {
    return {} as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return {} as GainNode;
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
