import { createVideoResource } from '@flighthq/video';

import {
  getVideoChannelCurrentTime,
  getVideoChannelDuration,
  getVideoChannelHeight,
  getVideoChannelWidth,
  isVideoChannelPlaying,
  pauseVideoChannel,
  playVideoResource,
  resumeVideoChannel,
  setVideoChannelCurrentTime,
  setVideoChannelGain,
  setVideoChannelPlaybackRate,
  stopVideoChannel,
} from './videoChannel';

describe('getVideoChannelCurrentTime', () => {
  it('returns stored currentTime when not playing', () => {
    const source = createVideoResource(createMockVideoElement());
    const channel = playVideoResource(source, { currentTime: 500 });
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    expect(getVideoChannelCurrentTime(channel!)).toBe(500);
  });
});

describe('getVideoChannelDuration', () => {
  it('returns the channel length', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement(5)));
    expect(channel).not.toBeNull();
    expect(getVideoChannelDuration(channel!)).toBe(5000);
  });
});

describe('getVideoChannelHeight', () => {
  it('returns the element videoHeight', () => {
    const element = createMockVideoElement(10, 480);
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(getVideoChannelHeight(channel!)).toBe(480);
  });

  it('returns 0 when element is null', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    channel!.source = { element: null };
    expect(getVideoChannelHeight(channel!)).toBe(0);
  });
});

describe('getVideoChannelWidth', () => {
  it('returns the element videoWidth', () => {
    const element = createMockVideoElement(10, 480, 640);
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(getVideoChannelWidth(channel!)).toBe(640);
  });

  it('returns 0 when element is null', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    channel!.source = { element: null };
    expect(getVideoChannelWidth(channel!)).toBe(0);
  });
});

describe('isVideoChannelPlaying', () => {
  it('returns true while playing', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    expect(isVideoChannelPlaying(channel!)).toBe(true);
  });

  it('returns false when stopped', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    stopVideoChannel(channel!);
    expect(isVideoChannelPlaying(channel!)).toBe(false);
  });
});

describe('pauseVideoChannel', () => {
  it('marks the channel as paused and calls element.pause', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    expect(channel!.state).toBe('paused');
    expect(element.paused).toBe(true);
  });
});

describe('playVideoResource', () => {
  it('returns null when element is null', () => {
    expect(playVideoResource(createVideoResource())).toBeNull();
  });

  it('returns a playing channel with applied options', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });
});

describe('resumeVideoChannel', () => {
  it('resumes a paused channel', () => {
    const channel = playVideoResource(createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    pauseVideoChannel(channel!);
    resumeVideoChannel(channel!);
    expect(channel!.state).toBe('playing');
  });
});

describe('setVideoChannelCurrentTime', () => {
  it('clamps the value to channel length', () => {
    const element = createMockVideoElement(1);
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelCurrentTime(channel!, 9999)).toBe(1000);
  });
});

describe('setVideoChannelGain', () => {
  it('updates channel gain and element volume', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelGain(channel!, 0.3)).toBe(0.3);
    expect(element.volume).toBe(0.3);
  });
});

describe('setVideoChannelPlaybackRate', () => {
  it('updates channel playback rate and element rate', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelPlaybackRate(channel!, 2)).toBe(2);
    expect(element.playbackRate).toBe(2);
  });
});

describe('stopVideoChannel', () => {
  it('stops playback and resets currentTime', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(createVideoResource(element), { currentTime: 400 });
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
  videoHeight: number;
  videoWidth: number;
  volume = 1;
  private _listeners = new Map<string, (() => void)[]>();

  constructor(duration = 10, videoHeight = 0, videoWidth = 0) {
    this.duration = duration;
    this.videoHeight = videoHeight;
    this.videoWidth = videoWidth;
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

function createMockVideoElement(duration = 10, videoHeight = 0, videoWidth = 0): HTMLVideoElement {
  return new MockVideoElement(duration, videoHeight, videoWidth) as unknown as HTMLVideoElement;
}
