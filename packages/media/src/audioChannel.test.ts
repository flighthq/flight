import { createAudioResource } from '@flighthq/audio';

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
      disconnect() {},
      gain: { value: 1 },
    } as unknown as GainNode;
  }

  resume(): Promise<void> {
    return Promise.resolve();
  }
}

const ctx = new MockAudioContext() as unknown as AudioContext;

function createMockAudioBuffer(): AudioBuffer {
  return { duration: 1 } as AudioBuffer;
}

describe('connectAudioChannelToNode', () => {
  it('reroutes the active gain node to the destination without error', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    const destination = {} as AudioNode;
    expect(() => connectAudioChannelToNode(channel!, destination)).not.toThrow();
  });
});

describe('fadeAudioChannelGain', () => {
  it('updates the channel gain immediately when no gain node is active', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    fadeAudioChannelGain(channel!, 0.5, 500);
    expect(channel!.gain).toBe(0.5);
  });
});

describe('getAudioChannelCurrentTime', () => {
  it('returns the stored current time for an inactive channel', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()), { currentTime: 250 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(getAudioChannelCurrentTime(channel!)).toBe(250);
  });
});

describe('getAudioChannelDuration', () => {
  it('returns the channel length', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelDuration(channel!)).toBe(1000);
  });
});

describe('getAudioChannelInputNode', () => {
  it('returns the source node while playing', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelInputNode(channel!)).not.toBeNull();
  });

  it('returns null after stop', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    expect(getAudioChannelInputNode(channel!)).toBeNull();
  });
});

describe('getAudioChannelOutputNode', () => {
  it('returns the gain node while playing', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(getAudioChannelOutputNode(channel!)).not.toBeNull();
  });

  it('returns null after stop', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    expect(getAudioChannelOutputNode(channel!)).toBeNull();
  });
});

describe('isAudioChannelPlaying', () => {
  it('returns true while playing', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(isAudioChannelPlaying(channel!)).toBe(true);
  });

  it('returns false when paused', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(isAudioChannelPlaying(channel!)).toBe(false);
  });
});

describe('pauseAudioChannel', () => {
  it('preserves playback position and marks the channel as paused', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()), { currentTime: 100 });
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    expect(channel!.currentTime).toBe(100);
    expect(channel!.state).toBe('paused');
  });
});

describe('playAudioResource', () => {
  it('returns null when buffer is null', () => {
    const source = createAudioResource();
    expect(playAudioResource(ctx, source)).toBeNull();
  });

  it('returns a playing channel when buffer is available', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });
});

describe('resumeAudioChannel', () => {
  it('restarts playback from a paused channel', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    pauseAudioChannel(channel!);
    resumeAudioChannel(channel!);
    expect(channel!.state).toBe('playing');
  });
});

describe('setAudioChannelCurrentTime', () => {
  it('updates and clamps the channel current time', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelCurrentTime(channel!, 2000)).toBe(1000);
  });
});

describe('setAudioChannelGain', () => {
  it('updates the channel gain', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelGain(channel!, 0.25)).toBe(0.25);
    expect(channel!.gain).toBe(0.25);
  });
});

describe('setAudioChannelPlaybackRate', () => {
  it('updates the channel playback rate', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    expect(setAudioChannelPlaybackRate(channel!, 2)).toBe(2);
    expect(channel!.playbackRate).toBe(2);
  });
});

describe('stopAudioChannel', () => {
  it('stops playback and resets the current time', () => {
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()), { currentTime: 500 });
    expect(channel).not.toBeNull();
    stopAudioChannel(channel!);
    expect(channel!.currentTime).toBe(0);
    expect(channel!.state).toBe('stopped');
  });
});
