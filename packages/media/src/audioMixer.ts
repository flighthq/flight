import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clamp } from '@flighthq/math/contract';
import type {
  AudioBus,
  AudioBusNodeHandle,
  AudioBusMixerGuard,
  AudioBusMixerOperation,
  AudioBusOptions,
  AudioChannel,
  AudioDeviceHandle,
  AudioMixer,
  AudioMixerGraphHandle,
  AudioMixerOptions,
  EntityConstruction,
  HostAudioMixerProvider,
} from '@flighthq/types/contract';

import {
  getAudioChannelSourceHandle,
  pauseAudioChannel,
  resumeAudioChannel,
  setAudioChannelSourceRoute,
  stopAudioChannel,
} from './audioChannel';

export function addAudioBusToMixer(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: Readonly<AudioMixer>,
  bus: AudioBus,
): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  if (runtime.busNodes.has(bus)) return;
  const busNode = hostAudioMixer.createBusNode(runtime.graph, bus.muted ? 0 : bus.gain, bus.pan);
  runtime.busNodes.set(bus, busNode);
  runtime.buses.set(bus.name, bus);
  registerBusInReverseMap(bus, runtime);
}

export function createAudioBus(options?: Readonly<AudioBusOptions>): AudioBus {
  const out = allocateEntity<AudioBus>();
  initializeAudioBus(out, options);
  return finishEntity(out);
}

export function createAudioMixer(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  device: AudioDeviceHandle,
  options?: Readonly<AudioMixerOptions>,
): AudioMixer {
  const masterGain = options?.masterGain ?? 1;
  const masterMuted = options?.masterMuted ?? false;
  const graph = hostAudioMixer.createMixerGraph(device, masterMuted ? 0 : masterGain);
  const mixer = allocateEntity<AudioMixer>();
  mixer.masterGain = masterGain;
  mixer.masterMuted = masterMuted;
  mixerRuntimes.set(mixer, {
    activeChannels: new Set(),
    channelsPausedByMixer: new Set(),
    buses: new Map(),
    busNodes: new Map(),
    channelToBus: new WeakMap(),
    graph,
  });
  return mixer;
}

export function destroyAudioMixer(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  // Stop every routed channel and reset its transport state.
  for (const channel of runtime.activeChannels) {
    stopAudioChannel(channel);
    setAudioChannelSourceRoute(channel, null);
  }
  runtime.activeChannels.clear();
  for (const [bus, busNode] of runtime.busNodes) {
    unregisterBusFromReverseMap(bus, runtime);
    hostAudioMixer.destroyBusNode(runtime.graph, busNode);
  }
  hostAudioMixer.destroyMixerGraph(runtime.graph);
  runtime.busNodes.clear();
  runtime.buses.clear();
  mixerRuntimes.delete(mixer);
}

export function fadeAudioBusGain(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: Readonly<AudioMixer>,
  bus: AudioBus,
  targetGain: number,
  durationMs: number,
): void {
  const runtime = mixerRuntimes.get(mixer);
  const busNode = runtime?.busNodes.get(bus);
  if (runtime === undefined || busNode === undefined) {
    bus.gain = targetGain;
    return;
  }
  hostAudioMixer.fadeBusNodeGain(runtime.graph, busNode, bus.muted ? 0 : targetGain, durationMs);
  bus.gain = targetGain;
}

export function getAudioMixerActiveChannels(mixer: Readonly<AudioMixer>): readonly AudioChannel[] {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return [];
  return Array.from(runtime.activeChannels);
}

export function initializeAudioBus(out: EntityConstruction<AudioBus>, options?: Readonly<AudioBusOptions>): void {
  out.gain = options?.gain ?? 1;
  out.muted = options?.muted ?? false;
  out.name = options?.name ?? '';
  out.pan = options?.pan ?? 0;
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

export function routeAudioChannelToMixerBus(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: Readonly<AudioMixer>,
  channel: AudioChannel,
  bus: AudioBus,
): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  addAudioBusToMixer(hostAudioMixer, mixer, bus);
  runtime.activeChannels.add(channel);
  runtime.channelToBus.set(channel, bus);
  const busNode = runtime.busNodes.get(bus);
  if (busNode !== undefined) {
    setAudioChannelSourceRoute(channel, (source) => {
      hostAudioMixer.routeSourceToBus(runtime.graph, source, busNode);
    });
  }
}

// Sets the bus gain and pushes it to the gain node of every mixer holding this bus, found by reverse
// lookup through busToMixerRuntimes.
//
// A bus that belongs to NO mixer has no node to push to, so the new value is stored and returned while
// nothing becomes audible. That is a silent no-op the return value cannot express — it reports the value
// that was set, not whether anything is listening — so it routes through the guard seam instead of relying
// on a comment telling callers to add the bus first.
export function setAudioBusGain(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  bus: AudioBus,
  value: number,
): number {
  bus.gain = value;
  reportUnmixedBus(bus, 'gain');
  updateBusGainNode(hostAudioMixer, bus);
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
export function setAudioBusMuted(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  bus: AudioBus,
  muted: boolean,
): boolean {
  bus.muted = muted;
  reportUnmixedBus(bus, 'mute');
  updateBusGainNode(hostAudioMixer, bus);
  return bus.muted;
}

// Same unmixed-bus caveat as setAudioBusGain: panning a bus no mixer holds changes nothing audible.
export function setAudioBusPan(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus, value: number): number {
  bus.pan = clamp(value, -1, 1);
  reportUnmixedBus(bus, 'pan');
  updateBusPannerNode(hostAudioMixer, bus);
  return bus.pan;
}

export function setAudioMixerMasterGain(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: AudioMixer,
  value: number,
): number {
  mixer.masterGain = value;
  const runtime = mixerRuntimes.get(mixer);
  if (runtime !== undefined) {
    hostAudioMixer.setMasterGain(runtime.graph, mixer.masterMuted ? 0 : value);
  }
  return mixer.masterGain;
}

export function setAudioMixerMasterMuted(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: AudioMixer,
  muted: boolean,
): boolean {
  mixer.masterMuted = muted;
  const runtime = mixerRuntimes.get(mixer);
  if (runtime !== undefined) {
    hostAudioMixer.setMasterGain(runtime.graph, muted ? 0 : mixer.masterGain);
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
  busNodes: Map<AudioBus, AudioBusNodeHandle>;
  channelToBus: WeakMap<AudioChannel, AudioBus>;
  graph: AudioMixerGraphHandle;
}

const mixerRuntimes = new WeakMap<AudioMixer, AudioMixerRuntime>();

// Reverse map from AudioBus to all mixer runtimes that contain it.
// This allows setAudioBusGain/setAudioBusMuted/setAudioBusPan to update the Web Audio graph
// without requiring the caller to pass the mixer.
const busToMixerRuntimes = new Map<AudioBus, Set<AudioMixerRuntime>>();

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

export function unrouteAudioChannelFromMixerBus(
  hostAudioMixer: Readonly<HostAudioMixerProvider>,
  mixer: Readonly<AudioMixer>,
  channel: AudioChannel,
): void {
  const runtime = mixerRuntimes.get(mixer);
  if (runtime === undefined) return;
  runtime.activeChannels.delete(channel);
  runtime.channelsPausedByMixer.delete(channel);
  runtime.channelToBus.delete(channel);
  setAudioChannelSourceRoute(channel, null);
  const source = getAudioChannelSourceHandle(channel);
  hostAudioMixer.unrouteSource(runtime.graph, source);
  hostAudioMixer.routeSourceToDefault(runtime.graph, source);
}

// Reports a write to a bus that belongs to no mixer. Cheap by construction — the Map lookup happens only
// when a guard is installed.
function reportUnmixedBus(bus: Readonly<AudioBus>, operation: AudioBusMixerOperation): void {
  if (_unmixedBusGuard === null) return;
  if (busToMixerRuntimes.get(bus) === undefined) _unmixedBusGuard(operation, bus);
}

let _unmixedBusGuard: AudioBusMixerGuard | null = null;

function updateBusGainNode(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus): void {
  const runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) return;
  for (const runtime of runtimes) {
    const busNode = runtime.busNodes.get(bus);
    if (busNode !== undefined) {
      hostAudioMixer.setBusNodeGain(runtime.graph, busNode, bus.muted ? 0 : bus.gain);
    }
  }
}

function updateBusPannerNode(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus): void {
  const runtimes = busToMixerRuntimes.get(bus);
  if (runtimes === undefined) return;
  for (const runtime of runtimes) {
    const busNode = runtime.busNodes.get(bus);
    if (busNode !== undefined) {
      hostAudioMixer.setBusNodePan(runtime.graph, busNode, bus.pan);
    }
  }
}
