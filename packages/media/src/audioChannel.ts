import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  AudioBufferHandle,
  AudioChannel,
  AudioDeviceHandle,
  AudioPlayOptions,
  AudioResource,
  AudioSourceHandle,
} from '@flighthq/types/contract';

import { getAudioDeviceBackend, getAudioSourceBufferSourceNode, getAudioSourceGainNode } from './audioDeviceBackend';

export function connectAudioChannelToNode(channel: AudioChannel, destinationNode: AudioNode): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;
  runtime.destinationNode = destinationNode;
  const gainNode = getAudioSourceGainNode(runtime.sourceHandle);
  if (gainNode !== null) {
    gainNode.disconnect();
    gainNode.connect(destinationNode);
  }
}

export function destroyAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined) return;
  destroyActiveSource(channel);
  if (runtime.bufferHandle !== INVALID_BUFFER) {
    getAudioDeviceBackend().destroyBuffer(runtime.bufferHandle);
    runtime.bufferHandle = INVALID_BUFFER;
  }
  channel.state = 'stopped';
  channel.currentTime = 0;
  channelRuntime.delete(channel);
}

export function fadeAudioChannelGain(channel: AudioChannel, targetGain: number, durationMs: number): void {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) {
    channel.gain = targetGain;
    return;
  }
  const gainNode = getAudioSourceGainNode(runtime.sourceHandle);
  if (gainNode !== null) {
    const deviceTime = getAudioDeviceBackend().getDeviceTime(runtime.device);
    gainNode.gain.cancelScheduledValues(deviceTime);
    gainNode.gain.setValueAtTime(gainNode.gain.value, deviceTime);
    gainNode.gain.linearRampToValueAtTime(targetGain, deviceTime + durationMs / 1000);
  } else {
    getAudioDeviceBackend().setSourceGain(runtime.sourceHandle, targetGain);
  }
  channel.gain = targetGain;
}

export function getAudioChannelCurrentTime(channel: AudioChannel): number {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return channel.currentTime;
  return Math.min((getAudioDeviceBackend().getDeviceTime(runtime.device) - runtime.startedAt) * 1000, channel.length);
}

export function getAudioChannelDuration(channel: AudioChannel): number {
  return channel.length;
}

export function getAudioChannelInputNode(channel: AudioChannel): AudioNode | null {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) return null;
  return getAudioSourceBufferSourceNode(runtime.sourceHandle);
}

export function getAudioChannelOutputNode(channel: AudioChannel): AudioNode | null {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || runtime.sourceHandle === INVALID_SOURCE) return null;
  return getAudioSourceGainNode(runtime.sourceHandle);
}

export function hasAudioChannelFade(): boolean {
  const backend = getAudioDeviceBackend();
  return 'getSourceGainNode' in backend;
}

export function hasAudioChannelNodeAccess(): boolean {
  const backend = getAudioDeviceBackend();
  return 'getSourceGainNode' in backend;
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
    pan: 0,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  channelRuntime.set(channel, {
    bufferHandle,
    destinationNode: null,
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

// Clamped rather than assigned as given, following setAudioChannelCurrentTime: pan is the other
// setter with a bounded domain, and the returned value is the one that actually reached the device so
// the channel field and the transport can never disagree about where the sound is.
export function setAudioChannelPan(channel: AudioChannel, value: number): number {
  channel.pan = clamp(value, -1, 1);
  const runtime = channelRuntime.get(channel);
  if (runtime !== undefined && runtime.sourceHandle !== INVALID_SOURCE) {
    getAudioDeviceBackend().setSourcePan(runtime.sourceHandle, channel.pan);
  }
  return channel.pan;
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
  destinationNode: AudioNode | null;
  device: AudioDeviceHandle;
  loopsRemaining: number;
  sourceHandle: AudioSourceHandle;
  startedAt: number;
}

const INVALID_BUFFER = 0 as AudioBufferHandle;
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
  backend.setSourcePan(sourceHandle, channel.pan);
  backend.onSourceEnded(sourceHandle, () => completeAudioChannel(channel));

  runtime.sourceHandle = sourceHandle;
  runtime.startedAt = backend.getDeviceTime(runtime.device) - currentTime / 1000;
  channel.currentTime = currentTime;
  channel.state = 'playing';

  backend.startSource(sourceHandle, currentTime / 1000);
  backend.setSourcePlaybackRate(sourceHandle, channel.playbackRate);

  const gainNode = getAudioSourceGainNode(sourceHandle);
  if (gainNode !== null && runtime.destinationNode !== null) {
    gainNode.disconnect();
    gainNode.connect(runtime.destinationNode);
  }

  backend.resumeDevice(runtime.device);
}
