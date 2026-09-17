import {
  createVideoTexture,
  destroyVideoTexture,
  getTextureSource,
  getVideoTextureWidth,
} from '@flighthq/texture/contract';
import type { HostImageSource, HostVideoCapability } from '@flighthq/types/contract';
import { createVideoResource, destroyVideoResource } from '@flighthq/video/contract';

import {
  destroyVideoChannel,
  getVideoChannelCurrentTime,
  getVideoChannelDuration,
  getVideoChannelHeight,
  getVideoChannelWidth,
  isVideoChannelPlaying,
  isVideoChannelMuted,
  pauseVideoChannel,
  playVideoResource,
  resumeVideoChannel,
  setVideoChannelCurrentTime,
  setVideoChannelGain,
  setVideoChannelMuted,
  setVideoChannelPlaybackRate,
  stopVideoChannel,
} from './videoChannel';

const webVideoHost: HostVideoCapability = {
  addEndedListener: (element, listener) => {
    asMock(element).addEventListener('ended', listener);
  },
  canPlayType: () => true,
  getCurrentTime: (element) => asMock(element).currentTime,
  getDuration: (element) => {
    const d = asMock(element).duration;
    return d === d ? d : 0;
  },
  getHeight: (element) => asMock(element).videoHeight,
  getLoop: (element) => asMock(element).loop,
  getMuted: (element) => asMock(element).muted,
  getPlaybackRate: (element) => asMock(element).playbackRate,
  getVolume: (element) => asMock(element).volume,
  getWidth: (element) => asMock(element).videoWidth,
  isReady: (element) => (asMock(element).readyState ?? 0) >= 2,
  pause: (element) => {
    asMock(element).pause();
  },
  play: (element) => asMock(element).play(),
  releaseElement(element) {
    const video = asMock(element);
    if (video.srcObject !== null) video.srcObject = null;
    video.removeAttribute('src');
    video.load();
  },
  removeEndedListener: (element, listener) => {
    asMock(element).removeEventListener('ended', listener);
  },
  setCurrentTime: (element, value) => {
    asMock(element).currentTime = value;
  },
  setLoop: (element, value) => {
    asMock(element).loop = value;
  },
  setMuted: (element, value) => {
    asMock(element).muted = value;
  },
  setPlaybackRate: (element, value) => {
    asMock(element).playbackRate = value;
  },
  setVolume: (element, value) => {
    asMock(element).volume = value;
  },
};

describe('destroyVideoChannel', () => {
  it('nulls source and sets state to stopped', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    expect(channel.source).toBe(resource);
    destroyVideoChannel(webVideoHost, channel);
    expect(channel.source).toBeNull();
    expect(channel.state).toBe('stopped');
    expect(channel.currentTime).toBe(0);
  });

  it('removes the ended listener from the element', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    const listenersBefore = asMock(element).listenerCount('ended');
    expect(listenersBefore).toBe(1);
    destroyVideoChannel(webVideoHost, channel);
    expect(asMock(element).listenerCount('ended')).toBe(0);
  });

  it('pauses the element', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    expect(asMock(element).paused).toBe(false);
    destroyVideoChannel(webVideoHost, channel);
    expect(asMock(element).paused).toBe(true);
  });

  it('is idempotent', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    destroyVideoChannel(webVideoHost, channel);
    destroyVideoChannel(webVideoHost, channel);
    expect(channel.source).toBeNull();
    expect(channel.state).toBe('stopped');
  });

  it('does not destroy the borrowed video resource', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    destroyVideoChannel(webVideoHost, channel);
    expect(resource.element).toBe(element);
    expect(resource.ownsElement).toBe(false);
  });

  it('does not stop MediaStream tracks', () => {
    const track = { stop: vi.fn(), kind: 'video', enabled: true } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const element = createMockVideoElement();
    asMock(element).srcObject = stream;
    const resource = createVideoResource(element);
    const channel = playVideoResource(webVideoHost, resource)!;
    destroyVideoChannel(webVideoHost, channel);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('removes listener even when destroyVideoResource runs first', () => {
    const element = createMockVideoElement();
    const resource = createVideoResource(element, undefined, true);
    const channel = playVideoResource(webVideoHost, resource)!;
    expect(asMock(element).listenerCount('ended')).toBe(1);
    destroyVideoResource(webVideoHost, resource);
    expect(resource.element).toBeNull();
    destroyVideoChannel(webVideoHost, channel);
    expect(asMock(element).listenerCount('ended')).toBe(0);
    expect(channel.source).toBeNull();
    expect(channel.state).toBe('stopped');
  });

  it('combined resource+channel+texture teardown: resource first', () => {
    const track = { stop: vi.fn(), kind: 'video', enabled: true } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const element = createMockVideoElement(10, 240, 320);
    asMock(element).srcObject = stream;
    asMock(element).readyState = 4;
    const resource = createVideoResource(element, undefined, true);
    const channel = playVideoResource(webVideoHost, resource)!;
    const texture = createVideoTexture(webVideoHost, resource);
    expect(asMock(element).listenerCount('ended')).toBe(1);
    expect(getVideoTextureWidth(webVideoHost, texture)).toBe(320);
    destroyVideoResource(webVideoHost, resource);
    destroyVideoTexture(texture);
    destroyVideoChannel(webVideoHost, channel);
    expect(resource.element).toBeNull();
    expect(channel.source).toBeNull();
    expect(asMock(element).listenerCount('ended')).toBe(0);
    expect(asMock(element).paused).toBe(true);
    expect(getTextureSource(texture)).toBeNull();
    expect(getVideoTextureWidth(webVideoHost, texture)).toBe(-1);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('combined resource+channel+texture teardown: channel first', () => {
    const track = { stop: vi.fn(), kind: 'video', enabled: true } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const element = createMockVideoElement(10, 240, 320);
    asMock(element).srcObject = stream;
    asMock(element).readyState = 4;
    const resource = createVideoResource(element, undefined, true);
    const channel = playVideoResource(webVideoHost, resource)!;
    const texture = createVideoTexture(webVideoHost, resource);
    destroyVideoChannel(webVideoHost, channel);
    destroyVideoTexture(texture);
    destroyVideoResource(webVideoHost, resource);
    expect(channel.source).toBeNull();
    expect(asMock(element).listenerCount('ended')).toBe(0);
    expect(asMock(element).paused).toBe(true);
    expect(resource.element).toBeNull();
    expect(getTextureSource(texture)).toBeNull();
    expect(getVideoTextureWidth(webVideoHost, texture)).toBe(-1);
    expect(track.stop).not.toHaveBeenCalled();
  });
});

describe('getVideoChannelCurrentTime', () => {
  it('returns stored currentTime when not playing', () => {
    const source = createVideoResource(createMockVideoElement());
    const channel = playVideoResource(webVideoHost, source, { currentTime: 500 });
    expect(channel).not.toBeNull();
    pauseVideoChannel(webVideoHost, channel!);
    expect(getVideoChannelCurrentTime(webVideoHost, channel!)).toBe(500);
  });
});

describe('getVideoChannelDuration', () => {
  it('returns the channel length', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement(5)));
    expect(channel).not.toBeNull();
    expect(getVideoChannelDuration(channel!)).toBe(5000);
  });
});

describe('getVideoChannelHeight', () => {
  it('returns the element videoHeight', () => {
    const element = createMockVideoElement(10, 480);
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(getVideoChannelHeight(webVideoHost, channel!)).toBe(480);
  });

  it('returns 0 when element is null', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    channel!.source = createVideoResource();
    expect(getVideoChannelHeight(webVideoHost, channel!)).toBe(0);
  });
});

describe('getVideoChannelWidth', () => {
  it('returns the element videoWidth', () => {
    const element = createMockVideoElement(10, 480, 640);
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(getVideoChannelWidth(webVideoHost, channel!)).toBe(640);
  });

  it('returns 0 when element is null', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    channel!.source = createVideoResource();
    expect(getVideoChannelWidth(webVideoHost, channel!)).toBe(0);
  });
});

describe('isVideoChannelMuted', () => {
  it('reports the mute state independently of the stored gain', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()), { gain: 0.5 })!;
    expect(isVideoChannelMuted(channel)).toBe(false);
    setVideoChannelMuted(webVideoHost, channel, true);
    expect(isVideoChannelMuted(channel)).toBe(true);
    expect(channel.gain).toBe(0.5);
  });
});

describe('isVideoChannelPlaying', () => {
  it('returns true while playing', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    expect(isVideoChannelPlaying(channel!)).toBe(true);
  });

  it('returns false when stopped', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    stopVideoChannel(webVideoHost, channel!);
    expect(isVideoChannelPlaying(channel!)).toBe(false);
  });
});

describe('pauseVideoChannel', () => {
  it('marks the channel as paused and calls element.pause', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    pauseVideoChannel(webVideoHost, channel!);
    expect(channel!.state).toBe('paused');
    expect(asMock(element).paused).toBe(true);
  });
});

describe('playVideoResource', () => {
  it('returns null when element is null', () => {
    expect(playVideoResource(webVideoHost, createVideoResource())).toBeNull();
  });

  it('returns a playing channel with applied options', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()), { gain: 0.5 });
    expect(channel).not.toBeNull();
    expect(channel!.gain).toBe(0.5);
    expect(channel!.state).toBe('playing');
  });
});

describe('resumeVideoChannel', () => {
  it('resumes a paused channel', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()));
    expect(channel).not.toBeNull();
    pauseVideoChannel(webVideoHost, channel!);
    resumeVideoChannel(webVideoHost, channel!);
    expect(channel!.state).toBe('playing');
  });
});

describe('setVideoChannelCurrentTime', () => {
  it('clamps the value to channel length', () => {
    const element = createMockVideoElement(1);
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelCurrentTime(webVideoHost, channel!, 9999)).toBe(1000);
  });
});

describe('setVideoChannelGain', () => {
  it('updates channel gain and element volume', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelGain(webVideoHost, channel!, 0.3)).toBe(0.3);
    expect(asMock(element).volume).toBe(0.3);
  });
});

describe('setVideoChannelMuted', () => {
  it('mutes the element without disturbing its volume or the stored gain', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element), { gain: 0.7 })!;
    setVideoChannelMuted(webVideoHost, channel, true);
    expect(asMock(element).muted).toBe(true);
    expect(asMock(element).volume).toBe(0.7);
    expect(channel.gain).toBe(0.7);
    expect(isVideoChannelMuted(channel)).toBe(true);
  });

  it('unmutes back to the level the caller set, including one set while muted', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element), { gain: 0.7 })!;
    setVideoChannelMuted(webVideoHost, channel, true);
    setVideoChannelGain(webVideoHost, channel, 0.2);
    setVideoChannelMuted(webVideoHost, channel, false);
    expect(asMock(element).muted).toBe(false);
    expect(asMock(element).volume).toBe(0.2);
  });

  it('starts unmuted', () => {
    const channel = playVideoResource(webVideoHost, createVideoResource(createMockVideoElement()))!;
    expect(isVideoChannelMuted(channel)).toBe(false);
  });
});

describe('setVideoChannelPlaybackRate', () => {
  it('updates channel playback rate and element rate', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element));
    expect(channel).not.toBeNull();
    expect(setVideoChannelPlaybackRate(webVideoHost, channel!, 2)).toBe(2);
    expect(asMock(element).playbackRate).toBe(2);
  });
});

describe('stopVideoChannel', () => {
  it('stops playback and resets currentTime', () => {
    const element = createMockVideoElement();
    const channel = playVideoResource(webVideoHost, createVideoResource(element), { currentTime: 400 });
    expect(channel).not.toBeNull();
    stopVideoChannel(webVideoHost, channel!);
    expect(channel!.currentTime).toBe(0);
    expect(channel!.state).toBe('stopped');
  });
});

class MockVideoElement {
  currentTime = 0;
  duration: number;
  loop = false;
  muted = false;
  paused = false;
  playbackRate = 1;
  readyState = 0;
  srcObject: MediaStream | null = null;
  videoHeight: number;
  videoWidth: number;
  volume = 1;
  private _attrs = new Map<string, string>();
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

  listenerCount(type: string): number {
    return this._listeners.get(type)?.length ?? 0;
  }

  load(): void {
    // no-op — satisfies destroyVideoResource's decoder-release call
  }

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  removeAttribute(name: string): void {
    this._attrs.delete(name);
  }

  removeEventListener(type: string, handler: () => void): void {
    const list = this._listeners.get(type) ?? [];
    this._listeners.set(
      type,
      list.filter((h) => h !== handler),
    );
  }
}

function asMock(element: HostImageSource): MockVideoElement {
  return element as unknown as MockVideoElement;
}

function createMockVideoElement(duration = 10, videoHeight = 0, videoWidth = 0): HostImageSource {
  return new MockVideoElement(duration, videoHeight, videoWidth) as unknown as HostImageSource;
}
