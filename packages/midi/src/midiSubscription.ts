import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Entity,
  MidiAccess,
  MidiAccessStateSubscription,
  MidiEventAttachment,
  MidiEventBackendAttachOutcome,
  MidiInputMessageSubscription,
  MidiInputPort,
  MidiPort,
  MidiPortStateSubscription,
  MidiSubscriptionAttachOutcome,
  MidiSubscriptionDetachOutcome,
  MidiSubscriptionDisposeOutcome,
  Signal,
} from '@flighthq/types/contract';

import { getMidiAccessResourceState, getMidiPortResourceState } from './midiResource';

export function attachMidiAccessStateSubscription(
  access: MidiAccess,
  subscription: MidiAccessStateSubscription,
): Promise<MidiSubscriptionAttachOutcome> {
  const state = getMidiAccessResourceState(access);
  if (state === undefined || state.disposed) return Promise.resolve(attachFailure());
  return attachMidiSubscription(
    subscription,
    (listener) => state.operations.attachStateChange(listener),
    (port: MidiPort) => emitSignal(subscription.onMidiAccessStateChange, port),
  );
}

export function attachMidiInputMessageSubscription(
  input: MidiInputPort,
  subscription: MidiInputMessageSubscription,
): Promise<MidiSubscriptionAttachOutcome> {
  const state = getMidiPortResourceState(input);
  if (state === undefined || state.kind !== 'input' || state.disposed) return Promise.resolve(attachFailure());
  return attachMidiSubscription(
    subscription,
    (listener) => state.operations.attachMessage(listener),
    (data: Uint8Array, timestamp: number) =>
      emitSignal(subscription.onMidiInputMessage, { data: new Uint8Array(data), timestamp }),
  );
}

export function attachMidiPortStateSubscription(
  port: MidiPort,
  subscription: MidiPortStateSubscription,
): Promise<MidiSubscriptionAttachOutcome> {
  const state = getMidiPortResourceState(port);
  if (state === undefined || state.disposed) return Promise.resolve(attachFailure());
  return attachMidiSubscription(
    subscription,
    (listener) => state.operations.attachStateChange(listener),
    () => emitSignal(subscription.onMidiPortStateChange, port),
  );
}

export function createMidiAccessStateSubscription(): MidiAccessStateSubscription {
  return createMidiSubscription({ onMidiAccessStateChange: createSignal() });
}

export function createMidiInputMessageSubscription(): MidiInputMessageSubscription {
  return createMidiSubscription({ onMidiInputMessage: createSignal() });
}

export function createMidiPortStateSubscription(): MidiPortStateSubscription {
  return createMidiSubscription({ onMidiPortStateChange: createSignal() });
}

export function detachMidiAccessStateSubscription(
  subscription: MidiAccessStateSubscription,
): Promise<MidiSubscriptionDetachOutcome> {
  return detachMidiSubscription(subscription);
}

export function detachMidiInputMessageSubscription(
  subscription: MidiInputMessageSubscription,
): Promise<MidiSubscriptionDetachOutcome> {
  return detachMidiSubscription(subscription);
}

export function detachMidiPortStateSubscription(
  subscription: MidiPortStateSubscription,
): Promise<MidiSubscriptionDetachOutcome> {
  return detachMidiSubscription(subscription);
}

export function disposeMidiAccessStateSubscription(
  subscription: MidiAccessStateSubscription,
): Promise<MidiSubscriptionDisposeOutcome> {
  return disposeMidiSubscription(subscription, subscription.onMidiAccessStateChange);
}

export function disposeMidiInputMessageSubscription(
  subscription: MidiInputMessageSubscription,
): Promise<MidiSubscriptionDisposeOutcome> {
  return disposeMidiSubscription(subscription, subscription.onMidiInputMessage);
}

export function disposeMidiPortStateSubscription(
  subscription: MidiPortStateSubscription,
): Promise<MidiSubscriptionDisposeOutcome> {
  return disposeMidiSubscription(subscription, subscription.onMidiPortStateChange);
}

type MidiAttach<Arguments extends unknown[]> = (
  listener: (...args: Arguments) => void,
) => Promise<MidiEventBackendAttachOutcome>;

interface MidiSubscriptionRuntime {
  attachment: MidiEventAttachment | null;
  disposeCompleted: boolean;
  disposed: boolean;
  generation: number;
  pending: Promise<MidiEventBackendAttachOutcome> | null;
}

const subscriptionStates = new WeakMap<Entity, MidiSubscriptionRuntime>();

function createMidiSubscription<Subscription extends Entity>(fields: Omit<Subscription, keyof Entity>): Subscription {
  const subscription = createEntity(fields) as Subscription;
  subscriptionStates.set(subscription, {
    attachment: null,
    disposeCompleted: false,
    disposed: false,
    generation: 0,
    pending: null,
  });
  return subscription;
}

async function attachMidiSubscription<Subscription extends Entity, Arguments extends unknown[]>(
  subscription: Subscription,
  attach: MidiAttach<Arguments>,
  listener: (...args: Arguments) => void,
): Promise<MidiSubscriptionAttachOutcome> {
  const runtime = subscriptionStates.get(subscription);
  if (runtime === undefined || runtime.disposed) return attachFailure();
  if (runtime.attachment !== null) {
    const detached = await detachMidiSubscription(subscription);
    if (detached.reason === 'operation-failed') {
      return { attachFailed: false, reason: 'operation-failed', releaseFailed: true };
    }
    if (runtime.disposed) return attachFailure();
  }
  const generation = ++runtime.generation;
  let pending: Promise<MidiEventBackendAttachOutcome>;
  try {
    pending = attach(listener);
  } catch {
    return attachFailure();
  }
  runtime.pending = pending;
  const outcome = await settleMidiAttach(pending);
  if (runtime.pending === pending) runtime.pending = null;
  if (outcome.reason === 'operation-failed') {
    return { attachFailed: true, reason: 'operation-failed', releaseFailed: outcome.releaseFailed };
  }
  if (runtime.disposed || runtime.generation !== generation) {
    const released = await releaseMidiAttachment(outcome.attachment);
    return released ? { reason: 'ok' } : { attachFailed: false, reason: 'operation-failed', releaseFailed: true };
  }
  runtime.attachment = outcome.attachment;
  return { reason: 'ok' };
}

async function detachMidiSubscription(subscription: Entity): Promise<MidiSubscriptionDetachOutcome> {
  const runtime = subscriptionStates.get(subscription);
  if (runtime === undefined || runtime.attachment === null) return { reason: 'not-attached' };
  if (!(await releaseMidiAttachment(runtime.attachment))) return { reason: 'operation-failed', releaseFailed: true };
  runtime.attachment = null;
  return { reason: 'ok' };
}

async function disposeMidiSubscription<Arguments extends unknown[]>(
  subscription: Entity,
  signal: Signal<(...args: Arguments) => void>,
): Promise<MidiSubscriptionDisposeOutcome> {
  const runtime = subscriptionStates.get(subscription);
  if (runtime === undefined || runtime.disposeCompleted) return { reason: 'already-disposed' };
  runtime.disposed = true;
  runtime.generation++;
  let attachFailed = false;
  let releaseFailed = false;
  if (runtime.pending !== null) {
    const outcome = await settleMidiAttach(runtime.pending);
    if (outcome.reason === 'operation-failed') {
      attachFailed = true;
      releaseFailed = outcome.releaseFailed;
    }
  }
  const detached = await detachMidiSubscription(subscription);
  if (detached.reason === 'operation-failed') releaseFailed = true;
  clearSignal(signal);
  if (attachFailed || releaseFailed) return { attachFailed, reason: 'operation-failed', releaseFailed };
  runtime.disposeCompleted = true;
  return { reason: 'ok' };
}

function attachFailure(): MidiSubscriptionAttachOutcome {
  return { attachFailed: true, reason: 'operation-failed', releaseFailed: false };
}

async function releaseMidiAttachment(attachment: MidiEventAttachment): Promise<boolean> {
  try {
    return (await attachment.release()).reason === 'ok';
  } catch {
    return false;
  }
}

async function settleMidiAttach(
  pending: Promise<MidiEventBackendAttachOutcome>,
): Promise<MidiEventBackendAttachOutcome> {
  try {
    return await pending;
  } catch {
    return { reason: 'operation-failed', releaseFailed: false };
  }
}
