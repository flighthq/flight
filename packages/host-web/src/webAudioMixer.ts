import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioBusNodeHandle,
  AudioDeviceHandle,
  AudioMixerGraphHandle,
  AudioSourceHandle,
  EntityConstruction,
  HostAudioDeviceCapability,
  HostAudioMixerCapability,
} from '@flighthq/types/contract';

import { webHostAudioDevice } from './webAudioDevice';

export function createWebAudioMixerBackend(): HostAudioMixerCapability {
  const out = allocateEntity<HostAudioMixerCapability>();
  initializeWebAudioMixerBackend(out);
  return finishEntity(out);
}

export function initializeWebAudioMixerBackend(out: EntityConstruction<HostAudioMixerCapability>): void {
  let nextHandle = 1;
  const graphs = new Map<number, WebAudioMixerGraph>();
  const buses = new Map<number, WebAudioBusNode>();

  out.createMixerGraph = (device: AudioDeviceHandle, masterGain: number): AudioMixerGraphHandle => {
    const context = getDeviceAudioContext(webHostAudioDevice, device);
    if (context === null) return INVALID_GRAPH;
    const masterGainNode = context.createGain();
    masterGainNode.gain.value = masterGain;
    masterGainNode.connect(context.destination);
    const graph = nextHandle++ as AudioMixerGraphHandle;
    graphs.set(graph as number, { buses: new Set(), context, masterGainNode });
    return graph;
  };

  out.destroyMixerGraph = (graph: AudioMixerGraphHandle): void => {
    const entry = graphs.get(graph as number);
    if (entry === undefined) return;
    for (const bus of entry.buses) destroyBus(graph, bus, graphs, buses);
    entry.masterGainNode.disconnect();
    graphs.delete(graph as number);
  };

  out.createBusNode = (graph: AudioMixerGraphHandle, gain: number, pan: number): AudioBusNodeHandle => {
    const entry = graphs.get(graph as number);
    if (entry === undefined) return INVALID_BUS;
    const gainNode = entry.context.createGain();
    gainNode.gain.value = gain;
    const createStereoPanner = entry.context.createStereoPanner;
    const outputNode = typeof createStereoPanner === 'function' ? createStereoPanner.call(entry.context) : null;
    if (outputNode === null) {
      gainNode.connect(entry.masterGainNode);
    } else {
      outputNode.pan.value = pan;
      gainNode.connect(outputNode);
      outputNode.connect(entry.masterGainNode);
    }
    const bus = nextHandle++ as AudioBusNodeHandle;
    buses.set(bus as number, { gainNode, graph, outputNode });
    entry.buses.add(bus);
    return bus;
  };

  out.destroyBusNode = (graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle): void => {
    destroyBus(graph, bus, graphs, buses);
  };

  out.setBusNodeGain = (graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, gain: number): void => {
    const entry = getBus(graph, bus, graphs, buses);
    if (entry !== null) entry.gainNode.gain.value = gain;
  };

  out.setBusNodePan = (graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, pan: number): void => {
    const entry = getBus(graph, bus, graphs, buses);
    if (entry?.outputNode !== null && entry?.outputNode !== undefined) entry.outputNode.pan.value = pan;
  };

  out.fadeBusNodeGain = (
    graph: AudioMixerGraphHandle,
    bus: AudioBusNodeHandle,
    target: number,
    durationMs: number,
  ): void => {
    const graphEntry = graphs.get(graph as number);
    const busEntry = getBus(graph, bus, graphs, buses);
    if (graphEntry === undefined || busEntry === null) return;
    const now = graphEntry.context.currentTime;
    busEntry.gainNode.gain.cancelScheduledValues(now);
    busEntry.gainNode.gain.setValueAtTime(busEntry.gainNode.gain.value, now);
    busEntry.gainNode.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
  };

  out.setMasterGain = (graph: AudioMixerGraphHandle, gain: number): void => {
    const entry = graphs.get(graph as number);
    if (entry !== undefined) entry.masterGainNode.gain.value = gain;
  };

  out.routeSourceToBus = (graph: AudioMixerGraphHandle, source: AudioSourceHandle, bus: AudioBusNodeHandle): void => {
    const graphEntry = graphs.get(graph as number);
    const busEntry = getBus(graph, bus, graphs, buses);
    const sourceNode = getSourceGainNode(webHostAudioDevice, source);
    if (graphEntry === undefined || busEntry === null || !belongsToContext(sourceNode, graphEntry.context)) return;
    sourceNode.disconnect();
    sourceNode.connect(busEntry.gainNode);
  };

  out.unrouteSource = (graph: AudioMixerGraphHandle, source: AudioSourceHandle): void => {
    const entry = graphs.get(graph as number);
    const sourceNode = getSourceGainNode(webHostAudioDevice, source);
    if (entry === undefined || !belongsToContext(sourceNode, entry.context)) return;
    sourceNode.disconnect();
  };

  out.routeSourceToDefault = (graph: AudioMixerGraphHandle, source: AudioSourceHandle): void => {
    const entry = graphs.get(graph as number);
    const sourceNode = getSourceGainNode(webHostAudioDevice, source);
    if (entry === undefined || !belongsToContext(sourceNode, entry.context)) return;
    sourceNode.connect(entry.context.destination);
  };
}

export const webHostAudioMixer: HostAudioMixerCapability = createWebAudioMixerBackend();

interface WebAudioBusNode {
  gainNode: GainNode;
  graph: AudioMixerGraphHandle;
  outputNode: StereoPannerNode | null;
}

interface WebAudioDeviceMixerAccess extends HostAudioDeviceCapability {
  getDeviceAudioContext(device: AudioDeviceHandle): AudioContext | null;
  getSourceGainNode(source: AudioSourceHandle): GainNode | null;
}

interface WebAudioMixerGraph {
  buses: Set<AudioBusNodeHandle>;
  context: AudioContext;
  masterGainNode: GainNode;
}

function belongsToContext(node: GainNode | null, context: AudioContext): node is GainNode {
  return node !== null && node.context === context;
}

function destroyBus(
  graph: AudioMixerGraphHandle,
  bus: AudioBusNodeHandle,
  graphs: Map<number, WebAudioMixerGraph>,
  buses: Map<number, WebAudioBusNode>,
): void {
  const graphEntry = graphs.get(graph as number);
  const busEntry = getBus(graph, bus, graphs, buses);
  if (graphEntry === undefined || busEntry === null) return;
  busEntry.outputNode?.disconnect();
  busEntry.gainNode.disconnect();
  graphEntry.buses.delete(bus);
  buses.delete(bus as number);
}

function getBus(
  graph: AudioMixerGraphHandle,
  bus: AudioBusNodeHandle,
  graphs: ReadonlyMap<number, WebAudioMixerGraph>,
  buses: ReadonlyMap<number, WebAudioBusNode>,
): WebAudioBusNode | null {
  if (!graphs.has(graph as number)) return null;
  const entry = buses.get(bus as number);
  return entry?.graph === graph ? entry : null;
}

function getDeviceAudioContext(
  backend: Readonly<HostAudioDeviceCapability>,
  device: AudioDeviceHandle,
): AudioContext | null {
  return hasMixerAccess(backend) ? backend.getDeviceAudioContext(device) : null;
}

function getSourceGainNode(backend: Readonly<HostAudioDeviceCapability>, source: AudioSourceHandle): GainNode | null {
  return hasMixerAccess(backend) ? backend.getSourceGainNode(source) : null;
}

function hasMixerAccess(backend: Readonly<HostAudioDeviceCapability>): backend is WebAudioDeviceMixerAccess {
  return 'getDeviceAudioContext' in backend && 'getSourceGainNode' in backend;
}

const INVALID_GRAPH = 0 as AudioMixerGraphHandle;
const INVALID_BUS = 0 as AudioBusNodeHandle;
