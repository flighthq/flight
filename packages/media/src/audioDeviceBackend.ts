import type {
  AudioBufferHandle,
  AudioDeviceBackend,
  AudioDeviceHandle,
  AudioDeviceOperation,
  AudioSourceHandle,
  BackendExplanation,
  BackendOperationExplanation,
} from '@flighthq/types/contract';

export function createWebAudioDeviceBackend(): AudioDeviceBackend & AudioDeviceBackendWebExtension {
  let nextHandle = 1;
  const devices = new Map<number, AudioContext>();
  const buffers = new Map<number, AudioBuffer>();
  const sources = new Map<
    number,
    {
      buffer: AudioBuffer;
      context: AudioContext;
      gainNode: GainNode;
      onEnded: (() => void) | null;
      sourceNode: AudioBufferSourceNode | null;
      state: 'playing' | 'stopped';
    }
  >();

  function handle(): number {
    return nextHandle++;
  }

  return {
    createBuffer(
      device: AudioDeviceHandle,
      channels: number,
      length: number,
      sampleRate: number,
      data: readonly Float32Array[],
    ): AudioBufferHandle {
      const context = devices.get(device as number);
      if (context === undefined) return 0 as AudioBufferHandle;
      const audioBuffer = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
      for (let i = 0; i < channels; i++) {
        if (i < data.length) audioBuffer.copyToChannel(new Float32Array(data[i]), i);
      }
      const h = handle() as unknown as AudioBufferHandle;
      buffers.set(h as number, audioBuffer);
      return h;
    },

    createDevice(sampleRate: number): AudioDeviceHandle {
      const context = new AudioContext({ sampleRate });
      const h = handle() as unknown as AudioDeviceHandle;
      devices.set(h as number, context);
      return h;
    },

    createSource(device: AudioDeviceHandle, buffer: AudioBufferHandle): AudioSourceHandle {
      const context = devices.get(device as number);
      const audioBuffer = buffers.get(buffer as number);
      if (context === undefined || audioBuffer === undefined) return 0 as AudioSourceHandle;
      const gainNode = context.createGain();
      gainNode.connect(context.destination);
      const h = handle() as unknown as AudioSourceHandle;
      sources.set(h as number, {
        buffer: audioBuffer,
        context,
        gainNode,
        onEnded: null,
        sourceNode: null,
        state: 'stopped',
      });
      return h;
    },

    destroyBuffer(buffer: AudioBufferHandle): void {
      buffers.delete(buffer as number);
    },

    destroyDevice(device: AudioDeviceHandle): void {
      const context = devices.get(device as number);
      if (context === undefined) return;
      context.close().catch(() => {});
      devices.delete(device as number);
    },

    destroySource(source: AudioSourceHandle): void {
      const s = sources.get(source as number);
      if (s === undefined) return;
      s.onEnded = null;
      if (s.sourceNode !== null) {
        s.sourceNode.onended = null;
        if (s.state === 'playing') {
          try {
            s.sourceNode.stop();
          } catch {
            // already stopped
          }
        }
        s.sourceNode.disconnect();
      }
      s.gainNode.disconnect();
      sources.delete(source as number);
    },

    getDeviceTime(device: AudioDeviceHandle): number {
      const context = devices.get(device as number);
      return context !== undefined ? context.currentTime : 0;
    },

    onSourceEnded(source: AudioSourceHandle, callback: (() => void) | null): void {
      const s = sources.get(source as number);
      if (s === undefined) return;
      s.onEnded = callback;
    },

    resumeDevice(device: AudioDeviceHandle): void {
      const context = devices.get(device as number);
      if (context !== undefined) context.resume().catch(() => {});
    },

    setSourceGain(source: AudioSourceHandle, gain: number): void {
      const s = sources.get(source as number);
      if (s === undefined) return;
      s.gainNode.gain.value = gain;
    },

    setSourcePlaybackRate(source: AudioSourceHandle, rate: number): void {
      const s = sources.get(source as number);
      if (s === undefined || s.sourceNode === null) return;
      s.sourceNode.playbackRate.value = rate;
    },

    startSource(source: AudioSourceHandle, offset: number): void {
      const s = sources.get(source as number);
      if (s === undefined) return;
      if (s.sourceNode !== null) {
        s.sourceNode.onended = null;
        try {
          s.sourceNode.stop();
        } catch {
          // already stopped
        }
        s.sourceNode.disconnect();
      }
      const sourceNode = s.context.createBufferSource();
      sourceNode.buffer = s.buffer;
      sourceNode.connect(s.gainNode);
      sourceNode.onended = () => {
        s.state = 'stopped';
        s.sourceNode = null;
        if (s.onEnded !== null) s.onEnded();
      };
      s.sourceNode = sourceNode;
      s.state = 'playing';
      sourceNode.start(0, offset);
    },

    stopSource(source: AudioSourceHandle): void {
      const s = sources.get(source as number);
      if (s === undefined || s.sourceNode === null) return;
      s.sourceNode.onended = null;
      try {
        s.sourceNode.stop();
      } catch {
        // already stopped
      }
      s.sourceNode.disconnect();
      s.sourceNode = null;
      s.state = 'stopped';
    },

    getSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null {
      const s = sources.get(source as number);
      return s?.sourceNode ?? null;
    },

    getSourceGainNode(source: AudioSourceHandle): GainNode | null {
      const s = sources.get(source as number);
      return s?.gainNode ?? null;
    },
  };
}

export function explainAudioDeviceBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function explainAudioDeviceOperation(operation: AudioDeviceOperation): BackendOperationExplanation {
  if (_custom !== null && typeof _custom[operation] === 'function') {
    return { implemented: true, layer: 'custom', operation };
  }
  if (_host !== null && typeof _host[operation] === 'function') {
    return { implemented: true, layer: 'host', operation };
  }
  return { implemented: false, layer: 'sentinel', operation };
}

export function getAudioDeviceBackend(): AudioDeviceBackend {
  return _custom ?? _host ?? _sentinel;
}

export function getAudioSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null {
  const backend = _custom ?? _host ?? _sentinel;
  if (isWebExtendedBackend(backend)) return backend.getSourceBufferSourceNode(source);
  return null;
}

export function getAudioSourceGainNode(source: AudioSourceHandle): GainNode | null {
  const backend = _custom ?? _host ?? _sentinel;
  if (isWebExtendedBackend(backend)) return backend.getSourceGainNode(source);
  return null;
}

export function hasAudioDeviceOperation(operation: AudioDeviceOperation): boolean {
  return explainAudioDeviceOperation(operation).implemented;
}

export function hasAudioDeviceWebNodeAccess(): boolean {
  return isWebExtendedBackend(_custom ?? _host ?? _sentinel);
}

export function installAudioDeviceHostBackend(backend: AudioDeviceBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeAudioDeviceHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetAudioDeviceBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setAudioDeviceBackend(backend: AudioDeviceBackend | null): void {
  _custom = backend;
}

interface AudioDeviceBackendWebExtension extends AudioDeviceBackend {
  getSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null;
  getSourceGainNode(source: AudioSourceHandle): GainNode | null;
}

function isWebExtendedBackend(backend: AudioDeviceBackend): backend is AudioDeviceBackendWebExtension {
  return 'getSourceGainNode' in backend && 'getSourceBufferSourceNode' in backend;
}

let _custom: AudioDeviceBackend | null = null;
let _host: AudioDeviceBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: AudioDeviceBackend = {
  createBuffer(): AudioBufferHandle {
    return 0 as AudioBufferHandle;
  },
  createDevice(): AudioDeviceHandle {
    return 0 as AudioDeviceHandle;
  },
  createSource(): AudioSourceHandle {
    return 0 as AudioSourceHandle;
  },
  destroyBuffer(): void {},
  destroyDevice(): void {},
  destroySource(): void {},
  getDeviceTime(): number {
    return 0;
  },
  onSourceEnded(): void {},
  resumeDevice(): void {},
  setSourceGain(): void {},
  setSourcePlaybackRate(): void {},
  startSource(): void {},
  stopSource(): void {},
};
