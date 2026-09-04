import { createEntity } from '@flighthq/entity/contract';
import type {
  AudioBufferHandle,
  AudioDeviceBackend,
  AudioDeviceHandle,
  AudioSourceHandle,
  EntityWithoutRuntime,
} from '@flighthq/types/contract';

export function createWebAudioDeviceBackend(): AudioDeviceBackend {
  let nextHandle = 1;
  const devices = new Map<number, AudioContext>();
  const buffers = new Map<number, AudioBuffer>();
  const sources = new Map<
    number,
    {
      buffer: AudioBuffer;
      context: AudioContext;
      gainNode: GainNode;
      pannerNode: StereoPannerNode;
      onEnded: (() => void) | null;
      sourceNode: AudioBufferSourceNode | null;
      state: 'playing' | 'stopped';
    }
  >();

  function handle(): number {
    return nextHandle++;
  }

  return createEntity<EntityWithoutRuntime<AudioDeviceBackend & AudioDeviceBackendWebExtension>>({
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
      const pannerNode = context.createStereoPanner();
      pannerNode.connect(gainNode);
      const h = handle() as unknown as AudioSourceHandle;
      sources.set(h as number, {
        buffer: audioBuffer,
        context,
        gainNode,
        pannerNode,
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
            assertSyncVoid(s.sourceNode.stop());
          } catch {
            // already stopped
          }
        }
        s.sourceNode.disconnect();
      }
      s.pannerNode.disconnect();
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

    setSourcePan(source: AudioSourceHandle, pan: number): void {
      const s = sources.get(source as number);
      if (s === undefined) return;
      s.pannerNode.pan.value = pan;
    },

    setSourcePlaybackRate(source: AudioSourceHandle, rate: number): void {
      const s = sources.get(source as number);
      if (s === undefined || s.sourceNode === null) return;
      s.sourceNode.playbackRate.value = rate;
    },

    startSource(source: AudioSourceHandle, offset: number, duration: number): void {
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
      sourceNode.connect(s.pannerNode);
      sourceNode.onended = () => {
        s.state = 'stopped';
        s.sourceNode = null;
        if (s.onEnded !== null) s.onEnded();
      };
      s.sourceNode = sourceNode;
      s.state = 'playing';
      if (duration > 0) sourceNode.start(0, offset, duration);
      else sourceNode.start(0, offset);
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
  });
}

export function getAudioSourceBufferSourceNode(
  backend: Readonly<AudioDeviceBackend>,
  source: AudioSourceHandle,
): AudioBufferSourceNode | null {
  if (isWebExtendedBackend(backend)) return backend.getSourceBufferSourceNode(source);
  return null;
}

export function getAudioSourceGainNode(
  backend: Readonly<AudioDeviceBackend>,
  source: AudioSourceHandle,
): GainNode | null {
  if (isWebExtendedBackend(backend)) return backend.getSourceGainNode(source);
  return null;
}

export function hasAudioDeviceWebNodeAccess(backend: Readonly<AudioDeviceBackend>): boolean {
  return isWebExtendedBackend(backend);
}

interface AudioDeviceBackendWebExtension extends AudioDeviceBackend {
  getSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null;
  getSourceGainNode(source: AudioSourceHandle): GainNode | null;
}

function isWebExtendedBackend(backend: Readonly<AudioDeviceBackend>): backend is AudioDeviceBackendWebExtension {
  return 'getSourceGainNode' in backend && 'getSourceBufferSourceNode' in backend;
}

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}
