import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  AudioBufferHandle,
  AudioChannel,
  AudioDeviceHandle,
  AudioPlayOptions,
  AudioResource,
  AudioSourceHandle,
} from '@flighthq/types/contract';

import { getAudioDeviceBackend } from './audioDeviceBackend';

export function connectAudioChannelToNode(_channel: AudioChannel, _destinationNode: AudioNode): void {}

export function fadeAudioChannelGain(channel: AudioChannel, targetGain: number, _durationMs: number): void {
  channel.gain = targetGain;
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) return;
  getAudioDeviceBackend().setSourceGain(runtime.sourceHandle, targetGain);
}

export function getAudioChannelCurrentTime(channel: AudioChannel): number {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return channel.currentTime;
  return Math.min((getAudioDeviceBackend().getDeviceTime(runtime.device) - runtime.startedAt) * 1000, channel.length);
}

export function getAudioChannelDuration(channel: AudioChannel): number {
  return channel.length;
}

export function getAudioChannelInputNode(_channel: AudioChannel): AudioNode | null {
  return null;
}

export function getAudioChannelOutputNode(_channel: AudioChannel): AudioNode | null {
  return null;
}

export function isAudioChannelPlaying(channel: AudioChannel): boolean {
  return channel.state === 'playing';
}

export function pauseAudioChannel(channel: AudioChannel): void {
  if (channel.state !== 'playing') return;
  channel.currentTime = getAudioChannelCurrentTime(channel);
  channel.state = 'paused';
  destroyActiveSource(channel);
}

export function playAudioResource(
  device: AudioDeviceHandle,
  source: AudioResource,
  options?: Readonly<AudioPlayOptions>,
): AudioChannel | null {
  if (source.buffer === null) return null;

  const backend = getAudioDeviceBackend();
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
    loops: options?.loops ?? 0,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  channelRuntime.set(channel, {
    bufferHandle,
    device,
    loopsRemaining: channel.loops,
    sourceHandle: INVALID_SOURCE,
    startedAt: 0,
  });

  startAudioChannel(channel);
  return channel;
}

export function resumeAudioChannel(channel: AudioChannel): void {
  if (channel.state === 'playing' || channel.source.buffer === null) return;
  startAudioChannel(channel);
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
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    getAudioDeviceBackend().setSourceGain(runtime.sourceHandle, value);
  }
  return channel.gain;
}

export function setAudioChannelPlaybackRate(channel: AudioChannel, value: number): number {
  channel.playbackRate = value;
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    getAudioDeviceBackend().setSourcePlaybackRate(runtime.sourceHandle, value);
  }
  return channel.playbackRate;
}

export function stopAudioChannel(channel: AudioChannel): void {
  destroyActiveSource(channel);
  channel.currentTime = 0;
  channel.state = 'stopped';
}

interface AudioChannelRuntime {
  bufferHandle: AudioBufferHandle;
  device: AudioDeviceHandle;
  loopsRemaining: number;
  sourceHandle: AudioSourceHandle;
  startedAt: number;
}

const INVALID_SOURCE = 0 as AudioSourceHandle;

const channelRuntime = new WeakMap<AudioChannel, AudioChannelRuntime>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function completeAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return;

  if (runtime.loopsRemaining !== 0) {
    if (runtime.loopsRemaining > 0) runtime.loopsRemaining--;
    channel.currentTime = 0;
    startAudioChannel(channel);
    return;
  }

  runtime.sourceHandle = INVALID_SOURCE;
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitSignal(channel.onComplete);
}

function destroyActiveSource(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) return;
  const backend = getAudioDeviceBackend();
  backend.onSourceEnded(runtime.sourceHandle, null);
  backend.destroySource(runtime.sourceHandle);
  runtime.sourceHandle = INVALID_SOURCE;
}

function startAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;

  const backend = getAudioDeviceBackend();
  const currentTime = clamp(channel.currentTime, 0, channel.length);
  const sourceHandle = backend.createSource(runtime.device, runtime.bufferHandle);

  backend.setSourceGain(sourceHandle, channel.gain);
  backend.onSourceEnded(sourceHandle, () => completeAudioChannel(channel));

  runtime.sourceHandle = sourceHandle;
  runtime.startedAt = backend.getDeviceTime(runtime.device) - currentTime / 1000;
  channel.currentTime = currentTime;
  channel.state = 'playing';

  backend.startSource(sourceHandle, currentTime / 1000);
  backend.setSourcePlaybackRate(sourceHandle, channel.playbackRate);
  backend.resumeDevice(runtime.device);
}
