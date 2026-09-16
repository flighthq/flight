import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { AudioDeviceHandle, HostAudioDeviceCapability } from '@flighthq/types/contract';
import type { AudioSourceHandle } from '@flighthq/types/contract';

import {
  createWebAudioDeviceBackend,
  getAudioDeviceContext,
  getAudioSourceBufferSourceNode,
  getAudioSourceGainNode,
  hasAudioDeviceWebNodeAccess,
  initializeWebAudioDeviceBackend,
  webHostAudioDevice,
} from './webAudioDevice';

describe('createWebAudioDeviceBackend', () => {
  it('creates the backend with web node access', () => {
    const backend = createWebAudioDeviceBackend();

    expect(Object.keys(backend)).toEqual(
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

describe('createWebAudioDeviceBackend source graph', () => {
  it('routes the buffer source through a panner into the gain, and leaves gain as the output', () => {
    const graph = installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(44100);
    const buffer = backend.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = backend.createSource(device, buffer);
    backend.startSource(source, 0, 0);

    expect(graph.panner.connect).toHaveBeenCalledWith(graph.gain);
    expect(graph.bufferSource.connect).toHaveBeenCalledWith(graph.panner);
    expect(graph.bufferSource.connect).not.toHaveBeenCalledWith(graph.gain);
    expect(getAudioSourceGainNode(backend, source)).toBe(graph.gain as unknown as GainNode);
  });

  it('writes the pan value onto the panner param', () => {
    const graph = installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(44100);
    const buffer = backend.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = backend.createSource(device, buffer);

    backend.setSourcePan(source, -0.5);
    expect(graph.panner.pan.value).toBe(-0.5);
  });

  it('ignores a pan set against an unknown source handle', () => {
    installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    expect(() => backend.setSourcePan(99 as unknown as AudioSourceHandle, 1)).not.toThrow();
  });

  it('disconnects the panner when the source is destroyed', () => {
    const graph = installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(44100);
    const buffer = backend.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = backend.createSource(device, buffer);
    backend.startSource(source, 0, 0);

    backend.destroySource(source);
    expect(graph.panner.disconnect).toHaveBeenCalled();
    expect(graph.gain.disconnect).toHaveBeenCalled();
  });
});

describe('getAudioDeviceContext', () => {
  it('resolves the context behind a device handle for a web-bound caller', () => {
    installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(48000);

    expect(getAudioDeviceContext(backend, device)).not.toBeNull();
  });

  it('returns null for a handle this backend did not create', () => {
    const backend = createWebAudioDeviceBackend();
    expect(getAudioDeviceContext(backend, 999 as unknown as AudioDeviceHandle)).toBeNull();
  });

  it('returns null for a backend with no web extension', () => {
    const plain = allocateEntity<HostAudioDeviceCapability>();
    plain.createDevice = () => 1 as unknown as AudioDeviceHandle;
    expect(getAudioDeviceContext(finishEntity(plain), 1 as unknown as AudioDeviceHandle)).toBeNull();
  });
  // The defect this file exists to prevent recurring: a provider carrying the SOURCE-NODE extension
  // but no context resolver once passed the shared guard — which vouched for it on the strength of two
  // other methods — and threw TypeError at the call. Each capability is now guarded on the member it
  // actually calls.
  it('returns null for a source-node-only extension instead of throwing', () => {
    const out = allocateEntity<HostAudioDeviceCapability & Record<string, unknown>>();
    out.getSourceGainNode = (): null => null;
    out.getSourceBufferSourceNode = (): null => null;
    const backend = finishEntity(out);

    expect(() => getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).not.toThrow();
    expect(getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).toBeNull();
  });

  // The mirror case, so the split is verified in both directions rather than only the one that broke.
  it('resolves a context-only extension even though it carries no source-node methods', () => {
    const out = allocateEntity<HostAudioDeviceCapability & Record<string, unknown>>();
    const context = {} as AudioContext;
    out.getDeviceAudioContext = (): AudioContext => context;
    const backend = finishEntity(out);

    expect(getAudioDeviceContext(backend, 1 as unknown as AudioDeviceHandle)).toBe(context);
    expect(hasAudioDeviceWebNodeAccess(backend)).toBe(false);
  });

  // An `in` check would pass here and then throw at the call, which is the same defect by another
  // route, so the guard tests callability rather than presence.
  it('returns null when the property exists but is not callable', () => {
    const out = allocateEntity<HostAudioDeviceCapability & Record<string, unknown>>();
    out.getDeviceAudioContext = 'not a function';
    const backend = finishEntity(out);

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

function stubBackend(): HostAudioDeviceCapability {
  const out = allocateEntity<HostAudioDeviceCapability>();
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
  return finishEntity(out);
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
describe('initializeWebAudioDeviceBackend', () => {
  it('is the construction initializer of createWebAudioDeviceBackend', () => {
    expect(typeof initializeWebAudioDeviceBackend).toBe('function');
  });
});

describe('webHostAudioDevice', () => {
  it('is an Entity', () => {
    expect(EntityRuntimeKey in webHostAudioDevice).toBe(true);
  });

  it('is a stable singleton', () => {
    expect(webHostAudioDevice).toBe(webHostAudioDevice);
  });
});
