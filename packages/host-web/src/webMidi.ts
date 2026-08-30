import { createEntity } from '@flighthq/entity/contract';
import {
  createMidiAccessResource,
  createMidiInputPortResource,
  createMidiOutputPortResource,
} from '@flighthq/midi/contract';
import type {
  MidiAccess,
  MidiEventAttachment,
  MidiEventBackendAttachOutcome,
  MidiInputPort,
  MidiOutputPort,
  MidiPort,
  PermissionQueryOutcome,
  PermissionState,
  WebMidiAccessCapabilities,
  WebMidiPermissionAccessCapabilities,
} from '@flighthq/types/contract';

export function createWebMidiAccessCapabilities(
  api: Readonly<Pick<Navigator, 'requestMIDIAccess'>>,
): WebMidiAccessCapabilities {
  return createWebMidiProfile(api, false);
}

export function createWebMidiPermissionAccessCapabilities(
  api: Readonly<Pick<Navigator, 'permissions' | 'requestMIDIAccess'>>,
): WebMidiPermissionAccessCapabilities {
  return createWebMidiProfile(api, true);
}

interface WebMidiProfileApi {
  readonly permissions?: Permissions;
  requestMIDIAccess(): Promise<MIDIAccess>;
}

function createWebMidiProfile(api: Readonly<WebMidiProfileApi>, includePermission: false): WebMidiAccessCapabilities;
function createWebMidiProfile(
  api: Readonly<WebMidiProfileApi>,
  includePermission: true,
): WebMidiPermissionAccessCapabilities;
function createWebMidiProfile(
  api: Readonly<WebMidiProfileApi>,
  includePermission: boolean,
): WebMidiAccessCapabilities | WebMidiPermissionAccessCapabilities {
  const accessByNative = new WeakMap<MIDIAccess, MidiAccess>();
  const inputByNative = new WeakMap<MIDIInput, MidiInputPort>();
  const outputByNative = new WeakMap<MIDIOutput, MidiOutputPort>();

  function toInput(native: MIDIInput): MidiInputPort {
    const retained = inputByNative.get(native);
    if (retained !== undefined) return retained;
    const port = createMidiInputPortResource(native, {
      attachMessage: (listener) =>
        attachWebMidiEvent(native, 'midimessage', (event: MIDIMessageEvent) => {
          if (event.data === null || event.data[0] === 0xf0) return;
          listener(new Uint8Array(event.data), event.timeStamp);
        }),
      attachStateChange: (listener) => attachWebMidiEvent(native, 'statechange', listener),
      close: async () => {
        await native.close();
      },
      getConnection: () => native.connection,
      getState: () => native.state,
      open: async () => {
        await native.open();
      },
    });
    inputByNative.set(native, port);
    return port;
  }

  function toOutput(native: MIDIOutput): MidiOutputPort {
    const retained = outputByNative.get(native);
    if (retained !== undefined) return retained;
    const port = createMidiOutputPortResource(native, {
      attachStateChange: (listener) => attachWebMidiEvent(native, 'statechange', listener),
      close: async () => {
        await native.close();
      },
      getConnection: () => native.connection,
      getState: () => native.state,
      open: async () => {
        await native.open();
      },
      send: (data, timestamp) => native.send([...data], timestamp),
    });
    outputByNative.set(native, port);
    return port;
  }

  function toPort(native: MIDIPort): MidiPort {
    return native.type === 'input' ? toInput(native as MIDIInput) : toOutput(native as MIDIOutput);
  }

  function toAccess(native: MIDIAccess): MidiAccess {
    const retained = accessByNative.get(native);
    if (retained !== undefined) return retained;
    const access = createMidiAccessResource({
      attachStateChange: (listener) =>
        attachWebMidiEvent(native, 'statechange', (event: MIDIConnectionEvent) => {
          if (event.port !== null) listener(toPort(event.port));
        }),
      getInputPorts: () => mapMidiPorts(native.inputs, toInput),
      getOutputPorts: () => mapMidiPorts(native.outputs, toOutput),
    });
    accessByNative.set(native, access);
    return access;
  }

  const access = createEntity({
    async requestAccess() {
      try {
        const native = await api.requestMIDIAccess();
        return { access: toAccess(native), reason: 'accepted' } as const;
      } catch (error) {
        return { reason: classifyWebMidiRequestFailure(error) } as const;
      }
    },
  });
  if (!includePermission) return createEntity({ access });
  const permission = createEntity({
    getPermission: () => queryWebMidiPermission(api.permissions),
  });
  return createEntity({ access, permission });
}

function attachWebMidiEvent<Target extends EventTarget, EventType extends Event>(
  target: Target,
  type: string,
  listener: (event: EventType) => void,
): Promise<MidiEventBackendAttachOutcome> {
  const eventListener = listener as EventListener;
  try {
    target.addEventListener(type, eventListener);
  } catch {
    return Promise.resolve({ reason: 'operation-failed', releaseFailed: false });
  }
  let released = false;
  const attachmentEntity = createEntity({
    async release() {
      if (released) return { reason: 'ok' } as const;
      try {
        target.removeEventListener(type, eventListener);
        released = true;
        return { reason: 'ok' } as const;
      } catch {
        return { reason: 'operation-failed' } as const;
      }
    },
  });
  const attachment: MidiEventAttachment = attachmentEntity;
  return Promise.resolve({
    attachment,
    reason: 'ok',
  });
}

function mapMidiPorts<NativePort, Port>(
  map: { forEach(callback: (port: NativePort) => void): void },
  transform: (port: NativePort) => Port,
): Port[] {
  const ports: Port[] = [];
  map.forEach((port) => ports.push(transform(port)));
  return ports;
}

async function queryWebMidiPermission(permissions: Permissions | undefined): Promise<PermissionQueryOutcome> {
  if (permissions === undefined || typeof permissions.query !== 'function') return { reason: 'runtime-unavailable' };
  try {
    const status = await permissions.query({ name: 'midi', sysex: false } as PermissionDescriptor);
    return isPermissionState(status.state) ? { reason: 'ok', state: status.state } : { reason: 'operation-failed' };
  } catch (error) {
    return isUnsupportedWebMidiError(error) ? { reason: 'unsupported' } : { reason: 'operation-failed' };
  }
}

function classifyWebMidiRequestFailure(
  error: unknown,
): 'operation-failed' | 'permission-denied' | 'security-restricted' {
  const name = getErrorName(error);
  if (name === 'NotAllowedError') return 'permission-denied';
  if (name === 'SecurityError') return 'security-restricted';
  return 'operation-failed';
}

function getErrorName(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

function isPermissionState(state: unknown): state is PermissionState {
  return state === 'denied' || state === 'granted' || state === 'prompt';
}

function isUnsupportedWebMidiError(error: unknown): boolean {
  return error instanceof TypeError || getErrorName(error) === 'NotSupportedError';
}
