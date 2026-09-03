import { createEntity } from '@flighthq/entity/contract';
import { addNodeChild, createNode, getNodeChildCount, getNodeChildIndex } from '@flighthq/node/contract';
import type { CommandBinding, NodeAny, SetNodePropertyCommand } from '@flighthq/types/contract';
import { SetNodePropertyCommandKind } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createAddNodeChildCommand,
  createCompositeCommand,
  createRemoveNodeChildCommand,
  createReorderNodeChildCommand,
  createSetNodePropertyCommand,
} from './command';
import {
  createCommandBindingTable,
  getCommandBinding,
  hasCommandBinding,
  registerCommandBinding,
  registerDefaultCommandBindings,
} from './commandBinding';
import { createCommandHistory, executeCommand, undoCommand } from './commandHistory';

describe('createCommandBindingTable', () => {
  it('starts empty, so nothing dispatches until a caller registers it', () => {
    const history = createCommandHistory();
    history.bindings = createCommandBindingTable();
    expect(hasCommandBinding(history, SetNodePropertyCommandKind)).toBe(false);
  });
});

describe('getCommandBinding', () => {
  it('returns null for an unregistered kind rather than throwing', () => {
    expect(getCommandBinding(createCommandHistory(), 'acme.Nothing')).toBeNull();
  });
});

describe('hasCommandBinding', () => {
  it('reports a registered kind', () => {
    const history = createCommandHistory();
    registerDefaultCommandBindings(history);
    expect(hasCommandBinding(history, SetNodePropertyCommandKind)).toBe(true);
  });
});

describe('registerCommandBinding', () => {
  it('accepts a caller-defined vendor-prefixed kind', () => {
    const history = createCommandHistory();
    const seen: string[] = [];
    registerCommandBinding(history, 'acme.Custom', {
      execute: () => seen.push('execute'),
      undo: () => seen.push('undo'),
    });
    executeCommand(history, createEntity({ kind: 'acme.Custom', label: 'Custom' }));
    undoCommand(history);
    expect(seen).toEqual(['execute', 'undo']);
  });

  // Last write wins, which is what lets a consumer replace a built-in binding without forking the package.
  it('overrides an earlier binding for the same kind', () => {
    const history = createCommandHistory();
    const first: CommandBinding = { execute: () => undefined, undo: () => undefined };
    const second: CommandBinding = { execute: () => undefined, undo: () => undefined };
    registerCommandBinding(history, 'acme.Custom', first);
    registerCommandBinding(history, 'acme.Custom', second);
    expect(getCommandBinding(history, 'acme.Custom')).toBe(second);
  });
});

describe('registerDefaultCommandBindings', () => {
  it('applies and reverses an added child, restoring membership', () => {
    const history = withDefaults();
    const parent = node();
    const child = node();

    executeCommand(history, createAddNodeChildCommand('Add', parent, child));
    expect(getNodeChildCount(parent)).toBe(1);
    undoCommand(history);
    expect(getNodeChildCount(parent)).toBe(0);
  });

  // Position, not merely membership: a delete that undoes to the end of the list has lost information the
  // command captured on purpose.
  it('restores a removed child to the index it came from', () => {
    const history = withDefaults();
    const parent = node();
    const first = node();
    const second = node();
    const third = node();
    addNodeChild(parent, first);
    addNodeChild(parent, second);
    addNodeChild(parent, third);

    executeCommand(history, createRemoveNodeChildCommand('Delete', parent, second));
    expect(getNodeChildCount(parent)).toBe(2);
    undoCommand(history);
    expect(getNodeChildIndex(parent, second)).toBe(1);
  });

  it('applies and reverses a reorder', () => {
    const history = withDefaults();
    const parent = node();
    const first = node();
    const second = node();
    addNodeChild(parent, first);
    addNodeChild(parent, second);

    executeCommand(history, createReorderNodeChildCommand('Front', parent, second, 0));
    expect(getNodeChildIndex(parent, second)).toBe(0);
    undoCommand(history);
    expect(getNodeChildIndex(parent, second)).toBe(1);
  });

  it('applies and reverses a property write', () => {
    const history = withDefaults();
    const target = node();
    write(target, 'x', 5);

    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 100));
    expect(read(target, 'x')).toBe(100);
    undoCommand(history);
    expect(read(target, 'x')).toBe(5);
  });

  it('runs composite children in order and reverses them in reverse order', () => {
    const history = withDefaults();
    const parent = node();
    const child = node();

    executeCommand(
      history,
      createCompositeCommand('Add and move', [
        createAddNodeChildCommand('Add', parent, child),
        createSetNodePropertyCommand('Move', child, 'x', 10),
      ]),
    );
    expect(getNodeChildCount(parent)).toBe(1);
    expect(read(child, 'x')).toBe(10);

    // Reverse order matters: undoing forward would move a child that the add has not yet taken back.
    undoCommand(history);
    expect(getNodeChildCount(parent)).toBe(0);
    expect(read(child, 'x')).toBeUndefined();
  });

  it('merges same-target same-property writes inside the window into one reversible entry', () => {
    const history = withDefaults();
    const target = node();
    write(target, 'x', 0);

    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 10, 300, 0));
    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 20, 300, 100));
    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 30, 300, 200));

    expect(history.entries).toHaveLength(1);
    expect(read(target, 'x')).toBe(30);
    // One undo returns to where the gesture STARTED, not to the previous frame.
    undoCommand(history);
    expect(read(target, 'x')).toBe(0);
  });

  it('does not merge once the window has elapsed', () => {
    const history = withDefaults();
    const target = node();
    write(target, 'x', 0);

    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 10, 300, 0));
    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 20, 300, 1000));
    expect(history.entries).toHaveLength(2);
  });

  it('does not merge writes to a different property of the same node', () => {
    const history = withDefaults();
    const target = node();

    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 10, 300, 0));
    executeCommand(history, createSetNodePropertyCommand('Move', target, 'y', 20, 300, 10));
    expect(history.entries).toHaveLength(2);
  });

  it('does not merge when no window is given, which is the default', () => {
    const history = withDefaults();
    const target = node();

    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 10));
    executeCommand(history, createSetNodePropertyCommand('Move', target, 'x', 20));
    expect(history.entries).toHaveLength(2);
  });

  // The merged entry keeps the ORIGINAL before value; reading it back proves the merge is not simply
  // dropping the earlier command.
  it('keeps the original before value in the merged command', () => {
    const history = withDefaults();
    const target = node();
    write(target, 'x', 7);

    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 10, 300, 0));
    executeCommand(history, createSetNodePropertyCommand('Drag', target, 'x', 20, 300, 50));
    const merged = history.entries[0] as SetNodePropertyCommand;
    expect(merged.entries[0].before).toBe(7);
    expect(merged.entries[0].after).toBe(20);
  });
});

function node(): NodeAny {
  return createNode('test.CommandTarget') as NodeAny;
}

function read(target: Readonly<NodeAny>, property: string): unknown {
  return (target as unknown as Readonly<Record<string, unknown>>)[property];
}

function withDefaults() {
  const history = createCommandHistory();
  registerDefaultCommandBindings(history);
  return history;
}

function write(target: NodeAny, property: string, value: unknown): void {
  (target as unknown as Record<string, unknown>)[property] = value;
}
