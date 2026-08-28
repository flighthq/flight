import { createAudioResource } from '@flighthq/audio/contract';
import type { AudioDeviceHandle, AudioSourceHandle } from '@flighthq/types/contract';

import {
  connectAudioChannelToNode,
  destroyAudioChannel,
  fadeAudioChannelGain,
  getAudioChannelCurrentTime,
  getAudioChannelDuration,
  getAudioChannelInputNode,
  getAudioChannelOutputNode,
  hasAudioChannelFade,
  hasAudioChannelNodeAccess,
  isAudioChannelPlaying,
  pauseAudioChannel,
  playAudioResource,
  resumeAudioChannel,
  setAudioChannelCurrentTime,
  setAudioChannelGain,
  setAudioChannelPlaybackRate,
  stopAudioChannel,
} from './audioChannel';
import { resetAudioDeviceBackendForTest, setAudioDeviceBackend } from './audioDeviceBackend';

let deviceTime = 0;
let nextSourceHandle = 1;
let onEndedCallbacks: Map<number, (() => void) | null>;

const device = 1 as unknown as AudioDeviceHandle;

function createMockAudioBuffer(): AudioBuffer {
  return {
    duration: 1,
    getChannelData: () => new Float32Array(44100),
    length: 44100,
    numberOfChannels: 1,
    sampleRate: 44100,
  } as unknown as AudioBuffer;
}

class MockGainNode {
  gain = {
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    value: 1,
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

function createWebMockBackend() {
  const gainNodes = new Map<number, MockGainNode>();
  const sourceNodes = new Map<number, MockAudioBufferSourceNode>();

  return {
    backend: {
      createBuffer: vi.fn().mockReturnValue(1),
      createDevice: vi.fn().mockReturnValue(1),
      createSource: vi.fn(() => {
        const h = nextSourceHandle++;
        const gainNode = new MockGainNode();
        gainNodes.set(h, gainNode);
        return h as unknown as AudioSourceHandle;
      }),
      destroyBuffer: vi.fn(),
      destroyDevice: vi.fn(),
      destroySource: vi.fn((source: AudioSourceHandle) => {
        gainNodes.delete(source as number);
        sourceNodes.delete(source as number);
        onEndedCallbacks.delete(source as number);
      }),
      getDeviceTime: vi.fn(() => deviceTime),
      getSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null {
        return (sourceNodes.get(source as number) as unknown as AudioBufferSourceNode) ?? null;
      },
      getSourceGainNode(source: AudioSourceHandle): GainNode | null {
        return (gainNodes.get(source as number) as unknown as GainNode) ?? null;
      },
      onSourceEnded: vi.fn((source: AudioSourceHandle, cb: (() => void) | null) => {
        onEndedCallbacks.set(source as number, cb);
      }),
      resumeDevice: vi.fn(),
      setSourceGain: vi.fn(),
      setSourcePlaybackRate: vi.fn(),
      startSource: vi.fn((source: AudioSourceHandle) => {
        const srcNode = new MockAudioBufferSourceNode();
        sourceNodes.set(source as number, srcNode);
      }),
      stopSource: vi.fn(),
    },
    gainNodes,
    sourceNodes,
  };
}

let webMock: ReturnType<typeof createWebMockBackend>;

beforeEach(() => {
  deviceTime = 0;
  nextSourceHandle = 1;
  onEndedCallbacks = new Map();
  webMock = createWebMockBackend();
  setAudioDeviceBackend(webMock.backend);
});

afterEach(() => {
  resetAudioDeviceBackendForTest();
});

describe('connectAudioChannelToNode', () => {
  it('redirects the gain node to the provided destination', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const destination = {} as AudioNode;
    connectAudioChannelToNode(channel, destination);
    const gainNode = webMock.gainNodes.get(1)!;
    expect(gainNode.disconnect).toHaveBeenCalled();
    expect(gainNode.connect).toHaveBeenCalledWith(destination);
  });

  it('preserves routing across stop/restart cycles', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const busNode = {} as AudioNode;
    connectAudioChannelToNode(channel, busNode);
    pauseAudioChannel(channel);
    resumeAudioChannel(channel);
    const newGainNode = webMock.gainNodes.get(2)!;
    expect(newGainNode.disconnect).toHaveBeenCalled();
    expect(newGainNode.connect).toHaveBeenCalledWith(busNode);
  });
});

describe('destroyAudioChannel', () => {
  it('frees the buffer handle', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    destroyAudioChannel(channel);
    expect(webMock.backend.destroyBuffer).toHaveBeenCalled();
    expect(channel.state).toBe('stopped');
  });

  it('destroys the active source before freeing the buffer', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    destroyAudioChannel(channel);
    expect(webMock.backend.destroySource).toHaveBeenCalled();
    expect(webMock.backend.destroyBuffer).toHaveBeenCalled();
  });

  it('is safe to call twice', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    destroyAudioChannel(channel);
    expect(() => destroyAudioChannel(channel)).not.toThrow();
    expect((webMock.backend.destroyBuffer as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('does not free the buffer on stop alone', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    stopAudioChannel(channel);
    expect(webMock.backend.destroyBuffer).not.toHaveBeenCalled();
  });

  it('does not free the buffer on completion', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const cb = onEndedCallbacks.get(1);
    cb?.();
    expect(channel.state).toBe('complete');
    expect(webMock.backend.destroyBuffer).not.toHaveBeenCalled();
  });
});

describe('fadeAudioChannelGain', () => {
  it('schedules a linear gain ramp on the web gain node', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    fadeAudioChannelGain(channel, 0.5, 500);
    const gainNode = webMock.gainNodes.get(1)!;
    expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.5);
    expect(channel.gain).toBe(0.5);
  });

  it('falls back to setSourceGain when no web nodes are available', () => {
    resetAudioDeviceBackendForTest();
    const plainMock = {
      createBuffer: vi.fn().mockReturnValue(1),
      createDevice: vi.fn().mockReturnValue(1),
      createSource: vi.fn(() => nextSourceHandle++ as unknown as AudioSourceHandle),
      destroyBuffer: vi.fn(),
      destroyDevice: vi.fn(),
      destroySource: vi.fn(),
      getDeviceTime: vi.fn(() => deviceTime),
      onSourceEnded: vi.fn((source: AudioSourceHandle, cb: (() => void) | null) => {
        onEndedCallbacks.set(source as number, cb);
      }),
      resumeDevice: vi.fn(),
      setSourceGain: vi.fn(),
      setSourcePlaybackRate: vi.fn(),
      startSource: vi.fn(),
      stopSource: vi.fn(),
    };
    setAudioDeviceBackend(plainMock);
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    fadeAudioChannelGain(channel, 0.3, 200);
    expect(plainMock.setSourceGain).toHaveBeenCalledWith(expect.anything(), 0.3);
    expect(channel.gain).toBe(0.3);
  });
});

describe('getAudioChannelCurrentTime', () => {
  it('computes from device time while playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    deviceTime = 0.25;
    expect(getAudioChannelCurrentTime(channel)).toBe(250);
  });

  it('returns the stored current time for an inactive channel', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 250 })!;
    pauseAudioChannel(channel);
    expect(getAudioChannelCurrentTime(channel)).toBe(250);
  });
});

describe('getAudioChannelDuration', () => {
  it('returns the channel length', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    expect(getAudioChannelDuration(channel)).toBe(1000);
  });
});

describe('getAudioChannelInputNode', () => {
  it('returns the buffer source node when web backend is active', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const inputNode = getAudioChannelInputNode(channel);
    expect(inputNode).not.toBeNull();
    expect(inputNode).toBe(webMock.sourceNodes.get(1));
  });

  it('returns null when the source is inactive', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    pauseAudioChannel(channel);
    expect(getAudioChannelInputNode(channel)).toBeNull();
  });
});

describe('getAudioChannelOutputNode', () => {
  it('returns the gain node when web backend is active', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const outputNode = getAudioChannelOutputNode(channel);
    expect(outputNode).not.toBeNull();
    expect(outputNode).toBe(webMock.gainNodes.get(1));
  });

  it('returns null when the source is inactive', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    pauseAudioChannel(channel);
    expect(getAudioChannelOutputNode(channel)).toBeNull();
  });
});

describe('hasAudioChannelFade', () => {
  it('returns true when web backend is active', () => {
    expect(hasAudioChannelFade()).toBe(true);
  });

  it('returns false when no web backend is active', () => {
    resetAudioDeviceBackendForTest();
    expect(hasAudioChannelFade()).toBe(false);
  });
});

describe('hasAudioChannelNodeAccess', () => {
  it('returns true when web backend is active', () => {
    expect(hasAudioChannelNodeAccess()).toBe(true);
  });

  it('returns false when no web backend is active', () => {
    resetAudioDeviceBackendForTest();
    expect(hasAudioChannelNodeAccess()).toBe(false);
  });
});

describe('isAudioChannelPlaying', () => {
  it('returns true while playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    expect(isAudioChannelPlaying(channel)).toBe(true);
  });

  it('returns false when paused', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    pauseAudioChannel(channel);
    expect(isAudioChannelPlaying(channel)).toBe(false);
  });
});

describe('pauseAudioChannel', () => {
  it('preserves playback position and marks the channel as paused', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 100 })!;
    pauseAudioChannel(channel);
    expect(channel.currentTime).toBe(100);
    expect(channel.state).toBe('paused');
  });

  it('destroys the active source', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    pauseAudioChannel(channel);
    expect(webMock.backend.destroySource).toHaveBeenCalled();
  });
});

describe('playAudioResource', () => {
  it('creates a buffer from the audio resource', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(webMock.backend.createBuffer).toHaveBeenCalledWith(device, 1, 44100, 44100, [expect.any(Float32Array)]);
  });

  it('creates a source and starts it', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(webMock.backend.createSource).toHaveBeenCalled();
    expect(webMock.backend.startSource).toHaveBeenCalled();
  });

  it('converts the millisecond current time to the source offset in seconds', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 250 });
    expect(webMock.backend.startSource).toHaveBeenCalledWith(expect.anything(), 0.25);
  });

  it('returns null when buffer is null', () => {
    const source = createAudioResource();
    expect(playAudioResource(device, source)).toBeNull();
  });

  it('returns a playing channel when buffer is available', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });

  it('resumes the device after starting', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(webMock.backend.resumeDevice).toHaveBeenCalledWith(device);
  });
});

describe('resumeAudioChannel', () => {
  it('restarts playback from a paused channel', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    pauseAudioChannel(channel);
    resumeAudioChannel(channel);
    expect(channel.state).toBe('playing');
  });

  it('creates a new source on resume', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const initialCreateCount = (webMock.backend.createSource as ReturnType<typeof vi.fn>).mock.calls.length;
    pauseAudioChannel(channel);
    resumeAudioChannel(channel);
    expect((webMock.backend.createSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCreateCount + 1);
  });
});

describe('setAudioChannelCurrentTime', () => {
  it('updates and clamps the channel current time', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    expect(setAudioChannelCurrentTime(channel, 2000)).toBe(1000);
  });

  it('restarts playback when playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    const destroyCalls = (webMock.backend.destroySource as ReturnType<typeof vi.fn>).mock.calls.length;
    setAudioChannelCurrentTime(channel, 500);
    expect((webMock.backend.destroySource as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(destroyCalls);
    expect(channel.state).toBe('playing');
  });
});

describe('setAudioChannelGain', () => {
  it('updates the channel gain through the backend', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    expect(setAudioChannelGain(channel, 0.25)).toBe(0.25);
    expect(channel.gain).toBe(0.25);
    expect(webMock.backend.setSourceGain).toHaveBeenCalledWith(expect.anything(), 0.25);
  });
});

describe('setAudioChannelPlaybackRate', () => {
  it('updates the channel playback rate through the backend', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()))!;
    expect(setAudioChannelPlaybackRate(channel, 2)).toBe(2);
    expect(channel.playbackRate).toBe(2);
    expect(webMock.backend.setSourcePlaybackRate).toHaveBeenCalledWith(expect.anything(), 2);
  });
});

describe('stopAudioChannel', () => {
  it('stops playback and resets the current time', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 500 })!;
    stopAudioChannel(channel);
    expect(channel.currentTime).toBe(0);
    expect(channel.state).toBe('stopped');
    expect(webMock.backend.destroySource).toHaveBeenCalled();
  });
});
