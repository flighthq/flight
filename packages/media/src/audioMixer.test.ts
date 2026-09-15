import { createAudioResource } from '@flighthq/audio/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioBusNodeHandle,
  AudioDeviceHandle,
  AudioMixerGraphHandle,
  AudioSourceHandle,
  HostAudioDeviceProvider,
  HostAudioMixerProvider,
} from '@flighthq/types/contract';

import { pauseAudioChannel, playAudioResource } from './audioChannel';
import {
  addAudioBusToMixer,
  createAudioBus,
  createAudioMixer,
  destroyAudioMixer,
  fadeAudioBusGain,
  getAudioMixerActiveChannels,
  initializeAudioBus,
  pauseAllAudioMixerChannels,
  resumeAllAudioMixerChannels,
  routeAudioChannelToMixerBus,
  setAudioBusGain,
  setAudioBusMixerGuard,
  setAudioBusMuted,
  setAudioBusPan,
  setAudioMixerMasterGain,
  setAudioMixerMasterMuted,
  stopAllAudioMixerChannels,
  unrouteAudioChannelFromMixerBus,
} from './audioMixer';

let nextSourceHandle = 1;
let mockBackend: HostAudioDeviceProvider;
let mockMixer: HostAudioMixerProvider;
const device = 1 as unknown as AudioDeviceHandle;
const graph = 1 as unknown as AudioMixerGraphHandle;
const busNode = 1 as unknown as AudioBusNodeHandle;

function createMockAudioBuffer(): AudioBuffer {
  return {
    duration: 1,
    getChannelData: () => new Float32Array(44100),
    length: 44100,
    numberOfChannels: 1,
    sampleRate: 44100,
  } as unknown as AudioBuffer;
}

function createMockBackend(): HostAudioDeviceProvider {
  const out = allocateEntity<any>();
  out.createBuffer = vi.fn().mockReturnValue(1);
  out.createDevice = vi.fn().mockReturnValue(1);
  out.createSource = vi.fn(() => nextSourceHandle++ as unknown as AudioSourceHandle);
  out.destroyBuffer = vi.fn();
  out.destroyDevice = vi.fn();
  out.destroySource = vi.fn();
  out.getDeviceTime = vi.fn().mockReturnValue(0);
  out.onSourceEnded = vi.fn();
  out.resumeDevice = vi.fn();
  out.setSourceGain = vi.fn();
  out.setSourcePan = vi.fn();
  out.setSourcePlaybackRate = vi.fn();
  out.startSource = vi.fn();
  out.stopSource = vi.fn();
  return finishEntity(out);
}

function createMockMixer(): HostAudioMixerProvider {
  const out = allocateEntity<HostAudioMixerProvider>();
  out.createMixerGraph = vi.fn(() => graph);
  out.destroyMixerGraph = vi.fn();
  out.createBusNode = vi.fn(() => busNode);
  out.destroyBusNode = vi.fn();
  out.setBusNodeGain = vi.fn();
  out.setBusNodePan = vi.fn();
  out.fadeBusNodeGain = vi.fn();
  out.setMasterGain = vi.fn();
  out.routeSourceToBus = vi.fn();
  out.unrouteSource = vi.fn();
  out.routeSourceToDefault = vi.fn();
  return finishEntity(out);
}

beforeEach(() => {
  nextSourceHandle = 1;
  mockBackend = createMockBackend();
  mockMixer = createMockMixer();
});

describe('addAudioBusToMixer', () => {
  it('registers the bus in the Web Audio graph without error', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus({ name: 'sfx', gain: 0.8 });
    expect(() => addAudioBusToMixer(mockMixer, mixer, bus)).not.toThrow();
    expect(mockMixer.createBusNode).toHaveBeenCalledWith(graph, 0.8, 0);
  });

  it('is idempotent — calling twice does not duplicate the bus', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus({ name: 'music' });
    addAudioBusToMixer(mockMixer, mixer, bus);
    expect(() => addAudioBusToMixer(mockMixer, mixer, bus)).not.toThrow();
    expect(mockMixer.createBusNode).toHaveBeenCalledOnce();
  });
});

describe('createAudioBus', () => {
  it('creates a bus with default values', () => {
    const bus = createAudioBus();
    expect(bus.gain).toBe(1);
    expect(bus.muted).toBe(false);
    expect(bus.name).toBe('');
    expect(bus.pan).toBe(0);
  });

  it('creates a bus with provided options', () => {
    const bus = createAudioBus({ gain: 0.7, muted: true, name: 'sfx', pan: 0.3 });
    expect(bus.gain).toBe(0.7);
    expect(bus.muted).toBe(true);
    expect(bus.name).toBe('sfx');
    expect(bus.pan).toBe(0.3);
  });
});

describe('createAudioMixer', () => {
  it('creates a mixer with default master values', () => {
    const mixer = createAudioMixer(mockMixer, device);
    expect(mixer.masterGain).toBe(1);
    expect(mixer.masterMuted).toBe(false);
    expect(mockMixer.createMixerGraph).toHaveBeenCalledWith(device, 1);
  });

  it('creates a mixer with provided options', () => {
    const mixer = createAudioMixer(mockMixer, device, { masterGain: 0.5, masterMuted: true });
    expect(mixer.masterGain).toBe(0.5);
    expect(mixer.masterMuted).toBe(true);
    expect(mockMixer.createMixerGraph).toHaveBeenCalledWith(device, 0);
  });
});

describe('destroyAudioMixer', () => {
  it('stops routed channels, clears the active set, and is safe to call twice', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    destroyAudioMixer(mockMixer, mixer);
    expect(channel!.state).toBe('stopped');
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
    expect(mockMixer.destroyBusNode).toHaveBeenCalledWith(graph, busNode);
    expect(mockMixer.destroyMixerGraph).toHaveBeenCalledWith(graph);
    expect(() => destroyAudioMixer(mockMixer, mixer)).not.toThrow();
    expect(mockMixer.destroyMixerGraph).toHaveBeenCalledOnce();
  });
});

describe('explicit provider-first mixer operations', () => {
  it('uses the provider supplied to each host operation instead of retaining the construction provider', () => {
    const operationProvider = createMockMixer();
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()))!;

    addAudioBusToMixer(operationProvider, mixer, bus);
    setAudioBusGain(operationProvider, bus, 0.5);
    setAudioBusMuted(operationProvider, bus, true);
    setAudioBusPan(operationProvider, bus, 0.25);
    fadeAudioBusGain(operationProvider, mixer, bus, 0.75, 100);
    setAudioMixerMasterGain(operationProvider, mixer, 0.4);
    setAudioMixerMasterMuted(operationProvider, mixer, true);
    routeAudioChannelToMixerBus(operationProvider, mixer, channel, bus);
    unrouteAudioChannelFromMixerBus(operationProvider, mixer, channel);
    destroyAudioMixer(operationProvider, mixer);

    expect(operationProvider.createBusNode).toHaveBeenCalled();
    expect(operationProvider.setBusNodeGain).toHaveBeenCalled();
    expect(operationProvider.setBusNodePan).toHaveBeenCalled();
    expect(operationProvider.fadeBusNodeGain).toHaveBeenCalled();
    expect(operationProvider.setMasterGain).toHaveBeenCalled();
    expect(operationProvider.routeSourceToBus).toHaveBeenCalled();
    expect(operationProvider.unrouteSource).toHaveBeenCalled();
    expect(operationProvider.routeSourceToDefault).toHaveBeenCalled();
    expect(operationProvider.destroyBusNode).toHaveBeenCalled();
    expect(operationProvider.destroyMixerGraph).toHaveBeenCalled();
    expect(mockMixer.createMixerGraph).toHaveBeenCalledOnce();
    expect(mockMixer.createBusNode).not.toHaveBeenCalled();
  });
});

describe('fadeAudioBusGain', () => {
  it('updates bus gain immediately when no audio context time has passed', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus({ gain: 1 });
    addAudioBusToMixer(mockMixer, mixer, bus);
    fadeAudioBusGain(mockMixer, mixer, bus, 0.5, 500);
    expect(bus.gain).toBe(0.5);
    expect(mockMixer.fadeBusNodeGain).toHaveBeenCalledWith(graph, busNode, 0.5, 500);
  });

  it('updates bus gain data when bus is not in a mixer', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus({ gain: 1 });
    fadeAudioBusGain(mockMixer, mixer, bus, 0.3, 200);
    expect(bus.gain).toBe(0.3);
  });
});

describe('getAudioMixerActiveChannels', () => {
  it('returns an empty array for a new mixer', () => {
    const mixer = createAudioMixer(mockMixer, device);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
  });

  it('returns routed channels', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(1);
  });
});

describe('initializeAudioBus', () => {
  it('is the construction initializer of createAudioBus', () => {
    expect(typeof initializeAudioBus).toBe('function');
  });
});

describe('pauseAllAudioMixerChannels', () => {
  it('destroys the active source and marks playing channels as paused', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    pauseAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('paused');
    expect(mockBackend.destroySource).toHaveBeenCalled();
  });
});

describe('resumeAllAudioMixerChannels', () => {
  it('creates a new source and marks paused channels as playing', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    const createCountBefore = (mockBackend.createSource as ReturnType<typeof vi.fn>).mock.calls.length;
    pauseAllAudioMixerChannels(mixer);
    resumeAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('playing');
    expect((mockBackend.createSource as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(createCountBefore);
    expect(mockMixer.routeSourceToBus).toHaveBeenCalledTimes(2);
  });
});

describe('resumeAllAudioMixerChannels scope', () => {
  function playRouted(mixer: ReturnType<typeof createAudioMixer>, bus: ReturnType<typeof createAudioBus>) {
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()))!;
    routeAudioChannelToMixerBus(mockMixer, mixer, channel, bus);
    return channel;
  }

  function mixerWithBus() {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus({ name: 'sfx' });
    addAudioBusToMixer(mockMixer, mixer, bus);
    return { bus, mixer };
  }

  it('leaves a channel the caller paused independently still paused', () => {
    const { bus, mixer } = mixerWithBus();
    const mixerPaused = playRouted(mixer, bus);
    const callerPaused = playRouted(mixer, bus);

    pauseAudioChannel(callerPaused);
    pauseAllAudioMixerChannels(mixer);
    resumeAllAudioMixerChannels(mixer);

    expect(mixerPaused.state).toBe('playing');
    expect(callerPaused.state).toBe('paused');
  });

  it('resumes the channels it paused', () => {
    const { bus, mixer } = mixerWithBus();
    const channel = playRouted(mixer, bus);

    pauseAllAudioMixerChannels(mixer);
    expect(channel.state).toBe('paused');
    resumeAllAudioMixerChannels(mixer);

    expect(channel.state).toBe('playing');
  });

  it('does not resume a channel unrouted while the mixer was paused', () => {
    const { bus, mixer } = mixerWithBus();
    const channel = playRouted(mixer, bus);

    pauseAllAudioMixerChannels(mixer);
    unrouteAudioChannelFromMixerBus(mockMixer, mixer, channel);
    resumeAllAudioMixerChannels(mixer);

    expect(channel.state).toBe('paused');
  });

  it('does not resume a channel stopped while the mixer was paused', () => {
    const { bus, mixer } = mixerWithBus();
    const channel = playRouted(mixer, bus);

    pauseAllAudioMixerChannels(mixer);
    stopAllAudioMixerChannels(mixer);
    resumeAllAudioMixerChannels(mixer);

    expect(channel.state).toBe('stopped');
  });

  it('does not re-resume on a second call after the caller paused again', () => {
    const { bus, mixer } = mixerWithBus();
    const channel = playRouted(mixer, bus);

    pauseAllAudioMixerChannels(mixer);
    resumeAllAudioMixerChannels(mixer);
    pauseAudioChannel(channel);
    resumeAllAudioMixerChannels(mixer);

    expect(channel.state).toBe('paused');
  });
});

describe('routeAudioChannelToMixerBus', () => {
  it('adds the channel to the mixer active channels', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    expect(getAudioMixerActiveChannels(mixer)).toContain(channel!);
    expect(mockMixer.routeSourceToBus).toHaveBeenCalledWith(graph, 1, busNode);
  });
});

describe('setAudioBusGain', () => {
  it('updates bus gain', () => {
    const bus = createAudioBus();
    expect(setAudioBusGain(mockMixer, bus, 0.5)).toBe(0.5);
    expect(bus.gain).toBe(0.5);
  });
});

describe('setAudioBusMixerGuard', () => {
  it('reports a bus-property write that reaches no mixer, for each setter', () => {
    const seen: string[] = [];
    setAudioBusMixerGuard((operation) => seen.push(operation));
    try {
      const orphan = createAudioBus({ name: 'orphan' });
      expect(setAudioBusGain(mockMixer, orphan, 0.25)).toBe(0.25);
      setAudioBusMuted(mockMixer, orphan, true);
      setAudioBusPan(mockMixer, orphan, -1);
    } finally {
      setAudioBusMixerGuard(null);
    }
    expect(seen).toEqual(['gain', 'mute', 'pan']);
  });

  it('stays silent for a bus that belongs to a mixer, and once uninstalled', () => {
    const seen: string[] = [];
    setAudioBusMixerGuard((operation) => seen.push(operation));
    try {
      const mixer = createAudioMixer(mockMixer, device);
      const bus = createAudioBus({ name: 'music' });
      addAudioBusToMixer(mockMixer, mixer, bus);
      setAudioBusGain(mockMixer, bus, 0.5);
      setAudioBusMuted(mockMixer, bus, true);
      setAudioBusPan(mockMixer, bus, 0.5);
      expect(seen).toEqual([]);
      expect(mockMixer.setBusNodeGain).toHaveBeenLastCalledWith(graph, busNode, 0);
      expect(mockMixer.setBusNodePan).toHaveBeenCalledWith(graph, busNode, 0.5);
    } finally {
      setAudioBusMixerGuard(null);
    }
    setAudioBusGain(mockMixer, createAudioBus({ name: 'orphan2' }), 0.75);
    expect(seen).toEqual([]);
  });
});

describe('setAudioBusMuted', () => {
  it('mutes the bus', () => {
    const bus = createAudioBus();
    expect(setAudioBusMuted(mockMixer, bus, true)).toBe(true);
    expect(bus.muted).toBe(true);
  });
});

describe('setAudioBusPan', () => {
  it('sets bus pan and clamps to [-1, 1]', () => {
    const bus = createAudioBus();
    expect(setAudioBusPan(mockMixer, bus, 0.5)).toBe(0.5);
    expect(setAudioBusPan(mockMixer, bus, 2)).toBe(1);
    expect(setAudioBusPan(mockMixer, bus, -2)).toBe(-1);
  });
});

describe('setAudioMixerMasterGain', () => {
  it('updates the master gain', () => {
    const mixer = createAudioMixer(mockMixer, device);
    expect(setAudioMixerMasterGain(mockMixer, mixer, 0.5)).toBe(0.5);
    expect(mixer.masterGain).toBe(0.5);
    expect(mockMixer.setMasterGain).toHaveBeenCalledWith(graph, 0.5);
  });
});

describe('setAudioMixerMasterMuted', () => {
  it('mutes the master', () => {
    const mixer = createAudioMixer(mockMixer, device);
    expect(setAudioMixerMasterMuted(mockMixer, mixer, true)).toBe(true);
    expect(mixer.masterMuted).toBe(true);
    expect(mockMixer.setMasterGain).toHaveBeenCalledWith(graph, 0);
  });
});

describe('stopAllAudioMixerChannels', () => {
  it('stops all routed channels and clears the active set', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    stopAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('stopped');
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
  });

  it('stops the underlying source, not just the channel state', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()))!;
    routeAudioChannelToMixerBus(mockMixer, mixer, channel, bus);
    const stopSource = mockBackend.stopSource as unknown as ReturnType<typeof vi.fn>;
    const destroySource = mockBackend.destroySource as unknown as ReturnType<typeof vi.fn>;
    const before = stopSource.mock.calls.length + destroySource.mock.calls.length;

    stopAllAudioMixerChannels(mixer);

    expect(stopSource.mock.calls.length + destroySource.mock.calls.length).toBeGreaterThan(before);
    expect(channel.state).toBe('stopped');
    expect(channel.currentTime).toBe(0);
  });

  it('stops every routed channel, not only the first', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const first = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()))!;
    const second = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()))!;
    routeAudioChannelToMixerBus(mockMixer, mixer, first, bus);
    routeAudioChannelToMixerBus(mockMixer, mixer, second, bus);

    stopAllAudioMixerChannels(mixer);

    expect(first.state).toBe('stopped');
    expect(second.state).toBe('stopped');
    expect(getAudioMixerActiveChannels(mixer)).toEqual([]);
  });
});
describe('unrouteAudioChannelFromMixerBus', () => {
  it('removes the channel from the mixer active channels', () => {
    const mixer = createAudioMixer(mockMixer, device);
    const bus = createAudioBus();
    const channel = playAudioResource(mockBackend, device, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mockMixer, mixer, channel!, bus);
    unrouteAudioChannelFromMixerBus(mockMixer, mixer, channel!);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
    expect(mockMixer.unrouteSource).toHaveBeenCalledWith(graph, 1);
    expect(mockMixer.routeSourceToDefault).toHaveBeenCalledWith(graph, 1);
  });
});
