import { createAudioResource } from '@flighthq/audio';

import { playAudioResource } from './audioChannel';
import {
  addAudioBusToMixer,
  createAudioBus,
  createAudioMixer,
  destroyAudioMixer,
  fadeAudioBusGain,
  getAudioMixerActiveChannels,
  pauseAllAudioMixerChannels,
  resumeAllAudioMixerChannels,
  routeAudioChannelToMixerBus,
  setAudioBusGain,
  setAudioBusMuted,
  setAudioBusPan,
  setAudioMixerMasterGain,
  setAudioMixerMasterMuted,
  stopAllAudioMixerChannels,
  unrouteAudioChannelFromMixerBus,
} from './audioMixer';

const createdSourceNodes: MockAudioBufferSourceNode[] = [];

class MockStereoPannerNode {
  pan = { value: 0 };
  connect(): void {}
  disconnect(): void {}
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loopEnd = 0;
  loopStart = 0;
  onended: (() => void) | null = null;
  playbackRate = { value: 1 };
  stopCount = 0;
  connect(): void {}
  start(): void {}
  stop(): void {
    this.stopCount++;
  }
}

class MockGainNode {
  gain = {
    cancelScheduledValues: () => {},
    linearRampToValueAtTime: () => {},
    setValueAtTime: () => {},
    value: 1,
  };
  connect(): void {}
  disconnect(): void {}
}

class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createBufferSource(): AudioBufferSourceNode {
    const node = new MockAudioBufferSourceNode();
    createdSourceNodes.push(node);
    return node as unknown as AudioBufferSourceNode;
  }
  createGain(): GainNode {
    return new MockGainNode() as unknown as GainNode;
  }
  createStereoPanner(): StereoPannerNode {
    return new MockStereoPannerNode() as unknown as StereoPannerNode;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

const ctx = new MockAudioContext() as unknown as AudioContext;

function createMockAudioBuffer(): AudioBuffer {
  return { duration: 1 } as AudioBuffer;
}

describe('addAudioBusToMixer', () => {
  it('registers the bus in the Web Audio graph without error', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus({ name: 'sfx', gain: 0.8 });
    expect(() => addAudioBusToMixer(mixer, bus)).not.toThrow();
  });

  it('is idempotent — calling twice does not duplicate the bus', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus({ name: 'music' });
    addAudioBusToMixer(mixer, bus);
    expect(() => addAudioBusToMixer(mixer, bus)).not.toThrow();
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
    const mixer = createAudioMixer(ctx);
    expect(mixer.masterGain).toBe(1);
    expect(mixer.masterMuted).toBe(false);
  });

  it('creates a mixer with provided options', () => {
    const mixer = createAudioMixer(ctx, { masterGain: 0.5, masterMuted: true });
    expect(mixer.masterGain).toBe(0.5);
    expect(mixer.masterMuted).toBe(true);
  });
});

describe('destroyAudioMixer', () => {
  it('stops routed channels, clears the active set, and is safe to call twice', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    destroyAudioMixer(mixer);
    expect(channel!.state).toBe('stopped');
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
    expect(() => destroyAudioMixer(mixer)).not.toThrow();
  });
});

describe('fadeAudioBusGain', () => {
  it('updates bus gain immediately when no audio context time has passed', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus({ gain: 1 });
    addAudioBusToMixer(mixer, bus);
    fadeAudioBusGain(mixer, bus, 0.5, 500);
    expect(bus.gain).toBe(0.5);
  });

  it('updates bus gain data when bus is not in a mixer', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus({ gain: 1 });
    fadeAudioBusGain(mixer, bus, 0.3, 200);
    expect(bus.gain).toBe(0.3);
  });
});

describe('getAudioMixerActiveChannels', () => {
  it('returns an empty array for a new mixer', () => {
    const mixer = createAudioMixer(ctx);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
  });

  it('returns routed channels', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(1);
  });
});

describe('pauseAllAudioMixerChannels', () => {
  it('stops the source node and marks playing channels as paused', () => {
    createdSourceNodes.length = 0;
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    pauseAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('paused');
    expect(createdSourceNodes[0]?.stopCount).toBeGreaterThan(0);
  });
});

describe('resumeAllAudioMixerChannels', () => {
  it('restarts the source node and marks paused channels as playing', () => {
    createdSourceNodes.length = 0;
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    pauseAllAudioMixerChannels(mixer);
    resumeAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('playing');
    // A fresh source node is created on resume (the paused one was stopped and discarded).
    expect(createdSourceNodes.length).toBeGreaterThan(1);
  });
});

describe('routeAudioChannelToMixerBus', () => {
  it('adds the channel to the mixer active channels', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    expect(getAudioMixerActiveChannels(mixer)).toContain(channel!);
  });
});

describe('setAudioBusGain', () => {
  it('updates bus gain', () => {
    const bus = createAudioBus();
    expect(setAudioBusGain(bus, 0.5)).toBe(0.5);
    expect(bus.gain).toBe(0.5);
  });
});

describe('setAudioBusMuted', () => {
  it('mutes the bus', () => {
    const bus = createAudioBus();
    expect(setAudioBusMuted(bus, true)).toBe(true);
    expect(bus.muted).toBe(true);
  });
});

describe('setAudioBusPan', () => {
  it('sets bus pan and clamps to [-1, 1]', () => {
    const bus = createAudioBus();
    expect(setAudioBusPan(bus, 0.5)).toBe(0.5);
    expect(setAudioBusPan(bus, 2)).toBe(1);
    expect(setAudioBusPan(bus, -2)).toBe(-1);
  });
});

describe('setAudioMixerMasterGain', () => {
  it('updates the master gain', () => {
    const mixer = createAudioMixer(ctx);
    expect(setAudioMixerMasterGain(mixer, 0.5)).toBe(0.5);
    expect(mixer.masterGain).toBe(0.5);
  });
});

describe('setAudioMixerMasterMuted', () => {
  it('mutes the master', () => {
    const mixer = createAudioMixer(ctx);
    expect(setAudioMixerMasterMuted(mixer, true)).toBe(true);
    expect(mixer.masterMuted).toBe(true);
  });
});

describe('stopAllAudioMixerChannels', () => {
  it('stops all routed channels and clears the active set', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    stopAllAudioMixerChannels(mixer);
    expect(channel!.state).toBe('stopped');
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
  });
});

describe('unrouteAudioChannelFromMixerBus', () => {
  it('removes the channel from the mixer active channels', () => {
    const mixer = createAudioMixer(ctx);
    const bus = createAudioBus();
    const channel = playAudioResource(ctx, createAudioResource(createMockAudioBuffer()));
    expect(channel).not.toBeNull();
    routeAudioChannelToMixerBus(mixer, channel!, bus);
    unrouteAudioChannelFromMixerBus(mixer, channel!);
    expect(getAudioMixerActiveChannels(mixer)).toHaveLength(0);
  });
});
