import type { AudioDeviceBackend } from '@flighthq/types/contract';
import type { AudioSourceHandle } from '@flighthq/types/contract';

import {
  createWebAudioDeviceBackend,
  explainAudioDeviceBackend,
  explainAudioDeviceOperation,
  getAudioDeviceBackend,
  getAudioSourceBufferSourceNode,
  getAudioSourceGainNode,
  hasAudioDeviceOperation,
  hasAudioDeviceWebNodeAccess,
  installAudioDeviceHostBackend,
  observeAudioDeviceHostResult,
  resetAudioDeviceBackendForTest,
  setAudioDeviceBackend,
} from './audioDeviceBackend';

afterEach(() => {
  resetAudioDeviceBackendForTest();
});

describe('createWebAudioDeviceBackend', () => {
  it('creates the backend with web node access', () => {
    const backend = createWebAudioDeviceBackend();

    expect(Object.keys(backend).sort()).toEqual([
      'createBuffer',
      'createDevice',
      'createSource',
      'destroyBuffer',
      'destroyDevice',
      'destroySource',
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
    ]);
  });
});

describe('createWebAudioDeviceBackend source graph', () => {
  it('routes the buffer source through a panner into the gain, and leaves gain as the output', () => {
    // The panner is inserted BEFORE the gain so the gain node stays the source's output node. If it
    // were appended after, channel routing and disposal would silently keep addressing the wrong node.
    const graph = installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(44100);
    const buffer = backend.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = backend.createSource(device, buffer);
    backend.startSource(source, 0);

    expect(graph.panner.connect).toHaveBeenCalledWith(graph.gain);
    expect(graph.bufferSource.connect).toHaveBeenCalledWith(graph.panner);
    expect(graph.bufferSource.connect).not.toHaveBeenCalledWith(graph.gain);
    expect(backend.getSourceGainNode(source)).toBe(graph.gain as unknown as GainNode);
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
    // A panner left connected outlives its source and keeps the gain node reachable — a leak that no
    // audible behaviour would reveal.
    const graph = installFakeAudioContext();
    const backend = createWebAudioDeviceBackend();
    const device = backend.createDevice(44100);
    const buffer = backend.createBuffer(device, 1, 1, 44100, [new Float32Array(1)]);
    const source = backend.createSource(device, buffer);
    backend.startSource(source, 0);

    backend.destroySource(source);
    expect(graph.panner.disconnect).toHaveBeenCalled();
    expect(graph.gain.disconnect).toHaveBeenCalled();
  });
});

describe('explainAudioDeviceBackend', () => {
  it('reports host-not-enabled when no backend is installed', () => {
    expect(explainAudioDeviceBackend().layer).toBe('host-not-enabled');
  });

  it('reports custom layer when a custom backend is set', () => {
    setAudioDeviceBackend(stubBackend());
    expect(explainAudioDeviceBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installAudioDeviceHostBackend(stubBackend());
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceBackend().conflict).toBe(true);
  });

  it('does not report conflict when the same backend is installed twice', () => {
    const backend = stubBackend();
    installAudioDeviceHostBackend(backend);
    installAudioDeviceHostBackend(backend);
    expect(explainAudioDeviceBackend().conflict).toBe(false);
  });
});

describe('explainAudioDeviceOperation', () => {
  it('reports implemented for a host backend operation', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(explainAudioDeviceOperation('createDevice').implemented).toBe(true);
    expect(explainAudioDeviceOperation('createDevice').layer).toBe('host');
  });

  it('reports sentinel when no backend is installed', () => {
    expect(explainAudioDeviceOperation('createDevice').implemented).toBe(false);
    expect(explainAudioDeviceOperation('createDevice').layer).toBe('sentinel');
  });

  it('reports panning through the same seam as every other operation', () => {
    // Pan is not a capability a caller has to probe for separately: an unsupported backend answers
    // through the existing operation seam, and the sentinel absorbs the call rather than throwing.
    expect(explainAudioDeviceOperation('setSourcePan').implemented).toBe(false);
    expect(explainAudioDeviceOperation('setSourcePan').layer).toBe('sentinel');
    expect(() => getAudioDeviceBackend().setSourcePan(1 as unknown as AudioSourceHandle, -1)).not.toThrow();
    installAudioDeviceHostBackend(stubBackend());
    expect(hasAudioDeviceOperation('setSourcePan')).toBe(true);
  });
});

describe('getAudioDeviceBackend', () => {
  it('returns the sentinel when no backend is installed', () => {
    const backend = getAudioDeviceBackend();
    expect(backend.getDeviceTime(0 as never)).toBe(0);
  });

  it('returns a custom backend over a host backend', () => {
    const host = stubBackend();
    const custom = stubBackend();
    installAudioDeviceHostBackend(host);
    setAudioDeviceBackend(custom);
    expect(getAudioDeviceBackend()).toBe(custom);
  });

  it('returns a host backend when no custom is set', () => {
    const host = stubBackend();
    installAudioDeviceHostBackend(host);
    expect(getAudioDeviceBackend()).toBe(host);
  });
});

describe('getAudioSourceBufferSourceNode', () => {
  it('returns null when no web-extended backend is installed', () => {
    expect(getAudioSourceBufferSourceNode(1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('returns null when a plain backend is installed', () => {
    setAudioDeviceBackend(stubBackend());
    expect(getAudioSourceBufferSourceNode(1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('delegates to the web extension when present', () => {
    const mockNode = {} as AudioBufferSourceNode;
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => mockNode,
      getSourceGainNode: () => null,
    };
    setAudioDeviceBackend(backend);
    expect(getAudioSourceBufferSourceNode(1 as unknown as AudioSourceHandle)).toBe(mockNode);
  });
});

describe('getAudioSourceGainNode', () => {
  it('returns null when no web-extended backend is installed', () => {
    expect(getAudioSourceGainNode(1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('returns null when a plain backend is installed', () => {
    setAudioDeviceBackend(stubBackend());
    expect(getAudioSourceGainNode(1 as unknown as AudioSourceHandle)).toBeNull();
  });

  it('delegates to the web extension when present', () => {
    const mockNode = {} as GainNode;
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => null,
      getSourceGainNode: () => mockNode,
    };
    setAudioDeviceBackend(backend);
    expect(getAudioSourceGainNode(1 as unknown as AudioSourceHandle)).toBe(mockNode);
  });
});

describe('hasAudioDeviceOperation', () => {
  it('returns false for the sentinel', () => {
    expect(hasAudioDeviceOperation('createDevice')).toBe(false);
  });

  it('returns true for an installed backend', () => {
    installAudioDeviceHostBackend(stubBackend());
    expect(hasAudioDeviceOperation('createDevice')).toBe(true);
  });
});

describe('hasAudioDeviceWebNodeAccess', () => {
  it('returns false when no backend is installed', () => {
    expect(hasAudioDeviceWebNodeAccess()).toBe(false);
  });

  it('returns false for a plain backend', () => {
    setAudioDeviceBackend(stubBackend());
    expect(hasAudioDeviceWebNodeAccess()).toBe(false);
  });

  it('returns true when the backend has web extension methods', () => {
    const backend = {
      ...stubBackend(),
      getSourceBufferSourceNode: () => null,
      getSourceGainNode: () => null,
    };
    setAudioDeviceBackend(backend);
    expect(hasAudioDeviceWebNodeAccess()).toBe(true);
  });
});

describe('installAudioDeviceHostBackend', () => {
  it('installs the first host backend and reports a later different backend as a conflict', () => {
    installAudioDeviceHostBackend(stubBackend());
    installAudioDeviceHostBackend(stubBackend());

    expect(explainAudioDeviceBackend()).toMatchObject({ conflict: true, layer: 'host' });
  });
});

describe('observeAudioDeviceHostResult', () => {
  it('records host operation viability', () => {
    installAudioDeviceHostBackend(stubBackend());
    observeAudioDeviceHostResult('createDevice', false);

    expect(explainAudioDeviceBackend()).toMatchObject({
      operation: 'createDevice',
      viability: 'runtime-api-unavailable',
    });
  });
});

describe('resetAudioDeviceBackendForTest', () => {
  it('clears custom, host, conflict and observation state', () => {
    installAudioDeviceHostBackend(stubBackend());
    installAudioDeviceHostBackend(stubBackend());
    setAudioDeviceBackend(stubBackend());
    observeAudioDeviceHostResult('createDevice', true);

    resetAudioDeviceBackendForTest();

    expect(explainAudioDeviceBackend()).toEqual({
      conflict: false,
      layer: 'host-not-enabled',
      operation: null,
      viability: 'unobserved',
    });
  });
});

describe('sentinel', () => {
  it('returns 0 from createDevice', () => {
    expect(getAudioDeviceBackend().createDevice(44100) as number).toBe(0);
  });

  it('returns 0 from createBuffer', () => {
    expect(getAudioDeviceBackend().createBuffer(0 as never, 1, 1, 44100, []) as number).toBe(0);
  });

  it('returns 0 from createSource', () => {
    expect(getAudioDeviceBackend().createSource(0 as never, 0 as never) as number).toBe(0);
  });

  it('returns 0 from getDeviceTime', () => {
    expect(getAudioDeviceBackend().getDeviceTime(0 as never)).toBe(0);
  });

  it('is a no-op for destroyDevice', () => {
    expect(() => getAudioDeviceBackend().destroyDevice(0 as never)).not.toThrow();
  });

  it('is a no-op for destroyBuffer', () => {
    expect(() => getAudioDeviceBackend().destroyBuffer(0 as never)).not.toThrow();
  });

  it('is a no-op for destroySource', () => {
    expect(() => getAudioDeviceBackend().destroySource(0 as never)).not.toThrow();
  });

  it('is a no-op for startSource', () => {
    expect(() => getAudioDeviceBackend().startSource(0 as never, 0)).not.toThrow();
  });

  it('is a no-op for stopSource', () => {
    expect(() => getAudioDeviceBackend().stopSource(0 as never)).not.toThrow();
  });

  it('is a no-op for setSourceGain', () => {
    expect(() => getAudioDeviceBackend().setSourceGain(0 as never, 1)).not.toThrow();
  });

  it('is a no-op for setSourcePlaybackRate', () => {
    expect(() => getAudioDeviceBackend().setSourcePlaybackRate(0 as never, 1)).not.toThrow();
  });

  it('is a no-op for onSourceEnded', () => {
    expect(() => getAudioDeviceBackend().onSourceEnded(0 as never, null)).not.toThrow();
  });

  it('is a no-op for resumeDevice', () => {
    expect(() => getAudioDeviceBackend().resumeDevice(0 as never)).not.toThrow();
  });
});

describe('setAudioDeviceBackend', () => {
  it('sets and clears the custom backend', () => {
    const backend = stubBackend();

    setAudioDeviceBackend(backend);
    expect(getAudioDeviceBackend()).toBe(backend);
    setAudioDeviceBackend(null);
    expect(getAudioDeviceBackend()).not.toBe(backend);
  });
});

function stubBackend(): AudioDeviceBackend {
  return {
    createBuffer: vi.fn().mockReturnValue(1),
    createDevice: vi.fn().mockReturnValue(1),
    createSource: vi.fn().mockReturnValue(1),
    destroyBuffer: vi.fn(),
    destroyDevice: vi.fn(),
    destroySource: vi.fn(),
    getDeviceTime: vi.fn().mockReturnValue(0),
    onSourceEnded: vi.fn(),
    resumeDevice: vi.fn(),
    setSourceGain: vi.fn(),
    setSourcePan: vi.fn(),
    setSourcePlaybackRate: vi.fn(),
    startSource: vi.fn(),
    stopSource: vi.fn(),
  };
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
