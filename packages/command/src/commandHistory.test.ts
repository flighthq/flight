import { createEntity } from '@flighthq/entity/contract';
import { createNode, getNodeChildCount } from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { Command, CommandHistory, NodeAny } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createAddNodeChildCommand, createSetNodePropertyCommand } from './command';
import { registerCommandBinding, registerDefaultCommandBindings } from './commandBinding';
import {
  canRedoCommand,
  canUndoCommand,
  clearCommandHistory,
  createCommandHistory,
  executeCommand,
  getCommandHistoryEntries,
  getCommandHistoryIndex,
  getCommandHistoryRedoLabel,
  getCommandHistoryUndoLabel,
  notifyCommandHistoryChanged,
  redoCommand,
  undoCommand,
} from './commandHistory';
import { enableCommandHistorySignals } from './commandHistorySignals';

describe('canRedoCommand', () => {
  it('is false until something has been undone', () => {
    const history = counting();
    expect(canRedoCommand(history)).toBe(false);
    executeCommand(history, counter('One'));
    expect(canRedoCommand(history)).toBe(false);
    undoCommand(history);
    expect(canRedoCommand(history)).toBe(true);
  });
});

describe('canUndoCommand', () => {
  it('is false on an empty history and true once something is applied', () => {
    const history = counting();
    expect(canUndoCommand(history)).toBe(false);
    executeCommand(history, counter('One'));
    expect(canUndoCommand(history)).toBe(true);
  });
});

describe('clearCommandHistory', () => {
  // Clearing FORGETS how to reverse the work; it must not silently reverse it. An editor that cleared
  // history on save would otherwise undo the document.
  it('drops entries without undoing them', () => {
    const history = withDefaults();
    const parent = node();
    executeCommand(history, createAddNodeChildCommand('Add', parent, node()));

    clearCommandHistory(history);
    expect(getCommandHistoryEntries(history)).toHaveLength(0);
    expect(getCommandHistoryIndex(history)).toBe(0);
    expect(getNodeChildCount(parent)).toBe(1);
  });

  it('emits nothing when there was nothing to forget', () => {
    const history = counting();
    let changes = 0;
    connectSignal(enableCommandHistorySignals(history), () => changes++);
    clearCommandHistory(history);
    expect(changes).toBe(0);
  });
});

describe('createCommandHistory', () => {
  it('starts empty with no bindings and no signal allocated', () => {
    const history = createCommandHistory();
    expect(history.entries).toHaveLength(0);
    expect(history.index).toBe(0);
    expect(history.maxSize).toBe(0);
    expect(history.onChange).toBeNull();
  });
});

describe('executeCommand', () => {
  it('refuses an unregistered kind rather than pushing an entry undo would skip', () => {
    const history = createCommandHistory();
    expect(executeCommand(history, command('acme.Unbound', 'Nope'))).toBe(false);
    expect(getCommandHistoryEntries(history)).toHaveLength(0);
  });

  // A new action after an undo forks the timeline: the abandoned redo branch must not survive, or redo
  // would re-apply work the user replaced.
  it('discards the redo branch when a new command arrives after an undo', () => {
    const history = counting();
    executeCommand(history, counter('One'));
    executeCommand(history, counter('Two'));
    undoCommand(history);
    executeCommand(history, counter('Three'));

    expect(getCommandHistoryEntries(history).map((entry) => entry.label)).toEqual(['One', 'Three']);
    expect(canRedoCommand(history)).toBe(false);
  });

  it('trims from the oldest end at maxSize, keeping the most recent history', () => {
    const history = counting(2);
    executeCommand(history, counter('One'));
    executeCommand(history, counter('Two'));
    executeCommand(history, counter('Three'));

    expect(getCommandHistoryEntries(history).map((entry) => entry.label)).toEqual(['Two', 'Three']);
    expect(getCommandHistoryIndex(history)).toBe(2);
  });
});

describe('getCommandHistoryEntries', () => {
  it('includes the reversed entries ahead of the cursor', () => {
    const history = counting();
    executeCommand(history, counter('One'));
    undoCommand(history);
    expect(getCommandHistoryEntries(history)).toHaveLength(1);
    expect(getCommandHistoryIndex(history)).toBe(0);
  });
});

describe('getCommandHistoryIndex', () => {
  it('counts applied entries', () => {
    const history = counting();
    executeCommand(history, counter('One'));
    executeCommand(history, counter('Two'));
    expect(getCommandHistoryIndex(history)).toBe(2);
  });
});

describe('getCommandHistoryRedoLabel', () => {
  it('names the entry redo would re-apply, and is null with nothing to redo', () => {
    const history = counting();
    expect(getCommandHistoryRedoLabel(history)).toBeNull();
    executeCommand(history, counter('One'));
    undoCommand(history);
    expect(getCommandHistoryRedoLabel(history)).toBe('One');
  });
});

describe('getCommandHistoryUndoLabel', () => {
  it('names the entry undo would reverse, and is null with nothing to undo', () => {
    const history = counting();
    expect(getCommandHistoryUndoLabel(history)).toBeNull();
    executeCommand(history, counter('One'));
    expect(getCommandHistoryUndoLabel(history)).toBe('One');
  });
});

describe('notifyCommandHistoryChanged', () => {
  it('is inert when no signal was enabled', () => {
    expect(() => notifyCommandHistoryChanged(createCommandHistory())).not.toThrow();
  });
});

describe('redoCommand', () => {
  it('re-applies through the registered execute and returns false with nothing to redo', () => {
    const history = withDefaults();
    const target = node();
    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 100));
    undoCommand(history);
    expect(redoCommand(history)).toBe(true);
    expect((target as unknown as Record<string, unknown>).x).toBe(100);
    expect(redoCommand(history)).toBe(false);
  });
});

describe('undoCommand', () => {
  it('returns false with nothing to undo', () => {
    expect(undoCommand(createCommandHistory())).toBe(false);
  });

  it('reverses entries newest first', () => {
    const history = counting();
    const order: string[] = [];
    registerCommandBinding(history, 'test.Ordered', {
      execute: () => undefined,
      undo: (command) => order.push(command.label),
    });
    executeCommand(history, command('test.Ordered', 'One'));
    executeCommand(history, command('test.Ordered', 'Two'));
    undoCommand(history);
    undoCommand(history);
    expect(order).toEqual(['Two', 'One']);
  });
});

function counter(label: string): Command {
  return command('test.Counter', label);
}

function command(kind: string, label: string): Command {
  return createEntity({ kind, label });
}

// A history bound to one inert kind, so stack behaviour can be tested without any graph mutation.
function counting(maxSize = 0): CommandHistory {
  const history = createCommandHistory(maxSize);
  registerCommandBinding(history, 'test.Counter', { execute: () => undefined, undo: () => undefined });
  return history;
}

function node(): NodeAny {
  return createNode('test.CommandTarget') as NodeAny;
}

function withDefaults(): CommandHistory {
  const history = createCommandHistory();
  registerDefaultCommandBindings(history);
  return history;
}
