import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioBufferHandle,
  HostAudioDeviceProvider,
  AudioDeviceHandle,
  AudioSourceHandle,
  EntityConstruction,
} from '@flighthq/types/contract';

/**
 * The Web Audio implementation of the audio device seam.
 *
 * It lives here rather than in `@flighthq/media` because every value it touches — AudioContext,
 * GainNode, AudioBufferSourceNode, StereoPannerNode — is a browser type, and portable media may hold
 * only handles. The handles it hands back are opaque integers; the node graph behind them crosses the
 * seam only through the resolvers below, which exist for callers that are already web-bound and need
 * to wire these sources into a graph of their own.
 */
export function createWebAudioDeviceBackend(): HostAudioDeviceProvider {
  let nextHandle = 1;
  const devices = new Map<number, AudioContext>();
  const buffers = new Map<number, AudioBuffer>();
  const sources = new Map<number, AudioSourceEntry>();

  function handle(): number {
    return nextHandle++;
  }

  const out = allocateEntity<HostAudioDeviceProvider & AudioDeviceBackendWebExtension>();
  initializeWebAudioDeviceBackend(out, devices, buffers, sources, handle);
  return finishEntity(out);
}

/**
 * The AudioContext behind a device handle, or null when this backend did not create it.
 *
 * The sibling of the two source-node resolvers, and the seam a web-bound caller needs to build its own
 * node graph on the same context — a mixer, an analyser, a worklet. Portable code never calls it: it
 * holds a handle and has no type to receive the result into.
 */
export function getAudioDeviceContext(
  backend: Readonly<HostAudioDeviceProvider>,
  device: AudioDeviceHandle,
): AudioContext | null {
  if (isWebExtendedBackend(backend)) return backend.getDeviceContext(device);
  return null;
}

export function getAudioSourceBufferSourceNode(
  backend: Readonly<HostAudioDeviceProvider>,
  source: AudioSourceHandle,
): AudioBufferSourceNode | null {
  if (isWebExtendedBackend(backend)) return backend.getSourceBufferSourceNode(source);
  return null;
}

export function getAudioSourceGainNode(
  backend: Readonly<HostAudioDeviceProvider>,
  source: AudioSourceHandle,
): GainNode | null {
  if (isWebExtendedBackend(backend)) return backend.getSourceGainNode(source);
  return null;
}

export function hasAudioDeviceWebNodeAccess(backend: Readonly<HostAudioDeviceProvider>): boolean {
  return isWebExtendedBackend(backend);
}

export function initializeWebAudioDeviceBackend(
  out: EntityConstruction<HostAudioDeviceProvider & AudioDeviceBackendWebExtension>,
  devices: Map<number, AudioContext>,
  buffers: Map<number, AudioBuffer>,
  sources: Map<number, AudioSourceEntry>,
  handle: () => number,
): void {
  out.createBuffer = (
    device: AudioDeviceHandle,
    channels: number,
    length: number,
    sampleRate: number,
    data: readonly Float32Array[],
  ): AudioBufferHandle => {
    const context = devices.get(device as number);
    if (context === undefined) return 0 as AudioBufferHandle;
    const audioBuffer = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
    for (let i = 0; i < channels; i++) {
      if (i < data.length) audioBuffer.copyToChannel(new Float32Array(data[i]), i);
    }
    const h = handle() as unknown as AudioBufferHandle;
    buffers.set(h as number, audioBuffer);
    return h;
  };

  out.createDevice = (sampleRate: number): AudioDeviceHandle => {
    const context = new AudioContext({ sampleRate });
    const h = handle() as unknown as AudioDeviceHandle;
    devices.set(h as number, context);
    return h;
  };

  out.createSource = (device: AudioDeviceHandle, buffer: AudioBufferHandle): AudioSourceHandle => {
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
  };

  out.destroyBuffer = (buffer: AudioBufferHandle): void => {
    buffers.delete(buffer as number);
  };

  out.destroyDevice = (device: AudioDeviceHandle): void => {
    const context = devices.get(device as number);
    if (context === undefined) return;
    context.close().catch(() => {});
    devices.delete(device as number);
  };

  out.destroySource = (source: AudioSourceHandle): void => {
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
  };

  out.fadeSourceGain = (source: AudioSourceHandle, targetGain: number, durationMs: number): void => {
    const s = sources.get(source as number);
    if (s === undefined) return;
    // Read the clock here rather than taking it as a parameter: the context that schedules the ramp is
    // the one that owns the timebase, so a caller can neither supply a useful value nor get it wrong.
    const now = s.context.currentTime;
    const gain = s.gainNode.gain;
    // Cancel then pin: without setValueAtTime the ramp would start from whatever value a previously
    // cancelled automation left behind, which is not necessarily what is audible right now.
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(targetGain, now + durationMs / 1000);
  };

  out.getDeviceTime = (device: AudioDeviceHandle): number => {
    const context = devices.get(device as number);
    return context !== undefined ? context.currentTime : 0;
  };

  out.getDeviceContext = (device: AudioDeviceHandle): AudioContext | null => {
    return devices.get(device as number) ?? null;
  };

  out.getSourceBufferSourceNode = (source: AudioSourceHandle): AudioBufferSourceNode | null => {
    const s = sources.get(source as number);
    return s?.sourceNode ?? null;
  };

  out.getSourceGainNode = (source: AudioSourceHandle): GainNode | null => {
    const s = sources.get(source as number);
    return s?.gainNode ?? null;
  };

  out.onSourceEnded = (source: AudioSourceHandle, callback: (() => void) | null): void => {
    const s = sources.get(source as number);
    if (s === undefined) return;
    s.onEnded = callback;
  };

  out.resumeDevice = (device: AudioDeviceHandle): void => {
    const context = devices.get(device as number);
    if (context !== undefined) context.resume().catch(() => {});
  };

  out.setSourceGain = (source: AudioSourceHandle, gain: number): void => {
    const s = sources.get(source as number);
    if (s === undefined) return;
    s.gainNode.gain.value = gain;
  };

  out.setSourcePan = (source: AudioSourceHandle, pan: number): void => {
    const s = sources.get(source as number);
    if (s === undefined) return;
    s.pannerNode.pan.value = pan;
  };

  out.setSourcePlaybackRate = (source: AudioSourceHandle, rate: number): void => {
    const s = sources.get(source as number);
    if (s === undefined || s.sourceNode === null) return;
    s.sourceNode.playbackRate.value = rate;
  };

  out.startSource = (source: AudioSourceHandle, offset: number, duration: number): void => {
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
  };

  out.stopSource = (source: AudioSourceHandle): void => {
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
  };
}

interface AudioDeviceBackendWebExtension extends HostAudioDeviceProvider {
  getDeviceContext(device: AudioDeviceHandle): AudioContext | null;
  getSourceBufferSourceNode(source: AudioSourceHandle): AudioBufferSourceNode | null;
  getSourceGainNode(source: AudioSourceHandle): GainNode | null;
}

interface AudioSourceEntry {
  buffer: AudioBuffer;
  context: AudioContext;
  gainNode: GainNode;
  onEnded: (() => void) | null;
  pannerNode: StereoPannerNode;
  sourceNode: AudioBufferSourceNode | null;
  state: 'playing' | 'stopped';
}

function isWebExtendedBackend(backend: Readonly<HostAudioDeviceProvider>): backend is AudioDeviceBackendWebExtension {
  return 'getSourceGainNode' in backend && 'getSourceBufferSourceNode' in backend;
}

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}

// Published on the Host rather than installed into the media package, so a caller selects this device
// backend by passing the host that carries it.
export const webHostAudioDevice: HostAudioDeviceProvider = createWebAudioDeviceBackend();
