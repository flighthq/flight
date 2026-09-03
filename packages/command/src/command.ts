import { createEntity } from '@flighthq/entity/contract';
import { getNodeChildIndex } from '@flighthq/node/contract';
import type {
  AddNodeChildCommand,
  Command,
  CommandPropertyEntry,
  CompositeCommand,
  NodeAny,
  RemoveNodeChildCommand,
  ReorderNodeChildCommand,
  SetNodePropertyCommand,
} from '@flighthq/types/contract';
import {
  AddNodeChildCommandKind,
  CompositeCommandKind,
  RemoveNodeChildCommandKind,
  ReorderNodeChildCommandKind,
  SetNodePropertyCommandKind,
} from '@flighthq/types/contract';

// Constructors for the built-in command kinds. Each returns PLAIN DATA — no method, no captured closure —
// so the result can be inspected by a history panel, compared, and (once nodes carry stable identity)
// written to disk. The behaviour that acts on this data is registered separately per kind.
//
// Each constructor captures what undo will need AT CREATION TIME: the previous property value, the child's
// current index. That is why these are `create*` rather than plain literals, and why a caller must build a
// command BEFORE applying the change by hand.

/** Adds `child` to `parent`. `index` of `-1` appends. */
export function createAddNodeChildCommand(
  label: string,
  parent: NodeAny,
  child: NodeAny,
  index = -1,
): AddNodeChildCommand {
  return createEntity({ child, index, kind: AddNodeChildCommandKind, label, parent });
}

/** Applies `children` as one history entry, in order; undo runs them in reverse. Nesting is allowed. */
export function createCompositeCommand(label: string, children: readonly Command[]): CompositeCommand {
  return createEntity({ children: [...children], kind: CompositeCommandKind, label });
}

// Removes `child` from `parent`, capturing its CURRENT index so undo restores position and not merely
// membership. Build this before removing the child — once it is detached the index is gone.
export function createRemoveNodeChildCommand(label: string, parent: NodeAny, child: NodeAny): RemoveNodeChildCommand {
  return createEntity({
    child,
    index: getNodeChildIndex(parent, child),
    kind: RemoveNodeChildCommandKind,
    label,
    parent,
  });
}

// Moves `child` to `toIndex`, capturing where it started. Build this before moving the child.
export function createReorderNodeChildCommand(
  label: string,
  parent: NodeAny,
  child: NodeAny,
  toIndex: number,
): ReorderNodeChildCommand {
  return createEntity({
    child,
    fromIndex: getNodeChildIndex(parent, child),
    kind: ReorderNodeChildCommandKind,
    label,
    parent,
    toIndex,
  });
}

// One property assignment. `before` is read from the node NOW, so build this before writing the value.
//
// `mergeWindow` and `time` drive coalescing: two commands over the same target and property merge when
// both carry a positive window and the elapsed time fits inside it, which is what turns a drag into one
// undo entry. Both default to 0, meaning every change is its own entry. `time` is supplied by the caller
// because this package takes no clock dependency — and a caller-supplied number stays serializable.
export function createSetNodePropertyCommand(
  label: string,
  target: NodeAny,
  property: string,
  value: unknown,
  mergeWindow = 0,
  time = 0,
): SetNodePropertyCommand {
  return createEntity({
    entries: [{ after: value, before: readNodeProperty(target, property), property, target }],
    kind: SetNodePropertyCommandKind,
    label,
    mergeWindow,
    time,
  });
}

// Several property assignments applied together as one entry — the shape a gizmo drag produces when it
// writes x and y at once. Each `before` is read now, in the order given.
export function createSetNodePropertyCommandBatch(
  label: string,
  entries: readonly Readonly<{ property: string; target: NodeAny; value: unknown }>[],
  mergeWindow = 0,
  time = 0,
): SetNodePropertyCommand {
  const captured: CommandPropertyEntry[] = entries.map((entry) => ({
    after: entry.value,
    before: readNodeProperty(entry.target, entry.property),
    property: entry.property,
    target: entry.target,
  }));
  return createEntity({ entries: captured, kind: SetNodePropertyCommandKind, label, mergeWindow, time });
}

function readNodeProperty(target: Readonly<NodeAny>, property: string): unknown {
  return (target as unknown as Readonly<Record<string, unknown>>)[property];
}
