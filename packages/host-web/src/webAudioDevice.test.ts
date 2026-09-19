import type { AudioDeviceHandle, HostAudioDeviceCapability } from '@flighthq/types/contract';
import type { AudioSourceHandle } from '@flighthq/types/contract';

import {
  getAudioDeviceContext,
  getAudioSourceBufferSourceNode,
  getAudioSourceGainNode,
  hasAudioDeviceWebNodeAccess,
  webHostAudioDevice,
} from './webAudioDevice';

describe('getAudioDeviceContext', () => {
  it('resolves the context behind a device handle for a web-bound caller', () => {
    installFakeAudioContext();
    const device = webHostAudioDevice.createDevice(48000);

    expect(getAudioDeviceContext(webHostAudioDevice, device)).not.toBeNull();
  });

  it('returns null for a handle this backend did not create', () => {
    expect(getAudioDeviceContext(webHostAudioDevice, 999 as unknown as AudioDeviceHandle)).toBeNull();
  });

  it('returns null for a backend with no web extension', () => {
    const plain = {} as HostAudioDeviceCapability;
    plain.createDevice = () => 1 as unknown as AudioDeviceHandle;
    expect(getAudioDeviceContext(plain, 1 as unknown as AudioDeviceHandle)).toBeNull();
  });

  it('returns null for a source-node-only extension instead of throwing', () => {
    const out = {} as HostAudioDeviceCapability & Record<string, unknown>;
    out.getSourceGainNode = (): null => null;
    out.getSourceBufferSourceNode = (): null => null;
    const backend = out;

    expect(() => getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).not.toThrow();
    expect(getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).toBeNull();
  });

  it('resolves a context-only extension even though it carries no source-node methods', () => {
    const out = {} as HostAudioDeviceCapability & Record<string, unknown>;
    const context = {} as AudioContext;
    out.getDeviceAudioContext = (): AudioContext => context;
    const backend = out;

    expect(getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).toBe(context);
    expect(hasAudioDeviceWebNodeAccess(backend)).toBe(false);
  });

  it('returns null when the property exists but is not callable', () => {
    const out = {} as HostAudioDeviceCapability & Record<string, unknown>;
    out.getDeviceAudioContext = 'not a function';
    const backend = out;

    expect(getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).toBeNull();
  });
});

describe('getAudioSourceBufferSourceNode', () => {
  it('returns null for a plain backend', () => {
    expect(getAudioSourceBufferSourceNode(stubBackend(), 1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('delegates to the web extension when present', () => {
    const mockNode = {} as AudioBufferSourceNode;
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => mockNode,
      getSourceGainNode: () => null,
    };
    expect(getAudioSourceBufferSourceNode(backend, 1 as unknown as AudioSourceHandle)).toBe(mockNode);
  });
});

describe('getAudioSourceGainNode', () => {
  it('returns null for a plain backend', () => {
    expect(getAudioSourceGainNode(stubBackend(), 1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('delegates to the web extension when present', () => {
    const mockNode = {} as GainNode;
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => null,
      getSourceGainNode: () => mockNode,
    };
    expect(getAudioSourceGainNode(backend, 1 as unknown as AudioSourceHandle)).toBe(mockNode);
  });
});

describe('hasAudioDeviceWebNodeAccess', () => {
  it('returns false for a plain backend', () => {
    expect(hasAudioDeviceWebNodeAccess(stubBackend())).toBe(false);
  });

  it('returns true when the backend has web extension methods', () => {
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => null,
      getSourceGainNode: () => null,
    };
    expect(hasAudioDeviceWebNodeAccess(backend)).toBe(true);
  });
});

describe('webHostAudioDevice', () => {
  it('is a stable singleton', () => {
    expect(webHostAudioDevice).toBe(webHostAudioDevice);
  });

  it('exposes the expected audio device methods', () => {
    expect(Object.keys(webHostAudioDevice)).toEqual(
      expect.arrayContaining([
        'createBuffer',
        'createDevice',
        'createSource',
        'destroyBuffer',
        'destroyDevice',
        'destroySource',
        'fadeSourceGain',
        'getDeviceAudioContext',
        'getDeviceTime',
        'getSourceBufferSourceNode',
        'getSourceGainNode',
        'onSourceEnded',
        'resumeDevice',
        'setSourceGain',
        'setSourcePan',
        'setSourcePlaybackRate',
        'startSource',
        'stopSource',
      ]),
    );
  });
});

describe('webHostAudioDevice source graph', () => {
  it('routes the buffer source through a panner into the gain, and leaves gain as the output', () => {
    const graph = installFakeAudioContext();
    const device = webHostAudioDevice.createDevice(44100);
    const buffer = webHostAudioDevice.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = webHostAudioDevice.createSource(device, buffer);
    webHostAudioDevice.startSource(source, 0, 0);

    expect(graph.panner.connect).toHaveBeenCalledWith(graph.gain);
    expect(graph.bufferSource.connect).toHaveBeenCalledWith(graph.panner);
    expect(graph.bufferSource.connect).not.toHaveBeenCalledWith(graph.gain);
    expect(getAudioSourceGainNode(webHostAudioDevice, source)).toBe(graph.gain as unknown as GainNode);
  });

  it('writes the pan value onto the panner param', () => {
    const graph = installFakeAudioContext();
    const device = webHostAudioDevice.createDevice(44100);
    const buffer = webHostAudioDevice.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = webHostAudioDevice.createSource(device, buffer);

    webHostAudioDevice.setSourcePan(source, -0.5);
    expect(graph.panner.pan.value).toBe(-0.5);
  });

  it('ignores a pan set against an unknown source handle', () => {
    installFakeAudioContext();
    expect(() => webHostAudioDevice.setSourcePan(99 as unknown as AudioSourceHandle, 1)).not.toThrow();
  });

  it('disconnects the panner when the source is destroyed', () => {
    const graph = installFakeAudioContext();
    const device = webHostAudioDevice.createDevice(44100);
    const buffer = webHostAudioDevice.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = webHostAudioDevice.createSource(device, buffer);
    webHostAudioDevice.startSource(source, 0, 0);

    webHostAudioDevice.destroySource(source);
    expect(graph.panner.disconnect).toHaveBeenCalled();
    expect(graph.gain.disconnect).toHaveBeenCalled();
  });
});

function stubBackend(): HostAudioDeviceCapability {
  const out = {} as HostAudioDeviceCapability;
  out.createBuffer = vi.fn().mockReturnValue(1);
  out.createDevice = vi.fn().mockReturnValue(1);
  out.createSource = vi.fn().mockReturnValue(1);
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
  return out;
}

function installFakeAudioContext(): {
  bufferSource: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } & Record<string, unknown>;
  gain: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } & Record<string, unknown>;
  panner: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    pan: { value: number };
  };
} {
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const panner = { connect: vi.fn(), disconnect: vi.fn(), pan: { value: 0 } };
  const bufferSource = {
    buffer: null as unknown,
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null as (() => void) | null,
    playbackRate: { value: 1 },
    start: vi.fn(),
    stop: vi.fn(),
  };
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    close = async (): Promise<void> => {};
    createBufferSource = (): unknown => bufferSource;
    createGain = (): unknown => gain;
    createStereoPanner = (): unknown => panner;
    resume = async (): Promise<void> => {};
  }
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  globalThis.AudioBuffer = class {
    copyToChannel = (): void => {};
  } as unknown as typeof AudioBuffer;
  return { bufferSource, gain, panner };
}
