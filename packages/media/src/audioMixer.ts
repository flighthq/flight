import { createEntity } from '@flighthq/entity/contract';
import type {
  AudioBus,
  AudioBusMixerGuard,
  AudioBusMixerOperation,
  AudioBusOptions,
  AudioChannel,
  AudioMixer,
  AudioMixerOptions,
} from '@flighthq/types/contract';

import { connectAudioChannelToNode, pauseAudioChannel, resumeAudioChannel, stopAudioChannel } from './audioChannel';

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
  return createEntity({
    gain: options?.gain ?? 1,
    muted: options?.muted ?? false,
    name: options?.name ?? '',
    pan: options?.pan ?? 0,
  });
}

export function createAudioMixer(context: AudioContext, options?: Readonly<AudioMixerOptions>): AudioMixer {
  const masterGainNode = context.createGain();
  masterGainNode.gain.value = options?.masterGain ?? 1;
  masterGainNode.connect(context.destination);
  const mixer: AudioMixer = createEntity({
    masterGain: options?.masterGain ?? 1,
    masterMuted: options?.masterMuted ?? false,
  });
  mixerRuntimes.set(mixer, {
    activeChannels: new Set(),
    channelsPausedByMixer: new Set(),
    buses: new Map(),
    busGainNodes: new Map(),
    busOutputNodes: new Map(),
    channelToBus: new WeakMap(),
    context,
    masterGainNode,
  });
  return mixer;
}

export function destroyAudioMixer(mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  // Stop every routed channel and reset its transport state.
  for (const channel of runtime.activeChannels) stopAudioChannel(channel);
  runtime.activeChannels.clear();
  // Tear down the Web Audio graph: bus panners, bus gains, then the master gain.
  for (const pannerNode of runtime.busOutputNodes.values()) pannerNode.disconnect();
  for (const bus of runtime.busGainNodes.keys()) unregisterBusFromReverseMap(bus, runtime);
  for (const gainNode of runtime.busGainNodes.values()) gainNode.disconnect();
  runtime.masterGainNode.disconnect();
  runtime.busGainNodes.clear();
  runtime.busOutputNodes.clear();
  runtime.buses.clear();
  mixerRuntimes.delete(mixer);
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
  // Actually stop each source node (not just flip the flag) so audio halts on pause. Only channels
  // that were playing are recorded: one already paused by the caller is not this mixer's to resume.
  for (const channel of runtime.activeChannels) {
    if (channel.state !== 'playing') continue;
    pauseAudioChannel(channel);
    runtime.channelsPausedByMixer.add(channel);
  }
}

export function resumeAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  // Restart the source node for channels this mixer paused; bus routing survives the restart because
  // the channel's destination node is preserved across stop/start. Resuming every paused channel
  // instead would resurrect one the caller had deliberately paused on its own — a mixer-wide pause and
  // resume around a menu would silently un-pause it. The state re-check covers a channel resumed or
  // stopped individually while the mixer was paused.
  for (const channel of runtime.channelsPausedByMixer) {
    if (channel.state === 'paused') resumeAudioChannel(channel);
  }
  runtime.channelsPausedByMixer.clear();
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

// Sets the bus gain and pushes it to the gain node of every mixer holding this bus, found by reverse
// lookup through busToMixerRuntimes.
//
// A bus that belongs to NO mixer has no node to push to, so the new value is stored and returned while
// nothing becomes audible. That is a silent no-op the return value cannot express — it reports the value
// that was set, not whether anything is listening — so it routes through the guard seam instead of relying
// on a comment telling callers to add the bus first.
export function setAudioBusGain(bus: AudioBus, value: number): number {
  bus.gain = value;
  reportUnmixedBus(bus, 'gain');
  updateBusGainNode(bus);
  return bus.gain;
}

// The diagnostics seam for a bus-property write that cannot reach any audio node, not the caller-facing
// entry point — use enableAudioMixerGuards, which installs the @flighthq/log reporter through here. Null
// uninstalls it, and a null slot is the production default: the reverse-map lookup that detects the case
// runs only while a guard is installed.
export function setAudioBusMixerGuard(guard: AudioBusMixerGuard | null): void {
  _unmixedBusGuard = guard;
}

// Same unmixed-bus caveat as setAudioBusGain: muting a bus no mixer holds changes nothing audible.
export function setAudioBusMuted(bus: AudioBus, muted: boolean): boolean {
  bus.muted = muted;
  reportUnmixedBus(bus, 'mute');
  updateBusGainNode(bus);
  return bus.muted;
}

// Same unmixed-bus caveat as setAudioBusGain: panning a bus no mixer holds changes nothing audible.
export function setAudioBusPan(bus: AudioBus, value: number): number {
  bus.pan = clamp(value, -1, 1);
  reportUnmixedBus(bus, 'pan');
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
  // Delegating rather than flipping the fields by hand is the fix: the previous version set state and
  // currentTime directly and never stopped the source, so every channel reported 'stopped' while its
  // Web Audio node kept emitting. The snapshot is defensive rather than load-bearing —
  // stopAudioChannel does not currently reach into activeChannels, and destroyAudioMixer iterates the
  // live set for the same walk — but it makes this loop safe if that stops being true.
  const stopping = [...runtime.activeChannels];
  runtime.activeChannels.clear();
  for (const channel of stopping) {
    stopAudioChannel(channel);
  }
  // Bookkeeping, not a behavioural guard: resume already re-checks that a channel is still paused, so
  // a stopped channel would be skipped anyway. Clearing keeps the record from retaining channels the
  // mixer no longer owns for the rest of its life.
  runtime.channelsPausedByMixer.clear();
}

interface AudioMixerRuntime {
  activeChannels: Set<AudioChannel>;
  // The channels this mixer itself paused, so a mixer-wide resume restores exactly those and leaves a
  // channel the caller paused on its own still paused.
  channelsPausedByMixer: Set<AudioChannel>;
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

// Drop a runtime from a bus's reverse-map entry, deleting the entry entirely once no runtime
// references the bus. This keeps busToMixerRuntimes bounded as mixers are destroyed.
function unregisterBusFromReverseMap(bus: AudioBus, runtime: AudioMixerRuntime): void {
  const runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) return;
  runtimes.delete(runtime);
  if (runtimes.size === 0) busToMixerRuntimes.delete(bus);
}

export function unrouteAudioChannelFromMixerBus(mixer: Readonly<AudioMixer>, channel: AudioChannel): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  runtime.activeChannels.delete(channel);
  runtime.channelsPausedByMixer.delete(channel);
  runtime.channelToBus.delete(channel);
  // Reconnect the channel output to the context destination so it keeps playing if still active.
  connectAudioChannelToNode(channel, runtime.context.destination);
}

// Reports a write to a bus that belongs to no mixer. Cheap by construction — the Map lookup happens only
// when a guard is installed.
function reportUnmixedBus(bus: Readonly<AudioBus>, operation: AudioBusMixerOperation): void {
  if (_unmixedBusGuard === null) return;
  if (busToMixerRuntimes.get(bus) === undefined) _unmixedBusGuard(operation, bus);
}

let _unmixedBusGuard: AudioBusMixerGuard | null = null;

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
