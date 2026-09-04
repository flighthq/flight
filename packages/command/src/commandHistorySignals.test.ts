import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import { registerCommandBinding } from './commandBinding';
import { createCommandHistory, executeCommand, undoCommand } from './commandHistory';
import { enableCommandHistorySignals, getCommandHistorySignals } from './commandHistorySignals';

describe('enableCommandHistorySignals', () => {
  it('allocates once and returns the same signal on a second call', () => {
    const history = createCommandHistory();
    expect(history.onChange).toBeNull();
    const signal = enableCommandHistorySignals(history);
    expect(enableCommandHistorySignals(history)).toBe(signal);
  });

  it('emits after an execute and after an undo', () => {
    const history = createCommandHistory();
    registerCommandBinding(history, 'test.Counter', { execute: () => undefined, undo: () => undefined });
    let changes = 0;
    connectSignal(enableCommandHistorySignals(history), () => changes++);

    executeCommand(history, (() => { const out = allocateEntity<unknown>(); out.kind = 'test.Counter'; out.label = 'One'; return finishEntity(out); })());
    expect(changes).toBe(1);
    undoCommand(history);
    expect(changes).toBe(2);
  });

  // A refused command changed nothing, so reporting a change would teach a panel to distrust the signal.
  it('does not emit when a command was refused for want of a binding', () => {
    const history = createCommandHistory();
    let changes = 0;
    connectSignal(enableCommandHistorySignals(history), () => changes++);
    executeCommand(history, (() => { const out = allocateEntity<unknown>(); out.kind = 'acme.Unbound'; out.label = 'Nope'; return finishEntity(out); })());
    expect(changes).toBe(0);
  });
});

describe('getCommandHistorySignals', () => {
  it('returns null until signals are enabled, and never allocates', () => {
    const history = createCommandHistory();
    expect(getCommandHistorySignals(history)).toBeNull();
    expect(history.onChange).toBeNull();
    const signal = enableCommandHistorySignals(history);
    expect(getCommandHistorySignals(history)).toBe(signal);
  });
});
