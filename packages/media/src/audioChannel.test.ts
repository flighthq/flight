import { createAudioSource } from '@flighthq/assets';

import {
  getAudioChannelCurrentTime,
  pauseAudioChannel,
  playAudioSource,
  resumeAudioChannel,
  setAudioChannelCurrentTime,
  setAudioChannelGain,
  setAudioChannelPlaybackRate,
  stopAudioChannel,
} from './audioChannel';

describe('getAudioChannelCurrentTime', () => {
  it('returns the stored current time for an inactive channel', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()), { currentTime: 250 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(getAudioChannelCurrentTime(channel!)).toBe(250);
  });
});

describe('pauseAudioChannel', () => {
  it('preserves playback position and marks the channel as paused', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()), { currentTime: 100 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(channel!.currentTime).toBe(100);
    expect(channel!.state).toBe('paused');
  });
});

describe('playAudioSource', () => {
  it('returns null when buffer is null', () => {
    const source = createAudioSource();
    expect(playAudioSource(source)).toBeNull();
  });

  it('returns a playing channel when buffer is available', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });
});

describe('resumeAudioChannel', () => {
  it('restarts playback from a paused channel', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    resumeAudioChannel(channel!);
    expect(channel!.state).toBe('playing');
  });
});

describe('setAudioChannelCurrentTime', () => {
  it('updates and clamps the channel current time', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelCurrentTime(channel!, 2000)).toBe(1000);
  });
});

describe('setAudioChannelGain', () => {
  it('updates the channel gain', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelGain(channel!, 0.25)).toBe(0.25);
    expect(channel!.gain).toBe(0.25);
  });
});

describe('setAudioChannelPlaybackRate', () => {
  it('updates the channel playback rate', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelPlaybackRate(channel!, 2)).toBe(2);
    expect(channel!.playbackRate).toBe(2);
  });
});

describe('stopAudioChannel', () => {
  it('stops playback and resets the current time', () => {
    const channel = playAudioSource(createAudioSource(createMockAudioBuffer()), { currentTime: 500 });
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    expect(channel!.currentTime).toBe(0);
    expect(channel!.state).toBe('stopped');
  });
});

function createMockAudioBuffer(): AudioBuffer {
  return { duration: 1 } as AudioBuffer;
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  playbackRate = { value: 1 };

  connect(): void {}
  start(): void {}
  stop(): void {}
}

class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';

  createBufferSource(): AudioBufferSourceNode {
    return new MockAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return {
      connect() {},
      gain: { value: 1 },
    } as unknown as GainNode;
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }
}

vi.stubGlobal('AudioContext', MockAudioContext);
