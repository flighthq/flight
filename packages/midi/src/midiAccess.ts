import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HasMidiAccess,
  MidiAccess,
  MidiAccessDisposeOutcome,
  MidiAccessPortsOutcome,
  MidiAccessRequestOutcome,
  MidiAccessResourceOperations,
  MidiInputPort,
  MidiOutputPort,
  MidiPort,
} from '@flighthq/types/contract';

import { disposeMidiPort } from './midiPort';
import { getMidiAccessResourceState, retainMidiAccessResourceState } from './midiResource';
import { disposeMidiAccessStateSubscription } from './midiSubscription';

// Provider-contract constructor. Native MIDIAccess identity stays in provider-local state; this empty
// public Entity is the only handle consumers retain.
export function createMidiAccessResource(operations: MidiAccessResourceOperations): MidiAccess {
  const access = createEntity({});
  retainMidiAccessResourceState(access, operations);
  return access;
}

export function disposeMidiAccess(access: MidiAccess): Promise<MidiAccessDisposeOutcome> {
  const state = getMidiAccessResourceState(access);
  if (state === undefined || state.disposeCompleted) return Promise.resolve({ reason: 'already-disposed' });
  if (state.disposePending !== null) return state.disposePending;
  state.disposed = true;
  const pending = disposeMidiAccessKnownPorts(access);
  state.disposePending = pending;
  void pending.finally(() => {
    if (state.disposePending === pending) state.disposePending = null;
  });
  return pending;
}

export function getMidiAccessInputPorts(access: MidiAccess): MidiAccessPortsOutcome<MidiInputPort> {
  return getMidiAccessPorts(access, 'input');
}

export function getMidiAccessOutputPorts(access: MidiAccess): MidiAccessPortsOutcome<MidiOutputPort> {
  return getMidiAccessPorts(access, 'output');
}

export async function requestMidiAccess(host: HasMidiAccess): Promise<MidiAccessRequestOutcome> {
  try {
    return await host.midi.access.requestAccess();
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function disposeMidiAccessKnownPorts(access: MidiAccess): Promise<MidiAccessDisposeOutcome> {
  const state = getMidiAccessResourceState(access);
  if (state === undefined) return { reason: 'already-disposed' };
  const failures: Array<
    | { operation: 'state-subscription-release' }
    | {
        id: string;
        operation: 'close' | 'message-subscription-release' | 'state-subscription-release';
        type: MidiPort['type'];
      }
  > = [];
  for (const subscription of [...state.subscriptions]) {
    const outcome = await disposeMidiAccessStateSubscription(subscription);
    if (outcome.reason === 'operation-failed' && outcome.releaseFailed) {
      failures.push({ operation: 'state-subscription-release' });
    } else state.subscriptions.delete(subscription);
  }
  for (const port of [...state.knownPorts]) {
    const outcome = await disposeMidiPort(port);
    if (outcome.reason === 'operation-failed') {
      for (const failure of outcome.failures)
        failures.push({ id: port.id, operation: failure.operation, type: port.type });
    } else {
      state.knownPorts.delete(port);
    }
  }
  if (failures.length > 0) return { failures, reason: 'operation-failed' };
  state.disposeCompleted = true;
  return { reason: 'ok' };
}

function getMidiAccessPorts(access: MidiAccess, kind: 'input'): MidiAccessPortsOutcome<MidiInputPort>;
function getMidiAccessPorts(access: MidiAccess, kind: 'output'): MidiAccessPortsOutcome<MidiOutputPort>;
function getMidiAccessPorts(
  access: MidiAccess,
  kind: 'input' | 'output',
): MidiAccessPortsOutcome<MidiInputPort> | MidiAccessPortsOutcome<MidiOutputPort> {
  const state = getMidiAccessResourceState(access);
  if (state === undefined) return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  try {
    if (kind === 'input') {
      const ports = [...state.operations.getInputPorts()];
      for (const port of ports) state.knownPorts.add(port);
      return { ports, reason: 'ok' };
    }
    const ports = [...state.operations.getOutputPorts()];
    for (const port of ports) state.knownPorts.add(port);
    return { ports, reason: 'ok' };
  } catch {
    return { reason: 'operation-failed' };
  }
}
