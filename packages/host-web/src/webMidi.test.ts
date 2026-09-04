import * as midi from '@flighthq/midi/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { webHost } from './webHost';
import * as webMidi from './webMidi';
import {
  initializeWebMidiAccessBackend,
  initializeWebMidiAccessCapabilities,
  initializeWebMidiEventAttachment,
  initializeWebMidiPermissionAccessCapabilities,
  initializeWebMidiPermissionBackend,
} from './webMidi';

describe('createWebMidiAccessCapabilities', () => {
  it('constructs only the access profile and requests basic MIDI with zero options', async () => {
    const native = fakeMidiAccess();
    const requestMIDIAccess = vi.fn(async () => native.access);
    const capabilities = requiredWebFunction('createWebMidiAccessCapabilities')({ requestMIDIAccess }) as Record<
      string,
      unknown
    >;
    expect(Object.keys(capabilities)).toEqual(['access']);

    const outcome = await requiredMidiFunction('requestMidiAccess')({ midi: capabilities });
    expect(requestMIDIAccess).toHaveBeenCalledOnce();
    expect(requestMIDIAccess).toHaveBeenCalledWith();
    expect(outcome).toMatchObject({ reason: 'accepted' });
    expect(EntityRuntimeKey in (outcome as { access: object }).access).toBe(true);
  });

  it('keeps stable native-to-Entity identities inside one injected profile and isolates another profile', async () => {
    const native = fakeMidiAccess();
    const first = requiredWebFunction('createWebMidiAccessCapabilities')({
      requestMIDIAccess: async () => native.access,
    }) as Record<string, unknown>;
    const second = requiredWebFunction('createWebMidiAccessCapabilities')({
      requestMIDIAccess: async () => native.access,
    }) as Record<string, unknown>;
    const firstOutcome = await requiredMidiFunction('requestMidiAccess')({ midi: first });
    const repeatedOutcome = await requiredMidiFunction('requestMidiAccess')({ midi: first });
    const secondOutcome = await requiredMidiFunction('requestMidiAccess')({ midi: second });
    expect((repeatedOutcome as { access: unknown }).access).toBe((firstOutcome as { access: unknown }).access);
    expect((secondOutcome as { access: unknown }).access).not.toBe((firstOutcome as { access: unknown }).access);

    const access = (firstOutcome as { access: unknown }).access;
    const firstInputs = requiredMidiFunction('getMidiAccessInputPorts')(access) as { ports: readonly unknown[] };
    const secondInputs = requiredMidiFunction('getMidiAccessInputPorts')(access) as { ports: readonly unknown[] };
    expect(firstInputs.ports[0]).toBe(secondInputs.ports[0]);
  });

  it('classifies denial, security restriction, and other native failure without publishing resources', async () => {
    const requestMIDIAccess = vi
      .fn()
      .mockRejectedValueOnce(namedError('NotAllowedError'))
      .mockRejectedValueOnce(namedError('SecurityError'))
      .mockRejectedValueOnce(new Error('transport failed'));
    const capabilities = requiredWebFunction('createWebMidiAccessCapabilities')({ requestMIDIAccess });
    const request = requiredMidiFunction('requestMidiAccess');
    await expect(request({ midi: capabilities })).resolves.toEqual({ reason: 'permission-denied' });
    await expect(request({ midi: capabilities })).resolves.toEqual({ reason: 'security-restricted' });
    await expect(request({ midi: capabilities })).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('maps hotplug, port state, and copied input messages and releases exact native listeners', async () => {
    const native = fakeMidiAccess();
    const capabilities = requiredWebFunction('createWebMidiAccessCapabilities')({
      requestMIDIAccess: async () => native.access,
    });
    const request = (await requiredMidiFunction('requestMidiAccess')({ midi: capabilities })) as { access: unknown };
    const accessSubscription = requiredMidiFunction('createMidiAccessStateSubscription')() as AccessSignal;
    const changed: unknown[] = [];
    connectSignal(accessSubscription.onMidiAccessStateChange, (port: unknown) => changed.push(port));
    await requiredMidiFunction('attachMidiAccessStateSubscription')(request.access, accessSubscription);
    native.access.dispatch('statechange', { port: native.input });
    const input = (requiredMidiFunction('getMidiAccessInputPorts')(request.access) as { ports: readonly unknown[] })
      .ports[0];
    expect(changed).toEqual([input]);

    const stateSubscription = requiredMidiFunction('createMidiPortStateSubscription')() as PortSignal;
    const states: unknown[] = [];
    connectSignal(stateSubscription.onMidiPortStateChange, (port: unknown) => states.push(port));
    await requiredMidiFunction('attachMidiPortStateSubscription')(input, stateSubscription);
    native.input.dispatch('statechange', { port: native.input });
    expect(states).toEqual([input]);

    const messageSubscription = requiredMidiFunction('createMidiInputMessageSubscription')() as MessageSignal;
    const messages: Array<{ data: Uint8Array; timestamp: number }> = [];
    connectSignal(messageSubscription.onMidiInputMessage, (message: { data: Uint8Array; timestamp: number }) => {
      messages.push(message);
    });
    await requiredMidiFunction('attachMidiInputMessageSubscription')(input, messageSubscription);
    const bytes = new Uint8Array([0x90, 60, 127]);
    native.input.dispatch('midimessage', { data: bytes, timeStamp: 8.5 });
    bytes[1] = 1;
    expect([...messages[0].data]).toEqual([0x90, 60, 127]);
    expect(messages[0].timestamp).toBe(8.5);
    native.input.dispatch('midimessage', { data: new Uint8Array([0xf0, 1, 0xf7]), timeStamp: 9 });
    expect(messages).toHaveLength(1);

    await requiredMidiFunction('detachMidiAccessStateSubscription')(accessSubscription);
    await requiredMidiFunction('detachMidiPortStateSubscription')(stateSubscription);
    await requiredMidiFunction('detachMidiInputMessageSubscription')(messageSubscription);
    expect(native.access.listenerCount('statechange')).toBe(0);
    expect(native.input.listenerCount('statechange')).toBe(0);
    expect(native.input.listenerCount('midimessage')).toBe(0);
  });
});

describe('createWebMidiPermissionAccessCapabilities', () => {
  it('adds only the read-only permission owner and never routes query through access', async () => {
    const native = fakeMidiAccess();
    const query = vi.fn(async () => ({ state: 'prompt' }));
    const requestMIDIAccess = vi.fn(async () => native.access);
    const capabilities = requiredWebFunction('createWebMidiPermissionAccessCapabilities')({
      permissions: { query },
      requestMIDIAccess,
    }) as Record<string, unknown>;
    expect(Object.keys(capabilities).sort()).toEqual(['access', 'permission']);
    await expect(requiredMidiFunction('getMidiPermission')({ midi: capabilities })).resolves.toEqual({
      reason: 'ok',
      state: 'prompt',
    });
    expect(query).toHaveBeenCalledWith({ name: 'midi', sysex: false });
    expect(requestMIDIAccess).not.toHaveBeenCalled();
  });
});

describe('initializeWebMidiAccessBackend', () => {
  it('is the construction initializer of createWebMidiAccessBackend', () => {
    expect(typeof initializeWebMidiAccessBackend).toBe('function');
  });
});

interface AccessSignal {
  onMidiAccessStateChange: Parameters<typeof connectSignal>[0];
}

interface MessageSignal {
  onMidiInputMessage: Parameters<typeof connectSignal>[0];
}

interface PortSignal {
  onMidiPortStateChange: Parameters<typeof connectSignal>[0];
}

interface FakeEventSource {
  addEventListener(type: string, listener: (event: never) => void): void;
  dispatch(type: string, event: object): void;
  listenerCount(type: string): number;
  removeEventListener(type: string, listener: (event: never) => void): void;
}

function fakeMidiAccess() {
  const accessEvents = fakeEventSource();
  const inputEvents = fakeEventSource();
  const outputEvents = fakeEventSource();
  const input = {
    ...inputEvents,
    close: vi.fn(async () => input),
    connection: 'closed',
    id: 'input',
    manufacturer: 'Flight',
    name: 'Input',
    open: vi.fn(async () => input),
    state: 'connected',
    type: 'input',
    version: '1',
  };
  const output = {
    ...outputEvents,
    close: vi.fn(async () => output),
    connection: 'closed',
    id: 'output',
    manufacturer: 'Flight',
    name: 'Output',
    open: vi.fn(async () => output),
    send: vi.fn(),
    state: 'connected',
    type: 'output',
    version: '1',
  };
  const access = {
    ...accessEvents,
    inputs: new Map([['input', input]]),
    outputs: new Map([['output', output]]),
    sysexEnabled: false,
  };
  return { access, input, output } as unknown as {
    access: MIDIAccess & FakeEventSource;
    input: MIDIInput & FakeEventSource;
    output: MIDIOutput & FakeEventSource;
  };
}

function fakeEventSource(): FakeEventSource {
  const listeners = new Map<string, Set<(event: never) => void>>();
  return {
    addEventListener(type, listener) {
      let slots = listeners.get(type);
      if (slots === undefined) listeners.set(type, (slots = new Set()));
      slots.add(listener);
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) listener(event as never);
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function requiredMidiFunction(name: string): (...args: any[]) => any {
  const value: unknown = Reflect.get(midi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}

function requiredWebFunction(name: string): (...args: any[]) => any {
  const value: unknown = Reflect.get(webMidi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}
describe('initializeWebMidiAccessCapabilities', () => {
  it('is the construction initializer of createWebMidiAccessCapabilities', () => {
    expect(typeof initializeWebMidiAccessCapabilities).toBe('function');
  });
});

describe('initializeWebMidiEventAttachment', () => {
  it('is the construction initializer of createWebMidiEventAttachment', () => {
    expect(typeof initializeWebMidiEventAttachment).toBe('function');
  });
});

describe('initializeWebMidiPermissionAccessCapabilities', () => {
  it('is the construction initializer of createWebMidiPermissionAccessCapabilities', () => {
    expect(typeof initializeWebMidiPermissionAccessCapabilities).toBe('function');
  });
});

describe('initializeWebMidiPermissionBackend', () => {
  it('is the construction initializer of createWebMidiPermissionBackend', () => {
    expect(typeof initializeWebMidiPermissionBackend).toBe('function');
  });
});

describe('webHost midi', () => {
  it('is structurally empty and cannot acquire hardware in default construction', () => {
    expect((webHost as unknown as { midi: object }).midi).toEqual({});
  });
});
