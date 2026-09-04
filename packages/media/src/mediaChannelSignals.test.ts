import { createAudioResource } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { AudioDeviceBackend, AudioDeviceHandle, AudioSourceHandle } from '@flighthq/types/contract';

import { pauseAudioChannel, playAudioResource, resumeAudioChannel, stopAudioChannel } from './audioChannel';
import {
  enableAudioChannelSignals,
  enableVideoChannelSignals,
  getAudioChannelSignals,
  getVideoChannelSignals,
} from './mediaChannelSignals';

const device = 1 as unknown as AudioDeviceHandle;
let onEnded: Map<number, (() => void) | null>;
let nextHandle = 1;
let backend: AudioDeviceBackend;

function mockBuffer(): AudioBuffer {
  return {
    duration: 1,
    getChannelData: () => new Float32Array(8),
    length: 8,
    numberOfChannels: 1,
    sampleRate: 8,
  } as unknown as AudioBuffer;
}

function mockBackend(): AudioDeviceBackend {
  const out = allocateEntity<AudioBuffer>();
  out.createBuffer = vi.fn().mockReturnValue(1);
  out.createDevice = vi.fn().mockReturnValue(1);
  out.createSource = vi.fn(() => nextHandle++ as unknown as AudioSourceHandle);
  out.destroyBuffer = vi.fn();
  out.destroyDevice = vi.fn();
  out.destroySource = vi.fn();
  out.getDeviceTime = vi.fn(() => 0);
  out.onSourceEnded = vi.fn((source: AudioSourceHandle, cb: (() => void) | null) => {
    onEnded.set(source as number, cb);
  });
  out.resumeDevice = vi.fn();
  out.setSourceGain = vi.fn();
  out.setSourcePan = vi.fn();
  out.setSourcePlaybackRate = vi.fn();
  out.startSource = vi.fn();
  out.stopSource = vi.fn();
  return finishEntity(out);
}

beforeEach(() => {
  onEnded = new Map();
  nextHandle = 1;
  backend = mockBackend();
});

function recorded(channel: Parameters<typeof enableAudioChannelSignals>[0]): string[] {
  const seen: string[] = [];
  const signals = enableAudioChannelSignals(channel);
  connectSignal(signals.onComplete, () => seen.push('complete'));
  connectSignal(signals.onLoop, () => seen.push('loop'));
  connectSignal(signals.onPause, () => seen.push('pause'));
  connectSignal(signals.onPlay, () => seen.push('play'));
  connectSignal(signals.onStop, () => seen.push('stop'));
  return seen;
}

describe('enableAudioChannelSignals', () => {
  it('returns the same signals object on a second call rather than replacing listeners', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()))!;
    const first = enableAudioChannelSignals(channel);
    expect(enableAudioChannelSignals(channel)).toBe(first);
  });

  it('reports the pause, play and stop a caller drives', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()))!;
    const seen = recorded(channel);
    pauseAudioChannel(channel);
    resumeAudioChannel(channel);
    stopAudioChannel(channel);
    expect(seen).toEqual(['pause', 'play', 'stop']);
  });

  it('reports a loop iteration and then the completion, in that order', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()), { loops: 1 })!;
    const seen = recorded(channel);
    onEnded.get(1)!();
    onEnded.get(2)!();
    expect(seen).toEqual(['loop', 'complete']);
  });

  it('does not report a play for a loop iteration', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()), { loops: 2 })!;
    const seen = recorded(channel);
    onEnded.get(1)!();
    expect(seen).toEqual(['loop']);
  });
});

describe('enableVideoChannelSignals', () => {
  it('is independent per channel', () => {
    const first = {} as unknown as Parameters<typeof enableVideoChannelSignals>[0];
    const second = {} as unknown as Parameters<typeof enableVideoChannelSignals>[0];
    expect(enableVideoChannelSignals(first)).not.toBe(enableVideoChannelSignals(second));
  });
});

describe('getAudioChannelSignals', () => {
  it('returns null until a caller opts in, so nothing is allocated for anyone else', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()))!;
    expect(getAudioChannelSignals(channel)).toBeNull();
    expect(enableAudioChannelSignals(channel)).not.toBeNull();
    expect(getAudioChannelSignals(channel)).not.toBeNull();
  });

  it('lets an un-opted channel run its whole lifecycle without producing anything', () => {
    const channel = playAudioResource(backend, device, createAudioResource(mockBuffer()))!;
    pauseAudioChannel(channel);
    resumeAudioChannel(channel);
    stopAudioChannel(channel);
    expect(getAudioChannelSignals(channel)).toBeNull();
  });
});

describe('getVideoChannelSignals', () => {
  it('returns null until a caller opts in', () => {
    const channel = {} as unknown as Parameters<typeof enableVideoChannelSignals>[0];
    expect(getVideoChannelSignals(channel)).toBeNull();
    enableVideoChannelSignals(channel);
    expect(getVideoChannelSignals(channel)).not.toBeNull();
  });
});
