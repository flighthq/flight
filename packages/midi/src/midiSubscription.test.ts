import { createEntity } from '@flighthq/entity/contract';
import { connectSignal, hasSignalSlots } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as midi from './contract';

describe('attachMidiAccessStateSubscription', () => {
  it('pins the exact access origin and emits stable hotplug port entities', async () => {
    const listener: { current: ((port: unknown) => void) | null } = { current: null };
    const release = vi.fn(async () => ({ reason: 'ok' }));
    const access = createAccess(async (next) => {
      listener.current = next;
      return { attachment: createEntity({ release }), reason: 'ok' };
    });
    const subscription = requiredFunction('createMidiAccessStateSubscription')() as SignalEntity;
    const seen: unknown[] = [];
    connectSignal(subscription.onMidiAccessStateChange, (port: unknown) => seen.push(port));
    await expect(requiredFunction('attachMidiAccessStateSubscription')(access, subscription)).resolves.toEqual({
      reason: 'ok',
    });
    const port = createInputPort();
    listener.current?.(port);
    expect(seen).toEqual([port]);
    await requiredFunction('detachMidiAccessStateSubscription')(subscription);
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('attachMidiInputMessageSubscription', () => {
  it('copies each byte payload and carries the native event time', async () => {
    const listener: { current: ((data: Uint8Array, timestamp: number) => void) | null } = { current: null };
    const input = createInputPort({
      attachMessage: async (next) => {
        listener.current = next;
        return { attachment: successfulAttachment(), reason: 'ok' };
      },
    });
    const subscription = requiredFunction('createMidiInputMessageSubscription')() as MessageSignalEntity;
    const seen: Array<{ data: Uint8Array; timestamp: number }> = [];
    connectSignal(subscription.onMidiInputMessage, (message: Readonly<{ data: Uint8Array; timestamp: number }>) => {
      seen.push({ data: message.data, timestamp: message.timestamp });
    });
    await expect(requiredFunction('attachMidiInputMessageSubscription')(input, subscription)).resolves.toEqual({
      reason: 'ok',
    });
    const nativeData = new Uint8Array([0x90, 60, 127]);
    listener.current?.(nativeData, 42.5);
    nativeData[1] = 1;
    expect(seen).toHaveLength(1);
    expect([...seen[0].data]).toEqual([0x90, 60, 127]);
    expect(seen[0].data).not.toBe(nativeData);
    expect(seen[0].timestamp).toBe(42.5);
  });
});

describe('attachMidiPortStateSubscription', () => {
  it('emits the originating port while state and connection stay pull-based', async () => {
    const listener: { current: (() => void) | null } = { current: null };
    const port = createInputPort({
      attachStateChange: async (next) => {
        listener.current = next;
        return { attachment: successfulAttachment(), reason: 'ok' };
      },
    });
    const subscription = requiredFunction('createMidiPortStateSubscription')() as SignalEntity;
    const seen: unknown[] = [];
    connectSignal(subscription.onMidiPortStateChange, (changed: unknown) => seen.push(changed));
    await expect(requiredFunction('attachMidiPortStateSubscription')(port, subscription)).resolves.toEqual({
      reason: 'ok',
    });
    listener.current?.();
    expect(seen).toEqual([port]);
    expect(Reflect.has(port, 'state')).toBe(false);
    expect(Reflect.has(port, 'connection')).toBe(false);
  });
});

describe('createMidiAccessStateSubscription', () => {
  it('creates a detached subscription Entity with an empty signal', () => {
    const subscription = requiredFunction('createMidiAccessStateSubscription')() as SignalEntity;
    expect(EntityRuntimeKey in subscription).toBe(true);
    expect(hasSignalSlots(subscription.onMidiAccessStateChange)).toBe(false);
  });
});

describe('createMidiInputMessageSubscription', () => {
  it('creates a detached subscription Entity with an empty signal', () => {
    const subscription = requiredFunction('createMidiInputMessageSubscription')() as MessageSignalEntity;
    expect(EntityRuntimeKey in subscription).toBe(true);
    expect(hasSignalSlots(subscription.onMidiInputMessage)).toBe(false);
  });
});

describe('createMidiPortStateSubscription', () => {
  it('creates a detached subscription Entity with an empty signal', () => {
    const subscription = requiredFunction('createMidiPortStateSubscription')() as SignalEntity;
    expect(EntityRuntimeKey in subscription).toBe(true);
    expect(hasSignalSlots(subscription.onMidiPortStateChange)).toBe(false);
  });
});

describe('detachMidiAccessStateSubscription', () => {
  it('retains a failed exact release for retry and never redirects through another access', async () => {
    const release = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'operation-failed' })
      .mockResolvedValueOnce({ reason: 'ok' });
    const access = createAccess(async () => ({ attachment: createEntity({ release }), reason: 'ok' }));
    const subscription = requiredFunction('createMidiAccessStateSubscription')();
    await requiredFunction('attachMidiAccessStateSubscription')(access, subscription);
    const detach = requiredFunction('detachMidiAccessStateSubscription');
    await expect(detach(subscription)).resolves.toEqual({ reason: 'operation-failed', releaseFailed: true });
    await expect(detach(subscription)).resolves.toEqual({ reason: 'ok' });
    await expect(detach(subscription)).resolves.toEqual({ reason: 'not-attached' });
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('invalidates an in-flight attach and waits for its exact release', async () => {
    const settle: { current: ((value: unknown) => void) | null } = { current: null };
    const release = vi.fn(async () => ({ reason: 'ok' }));
    const access = createAccess(
      () =>
        new Promise((resolve) => {
          settle.current = resolve;
        }),
    );
    const subscription = requiredFunction('createMidiAccessStateSubscription')();
    const attaching = requiredFunction('attachMidiAccessStateSubscription')(access, subscription);
    const detaching = requiredFunction('detachMidiAccessStateSubscription')(subscription);
    settle.current?.({ attachment: createEntity({ release }), reason: 'ok' });
    await expect(attaching).resolves.toEqual({ reason: 'ok' });
    await expect(detaching).resolves.toEqual({ reason: 'ok' });
    expect(release).toHaveBeenCalledOnce();
    await expect(requiredFunction('detachMidiAccessStateSubscription')(subscription)).resolves.toEqual({
      reason: 'not-attached',
    });
  });
});

describe('detachMidiInputMessageSubscription', () => {
  it('releases an input listener once and reports the detached state', async () => {
    const release = vi.fn(async () => ({ reason: 'ok' }));
    const input = createInputPort({
      attachMessage: async () => ({ attachment: createEntity({ release }), reason: 'ok' }),
    });
    const subscription = requiredFunction('createMidiInputMessageSubscription')();
    await requiredFunction('attachMidiInputMessageSubscription')(input, subscription);
    const detach = requiredFunction('detachMidiInputMessageSubscription');
    await expect(detach(subscription)).resolves.toEqual({ reason: 'ok' });
    await expect(detach(subscription)).resolves.toEqual({ reason: 'not-attached' });
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('detachMidiPortStateSubscription', () => {
  it('releases the exact port-state listener without disposing consumer slots', async () => {
    const release = vi.fn(async () => ({ reason: 'ok' }));
    const port = createInputPort({
      attachStateChange: async () => ({ attachment: createEntity({ release }), reason: 'ok' }),
    });
    const subscription = requiredFunction('createMidiPortStateSubscription')() as SignalEntity;
    connectSignal(subscription.onMidiPortStateChange, vi.fn());
    await requiredFunction('attachMidiPortStateSubscription')(port, subscription);
    await expect(requiredFunction('detachMidiPortStateSubscription')(subscription)).resolves.toEqual({ reason: 'ok' });
    expect(hasSignalSlots(subscription.onMidiPortStateChange)).toBe(true);
  });
});

describe('disposeMidiAccessStateSubscription', () => {
  it('invalidates an in-flight attach, releases its eventual origin, clears slots, and stays terminal', async () => {
    const settle: { current: ((value: unknown) => void) | null } = { current: null };
    const release = vi.fn(async () => ({ reason: 'ok' }));
    const access = createAccess(
      () =>
        new Promise((resolve) => {
          settle.current = resolve;
        }),
    );
    const subscription = requiredFunction('createMidiAccessStateSubscription')() as SignalEntity;
    connectSignal(subscription.onMidiAccessStateChange, vi.fn());
    const attaching = requiredFunction('attachMidiAccessStateSubscription')(access, subscription);
    const disposing = requiredFunction('disposeMidiAccessStateSubscription')(subscription);
    settle.current?.({ attachment: createEntity({ release }), reason: 'ok' });
    await attaching;
    await expect(disposing).resolves.toEqual({ reason: 'ok' });
    expect(release).toHaveBeenCalledOnce();
    expect(hasSignalSlots(subscription.onMidiAccessStateChange)).toBe(false);
    await expect(requiredFunction('disposeMidiAccessStateSubscription')(subscription)).resolves.toEqual({
      reason: 'already-disposed',
    });
    await expect(requiredFunction('attachMidiAccessStateSubscription')(access, subscription)).resolves.toMatchObject({
      attachFailed: true,
      reason: 'operation-failed',
    });
  });
});

describe('disposeMidiInputMessageSubscription', () => {
  it('clears consumer slots even when native release fails and retries only that release', async () => {
    const release = vi
      .fn()
      .mockResolvedValueOnce({ reason: 'operation-failed' })
      .mockResolvedValueOnce({ reason: 'ok' });
    const input = createInputPort({
      attachMessage: async () => ({ attachment: createEntity({ release }), reason: 'ok' }),
    });
    const subscription = requiredFunction('createMidiInputMessageSubscription')() as MessageSignalEntity;
    connectSignal(subscription.onMidiInputMessage, vi.fn());
    await requiredFunction('attachMidiInputMessageSubscription')(input, subscription);
    const dispose = requiredFunction('disposeMidiInputMessageSubscription');
    await expect(dispose(subscription)).resolves.toEqual({
      attachFailed: false,
      reason: 'operation-failed',
      releaseFailed: true,
    });
    expect(hasSignalSlots(subscription.onMidiInputMessage)).toBe(false);
    await expect(dispose(subscription)).resolves.toEqual({ reason: 'ok' });
    expect(release).toHaveBeenCalledTimes(2);
  });
});

describe('disposeMidiPortStateSubscription', () => {
  it('is idempotent after a successful terminal release', async () => {
    const port = createInputPort({
      attachStateChange: async () => ({ attachment: successfulAttachment(), reason: 'ok' }),
    });
    const subscription = requiredFunction('createMidiPortStateSubscription')();
    await requiredFunction('attachMidiPortStateSubscription')(port, subscription);
    const dispose = requiredFunction('disposeMidiPortStateSubscription');
    await expect(dispose(subscription)).resolves.toEqual({ reason: 'ok' });
    await expect(dispose(subscription)).resolves.toEqual({ reason: 'already-disposed' });
  });
});

interface SignalEntity {
  [EntityRuntimeKey]: unknown;
  onMidiAccessStateChange: Parameters<typeof hasSignalSlots>[0];
  onMidiPortStateChange: Parameters<typeof hasSignalSlots>[0];
}

interface MessageSignalEntity {
  [EntityRuntimeKey]: unknown;
  onMidiInputMessage: Parameters<typeof hasSignalSlots>[0];
}

interface InputOperations {
  attachMessage?: (listener: (data: Uint8Array, timestamp: number) => void) => Promise<unknown>;
  attachStateChange?: (listener: () => void) => Promise<unknown>;
}

function createAccess(attachStateChange: (listener: (port: unknown) => void) => Promise<unknown>): unknown {
  return requiredFunction('createMidiAccessResource')({
    attachStateChange,
    getInputPorts: () => [],
    getOutputPorts: () => [],
  });
}

function createInputPort(operations: Readonly<InputOperations> = {}): Record<string, unknown> {
  return requiredFunction('createMidiInputPortResource')(
    { id: 'input', manufacturer: null, name: 'Input', version: null },
    {
      attachMessage: operations.attachMessage ?? vi.fn(),
      attachStateChange: operations.attachStateChange ?? vi.fn(),
      close: async () => undefined,
      getConnection: () => 'closed',
      getState: () => 'connected',
      open: async () => undefined,
    },
  ) as Record<string, unknown>;
}

function requiredFunction(name: string): (...args: unknown[]) => unknown {
  const value: unknown = Reflect.get(midi, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: unknown[]) => unknown;
}

function successfulAttachment(): object {
  return createEntity({ release: async () => ({ reason: 'ok' }) });
}
