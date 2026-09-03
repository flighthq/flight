import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { VideoChannel, VideoPlayOptions, VideoResource } from '@flighthq/types/contract';

import { getVideoChannelSignals } from './mediaChannelSignals';

export function destroyVideoChannel(channel: VideoChannel): void {
  const element = channelElements.get(channel) ?? getVideoElement(channel.source);
  if (element !== null) {
    const runtime = videoChannelRuntimes.get(element);
    if (runtime !== undefined) {
      element.removeEventListener('ended', runtime.onEnded);
      videoChannelRuntimes.delete(element);
    }
    element.pause();
    channelElements.delete(channel);
  }
  channel.source = null;
  channel.state = 'stopped';
  channel.currentTime = 0;
}

export function getVideoChannelCurrentTime(channel: VideoChannel): number {
  const element = getVideoElement(channel.source);
  if (element === null || channel.state !== 'playing') return channel.currentTime;
  return element.currentTime * 1000;
}

export function getVideoChannelDuration(channel: VideoChannel): number {
  return channel.length;
}

export function getVideoChannelHeight(channel: VideoChannel): number {
  const element = getVideoElement(channel.source);
  return element !== null ? element.videoHeight : 0;
}

export function getVideoChannelWidth(channel: VideoChannel): number {
  const element = getVideoElement(channel.source);
  return element !== null ? element.videoWidth : 0;
}

// Mute rides the element's own `muted`, which is already independent of `volume` — so `channel.gain`
// and the element's volume both keep the level the caller set and unmuting restores it.
export function isVideoChannelMuted(channel: Readonly<VideoChannel>): boolean {
  return channel.muted;
}

export function isVideoChannelPlaying(channel: VideoChannel): boolean {
  return channel.state === 'playing';
}

export function pauseVideoChannel(channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const element = getVideoElement(channel.source);
  if (element === null) return;
  channel.currentTime = getVideoChannelCurrentTime(channel);
  channel.state = 'paused';
  element.pause();
  emitVideoChannelSignal(channel, 'onPause');
}

export function playVideoResource(source: VideoResource, options?: Readonly<VideoPlayOptions>): VideoChannel | null {
  const element = getVideoElement(source);
  if (element === null) return null;

  const runtime = videoChannelRuntimes.get(element);
  if (runtime !== undefined) {
    element.removeEventListener('ended', runtime.onEnded);
  }

  const channel: VideoChannel = {
    currentTime: options?.currentTime ?? 0,
    gain: options?.gain ?? 1,
    length: isNaN(element.duration) ? 0 : element.duration * 1000,
    loops: options?.loops ?? 0,
    muted: false,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  const onEnded = () => completeVideoChannel(channel);
  videoChannelRuntimes.set(element, { loopsRemaining: channel.loops, onEnded });
  channelElements.set(channel, element);

  element.currentTime = channel.currentTime / 1000;
  element.volume = channel.gain;
  element.playbackRate = channel.playbackRate;
  element.loop = false;
  element.addEventListener('ended', onEnded);

  startVideoChannel(channel);
  emitVideoChannelSignal(channel, 'onPlay');
  return channel;
}

export function resumeVideoChannel(channel: VideoChannel): void {
  if (channel.state === 'playing' || getVideoElement(channel.source) === null) return;
  startVideoChannel(channel);
  emitVideoChannelSignal(channel, 'onPlay');
}

export function setVideoChannelCurrentTime(channel: VideoChannel, value: number): number {
  channel.currentTime = clamp(value, 0, channel.length);
  const element = getVideoElement(channel.source);
  if (element !== null) element.currentTime = channel.currentTime / 1000;
  return channel.currentTime;
}

export function setVideoChannelGain(channel: VideoChannel, value: number): number {
  channel.gain = value;
  const element = getVideoElement(channel.source);
  if (element !== null) element.volume = value;
  return channel.gain;
}

export function setVideoChannelMuted(channel: VideoChannel, value: boolean): boolean {
  channel.muted = value;
  const element = getVideoElement(channel.source);
  if (element !== null) element.muted = value;
  return channel.muted;
}

export function setVideoChannelPlaybackRate(channel: VideoChannel, value: number): number {
  channel.playbackRate = value;
  const element = getVideoElement(channel.source);
  if (element !== null) element.playbackRate = value;
  return channel.playbackRate;
}

export function stopVideoChannel(channel: VideoChannel): void {
  const element = getVideoElement(channel.source);
  if (element !== null) {
    const runtime = videoChannelRuntimes.get(element);
    if (runtime !== undefined) element.removeEventListener('ended', runtime.onEnded);
    element.pause();
    element.currentTime = 0;
  }
  channel.currentTime = 0;
  channel.state = 'stopped';
  emitVideoChannelSignal(channel, 'onStop');
}

interface VideoChannelRuntime {
  loopsRemaining: number;
  onEnded: () => void;
}

// Records the element at creation so destroyVideoChannel can reach it even after
// destroyVideoResource nulls resource.element.
const channelElements = new WeakMap<VideoChannel, HTMLVideoElement>();
const videoChannelRuntimes = new WeakMap<HTMLVideoElement, VideoChannelRuntime>();

function getVideoElement(resource: Readonly<VideoResource> | null): HTMLVideoElement | null {
  return (resource?.element as HTMLVideoElement | null) ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function completeVideoChannel(channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const element = getVideoElement(channel.source);
  const runtime = element !== null ? videoChannelRuntimes.get(element) : undefined;
  if (runtime !== undefined && runtime.loopsRemaining !== 0) {
    if (runtime.loopsRemaining > 0) runtime.loopsRemaining--;
    channel.currentTime = 0;
    emitVideoChannelSignal(channel, 'onLoop');
    startVideoChannel(channel);
    return;
  }
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitVideoChannelSignal(channel, 'onComplete');
  emitSignal(channel.onComplete);
}

// A null check and a return until a caller opts in.
function emitVideoChannelSignal(
  channel: Readonly<VideoChannel>,
  name: 'onComplete' | 'onLoop' | 'onPause' | 'onPlay' | 'onStop',
): void {
  const signals = getVideoChannelSignals(channel);
  if (signals !== null) emitSignal(signals[name]);
}

function startVideoChannel(channel: VideoChannel): void {
  const element = getVideoElement(channel.source);
  if (element === null) return;
  element.currentTime = channel.currentTime / 1000;
  channel.state = 'playing';
  element.play().catch(() => {
    if (channel.state === 'playing') channel.state = 'stopped';
  });
}
