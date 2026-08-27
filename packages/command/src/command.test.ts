import { addNodeChild, createNode, getNodeChildIndex } from '@flighthq/node/contract';
import type { NodeAny } from '@flighthq/types/contract';
import {
  AddNodeChildCommandKind,
  CompositeCommandKind,
  RemoveNodeChildCommandKind,
  ReorderNodeChildCommandKind,
  SetNodePropertyCommandKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createAddNodeChildCommand,
  createCompositeCommand,
  createRemoveNodeChildCommand,
  createReorderNodeChildCommand,
  createSetNodePropertyCommand,
  createSetNodePropertyCommandBatch,
} from './command';

describe('createAddNodeChildCommand', () => {
  it('is plain data carrying its kind, and appends by default', () => {
    const parent = node();
    const child = node();
    const command = createAddNodeChildCommand('Add sprite', parent, child);
    expect(command).toEqual({ child, index: -1, kind: AddNodeChildCommandKind, label: 'Add sprite', parent });
  });

  it('records an explicit insertion index', () => {
    expect(createAddNodeChildCommand('Add', node(), node(), 3).index).toBe(3);
  });
});

describe('createCompositeCommand', () => {
  it('copies the child list, so a later push by the caller cannot rewrite a recorded entry', () => {
    const children = [createAddNodeChildCommand('Add', node(), node())];
    const command = createCompositeCommand('Align', children);
    children.push(createAddNodeChildCommand('Add again', node(), node()));
    expect(command.kind).toBe(CompositeCommandKind);
    expect(command.children).toHaveLength(1);
  });
});

describe('createRemoveNodeChildCommand', () => {
  // The index has to be captured while the child is still attached — this is why removal is a `create*`
  // call before the mutation rather than a literal built afterwards.
  it('captures the index the child currently occupies', () => {
    const parent = node();
    const first = node();
    const second = node();
    addNodeChild(parent, first);
    addNodeChild(parent, second);

    const command = createRemoveNodeChildCommand('Delete', parent, second);
    expect(command.kind).toBe(RemoveNodeChildCommandKind);
    expect(command.index).toBe(1);
  });
});

describe('createReorderNodeChildCommand', () => {
  it('captures where the child started as well as where it is going', () => {
    const parent = node();
    const first = node();
    const second = node();
    addNodeChild(parent, first);
    addNodeChild(parent, second);

    const command = createReorderNodeChildCommand('Move to front', parent, second, 0);
    expect(command.kind).toBe(ReorderNodeChildCommandKind);
    expect(command.fromIndex).toBe(1);
    expect(command.toIndex).toBe(0);
    // Creating a command must not itself move anything.
    expect(getNodeChildIndex(parent, second)).toBe(1);
  });
});

describe('createSetNodePropertyCommand', () => {
  it('reads the current value as before and does not apply the change', () => {
    const target = node();
    (target as unknown as Record<string, unknown>).x = 5;

    const command = createSetNodePropertyCommand('Move', target, 'x', 100);
    expect(command.kind).toBe(SetNodePropertyCommandKind);
    expect(command.entries).toEqual([{ after: 100, before: 5, property: 'x', target }]);
    expect((target as unknown as Record<string, unknown>).x).toBe(5);
  });

  it('defaults to no merge window, so every change is its own undo entry', () => {
    const command = createSetNodePropertyCommand('Move', node(), 'x', 1);
    expect(command.mergeWindow).toBe(0);
    expect(command.time).toBe(0);
  });
});

describe('createSetNodePropertyCommandBatch', () => {
  it('captures each before value in the order given', () => {
    const target = node();
    const record = target as unknown as Record<string, unknown>;
    record.x = 1;
    record.y = 2;

    const command = createSetNodePropertyCommandBatch('Move', [
      { property: 'x', target, value: 10 },
      { property: 'y', target, value: 20 },
    ]);
    expect(command.entries.map((entry) => entry.before)).toEqual([1, 2]);
    expect(command.entries.map((entry) => entry.after)).toEqual([10, 20]);
  });
});

// A bare graph node from `node` itself — the package under test depends on `node` and nothing else in the
// graph, so a test must not reach for scene2d to get a subject.
function node(): NodeAny {
  return createNode('test.CommandTarget') as NodeAny;
}
