import { createSignal, emitSignal } from '@flighthq/signals';
import type { VideoChannel, VideoPlayOptions, VideoResource } from '@flighthq/types';

export function getVideoChannelCurrentTime(channel: VideoChannel): number {
  const element = channel.source.element;
  if (element === null || channel.state !== 'playing') return channel.currentTime;
  return element.currentTime * 1000;
}

export function getVideoChannelDuration(channel: VideoChannel): number {
  return channel.length;
}

export function getVideoChannelHeight(channel: VideoChannel): number {
  const element = channel.source.element;
  return element !== null ? element.videoHeight : 0;
}

export function getVideoChannelWidth(channel: VideoChannel): number {
  const element = channel.source.element;
  return element !== null ? element.videoWidth : 0;
}

export function isVideoChannelPlaying(channel: VideoChannel): boolean {
  return channel.state === 'playing';
}

export function pauseVideoChannel(channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const element = channel.source.element;
  if (element === null) return;
  channel.currentTime = getVideoChannelCurrentTime(channel);
  channel.state = 'paused';
  element.pause();
}

export function playVideoResource(source: VideoResource, options?: Readonly<VideoPlayOptions>): VideoChannel | null {
  const element = source.element;
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
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  const onEnded = () => completeVideoChannel(channel);
  videoChannelRuntimes.set(element, { loopsRemaining: channel.loops, onEnded });

  element.currentTime = channel.currentTime / 1000;
  element.volume = channel.gain;
  element.playbackRate = channel.playbackRate;
  element.loop = false;
  element.addEventListener('ended', onEnded);

  startVideoChannel(channel);
  return channel;
}

export function resumeVideoChannel(channel: VideoChannel): void {
  if (channel.state === 'playing' || channel.source.element === null) return;
  startVideoChannel(channel);
}

export function setVideoChannelCurrentTime(channel: VideoChannel, value: number): number {
  channel.currentTime = clamp(value, 0, channel.length);
  const element = channel.source.element;
  if (element !== null) element.currentTime = channel.currentTime / 1000;
  return channel.currentTime;
}

export function setVideoChannelGain(channel: VideoChannel, value: number): number {
  channel.gain = value;
  const element = channel.source.element;
  if (element !== null) element.volume = value;
  return channel.gain;
}

export function setVideoChannelPlaybackRate(channel: VideoChannel, value: number): number {
  channel.playbackRate = value;
  const element = channel.source.element;
  if (element !== null) element.playbackRate = value;
  return channel.playbackRate;
}

export function stopVideoChannel(channel: VideoChannel): void {
  const element = channel.source.element;
  if (element !== null) {
    const runtime = videoChannelRuntimes.get(element);
    if (runtime !== undefined) element.removeEventListener('ended', runtime.onEnded);
    element.pause();
    element.currentTime = 0;
  }
  channel.currentTime = 0;
  channel.state = 'stopped';
}

interface VideoChannelRuntime {
  loopsRemaining: number;
  onEnded: () => void;
}

const videoChannelRuntimes = new WeakMap<HTMLVideoElement, VideoChannelRuntime>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function completeVideoChannel(channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const runtime = channel.source.element !== null ? videoChannelRuntimes.get(channel.source.element) : undefined;
  if (runtime !== undefined && runtime.loopsRemaining !== 0) {
    if (runtime.loopsRemaining > 0) runtime.loopsRemaining--;
    channel.currentTime = 0;
    startVideoChannel(channel);
    return;
  }
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitSignal(channel.onComplete);
}

function startVideoChannel(channel: VideoChannel): void {
  const element = channel.source.element;
  if (element === null) return;
  element.currentTime = channel.currentTime / 1000;
  channel.state = 'playing';
  element.play().catch(() => {
    if (channel.state === 'playing') channel.state = 'stopped';
  });
}
