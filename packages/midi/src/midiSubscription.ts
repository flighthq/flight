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
    state.subscriptions,
    (listener) => state.operations.attachStateChange(listener),
    (port: MidiPort) => {
      state.knownPorts.add(port);
      emitSignal(subscription.onMidiAccessStateChange, port);
    },
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
    state.messageSubscriptions,
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
    state.stateSubscriptions,
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
  attaching: Promise<MidiSubscriptionAttachOutcome> | null;
  disposeCompleted: boolean;
  disposed: boolean;
  generation: number;
  ownerSubscriptions: Set<Entity> | null;
}

const subscriptionStates = new WeakMap<Entity, MidiSubscriptionRuntime>();

function createMidiSubscription<Subscription extends Entity>(fields: Omit<Subscription, keyof Entity>): Subscription {
  const subscription = createEntity(fields) as Subscription;
  subscriptionStates.set(subscription, {
    attachment: null,
    attaching: null,
    disposeCompleted: false,
    disposed: false,
    generation: 0,
    ownerSubscriptions: null,
  });
  return subscription;
}

async function attachMidiSubscription<Subscription extends Entity, Arguments extends unknown[]>(
  subscription: Subscription,
  ownerSubscriptions: Set<Subscription>,
  attach: MidiAttach<Arguments>,
  listener: (...args: Arguments) => void,
): Promise<MidiSubscriptionAttachOutcome> {
  const runtime = subscriptionStates.get(subscription);
  if (runtime === undefined || runtime.disposed) return attachFailure();
  if (runtime.attaching !== null) {
    runtime.generation++;
    await runtime.attaching;
    if (runtime.disposed) return attachFailure();
  }
  if (runtime.attachment !== null) {
    const detached = await detachMidiSubscription(subscription);
    if (detached.reason === 'operation-failed') {
      return { attachFailed: false, reason: 'operation-failed', releaseFailed: true };
    }
    if (runtime.disposed) return attachFailure();
  }
  const generation = ++runtime.generation;
  runtime.ownerSubscriptions = ownerSubscriptions as Set<Entity>;
  ownerSubscriptions.add(subscription);
  const attaching = performMidiAttach(subscription, runtime, generation, attach, listener);
  runtime.attaching = attaching;
  const outcome = await attaching;
  if (runtime.attaching === attaching) runtime.attaching = null;
  return outcome;
}

async function performMidiAttach<Arguments extends unknown[]>(
  subscription: Entity,
  runtime: MidiSubscriptionRuntime,
  generation: number,
  attach: MidiAttach<Arguments>,
  listener: (...args: Arguments) => void,
): Promise<MidiSubscriptionAttachOutcome> {
  let pending: Promise<MidiEventBackendAttachOutcome>;
  try {
    pending = attach(listener);
  } catch {
    untrackMidiSubscription(subscription, runtime);
    return attachFailure();
  }
  const outcome = await settleMidiAttach(pending);
  if (outcome.reason === 'operation-failed') {
    untrackMidiSubscription(subscription, runtime);
    return { attachFailed: true, reason: 'operation-failed', releaseFailed: outcome.releaseFailed };
  }
  runtime.attachment = outcome.attachment;
  if (runtime.disposed || runtime.generation !== generation) {
    const released = await releaseTrackedMidiAttachment(subscription, runtime);
    return released ? { reason: 'ok' } : { attachFailed: false, reason: 'operation-failed', releaseFailed: true };
  }
  return { reason: 'ok' };
}

async function detachMidiSubscription(subscription: Entity): Promise<MidiSubscriptionDetachOutcome> {
  const runtime = subscriptionStates.get(subscription);
  if (runtime === undefined) return { reason: 'not-attached' };
  runtime.generation++;
  let invalidatedAttach = false;
  if (runtime.attaching !== null) {
    const outcome = await runtime.attaching;
    if (outcome.reason === 'operation-failed' && outcome.releaseFailed) {
      return { reason: 'operation-failed', releaseFailed: true };
    }
    invalidatedAttach = outcome.reason === 'ok';
  }
  if (runtime.attachment === null) return { reason: invalidatedAttach ? 'ok' : 'not-attached' };
  if (!(await releaseTrackedMidiAttachment(subscription, runtime))) {
    return { reason: 'operation-failed', releaseFailed: true };
  }
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
  if (runtime.attaching !== null) {
    const outcome = await runtime.attaching;
    if (outcome.reason === 'operation-failed') ({ attachFailed, releaseFailed } = outcome);
  }
  if (!releaseFailed) {
    const detached = await detachMidiSubscription(subscription);
    if (detached.reason === 'operation-failed') releaseFailed = true;
  }
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

async function releaseTrackedMidiAttachment(subscription: Entity, runtime: MidiSubscriptionRuntime): Promise<boolean> {
  if (runtime.attachment === null || !(await releaseMidiAttachment(runtime.attachment))) return false;
  runtime.attachment = null;
  untrackMidiSubscription(subscription, runtime);
  return true;
}

function untrackMidiSubscription(subscription: Entity, runtime: MidiSubscriptionRuntime): void {
  runtime.ownerSubscriptions?.delete(subscription);
  runtime.ownerSubscriptions = null;
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
