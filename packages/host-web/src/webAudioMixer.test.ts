import type { AudioDeviceHandle } from '@flighthq/types/contract';

import { webHostAudioDevice } from './webAudioDevice';
import { webHostAudioMixer } from './webAudioMixer';

let device: AudioDeviceHandle | null = null;

afterEach(() => {
  if (device !== null) webHostAudioDevice.destroyDevice(device);
  device = null;
  vi.unstubAllGlobals();
});

describe('webHostAudioMixer', () => {
  it('exposes the frozen operation surface', () => {
    expect(Object.keys(webHostAudioMixer).sort()).toEqual([
      'createBusNode',
      'createMixerGraph',
      'destroyBusNode',
      'destroyMixerGraph',
      'fadeBusNodeGain',
      'routeSourceToBus',
      'routeSourceToDefault',
      'setBusNodeGain',
      'setBusNodePan',
      'setMasterGain',
      'unrouteSource',
    ]);
  });

  it('creates and destroys a master graph for the device context', () => {
    const audio = installFakeAudioContext();
    device = webHostAudioDevice.createDevice(48_000);
    const graph = webHostAudioMixer.createMixerGraph(device, 0.75);
    const master = audio.gains[0]!;

    expect(graph).not.toBe(0);
    expect(master.gain.value).toBe(0.75);
    expect(master.connect).toHaveBeenCalledWith(audio.destination);

    webHostAudioMixer.setMasterGain(graph, 0.25);
    expect(master.gain.value).toBe(0.25);
    webHostAudioMixer.destroyMixerGraph(graph);
    expect(master.disconnect).toHaveBeenCalledOnce();
  });

  it('creates, updates, fades, and destroys a bus chain', () => {
    const audio = installFakeAudioContext();
    device = webHostAudioDevice.createDevice(48_000);
    const graph = webHostAudioMixer.createMixerGraph(device, 1);
    const bus = webHostAudioMixer.createBusNode(graph, 0.6, -0.2);
    const master = audio.gains[0]!;
    const gain = audio.gains[1]!;
    const panner = audio.panners[0]!;

    expect(bus).not.toBe(0);
    expect(gain.gain.value).toBe(0.6);
    expect(panner.pan.value).toBe(-0.2);
    expect(gain.connect).toHaveBeenCalledWith(panner);
    expect(panner.connect).toHaveBeenCalledWith(master);

    webHostAudioMixer.setBusNodeGain(graph, bus, 0.4);
    webHostAudioMixer.setBusNodePan(graph, bus, 0.5);
    webHostAudioMixer.fadeBusNodeGain(graph, bus, 0.8, 500);
    expect(gain.gain.cancelScheduledValues).toHaveBeenCalledWith(2);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.4, 2);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 2.5);
    expect(panner.pan.value).toBe(0.5);

    webHostAudioMixer.destroyBusNode(graph, bus);
    expect(gain.disconnect).toHaveBeenCalledOnce();
    expect(panner.disconnect).toHaveBeenCalledOnce();
  });

  it('moves a source output between the default destination and a mixer bus', () => {
    const audio = installFakeAudioContext();
    device = webHostAudioDevice.createDevice(48_000);
    const graph = webHostAudioMixer.createMixerGraph(device, 1);
    const bus = webHostAudioMixer.createBusNode(graph, 1, 0);
    const buffer = webHostAudioDevice.createBuffer(device, 1, 1, 48_000, [new Float32Array(1)]);
    const source = webHostAudioDevice.createSource(device, buffer);
    const busGain = audio.gains[1]!;
    const sourceGain = audio.gains[2]!;

    expect(sourceGain.connect).toHaveBeenCalledWith(audio.destination);
    webHostAudioMixer.routeSourceToBus(graph, source, bus);
    expect(sourceGain.disconnect).toHaveBeenCalledOnce();
    expect(sourceGain.connect).toHaveBeenLastCalledWith(busGain);

    webHostAudioMixer.unrouteSource(graph, source);
    expect(sourceGain.disconnect).toHaveBeenCalledTimes(2);
    webHostAudioMixer.routeSourceToDefault(graph, source);
    expect(sourceGain.connect).toHaveBeenLastCalledWith(audio.destination);
  });

  it('returns zero handles and ignores operations for foreign handles', () => {
    installFakeAudioContext();
    const graph = webHostAudioMixer.createMixerGraph(99 as AudioDeviceHandle, 1);

    expect(graph).toBe(0);
    expect(webHostAudioMixer.createBusNode(graph, 1, 0)).toBe(0);
    expect(() => webHostAudioMixer.destroyMixerGraph(graph)).not.toThrow();
  });
});

interface FakeAudioGraph {
  destination: object;
  gains: FakeGainNode[];
  panners: FakePannerNode[];
}

interface FakeGainNode {
  connect: ReturnType<typeof vi.fn>;
  context: AudioContext;
  disconnect: ReturnType<typeof vi.fn>;
  gain: {
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
    value: number;
  };
}

interface FakePannerNode {
  connect: ReturnType<typeof vi.fn>;
  context: AudioContext;
  disconnect: ReturnType<typeof vi.fn>;
  pan: { value: number };
}

function installFakeAudioContext(): FakeAudioGraph {
  const destination = {};
  const gains: FakeGainNode[] = [];
  const panners: FakePannerNode[] = [];

  class FakeAudioContext {
    currentTime = 2;
    destination = destination;
    close = vi.fn(async (): Promise<void> => {});
    resume = vi.fn(async (): Promise<void> => {});

    createBufferSource(): AudioBufferSourceNode {
      return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        playbackRate: { value: 1 },
        start: vi.fn(),
        stop: vi.fn(),
      } as unknown as AudioBufferSourceNode;
    }

    createGain(): GainNode {
      const node: FakeGainNode = {
        connect: vi.fn(),
        context: this as unknown as AudioContext,
        disconnect: vi.fn(),
        gain: {
          cancelScheduledValues: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
          value: 1,
        },
      };
      gains.push(node);
      return node as unknown as GainNode;
    }

    createStereoPanner(): StereoPannerNode {
      const node: FakePannerNode = {
        connect: vi.fn(),
        context: this as unknown as AudioContext,
        disconnect: vi.fn(),
        pan: { value: 0 },
      };
      panners.push(node);
      return node as unknown as StereoPannerNode;
    }
  }

  class FakeAudioBuffer {
    copyToChannel = vi.fn();
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioBuffer', FakeAudioBuffer);
  return { destination, gains, panners };
}
