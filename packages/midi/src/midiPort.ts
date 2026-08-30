import { createEntity } from '@flighthq/entity/contract';
import type {
  MidiInputPort,
  MidiInputPortResourceOperations,
  MidiMessageSendOutcome,
  MidiOutputPort,
  MidiOutputPortResourceOperations,
  MidiPort,
  MidiPortCloseOutcome,
  MidiPortConnectionOutcome,
  MidiPortDisposeOutcome,
  MidiPortOpenOutcome,
  MidiPortStateOutcome,
} from '@flighthq/types/contract';

import {
  getMidiPortResourceState,
  retainMidiInputPortResourceState,
  retainMidiOutputPortResourceState,
} from './midiResource';

interface MidiPortMetadata {
  readonly id: string;
  readonly manufacturer: string | null;
  readonly name: string | null;
  readonly version: string | null;
}

export async function closeMidiPort(port: MidiPort): Promise<MidiPortCloseOutcome> {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  const connection = readMidiPortConnection(port);
  if (connection.reason !== 'ok') return { reason: 'operation-failed' };
  if (connection.connection === 'closed') return { reason: 'already-closed' };
  try {
    await state.operations.close();
    state.flightOpened = false;
    return { reason: 'closed' };
  } catch {
    return { reason: 'operation-failed' };
  }
}

// Provider-contract constructors retain operations privately. Matching native IDs never collapse two
// port Entities, even across input/output directions or access-profile origins.
export function createMidiInputPortResource(
  metadata: Readonly<MidiPortMetadata>,
  operations: MidiInputPortResourceOperations,
): MidiInputPort {
  const port = createEntity({ ...metadata, type: 'input' as const });
  retainMidiInputPortResourceState(port, operations);
  return port;
}

export function createMidiOutputPortResource(
  metadata: Readonly<MidiPortMetadata>,
  operations: MidiOutputPortResourceOperations,
): MidiOutputPort {
  const port = createEntity({ ...metadata, type: 'output' as const });
  retainMidiOutputPortResourceState(port, operations);
  return port;
}

export function disposeMidiPort(port: MidiPort): Promise<MidiPortDisposeOutcome> {
  const state = getMidiPortResourceState(port);
  if (state === undefined || state.disposeCompleted) return Promise.resolve({ reason: 'already-disposed' });
  if (state.disposePending !== null) return state.disposePending;
  state.disposed = true;
  const pending = disposeOwnedMidiPort(port);
  state.disposePending = pending;
  void pending.finally(() => {
    if (state.disposePending === pending) state.disposePending = null;
  });
  return pending;
}

export function getMidiPortConnection(port: MidiPort): MidiPortConnectionOutcome {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  return readMidiPortConnection(port);
}

export function getMidiPortState(port: MidiPort): MidiPortStateOutcome {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  try {
    return { reason: 'ok', state: state.operations.getState() };
  } catch {
    return { reason: 'operation-failed' };
  }
}

export async function openMidiPort(port: MidiPort): Promise<MidiPortOpenOutcome> {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  const portState = getMidiPortState(port);
  if (portState.reason !== 'ok') return { reason: 'operation-failed' };
  if (portState.state === 'disconnected') return { reason: 'disconnected' };
  const connection = readMidiPortConnection(port);
  if (connection.reason !== 'ok') return { reason: 'operation-failed' };
  if (connection.connection === 'open') return { reason: 'already-open' };
  if (connection.connection === 'pending') return { reason: 'operation-failed' };
  try {
    await state.operations.open();
    state.flightOpened = true;
    return { reason: 'opened' };
  } catch {
    return { reason: 'operation-failed' };
  }
}

export function sendMidiMessage(
  port: MidiOutputPort,
  data: Readonly<Uint8Array>,
  timestamp?: number,
): MidiMessageSendOutcome {
  const validation = validateBasicMidiMessage(data, timestamp);
  if (validation !== 'valid') return { reason: validation };
  const state = getMidiPortResourceState(port);
  if (state === undefined || state.kind !== 'output') return { reason: 'operation-failed' };
  if (state.disposed) return { reason: 'disposed' };
  const portState = getMidiPortState(port);
  if (portState.reason !== 'ok') return { reason: 'operation-failed' };
  if (portState.state === 'disconnected') return { reason: 'disconnected' };
  const connection = readMidiPortConnection(port);
  if (connection.reason !== 'ok') return { reason: 'operation-failed' };
  if (connection.connection !== 'open') return { reason: 'not-open' };
  try {
    state.operations.send([...data], timestamp);
    return { reason: 'sent' };
  } catch {
    return { reason: 'operation-failed' };
  }
}

async function disposeOwnedMidiPort(port: MidiPort): Promise<MidiPortDisposeOutcome> {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'already-disposed' };
  if (state.flightOpened) {
    let connectionIsClosed = false;
    try {
      connectionIsClosed = state.operations.getConnection() === 'closed';
    } catch {
      return { failures: [{ operation: 'close' }], reason: 'operation-failed' };
    }
    if (!connectionIsClosed) {
      try {
        await state.operations.close();
      } catch {
        return { failures: [{ operation: 'close' }], reason: 'operation-failed' };
      }
    }
  }
  state.flightOpened = false;
  state.disposeCompleted = true;
  return { reason: 'ok' };
}

function readMidiPortConnection(port: MidiPort): MidiPortConnectionOutcome {
  const state = getMidiPortResourceState(port);
  if (state === undefined) return { reason: 'operation-failed' };
  try {
    return { connection: state.operations.getConnection(), reason: 'ok' };
  } catch {
    return { reason: 'operation-failed' };
  }
}

function validateBasicMidiMessage(
  data: Readonly<Uint8Array>,
  timestamp: number | undefined,
): 'invalid-message' | 'system-exclusive-not-enabled' | 'valid' {
  if (timestamp !== undefined && (!Number.isFinite(timestamp) || timestamp < 0)) return 'invalid-message';
  if (data.length === 0) return 'invalid-message';
  const status = data[0];
  if (status === 0xf0) return 'system-exclusive-not-enabled';
  const expectedLength = getBasicMidiMessageLength(status);
  if (expectedLength === null || data.length !== expectedLength) return 'invalid-message';
  for (let index = 1; index < data.length; index++) {
    if (data[index] > 0x7f) return 'invalid-message';
  }
  return 'valid';
}

function getBasicMidiMessageLength(status: number): number | null {
  if (status < 0x80) return null;
  if (status < 0xf0) return status < 0xc0 || status >= 0xe0 ? 3 : 2;
  switch (status) {
    case 0xf1:
    case 0xf3:
      return 2;
    case 0xf2:
      return 3;
    case 0xf6:
    case 0xf8:
    case 0xfa:
    case 0xfb:
    case 0xfc:
    case 0xfe:
    case 0xff:
      return 1;
    default:
      return null;
  }
}
