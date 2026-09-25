import { clamp } from '@flighthq/math/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  AudioBufferHandle,
  AudioChannel,
  HostAudioDeviceCapability,
  AudioDeviceHandle,
  AudioPlayOptions,
  AudioResource,
  AudioSourceHandle,
} from '@flighthq/types/contract';

import { getAudioChannelSignals } from './mediaChannelSignals.ts';

export function clearAudioChannelLoopRegion(channel: AudioChannel): void {
  channel.loopEnd = 0;
  channel.loopStart = 0;
}

export function destroyAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;
  destroyActiveSource(channel);
  if (runtime.bufferHandle !== INVALID_BUFFER) {
    runtime.backend.destroyBuffer(runtime.bufferHandle);
    runtime.bufferHandle = INVALID_BUFFER;
  }
  channel.state = 'stopped';
  channel.currentTime = 0;
  channelRuntime.delete(channel);
}

export function fadeAudioChannelGain(
  hostAudioDevice: Readonly<HostAudioDeviceCapability>,
  channel: AudioChannel,
  targetGain: number,
  durationMs: number,
): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) {
    channel.gain = targetGain;
    return;
  }
  // The ramp is the host's to schedule — it owns the clock the automation runs on. A host that cannot
  // schedule omits the member, and the fade still lands, instantly, through the plain gain setter.
  if (hostAudioDevice.fadeSourceGain !== undefined) {
    hostAudioDevice.fadeSourceGain(runtime.sourceHandle, targetGain, durationMs);
  } else {
    hostAudioDevice.setSourceGain(runtime.sourceHandle, targetGain);
  }
  channel.gain = targetGain;
}

export function getAudioChannelCurrentTime(channel: AudioChannel): number {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return channel.currentTime;
  return Math.min((runtime.backend.getDeviceTime(runtime.device) - runtime.startedAt) * 1000, channel.length);
}

export function getAudioChannelDuration(channel: AudioChannel): number {
  return channel.length;
}

export function getAudioChannelSourceHandle(channel: Readonly<AudioChannel>): AudioSourceHandle {
  const runtime = channelRuntime.get(channel);
  return runtime?.sourceHandle ?? INVALID_SOURCE;
}

export function hasAudioChannelFade(hostAudioDevice: Readonly<HostAudioDeviceCapability>): boolean {
  return hostAudioDevice.fadeSourceGain !== undefined;
}

export function isAudioChannelMuted(channel: Readonly<AudioChannel>): boolean {
  return channel.muted;
}

export function isAudioChannelPlaying(channel: AudioChannel): boolean {
  return channel.state === 'playing';
}

export function pauseAudioChannel(channel: AudioChannel): void {
  if (channel.state !== 'playing') return;
  channel.currentTime = getAudioChannelCurrentTime(channel);
  channel.state = 'paused';
  destroyActiveSource(channel);
  emitChannelSignal(channel, 'onPause');
}

export function playAudioResource(
  backend: Readonly<HostAudioDeviceCapability>,
  device: AudioDeviceHandle,
  source: AudioResource,
  options?: Readonly<AudioPlayOptions>,
): AudioChannel | null {
  if (source.buffer === null) return null;

  const buf = source.buffer;
  const numberOfChannels = buf.numberOfChannels;
  const data: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    data.push(buf.getChannelData(i));
  }
  const bufferHandle = backend.createBuffer(device, numberOfChannels, buf.length, buf.sampleRate, data);

  const channel: AudioChannel = {
    currentTime: options?.currentTime ?? 0,
    gain: options?.gain ?? 1,
    length: buf.duration * 1000,
    loopEnd: 0,
    loops: options?.loops ?? 0,
    loopStart: 0,
    muted: false,
    pan: 0,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  channelRuntime.set(channel, {
    backend,
    bufferHandle,
    device,
    loopsRemaining: channel.loops,
    sourceHandle: INVALID_SOURCE,
    sourceRoute: null,
    startedAt: 0,
  });

  startAudioChannel(channel);
  emitChannelSignal(channel, 'onPlay');
  return channel;
}

export function resumeAudioChannel(channel: AudioChannel): void {
  if (channel.state === 'playing' || channel.source.buffer === null) return;
  startAudioChannel(channel);
  emitChannelSignal(channel, 'onPlay');
}

export function setAudioChannelCurrentTime(channel: AudioChannel, value: number): number {
  channel.currentTime = clamp(value, 0, channel.length);
  if (channel.state === 'playing') {
    destroyActiveSource(channel);
    startAudioChannel(channel);
  }
  return channel.currentTime;
}

export function setAudioChannelGain(channel: AudioChannel, value: number): number {
  channel.gain = value;
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE && !channel.muted) {
    runtime.backend.setSourceGain(runtime.sourceHandle, value);
  }
  return channel.gain;
}

export function setAudioChannelLoopRegion(channel: AudioChannel, startMs: number, endMs: number): boolean {
  const start = clamp(startMs, 0, channel.length);
  const end = clamp(endMs, 0, channel.length);
  if (end <= start) return false;
  channel.loopStart = start;
  channel.loopEnd = end;
  return true;
}

export function setAudioChannelMuted(channel: AudioChannel, value: boolean): boolean {
  channel.muted = value;
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    runtime.backend.setSourceGain(runtime.sourceHandle, value ? 0 : channel.gain);
  }
  return channel.muted;
}

export function setAudioChannelPan(channel: AudioChannel, value: number): number {
  channel.pan = clamp(value, -1, 1);
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    runtime.backend.setSourcePan(runtime.sourceHandle, channel.pan);
  }
  return channel.pan;
}

export function setAudioChannelPlaybackRate(channel: AudioChannel, value: number): number {
  channel.playbackRate = value;
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    runtime.backend.setSourcePlaybackRate(runtime.sourceHandle, value);
  }
  return channel.playbackRate;
}

export function setAudioChannelSourceRoute(
  channel: Readonly<AudioChannel>,
  route: ((source: AudioSourceHandle) => void) | null,
): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;
  runtime.sourceRoute = route;
  if (route !== null && runtime.sourceHandle !== INVALID_SOURCE) route(runtime.sourceHandle);
}

export function stopAudioChannel(channel: AudioChannel): void {
  destroyActiveSource(channel);
  channel.currentTime = 0;
  channel.state = 'stopped';
  emitChannelSignal(channel, 'onStop');
}

interface AudioChannelRuntime {
  backend: Readonly<HostAudioDeviceCapability>;
  bufferHandle: AudioBufferHandle;
  device: AudioDeviceHandle;
  loopsRemaining: number;
  sourceHandle: AudioSourceHandle;
  sourceRoute: ((source: AudioSourceHandle) => void) | null;
  startedAt: number;
}

const INVALID_BUFFER = 0 as AudioBufferHandle;
const INVALID_SOURCE = 0 as AudioSourceHandle;

const channelRuntime = new WeakMap<AudioChannel, AudioChannelRuntime>();

function emitChannelSignal(
  channel: Readonly<AudioChannel>,
  name: 'onComplete' | 'onLoop' | 'onPause' | 'onPlay' | 'onStop',
): void {
  const signals = getAudioChannelSignals(channel);
  if (signals !== null) emitSignal(signals[name]);
}

function completeAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return;

  if (runtime.loopsRemaining !== 0) {
    if (runtime.loopsRemaining > 0) runtime.loopsRemaining--;
    channel.currentTime = 0;
    emitChannelSignal(channel, 'onLoop');
    startAudioChannel(channel);
    return;
  }

  runtime.sourceHandle = INVALID_SOURCE;
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitChannelSignal(channel, 'onComplete');
  emitSignal(channel.onComplete);
}

function destroyActiveSource(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) return;
  runtime.backend.onSourceEnded(runtime.sourceHandle, null);
  runtime.backend.destroySource(runtime.sourceHandle);
  runtime.sourceHandle = INVALID_SOURCE;
}

function startAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;

  const backend = runtime.backend;
  const hasRegion = channel.loopEnd > channel.loopStart;
  const regionFloor = hasRegion && channel.currentTime < channel.loopStart ? channel.loopStart : channel.currentTime;
  const currentTime = clamp(regionFloor, 0, hasRegion ? channel.loopEnd : channel.length);
  const sourceHandle = backend.createSource(runtime.device, runtime.bufferHandle);

  backend.setSourceGain(sourceHandle, channel.muted ? 0 : channel.gain);
  backend.setSourcePan(sourceHandle, channel.pan);
  backend.onSourceEnded(sourceHandle, () => completeAudioChannel(channel));

  runtime.sourceHandle = sourceHandle;
  if (runtime.sourceRoute !== null && sourceHandle !== INVALID_SOURCE) runtime.sourceRoute(sourceHandle);
  runtime.startedAt = backend.getDeviceTime(runtime.device) - currentTime / 1000;
  channel.currentTime = currentTime;
  channel.state = 'playing';

  backend.startSource(sourceHandle, currentTime / 1000, hasRegion ? (channel.loopEnd - currentTime) / 1000 : 0);
  backend.setSourcePlaybackRate(sourceHandle, channel.playbackRate);

  backend.resumeDevice(runtime.device);
}
