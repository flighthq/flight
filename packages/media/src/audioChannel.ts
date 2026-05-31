import { getAudioContext } from '@flighthq/assets';
import { createSignal, emitSignal } from '@flighthq/signals';
import type { AudioChannel, AudioPlayOptions, AudioSource } from '@flighthq/types';

export function getAudioChannelCurrentTime(channel: AudioChannel): number {
  const runtime = channelRuntime.get(channel);
  if (runtime === undefined || channel.state !== 'playing') return channel.currentTime;
  return Math.min((runtime.context.currentTime - runtime.startedAt) * 1000, channel.length);
}

export function pauseAudioChannel(channel: AudioChannel): void {
  if (channel.state !== 'playing') return;
  channel.currentTime = getAudioChannelCurrentTime(channel);
  channel.state = 'paused';
  stopActiveNode(channel, false);
}

export function playAudioSource(source: AudioSource, options?: Readonly<AudioPlayOptions>): AudioChannel | null {
  if (source.buffer === null) return null;

  const context = getAudioContext();
  const channel: AudioChannel = {
    currentTime: options?.currentTime ?? 0,
    gain: options?.gain ?? 1,
    length: source.buffer.duration * 1000,
    loops: options?.loops ?? 0,
    playbackRate: options?.playbackRate ?? 1,
    source,
    state: 'stopped',
    onComplete: createSignal(),
  };

  channelRuntime.set(channel, {
    context,
    gainNode: null,
    loopsRemaining: channel.loops,
    sourceNode: null,
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
    stopActiveNode(channel, false);
    startAudioChannel(channel);
  }
  return channel.currentTime;
}

export function setAudioChannelGain(channel: AudioChannel, value: number): number {
  channel.gain = value;
  const runtime = channelRuntime.get(channel);
  if (runtime?.gainNode !== null && runtime?.gainNode !== undefined) runtime.gainNode.gain.value = value;
  return channel.gain;
}

export function setAudioChannelPlaybackRate(channel: AudioChannel, value: number): number {
  channel.playbackRate = value;
  const runtime = channelRuntime.get(channel);
  if (runtime?.sourceNode !== null && runtime?.sourceNode !== undefined) runtime.sourceNode.playbackRate.value = value;
  return channel.playbackRate;
}

export function stopAudioChannel(channel: AudioChannel): void {
  stopActiveNode(channel, false);
  channel.currentTime = 0;
  channel.state = 'stopped';
}

interface AudioChannelRuntime {
  context: AudioContext;
  gainNode: GainNode | null;
  loopsRemaining: number;
  sourceNode: AudioBufferSourceNode | null;
  startedAt: number;
}

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

  runtime.gainNode = null;
  runtime.sourceNode = null;
  channel.currentTime = channel.length;
  channel.state = 'complete';
  emitSignal(channel.onComplete);
}

function startAudioChannel(channel: AudioChannel): void {
  const runtime = channelRuntime.get(channel);
  const buffer = channel.source.buffer;
  if (runtime === undefined || buffer === null) return;

  const sourceNode = runtime.context.createBufferSource();
  const gainNode = runtime.context.createGain();
  const currentTime = clamp(channel.currentTime, 0, channel.length);

  sourceNode.buffer = buffer;
  sourceNode.playbackRate.value = channel.playbackRate;
  gainNode.gain.value = channel.gain;
  sourceNode.connect(gainNode);
  gainNode.connect(runtime.context.destination);
  sourceNode.onended = () => completeAudioChannel(channel);

  runtime.gainNode = gainNode;
  runtime.sourceNode = sourceNode;
  runtime.startedAt = runtime.context.currentTime - currentTime / 1000;
  channel.currentTime = currentTime;
  channel.state = 'playing';

  sourceNode.start(0, currentTime / 1000);

  if (runtime.context.state === 'suspended') {
    runtime.context.resume().catch(() => {});
  }
}

function stopActiveNode(channel: AudioChannel, complete: boolean): void {
  const runtime = channelRuntime.get(channel);
  const sourceNode = runtime?.sourceNode;
  if (runtime === undefined || sourceNode === null || sourceNode === undefined) return;

  runtime.sourceNode = null;
  runtime.gainNode = null;
  sourceNode.onended = complete ? () => completeAudioChannel(channel) : null;
  sourceNode.stop();
}
