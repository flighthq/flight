import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as midi from './contract';

describe('closeMidiPort', () => {
  it('distinguishes a successful close, an already-closed port, disposal, and provider failure', async () => {
    const connection = { value: 'open' };
    const close = vi.fn(async () => {
      connection.value = 'closed';
    });
    const port = createOutputPort({ close, connection });
    const closeMidiPort = requiredFunction('closeMidiPort');
    await expect(closeMidiPort(port)).resolves.toEqual({ reason: 'closed' });
    await expect(closeMidiPort(port)).resolves.toEqual({ reason: 'already-closed' });
    expect(close).toHaveBeenCalledOnce();
    await requiredFunction('disposeMidiPort')(port);
    await expect(closeMidiPort(port)).resolves.toEqual({ reason: 'disposed' });

    const failed = createOutputPort({
      close: vi.fn(async () => Promise.reject(new Error('close'))),
      connection: { value: 'open' },
    });
    await expect(closeMidiPort(failed)).resolves.toEqual({ reason: 'operation-failed' });
  });
});

describe('createMidiInputPortResource', () => {
  it('creates a typed Entity with immutable diagnostic metadata only', () => {
    const port = createInputPort();
    expect(EntityRuntimeKey in port).toBe(true);
    expect(port).toMatchObject({
      id: 'shared-id',
      manufacturer: 'Flight',
      name: 'Input',
      type: 'input',
      version: '1',
    });
    expect(Object.keys(port).sort()).toEqual(['id', 'manufacturer', 'name', 'type', 'version']);
  });
});

describe('createMidiOutputPortResource', () => {
  it('creates a distinct output Entity even when a native id matches an input', () => {
    const input = createInputPort();
    const output = createOutputPort();
    expect(EntityRuntimeKey in output).toBe(true);
    expect(output).not.toBe(input);
    expect(output).toMatchObject({ id: input.id, type: 'output' });
  });
});

describe('disposeMidiPort', () => {
  it('closes only a port opened through Flight, attempts failure again, and is terminal after success', async () => {
    const disposeMidiPort = requiredFunction('disposeMidiPort');
    const openMidiPort = requiredFunction('openMidiPort');
    const ownedConnection = { value: 'closed' };
    const ownedClose = vi
      .fn()
      .mockRejectedValueOnce(new Error('first close failed'))
      .mockImplementationOnce(async () => {
        ownedConnection.value = 'closed';
      });
    const owned = createOutputPort({ close: ownedClose, connection: ownedConnection });
    await expect(openMidiPort(owned)).resolves.toEqual({ reason: 'opened' });
    await expect(disposeMidiPort(owned)).resolves.toEqual({
      failures: [{ operation: 'close' }],
      reason: 'operation-failed',
    });
    await expect(disposeMidiPort(owned)).resolves.toEqual({ reason: 'ok' });
    await expect(disposeMidiPort(owned)).resolves.toEqual({ reason: 'already-disposed' });
    expect(ownedClose).toHaveBeenCalledTimes(2);

    const borrowedClose = vi.fn(async () => undefined);
    const borrowed = createOutputPort({ close: borrowedClose, connection: { value: 'open' } });
    await expect(openMidiPort(borrowed)).resolves.toEqual({ reason: 'already-open' });
    await expect(disposeMidiPort(borrowed)).resolves.toEqual({ reason: 'ok' });
    expect(borrowedClose).not.toHaveBeenCalled();
  });

  it('attempts every attached subscription and owned close, then retries only failed releases', async () => {
    const stateRelease = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'operation-failed' })
      .mockResolvedValueOnce({ reason: 'ok' });
    const messageRelease = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'operation-failed' })
      .mockResolvedValueOnce({ reason: 'ok' });
    const connection = { value: 'closed' };
    const close = vi.fn(async () => {
      connection.value = 'closed';
    });
    const input = createInputPort({
      attachMessage: async () => ({
        attachment: (() => {
          const out = allocateEntity<any>();
          out.release = messageRelease;
          return finishEntity(out);
        })(),
        reason: 'ok',
      }),
      attachStateChange: async () => ({
        attachment: (() => {
          const out = allocateEntity<any>();
          out.release = stateRelease;
          return finishEntity(out);
        })(),
        reason: 'ok',
      }),
      close,
      connection,
    });
    const messageSubscription = requiredFunction('createMidiInputMessageSubscription')();
    const stateSubscription = requiredFunction('createMidiPortStateSubscription')();
    await requiredFunction('attachMidiInputMessageSubscription')(input, messageSubscription);
    await requiredFunction('attachMidiPortStateSubscription')(input, stateSubscription);
    await requiredFunction('openMidiPort')(input);

    const disposeMidiPort = requiredFunction('disposeMidiPort');
    await expect(disposeMidiPort(input)).resolves.toEqual({
      failures: [{ operation: 'state-subscription-release' }, { operation: 'message-subscription-release' }],
      reason: 'operation-failed',
    });
    expect(close).toHaveBeenCalledOnce();
    await expect(disposeMidiPort(input)).resolves.toEqual({ reason: 'ok' });
    expect(close).toHaveBeenCalledOnce();
    expect(stateRelease).toHaveBeenCalledTimes(2);
    expect(messageRelease).toHaveBeenCalledTimes(2);
  });
});

describe('getMidiPortConnection', () => {
  it('pulls current connection from the exact origin and reports disposed resources', async () => {
    const first = createInputPort({ connection: { value: 'open' } });
    const second = createInputPort({ connection: { value: 'closed' } });
    const getMidiPortConnection = requiredFunction('getMidiPortConnection');
    expect(getMidiPortConnection(first)).toEqual({ connection: 'open', reason: 'ok' });
    expect(getMidiPortConnection(second)).toEqual({ connection: 'closed', reason: 'ok' });
    await requiredFunction('disposeMidiPort')(second);
    expect(getMidiPortConnection(second)).toEqual({ reason: 'disposed' });
  });
});

describe('getMidiPortState', () => {
  it('pulls dynamic state instead of mirroring it into public metadata', () => {
    const state = { value: 'connected' };
    const port = createInputPort({ state });
    const getMidiPortState = requiredFunction('getMidiPortState');
    expect(getMidiPortState(port)).toEqual({ reason: 'ok', state: 'connected' });
    state.value = 'disconnected';
    expect(getMidiPortState(port)).toEqual({ reason: 'ok', state: 'disconnected' });
    expect(Reflect.has(port, 'state')).toBe(false);
    expect(Reflect.has(port, 'connection')).toBe(false);
  });
});

describe('openMidiPort', () => {
  it('distinguishes open, already-open, disconnected, disposed, and provider failure', async () => {
    const connection = { value: 'closed' };
    const open = vi.fn(async () => {
      connection.value = 'open';
    });
    const port = createInputPort({ connection, open });
    const openMidiPort = requiredFunction('openMidiPort');
    await expect(openMidiPort(port)).resolves.toEqual({ reason: 'opened' });
    await expect(openMidiPort(port)).resolves.toEqual({ reason: 'already-open' });
    expect(open).toHaveBeenCalledOnce();

    const disconnected = createInputPort({ state: { value: 'disconnected' } });
    await expect(openMidiPort(disconnected)).resolves.toEqual({ reason: 'disconnected' });
    await requiredFunction('disposeMidiPort')(disconnected);
    await expect(openMidiPort(disconnected)).resolves.toEqual({ reason: 'disposed' });

    const failed = createInputPort({ open: vi.fn(async () => Promise.reject(new Error('open'))) });
    await expect(openMidiPort(failed)).resolves.toEqual({ reason: 'operation-failed' });
  });
});

describe('sendMidiMessage', () => {
  it('validates one basic message before the provider and never admits system exclusive data', async () => {
    const send = vi.fn();
    const connection = { value: 'closed' };
    const output = createOutputPort({ connection, send });
    const sendMidiMessage = requiredFunction('sendMidiMessage');
    expect(sendMidiMessage(output, new Uint8Array())).toEqual({ reason: 'invalid-message' });
    expect(sendMidiMessage(output, new Uint8Array([0x40]))).toEqual({ reason: 'invalid-message' });
    expect(sendMidiMessage(output, new Uint8Array([0x90, 0x40]))).toEqual({ reason: 'invalid-message' });
    expect(sendMidiMessage(output, new Uint8Array([0x90, 0x90, 0x7f]))).toEqual({ reason: 'invalid-message' });
    expect(sendMidiMessage(output, new Uint8Array([0xf0, 0x01, 0xf7]))).toEqual({
      reason: 'system-exclusive-not-enabled',
    });
    expect(sendMidiMessage(output, new Uint8Array([0x90, 0x40, 0x7f]))).toEqual({ reason: 'not-open' });
    expect(send).not.toHaveBeenCalled();

    connection.value = 'open';
    expect(sendMidiMessage(output, new Uint8Array([0x90, 0x40, 0x7f]), 12.5)).toEqual({ reason: 'sent' });
    expect(send).toHaveBeenCalledWith([0x90, 0x40, 0x7f], 12.5);

    const disconnected = createOutputPort({ connection: { value: 'open' }, state: { value: 'disconnected' } });
    expect(sendMidiMessage(disconnected, new Uint8Array([0x80, 0x40, 0]))).toEqual({ reason: 'disconnected' });
  });
});

interface MutableValue {
  value: string;
}

interface PortOverrides {
  attachMessage?: (listener: (data: Uint8Array, timestamp: number) => void) => Promise<unknown>;
  attachStateChange?: (listener: () => void) => Promise<unknown>;
  close?: () => Promise<void>;
  connection?: MutableValue;
  open?: () => Promise<void>;
  send?: (data: readonly number[], timestamp?: number) => void;
  state?: MutableValue;
}

function createInputPort(overrides: Readonly<PortOverrides> = {}): Record<string, unknown> {
  const connection = overrides.connection ?? { value: 'closed' };
  const state = overrides.state ?? { value: 'connected' };
  return requiredFunction('createMidiInputPortResource')(
    { id: 'shared-id', manufacturer: 'Flight', name: 'Input', version: '1' },
    {
      attachMessage: overrides.attachMessage ?? vi.fn(),
      attachStateChange: overrides.attachStateChange ?? vi.fn(),
      close:
        overrides.close ??
        (async () => {
          connection.value = 'closed';
        }),
      getConnection: () => connection.value,
      getState: () => state.value,
      open:
        overrides.open ??
        (async () => {
          connection.value = 'open';
        }),
    },
  ) as Record<string, unknown>;
}

function createOutputPort(overrides: Readonly<PortOverrides> = {}): Record<string, unknown> {
  const connection = overrides.connection ?? { value: 'closed' };
  const state = overrides.state ?? { value: 'connected' };
  return requiredFunction('createMidiOutputPortResource')(
    { id: 'shared-id', manufacturer: 'Flight', name: 'Output', version: '1' },
    {
      attachStateChange: vi.fn(),
      close:
        overrides.close ??
        (async () => {
          connection.value = 'closed';
        }),
      getConnection: () => connection.value,
      getState: () => state.value,
      open:
        overrides.open ??
        (async () => {
          connection.value = 'open';
        }),
      send: overrides.send ?? vi.fn(),
    },
  ) as Record<string, unknown>;
}

function requiredFunction(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(midi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: unknown[]) => unknown;
}
