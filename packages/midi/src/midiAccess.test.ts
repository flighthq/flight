import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as midi from './contract';

describe('createMidiAccessResource', () => {
  it('creates an Entity whose provider operations stay outside its public fields', () => {
    const createMidiAccessResource = requiredFunction('createMidiAccessResource');
    const access = createMidiAccessResource({
      attachStateChange: vi.fn(),
      getInputPorts: () => [],
      getOutputPorts: () => [],
    }) as object;
    expect(EntityRuntimeKey in access).toBe(true);
    expect(Object.keys(access)).toEqual([]);
  });
});

describe('disposeMidiAccess', () => {
  it('is terminal and idempotent when no owned resources need release', async () => {
    const access = createEmptyAccess();
    const disposeMidiAccess = requiredFunction('disposeMidiAccess');
    await expect(disposeMidiAccess(access)).resolves.toEqual({ reason: 'ok' });
    await expect(disposeMidiAccess(access)).resolves.toEqual({ reason: 'already-disposed' });
  });

  it('attempts subscriptions and hotplug-only ports, then retries only failed releases', async () => {
    const accessListener: { current: ((port: unknown) => void) | null } = { current: null };
    const release = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'operation-failed' })
      .mockResolvedValueOnce({ reason: 'ok' });
    const access = requiredFunction('createMidiAccessResource')({
      attachStateChange: async (listener: (port: unknown) => void) => {
        accessListener.current = listener;
        return {
          attachment: (() => {
            const out = allocateEntity<any>();
            out.release = release;
            return finishEntity(out);
          })(),
          reason: 'ok',
        };
      },
      getInputPorts: () => [],
      getOutputPorts: () => [],
    });
    const connection = { value: 'closed' };
    const close = vi.fn(async () => {
      connection.value = 'closed';
    });
    const port = requiredFunction('createMidiOutputPortResource')(
      { id: 'hotplug', manufacturer: null, name: 'Hotplug', version: null },
      {
        attachStateChange: vi.fn(),
        close,
        getConnection: () => connection.value,
        getState: () => 'connected',
        open: async () => {
          connection.value = 'open';
        },
        send: vi.fn(),
      },
    );
    const subscription = requiredFunction('createMidiAccessStateSubscription')();
    await requiredFunction('attachMidiAccessStateSubscription')(access, subscription);
    accessListener.current?.(port);
    await requiredFunction('openMidiPort')(port);

    const disposeMidiAccess = requiredFunction('disposeMidiAccess');
    await expect(disposeMidiAccess(access)).resolves.toEqual({
      failures: [{ operation: 'state-subscription-release' }],
      reason: 'operation-failed',
    });
    expect(close).toHaveBeenCalledOnce();
    await expect(disposeMidiAccess(access)).resolves.toEqual({ reason: 'ok' });
    expect(close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledTimes(2);
  });
});

describe('getMidiAccessInputPorts', () => {
  it('returns the provider current stable input identities without routing through ids', () => {
    const input = allocateEntity<any>();
    input.id = 'duplicate';
    const access = createAccess([input], []);
    const getMidiAccessInputPorts = requiredFunction('getMidiAccessInputPorts');
    expect(getMidiAccessInputPorts(access)).toEqual({ ports: [input], reason: 'ok' });
    expect(getMidiAccessInputPorts(access)).toEqual({ ports: [input], reason: 'ok' });
  });
});

describe('getMidiAccessOutputPorts', () => {
  it('accepts an access with zero devices and preserves the provider output identities', () => {
    const output = allocateEntity<any>();
    output.id = 'duplicate';
    const getMidiAccessOutputPorts = requiredFunction('getMidiAccessOutputPorts');
    expect(getMidiAccessOutputPorts(createAccess([], []))).toEqual({ ports: [], reason: 'ok' });
    expect(getMidiAccessOutputPorts(createAccess([], [output]))).toEqual({ ports: [output], reason: 'ok' });
  });
});

describe('requestMidiAccess', () => {
  it('retains accepted access and keeps denial, security restriction, and provider failure distinct', async () => {
    const requestMidiAccess = requiredFunction('requestMidiAccess');
    const access = createEmptyAccess();
    const requestAccess = vi
      .fn()
      .mockResolvedValueOnce({ access, reason: 'accepted' })
      .mockResolvedValueOnce({ reason: 'permission-denied' })
      .mockResolvedValueOnce({ reason: 'security-restricted' })
      .mockRejectedValueOnce(new Error('provider fault'));
    const host = {
      midi: {
        access: (() => {
          const out = allocateEntity<any>();
          out.requestAccess = requestAccess;
          return finishEntity(out);
        })(),
      },
    };
    await expect(requestMidiAccess(host)).resolves.toEqual({ access, reason: 'accepted' });
    await expect(requestMidiAccess(host)).resolves.toEqual({ reason: 'permission-denied' });
    await expect(requestMidiAccess(host)).resolves.toEqual({ reason: 'security-restricted' });
    await expect(requestMidiAccess(host)).resolves.toEqual({ reason: 'operation-failed' });
  });
});

function createAccess(inputs: readonly object[], outputs: readonly object[]): unknown {
  return requiredFunction('createMidiAccessResource')({
    attachStateChange: vi.fn(),
    getInputPorts: () => inputs,
    getOutputPorts: () => outputs,
  });
}

function createEmptyAccess(): unknown {
  return createAccess([], []);
}

function requiredFunction(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(midi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: unknown[]) => unknown;
}
