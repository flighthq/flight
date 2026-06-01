import { createVideoSource } from '@flighthq/assets';

import {
  getVideoChannelCurrentTime,
  pauseVideoChannel,
  playVideoSource,
  resumeVideoChannel,
  setVideoChannelCurrentTime,
  setVideoChannelGain,
  setVideoChannelPlaybackRate,
  stopVideoChannel,
} from './videoChannel';

describe('getVideoChannelCurrentTime', () => {
  it('returns stored currentTime when not playing', () => {
    const source = createVideoSource(createMockVideoElement());
    const channel = playVideoSource(source, { currentTime: 500 });
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    expect(getVideoChannelCurrentTime(channel!)).toBe(500);
  });
});

describe('pauseVideoChannel', () => {
  it('marks the channel as paused and calls element.pause', () => {
    const element = createMockVideoElement();
    const channel = playVideoSource(createVideoSource(element));
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    expect(channel!.state).toBe('paused');
    expect(element.paused).toBe(true);
  });
});

describe('playVideoSource', () => {
  it('returns null when element is null', () => {
    expect(playVideoSource(createVideoSource())).toBeNull();
  });

  it('returns a playing channel with applied options', () => {
    const channel = playVideoSource(createVideoSource(createMockVideoElement()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });
});

describe('resumeVideoChannel', () => {
  it('resumes a paused channel', () => {
    const channel = playVideoSource(createVideoSource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    resumeVideoChannel(channel!);
    expect(channel!.state).toBe('playing');
  });
});

describe('setVideoChannelCurrentTime', () => {
  it('clamps the value to channel length', () => {
    const element = createMockVideoElement(1);
    const channel = playVideoSource(createVideoSource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelCurrentTime(channel!, 9999)).toBe(1000);
  });
});

describe('setVideoChannelGain', () => {
  it('updates channel gain and element volume', () => {
    const element = createMockVideoElement();
    const channel = playVideoSource(createVideoSource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelGain(channel!, 0.3)).toBe(0.3);
    expect(element.volume).toBe(0.3);
  });
});

describe('setVideoChannelPlaybackRate', () => {
  it('updates channel playback rate and element rate', () => {
    const element = createMockVideoElement();
    const channel = playVideoSource(createVideoSource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelPlaybackRate(channel!, 2)).toBe(2);
    expect(element.playbackRate).toBe(2);
  });
});

describe('stopVideoChannel', () => {
  it('stops playback and resets currentTime', () => {
    const element = createMockVideoElement();
    const channel = playVideoSource(createVideoSource(element), { currentTime: 400 });
    expect(channel).not.toBeNull();
    stopVideoChannel(channel!);
    expect(channel!.currentTime).toBe(0);
    expect(channel!.state).toBe('stopped');
  });
});

class MockVideoElement {
  currentTime = 0;
  duration: number;
  loop = false;
  paused = false;
  playbackRate = 1;
  volume = 1;
  private _listeners = new Map<string, (() => void)[]>();

  constructor(duration = 10) {
    this.duration = duration;
  }

  addEventListener(type: string, handler: () => void): void {
    const list = this._listeners.get(type) ?? [];
    list.push(handler);
    this._listeners.set(type, list);
  }

  removeEventListener(type: string, handler: () => void): void {
    const list = this._listeners.get(type) ?? [];
    this._listeners.set(
      type,
      list.filter((h) => h !== handler),
    );
  }

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
}

function createMockVideoElement(duration = 10): HTMLVideoElement {
  return new MockVideoElement(duration) as unknown as HTMLVideoElement;
}
