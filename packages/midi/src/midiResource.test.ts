import { createEntity } from '@flighthq/entity/contract';
import type { MidiAccess, MidiInputPort, MidiOutputPort } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  getMidiAccessResourceState,
  getMidiPortResourceState,
  retainMidiAccessResourceState,
  retainMidiInputPortResourceState,
  retainMidiOutputPortResourceState,
} from './midiResource';

describe('getMidiAccessResourceState', () => {
  it('returns only state retained for the exact access identity', () => {
    const retained = createEntity({}) as MidiAccess;
    const other = createEntity({}) as MidiAccess;
    retainMidiAccessResourceState(retained, accessOperations());
    expect(getMidiAccessResourceState(retained)?.disposed).toBe(false);
    expect(getMidiAccessResourceState(other)).toBeUndefined();
  });
});

describe('getMidiPortResourceState', () => {
  it('does not collapse distinct port identities with matching metadata', () => {
    const first = inputPort();
    const second = inputPort();
    retainMidiInputPortResourceState(first, inputOperations());
    retainMidiInputPortResourceState(second, inputOperations());
    expect(getMidiPortResourceState(first)).not.toBe(getMidiPortResourceState(second));
  });
});

describe('retainMidiAccessResourceState', () => {
  it('starts an empty live access ownership ledger', () => {
    const access = createEntity({}) as MidiAccess;
    retainMidiAccessResourceState(access, accessOperations());
    expect(getMidiAccessResourceState(access)).toMatchObject({
      disposeCompleted: false,
      disposePending: null,
      disposed: false,
    });
    expect(getMidiAccessResourceState(access)?.knownPorts.size).toBe(0);
    expect(getMidiAccessResourceState(access)?.subscriptions.size).toBe(0);
  });
});

describe('retainMidiInputPortResourceState', () => {
  it('retains separate state and message subscription ownership', () => {
    const port = inputPort();
    retainMidiInputPortResourceState(port, inputOperations());
    const state = getMidiPortResourceState(port);
    expect(state?.kind).toBe('input');
    if (state?.kind !== 'input') throw new TypeError('expected input state');
    expect(state.messageSubscriptions.size).toBe(0);
    expect(state.stateSubscriptions.size).toBe(0);
  });
});

describe('retainMidiOutputPortResourceState', () => {
  it('retains output operations without an input-message ledger', () => {
    const port = outputPort();
    retainMidiOutputPortResourceState(port, outputOperations());
    const state = getMidiPortResourceState(port);
    expect(state?.kind).toBe('output');
    expect(state).not.toHaveProperty('messageSubscriptions');
    expect(state?.stateSubscriptions.size).toBe(0);
  });
});

function accessOperations() {
  return {
    attachStateChange: vi.fn(),
    getInputPorts: () => [],
    getOutputPorts: () => [],
  };
}

function inputOperations() {
  return {
    attachMessage: vi.fn(),
    attachStateChange: vi.fn(),
    close: vi.fn(),
    getConnection: () => 'closed' as const,
    getState: () => 'connected' as const,
    open: vi.fn(),
  };
}

function outputOperations() {
  return {
    attachStateChange: vi.fn(),
    close: vi.fn(),
    getConnection: () => 'closed' as const,
    getState: () => 'connected' as const,
    open: vi.fn(),
    send: vi.fn(),
  };
}

function inputPort(): MidiInputPort {
  return createEntity({ id: 'same', manufacturer: null, name: null, type: 'input' as const, version: null });
}

function outputPort(): MidiOutputPort {
  return createEntity({ id: 'same', manufacturer: null, name: null, type: 'output' as const, version: null });
}
