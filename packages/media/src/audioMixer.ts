import { getAudioContext } from '@flighthq/audio';
import type { AudioBus, AudioBusOptions, AudioChannel, AudioMixer, AudioMixerOptions } from '@flighthq/types';

import { connectAudioChannelToNode } from './audioChannel';

export function addAudioBusToMixer(mixer: Readonly<AudioMixer>, bus: AudioBus): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  if (runtime.busGainNodes.has(bus)) return;
  const gainNode = runtime.context.createGain();
  gainNode.gain.value = bus.muted ? 0 : bus.gain;
  let pannerNode: StereoPannerNode | null = null;
  if (typeof runtime.context.createStereoPanner === 'function') {
    pannerNode = runtime.context.createStereoPanner();
    pannerNode.pan.value = bus.pan;
    gainNode.connect(pannerNode);
    pannerNode.connect(runtime.masterGainNode);
  } else {
    gainNode.connect(runtime.masterGainNode);
  }
  runtime.busGainNodes.set(bus, gainNode);
  if (pannerNode !== null) runtime.busOutputNodes.set(bus, pannerNode);
  runtime.buses.set(bus.name, bus);
  registerBusInReverseMap(bus, runtime);
}

export function createAudioBus(options?: Readonly<AudioBusOptions>): AudioBus {
  return {
    gain: options?.gain ?? 1,
    muted: options?.muted ?? false,
    name: options?.name ?? '',
    pan: options?.pan ?? 0,
  };
}

export function createAudioMixer(options?: Readonly<AudioMixerOptions>): AudioMixer {
  const context = getAudioContext();
  const masterGainNode = context.createGain();
  masterGainNode.gain.value = options?.masterGain ?? 1;
  masterGainNode.connect(context.destination);
  const mixer: AudioMixer = {
    masterGain: options?.masterGain ?? 1,
    masterMuted: options?.masterMuted ?? false,
  };
  mixerRuntimes.set(mixer, {
    activeChannels: new Set(),
    buses: new Map(),
    busGainNodes: new Map(),
    busOutputNodes: new Map(),
    channelToBus: new WeakMap(),
    context,
    masterGainNode,
  });
  return mixer;
}

export function fadeAudioBusGain(
  mixer: Readonly<AudioMixer>,
  bus: AudioBus,
  targetGain: number,
  durationMs: number,
): void {
  const runtime = mixerRuntimes.get(mixer);
  const gainNode = runtime?.busGainNodes.get(bus);
  if (gainNode === undefined) {
    bus.gain = targetGain;
    return;
  }
  const now = runtime!.context.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(bus.muted ? 0 : targetGain, now + durationMs / 1000);
  bus.gain = targetGain;
}

export function getAudioMixerActiveChannels(mixer: Readonly<AudioMixer>): readonly AudioChannel[] {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return [];
  return Array.from(runtime.activeChannels);
}

export function pauseAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  for (const channel of runtime.activeChannels) {
    if (channel.state === 'playing') channel.state = 'paused';
  }
}

export function resumeAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  for (const channel of runtime.activeChannels) {
    if (channel.state === 'paused') channel.state = 'playing';
  }
}

export function routeAudioChannelToMixerBus(mixer: Readonly<AudioMixer>, channel: AudioChannel, bus: AudioBus): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  // Ensure the bus is registered in the Web Audio graph.
  addAudioBusToMixer(mixer, bus);
  runtime.activeChannels.add(channel);
  runtime.channelToBus.set(channel, bus);
  // Wire the channel's output to the bus gain node (the entry point into the bus graph).
  const busGainNode = runtime.busGainNodes.get(bus);
  if (busGainNode !== undefined) {
    connectAudioChannelToNode(channel, busGainNode);
  }
}

export function setAudioBusGain(bus: AudioBus, value: number): number {
  bus.gain = value;
  // Update the bus gain node for all mixers that contain this bus.
  // Since we store gain nodes per-bus inside each mixer runtime, iterate the known runtimes.
  // The caller must have already added the bus to a mixer via addAudioBusToMixer or routeAudioChannelToMixerBus.
  // We use a reverse lookup via busGainNodes — walk active mixers via the busGainNodes map on each runtime.
  updateBusGainNode(bus);
  return bus.gain;
}

export function setAudioBusMuted(bus: AudioBus, muted: boolean): boolean {
  bus.muted = muted;
  updateBusGainNode(bus);
  return bus.muted;
}

export function setAudioBusPan(bus: AudioBus, value: number): number {
  bus.pan = clamp(value, -1, 1);
  updateBusPannerNode(bus);
  return bus.pan;
}

export function setAudioMixerMasterGain(mixer: AudioMixer, value: number): number {
  mixer.masterGain = value;
  const runtime = mixerRuntimes.get(mixer);
  if (runtime !== undefined) {
    runtime.masterGainNode.gain.value = mixer.masterMuted ? 0 : value;
  }
  return mixer.masterGain;
}

export function setAudioMixerMasterMuted(mixer: AudioMixer, muted: boolean): boolean {
  mixer.masterMuted = muted;
  const runtime = mixerRuntimes.get(mixer);
  if (runtime !== undefined) {
    runtime.masterGainNode.gain.value = muted ? 0 : mixer.masterGain;
  }
  return mixer.masterMuted;
}

export function stopAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  for (const channel of runtime.activeChannels) {
    channel.state = 'stopped';
    channel.currentTime = 0;
  }
  runtime.activeChannels.clear();
}

export function unrouteAudioChannelFromMixerBus(mixer: Readonly<AudioMixer>, channel: AudioChannel): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  runtime.activeChannels.delete(channel);
  runtime.channelToBus.delete(channel);
  // Reconnect the channel output to the context destination so it keeps playing if still active.
  connectAudioChannelToNode(channel, runtime.context.destination);
}

interface AudioMixerRuntime {
  activeChannels: Set<AudioChannel>;
  buses: Map<string, AudioBus>;
  busGainNodes: Map<AudioBus, GainNode>;
  busOutputNodes: Map<AudioBus, StereoPannerNode>;
  channelToBus: WeakMap<AudioChannel, AudioBus>;
  context: AudioContext;
  masterGainNode: GainNode;
}

const mixerRuntimes = new WeakMap<AudioMixer, AudioMixerRuntime>();

// Reverse map from AudioBus to all mixer runtimes that contain it.
// This allows setAudioBusGain/setAudioBusMuted/setAudioBusPan to update the Web Audio graph
// without requiring the caller to pass the mixer.
const busToMixerRuntimes = new Map<AudioBus, Set<AudioMixerRuntime>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function registerBusInReverseMap(bus: AudioBus, runtime: AudioMixerRuntime): void {
  let runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) {
    runtimes = new Set();
    busToMixerRuntimes.set(bus, runtimes);
  }
  runtimes.add(runtime);
}

function updateBusGainNode(bus: AudioBus): void {
  const runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) return;
  for (const runtime of runtimes) {
    const gainNode = runtime.busGainNodes.get(bus);
    if (gainNode !== undefined) {
      gainNode.gain.value = bus.muted ? 0 : bus.gain;
    }
  }
}

function updateBusPannerNode(bus: AudioBus): void {
  const runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) return;
  for (const runtime of runtimes) {
    const pannerNode = runtime.busOutputNodes.get(bus);
    if (pannerNode !== undefined && 'pan' in pannerNode) {
      pannerNode.pan.value = bus.pan;
    }
  }
}
