import { createNode, getNodeChildCount } from '@flighthq/node/contract';
import type { CommandHistory, CompositeCommand, NodeAny } from '@flighthq/types/contract';
import { CompositeCommandKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createAddNodeChildCommand, createSetNodePropertyCommand } from './command';
import { registerDefaultCommandBindings } from './commandBinding';
import {
  createCommandHistory,
  executeCommand,
  getCommandHistoryEntries,
  getCommandHistoryUndoLabel,
  undoCommand,
} from './commandHistory';
import {
  abortCommandTransaction,
  beginCommandTransaction,
  endCommandTransaction,
  isCommandTransactionOpen,
} from './commandTransaction';

describe('abortCommandTransaction', () => {
  it('returns false when no bracket is open', () => {
    expect(abortCommandTransaction(createCommandHistory())).toBe(false);
  });

  // A half-finished paste must leave the graph as it was found, and must leave no undo entry behind.
  it('unwinds every command executed since begin and leaves no entry', () => {
    const history = withDefaults();
    const parent = node();
    const target = node();
    write(target, 'x', 1);

    beginCommandTransaction(history, 'Paste');
    executeCommand(history, createAddNodeChildCommand('Add', parent, node()));
    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 50));
    abortCommandTransaction(history);

    expect(getNodeChildCount(parent)).toBe(0);
    expect(read(target, 'x')).toBe(1);
    expect(getCommandHistoryEntries(history)).toHaveLength(0);
    expect(isCommandTransactionOpen(history)).toBe(false);
  });

  it('leaves entries recorded before the bracket alone', () => {
    const history = withDefaults();
    const target = node();
    executeCommand(history, createSetNodePropertyCommand('Before', target, 'x', 10));

    beginCommandTransaction(history, 'Paste');
    executeCommand(history, createSetNodePropertyCommand('Inside', target, 'x', 20));
    abortCommandTransaction(history);

    expect(getCommandHistoryEntries(history).map((entry) => entry.label)).toEqual(['Before']);
    expect(read(target, 'x')).toBe(10);
  });
});

describe('beginCommandTransaction', () => {
  it('opens a bracket', () => {
    const history = withDefaults();
    beginCommandTransaction(history, 'Paste');
    expect(isCommandTransactionOpen(history)).toBe(true);
  });

  // Nesting is COUNTED, not stacked: a helper that brackets its own work must not fragment a caller's
  // larger transaction into several undo entries.
  it('counts nesting so only the outermost close folds', () => {
    const history = withDefaults();
    const target = node();

    beginCommandTransaction(history, 'Outer');
    beginCommandTransaction(history, 'Inner');
    executeCommand(history, createSetNodePropertyCommand('One', target, 'x', 1));
    endCommandTransaction(history);
    expect(isCommandTransactionOpen(history)).toBe(true);
    executeCommand(history, createSetNodePropertyCommand('Two', target, 'y', 2));
    endCommandTransaction(history);

    expect(getCommandHistoryEntries(history)).toHaveLength(1);
    expect(getCommandHistoryUndoLabel(history)).toBe('Outer');
  });
});

describe('endCommandTransaction', () => {
  it('returns false when no bracket is open', () => {
    expect(endCommandTransaction(createCommandHistory())).toBe(false);
  });

  it('folds several commands into one composite entry carrying the bracket label', () => {
    const history = withDefaults();
    const target = node();
    write(target, 'x', 0);
    write(target, 'y', 0);

    beginCommandTransaction(history, 'Transform');
    executeCommand(history, createSetNodePropertyCommand('One', target, 'x', 10));
    executeCommand(history, createSetNodePropertyCommand('Two', target, 'y', 20));
    endCommandTransaction(history);

    const entries = getCommandHistoryEntries(history);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe(CompositeCommandKind);
    expect(entries[0].label).toBe('Transform');
    expect((entries[0] as CompositeCommand).children).toHaveLength(2);

    // One undo takes back the whole gesture.
    undoCommand(history);
    expect(read(target, 'x')).toBe(0);
    expect(read(target, 'y')).toBe(0);
  });

  // A composite of one is indirection a history panel would have to see through, and its bracket label
  // would replace a more specific one.
  it('leaves a single collected command unwrapped, keeping its own label', () => {
    const history = withDefaults();
    const target = node();

    beginCommandTransaction(history, 'Transform');
    executeCommand(history, createSetNodePropertyCommand('Move x', target, 'x', 10));
    endCommandTransaction(history);

    const entries = getCommandHistoryEntries(history);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).not.toBe(CompositeCommandKind);
    expect(entries[0].label).toBe('Move x');
  });

  // An empty undo step makes one undo press do nothing visible, which reads as a broken undo.
  it('records nothing when the bracket collected nothing', () => {
    const history = withDefaults();
    beginCommandTransaction(history, 'Empty');
    endCommandTransaction(history);
    expect(getCommandHistoryEntries(history)).toHaveLength(0);
  });

  it('suppresses merging inside the bracket, so the fold is the only coalescing', () => {
    const history = withDefaults();
    const target = node();

    beginCommandTransaction(history, 'Drag');
    executeCommand(history, createSetNodePropertyCommand('One', target, 'x', 10, 300, 0));
    executeCommand(history, createSetNodePropertyCommand('Two', target, 'x', 20, 300, 10));
    endCommandTransaction(history);

    const entries = getCommandHistoryEntries(history);
    expect(entries).toHaveLength(1);
    expect((entries[0] as CompositeCommand).children).toHaveLength(2);
  });
});

describe('isCommandTransactionOpen', () => {
  it('is false on a fresh history', () => {
    expect(isCommandTransactionOpen(createCommandHistory())).toBe(false);
  });
});

function node(): NodeAny {
  return createNode('test.CommandTarget') as NodeAny;
}

function read(target: Readonly<NodeAny>, property: string): unknown {
  return (target as unknown as Readonly<Record<string, unknown>>)[property];
}

function withDefaults(): CommandHistory {
  const history = createCommandHistory();
  registerDefaultCommandBindings(history);
  return history;
}

function write(target: NodeAny, property: string, value: unknown): void {
  (target as unknown as Record<string, unknown>)[property] = value;
}
