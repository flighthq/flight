import { clamp } from '@flighthq/math/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HostImageSource,
  HostVideoCapability,
  VideoChannel,
  VideoPlayOptions,
  VideoResource,
} from '@flighthq/types/contract';

import { getVideoChannelSignals } from './mediaChannelSignals';

export function destroyVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  const element = channelElements.get(channel) ?? getElement(channel.source);
  if (element !== null) {
    const runtime = videoChannelRuntimes.get(element);
    if (runtime !== undefined) {
      provider.removeEndedListener!(element, runtime.onEnded);
      videoChannelRuntimes.delete(element);
    }
    provider.pause!(element);
    channelElements.delete(channel);
  }
  channel.source = null;
  channel.state = 'stopped';
  channel.currentTime = 0;
}

export function getVideoChannelCurrentTime(provider: HostVideoCapability, channel: VideoChannel): number {
  const element = getElement(channel.source);
  if (element === null || channel.state !== 'playing') return channel.currentTime;
  return provider.getCurrentTime!(element) * 1000;
}

export function getVideoChannelDuration(channel: VideoChannel): number {
  return channel.length;
}

export function getVideoChannelHeight(provider: HostVideoCapability, channel: VideoChannel): number {
  const element = getElement(channel.source);
  return element !== null ? provider.getHeight!(element) : 0;
}

export function getVideoChannelWidth(provider: HostVideoCapability, channel: VideoChannel): number {
  const element = getElement(channel.source);
  return element !== null ? provider.getWidth!(element) : 0;
}

export function isVideoChannelMuted(channel: Readonly<VideoChannel>): boolean {
  return channel.muted;
}

export function isVideoChannelPlaying(channel: VideoChannel): boolean {
  return channel.state === 'playing';
}

export function pauseVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const element = getElement(channel.source);
  if (element === null) return;
  channel.currentTime = getVideoChannelCurrentTime(provider, channel);
  channel.state = 'paused';
  provider.pause!(element);
  emitVideoChannelSignal(channel, 'onPause');
}

export function playVideoResource(
  provider: HostVideoCapability,
  source: VideoResource,
  options?: Readonly<VideoPlayOptions>,
): VideoChannel | null {
  const element = getElement(source);
  if (element === null) return null;

  const runtime = videoChannelRuntimes.get(element);
  if (runtime !== undefined) {
    provider.removeEndedListener!(element, runtime.onEnded);
  }

  const channel: VideoChannel = {
    currentTime: options?.currentTime ?? 0,
    gain: options?.gain ?? 1,
    length: provider.getDuration!(element) * 1000,
    loops: options?.loops ?? 0,
    muted: false,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  const onEnded = (): void => completeVideoChannel(provider, channel);
  videoChannelRuntimes.set(element, { loopsRemaining: channel.loops, onEnded });
  channelElements.set(channel, element);

  provider.setCurrentTime!(element, channel.currentTime / 1000);
  provider.setVolume!(element, channel.gain);
  provider.setPlaybackRate!(element, channel.playbackRate);
  provider.setLoop!(element, false);
  provider.addEndedListener!(element, onEnded);

  startVideoChannel(provider, channel);
  emitVideoChannelSignal(channel, 'onPlay');
  return channel;
}

export function resumeVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  if (channel.state === 'playing' || getElement(channel.source) === null) return;
  startVideoChannel(provider, channel);
  emitVideoChannelSignal(channel, 'onPlay');
}

export function setVideoChannelCurrentTime(
  provider: HostVideoCapability,
  channel: VideoChannel,
  value: number,
): number {
  channel.currentTime = clamp(value, 0, channel.length);
  const element = getElement(channel.source);
  if (element !== null) provider.setCurrentTime!(element, channel.currentTime / 1000);
  return channel.currentTime;
}

export function setVideoChannelGain(provider: HostVideoCapability, channel: VideoChannel, value: number): number {
  channel.gain = value;
  const element = getElement(channel.source);
  if (element !== null) provider.setVolume!(element, value);
  return channel.gain;
}

export function setVideoChannelMuted(provider: HostVideoCapability, channel: VideoChannel, value: boolean): boolean {
  channel.muted = value;
  const element = getElement(channel.source);
  if (element !== null) provider.setMuted!(element, value);
  return channel.muted;
}

export function setVideoChannelPlaybackRate(
  provider: HostVideoCapability,
  channel: VideoChannel,
  value: number,
): number {
  channel.playbackRate = value;
  const element = getElement(channel.source);
  if (element !== null) provider.setPlaybackRate!(element, value);
  return channel.playbackRate;
}

export function stopVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  const element = getElement(channel.source);
  if (element !== null) {
    const runtime = videoChannelRuntimes.get(element);
    if (runtime !== undefined) provider.removeEndedListener!(element, runtime.onEnded);
    provider.pause!(element);
    provider.setCurrentTime!(element, 0);
  }
  channel.currentTime = 0;
  channel.state = 'stopped';
  emitVideoChannelSignal(channel, 'onStop');
}

interface VideoChannelRuntime {
  loopsRemaining: number;
  onEnded: () => void;
}

const channelElements = new WeakMap<VideoChannel, HostImageSource>();
const videoChannelRuntimes = new WeakMap<HostImageSource, VideoChannelRuntime>();

function getElement(resource: Readonly<VideoResource> | null): HostImageSource | null {
  return resource?.element ?? null;
}

function completeVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  if (channel.state !== 'playing') return;
  const element = getElement(channel.source);
  const runtime = element !== null ? videoChannelRuntimes.get(element) : undefined;
  if (runtime !== undefined && runtime.loopsRemaining !== 0) {
    if (runtime.loopsRemaining > 0) runtime.loopsRemaining--;
    channel.currentTime = 0;
    emitVideoChannelSignal(channel, 'onLoop');
    startVideoChannel(provider, channel);
    return;
  }
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitVideoChannelSignal(channel, 'onComplete');
  emitSignal(channel.onComplete);
}

function emitVideoChannelSignal(
  channel: Readonly<VideoChannel>,
  name: 'onComplete' | 'onLoop' | 'onPause' | 'onPlay' | 'onStop',
): void {
  const signals = getVideoChannelSignals(channel);
  if (signals !== null) emitSignal(signals[name]);
}

function startVideoChannel(provider: HostVideoCapability, channel: VideoChannel): void {
  const element = getElement(channel.source);
  if (element === null) return;
  provider.setCurrentTime!(element, channel.currentTime / 1000);
  channel.state = 'playing';
  provider.play!(element).catch(() => {
    if (channel.state === 'playing') channel.state = 'stopped';
  });
}
