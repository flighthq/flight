import { createAudioResource, getAudioContext } from './audioResource';

describe('createAudioResource', () => {
  it('returns a resource with null buffer when called with no arguments', () => {
    const resource = createAudioResource();
    expect(resource.buffer).toBeNull();
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
