import { createAudioResource } from '@flighthq/audio/contract';
import type { AudioDeviceBackend, AudioDeviceHandle, AudioSourceHandle } from '@flighthq/types/contract';

import {
  connectAudioChannelToNode,
  fadeAudioChannelGain,
  getAudioChannelCurrentTime,
  getAudioChannelDuration,
  getAudioChannelInputNode,
  getAudioChannelOutputNode,
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
let mockBackend: AudioDeviceBackend;

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

function createMockBackend(): AudioDeviceBackend {
  return {
    createBuffer: vi.fn().mockReturnValue(1),
    createDevice: vi.fn().mockReturnValue(1),
    createSource: vi.fn(() => {
      const h = nextSourceHandle++;
      return h as unknown as AudioSourceHandle;
    }),
    destroyBuffer: vi.fn(),
    destroyDevice: vi.fn(),
    destroySource: vi.fn((source: AudioSourceHandle) => {
      onEndedCallbacks.delete(source as number);
    }),
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
}

beforeEach(() => {
  deviceTime = 0;
  nextSourceHandle = 1;
  onEndedCallbacks = new Map();
  mockBackend = createMockBackend();
  setAudioDeviceBackend(mockBackend);
});

afterEach(() => {
  resetAudioDeviceBackendForTest();
});

describe('connectAudioChannelToNode', () => {
  it('is a no-op without error', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(() => connectAudioChannelToNode(channel!, {} as AudioNode)).not.toThrow();
  });
});

describe('fadeAudioChannelGain', () => {
  it('updates the channel gain immediately', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    fadeAudioChannelGain(channel!, 0.5, 500);
    expect(channel!.gain).toBe(0.5);
    expect(mockBackend.setSourceGain).toHaveBeenCalledWith(expect.anything(), 0.5);
  });
});

describe('getAudioChannelCurrentTime', () => {
  it('computes from device time while playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    deviceTime = 0.25;
    expect(getAudioChannelCurrentTime(channel!)).toBe(250);
  });

  it('returns the stored current time for an inactive channel', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 250 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(getAudioChannelCurrentTime(channel!)).toBe(250);
  });
});

describe('getAudioChannelDuration', () => {
  it('returns the channel length', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelDuration(channel!)).toBe(1000);
  });
});

describe('getAudioChannelInputNode', () => {
  it('returns null', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelInputNode(channel!)).toBeNull();
  });
});

describe('getAudioChannelOutputNode', () => {
  it('returns null', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelOutputNode(channel!)).toBeNull();
  });
});

describe('isAudioChannelPlaying', () => {
  it('returns true while playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(isAudioChannelPlaying(channel!)).toBe(true);
  });

  it('returns false when paused', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(isAudioChannelPlaying(channel!)).toBe(false);
  });
});

describe('pauseAudioChannel', () => {
  it('preserves playback position and marks the channel as paused', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 100 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(channel!.currentTime).toBe(100);
    expect(channel!.state).toBe('paused');
  });

  it('destroys the active source', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(mockBackend.destroySource).toHaveBeenCalled();
  });
});

describe('playAudioResource', () => {
  it('creates a buffer from the audio resource', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(mockBackend.createBuffer).toHaveBeenCalledWith(device, 1, 44100, 44100, [expect.any(Float32Array)]);
  });

  it('creates a source and starts it', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(mockBackend.createSource).toHaveBeenCalled();
    expect(mockBackend.startSource).toHaveBeenCalled();
  });

  it('converts the millisecond current time to the source offset in seconds', () => {
    playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 250 });
    expect(mockBackend.startSource).toHaveBeenCalledWith(expect.anything(), 0.25);
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
    expect(mockBackend.resumeDevice).toHaveBeenCalledWith(device);
  });
});

describe('resumeAudioChannel', () => {
  it('restarts playback from a paused channel', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    resumeAudioChannel(channel!);
    expect(channel!.state).toBe('playing');
  });

  it('creates a new source on resume', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    const initialCreateCount = (mockBackend.createSource as ReturnType<typeof vi.fn>).mock.calls.length;
    pauseAudioChannel(channel!);
    resumeAudioChannel(channel!);
    expect((mockBackend.createSource as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCreateCount + 1);
  });
});

describe('setAudioChannelCurrentTime', () => {
  it('updates and clamps the channel current time', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelCurrentTime(channel!, 2000)).toBe(1000);
  });

  it('restarts playback when playing', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    const destroyCalls = (mockBackend.destroySource as ReturnType<typeof vi.fn>).mock.calls.length;
    setAudioChannelCurrentTime(channel!, 500);
    expect((mockBackend.destroySource as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(destroyCalls);
    expect(channel!.state).toBe('playing');
  });
});

describe('setAudioChannelGain', () => {
  it('updates the channel gain through the backend', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelGain(channel!, 0.25)).toBe(0.25);
    expect(channel!.gain).toBe(0.25);
    expect(mockBackend.setSourceGain).toHaveBeenCalledWith(expect.anything(), 0.25);
  });
});

describe('setAudioChannelPlaybackRate', () => {
  it('updates the channel playback rate through the backend', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelPlaybackRate(channel!, 2)).toBe(2);
    expect(channel!.playbackRate).toBe(2);
    expect(mockBackend.setSourcePlaybackRate).toHaveBeenCalledWith(expect.anything(), 2);
  });
});

describe('stopAudioChannel', () => {
  it('stops playback and resets the current time', () => {
    const channel = playAudioResource(device, createAudioResource(createMockAudioBuffer()), { currentTime: 500 });
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    expect(channel!.currentTime).toBe(0);
    expect(channel!.state).toBe('stopped');
    expect(mockBackend.destroySource).toHaveBeenCalled();
  });
});
