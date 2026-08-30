import type {
  MidiAccess,
  MidiAccessDisposeOutcome,
  MidiAccessResourceOperations,
  MidiAccessStateSubscription,
  MidiInputMessageSubscription,
  MidiInputPort,
  MidiInputPortResourceOperations,
  MidiOutputPort,
  MidiOutputPortResourceOperations,
  MidiPort,
  MidiPortDisposeOutcome,
  MidiPortStateSubscription,
} from '@flighthq/types/contract';

export interface MidiAccessResourceState {
  disposeCompleted: boolean;
  disposePending: Promise<MidiAccessDisposeOutcome> | null;
  disposed: boolean;
  knownPorts: Set<MidiPort>;
  operations: MidiAccessResourceOperations;
  subscriptions: Set<MidiAccessStateSubscription>;
}

interface MidiPortResourceStateBase {
  disposeCompleted: boolean;
  disposePending: Promise<MidiPortDisposeOutcome> | null;
  disposed: boolean;
  flightOpened: boolean;
  stateSubscriptions: Set<MidiPortStateSubscription>;
}

export interface MidiInputPortResourceState extends MidiPortResourceStateBase {
  kind: 'input';
  messageSubscriptions: Set<MidiInputMessageSubscription>;
  operations: MidiInputPortResourceOperations;
}

export interface MidiOutputPortResourceState extends MidiPortResourceStateBase {
  kind: 'output';
  operations: MidiOutputPortResourceOperations;
}

export type MidiPortResourceState = MidiInputPortResourceState | MidiOutputPortResourceState;

const accessStates = new WeakMap<MidiAccess, MidiAccessResourceState>();
const portStates = new WeakMap<MidiPort, MidiPortResourceState>();

export function getMidiAccessResourceState(access: MidiAccess): MidiAccessResourceState | undefined {
  return accessStates.get(access);
}

export function getMidiPortResourceState(port: MidiPort): MidiPortResourceState | undefined {
  return portStates.get(port);
}

export function retainMidiAccessResourceState(access: MidiAccess, operations: MidiAccessResourceOperations): void {
  accessStates.set(access, {
    disposeCompleted: false,
    disposePending: null,
    disposed: false,
    knownPorts: new Set(),
    operations,
    subscriptions: new Set(),
  });
}

export function retainMidiInputPortResourceState(
  port: MidiInputPort,
  operations: MidiInputPortResourceOperations,
): void {
  portStates.set(port, { ...createMidiPortState('input', operations), messageSubscriptions: new Set() });
}

export function retainMidiOutputPortResourceState(
  port: MidiOutputPort,
  operations: MidiOutputPortResourceOperations,
): void {
  portStates.set(port, createMidiPortState('output', operations));
}

function createMidiPortState<
  Kind extends MidiPortResourceState['kind'],
  Operations extends MidiPortResourceState['operations'],
>(kind: Kind, operations: Operations) {
  return {
    disposeCompleted: false,
    disposePending: null,
    disposed: false,
    flightOpened: false,
    kind,
    operations,
    stateSubscriptions: new Set(),
  } as Extract<MidiPortResourceState, { kind: Kind }>;
}
