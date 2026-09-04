import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { addNodeChildAt, getNodeChildCount, removeNodeChild, setNodeChildIndex } from '@flighthq/node/contract';
import { createKeyedTable, getRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  AddNodeChildCommand,
  CommandBinding,
  CommandBindingTable,
  CommandHistory,
  CompositeCommand,
  Kind,
  NodeAny,
  RemoveNodeChildCommand,
  ReorderNodeChildCommand,
  SetNodePropertyCommand,
} from '@flighthq/types/contract';
import {
  AddNodeChildCommandKind,
  CommandBindingMissPolicy,
  CommandBindingRegistryId,
  CompositeCommandKind,
  RemoveNodeChildCommandKind,
  ReorderNodeChildCommandKind,
  SetNodePropertyCommandKind,
} from '@flighthq/types/contract';

/** An empty command binding table. Every kind a history will dispatch must be registered into it. */
export function createCommandBindingTable(): CommandBindingTable {
  return createKeyedTable<CommandBinding>(CommandBindingRegistryId, CommandBindingMissPolicy);
}

/** The binding registered for `kind`, or `null` when nothing is. */
export function getCommandBinding(history: Readonly<CommandHistory>, kind: Kind): CommandBinding | null {
  return getRegistryTableEntry(history.bindings, kind);
}

// Why a `null` return and no throw: an unregistered kind is an expected lookup failure, not API misuse,
// so it takes the sentinel every other registry miss in this SDK takes. `explainCommandDispatch` is the
// shakeable query that says WHICH kind was missing, per the diagnostics inversion rule.
export function hasCommandBinding(history: Readonly<CommandHistory>, kind: Kind): boolean {
  return getCommandBinding(history, kind) !== null;
}

// Binds behaviour to a command kind. NOT called at module load anywhere in this package — a caller opts
// in, which is what keeps unused command kinds shakeable and lets a consumer override a built-in binding
// or add a vendor-prefixed kind of their own. Last write wins.
export function registerCommandBinding(history: CommandHistory, kind: Kind, binding: CommandBinding): void {
  history.bindings = withRegistryTableEntry(history.bindings, kind, binding);
}

// Registers the five built-in kinds. An explicit call rather than a side effect at import: a history that
// only dispatches a caller's own kinds never references these, so they shake out of the bundle.
export function registerDefaultCommandBindings(history: CommandHistory): void {
  registerCommandBinding(history, AddNodeChildCommandKind, addNodeChildCommandBinding);
  registerCommandBinding(history, CompositeCommandKind, compositeCommandBinding(history));
  registerCommandBinding(history, RemoveNodeChildCommandKind, removeNodeChildCommandBinding);
  registerCommandBinding(history, ReorderNodeChildCommandKind, reorderNodeChildCommandBinding);
  registerCommandBinding(history, SetNodePropertyCommandKind, setNodePropertyCommandBinding);
}

const addNodeChildCommandBinding: CommandBinding = {
  execute: (command) => {
    const add = command as Readonly<AddNodeChildCommand>;
    addNodeChildAt(add.parent, add.child, resolveInsertIndex(add.parent, add.index));
  },
  undo: (command) => {
    const add = command as Readonly<AddNodeChildCommand>;
    removeNodeChild(add.parent, add.child);
  },
};

// The composite binding is the ONE binding that needs the history, because dispatching a child means
// resolving the child's own kind against the same table. It takes the history as a parameter rather than
// closing over mutable state: the table it reads is re-read on every call, so a binding registered after
// this one is still found.
function compositeCommandBinding(history: Readonly<CommandHistory>): CommandBinding {
  return {
    execute: (command) => {
      const children = (command as Readonly<CompositeCommand>).children;
      for (let i = 0; i < children.length; i++) {
        getCommandBinding(history, children[i].kind)?.execute(children[i]);
      }
    },
    // Reverse order, which is not a detail: undoing an add-then-reorder forward would reorder a child
    // that the add has not yet been taken back.
    undo: (command) => {
      const children = (command as Readonly<CompositeCommand>).children;
      for (let i = children.length - 1; i >= 0; i--) {
        getCommandBinding(history, children[i].kind)?.undo(children[i]);
      }
    },
  };
}

const removeNodeChildCommandBinding: CommandBinding = {
  execute: (command) => {
    const remove = command as Readonly<RemoveNodeChildCommand>;
    removeNodeChild(remove.parent, remove.child);
  },
  // Restores POSITION as well as membership, using the index captured when the command was created.
  undo: (command) => {
    const remove = command as Readonly<RemoveNodeChildCommand>;
    addNodeChildAt(remove.parent, remove.child, resolveInsertIndex(remove.parent, remove.index));
  },
};

const reorderNodeChildCommandBinding: CommandBinding = {
  execute: (command) => {
    const reorder = command as Readonly<ReorderNodeChildCommand>;
    setNodeChildIndex(reorder.parent, reorder.child, reorder.toIndex);
  },
  undo: (command) => {
    const reorder = command as Readonly<ReorderNodeChildCommand>;
    setNodeChildIndex(reorder.parent, reorder.child, reorder.fromIndex);
  },
};

// Reads `before`/`after` off the command's own entries rather than sampling the node, so undo restores the
// value recorded at capture time even if something else has written the property since.
const setNodePropertyCommandBinding: CommandBinding = {
  execute: (command) => {
    const entries = (command as Readonly<SetNodePropertyCommand>).entries;
    for (let i = 0; i < entries.length; i++) {
      writeNodeProperty(entries[i].target, entries[i].property, entries[i].after);
    }
  },
  // Coalesces a drag: the merged command keeps the ORIGINAL `before` and takes the newest `after`, so one
  // undo returns to the position the gesture started from. Merges only when both commands touch the same
  // targets and properties in the same order, and both carry a window that the elapsed time fits inside.
  merge: (previous, next) => {
    if (previous.kind !== next.kind) return null;
    const a = previous as Readonly<SetNodePropertyCommand>;
    const b = next as Readonly<SetNodePropertyCommand>;
    if (a.mergeWindow <= 0 || b.mergeWindow <= 0) return null;
    if (b.time - a.time > b.mergeWindow) return null;
    if (a.entries.length !== b.entries.length) return null;
    for (let i = 0; i < a.entries.length; i++) {
      if (a.entries[i].target !== b.entries[i].target) return null;
      if (a.entries[i].property !== b.entries[i].property) return null;
    }
    const out = allocateEntity<SetNodePropertyCommand>();
    out.entries = a.entries.map((entry, i) => ({
      after: b.entries[i].after,
      before: entry.before,
      property: entry.property,
      target: entry.target,
    }));
    out.kind = a.kind;
    out.label = b.label;
    out.mergeWindow = b.mergeWindow;
    out.time = b.time;
    return finishEntity(out);
  },
  undo: (command) => {
    const entries = (command as Readonly<SetNodePropertyCommand>).entries;
    for (let i = entries.length - 1; i >= 0; i--) {
      writeNodeProperty(entries[i].target, entries[i].property, entries[i].before);
    }
  },
};

// `-1` appends. Resolved against the CURRENT child count rather than the count at capture time, because an
// undo that restores a child to index 7 of a parent that now holds three children must place it at the end
// rather than fail.
function resolveInsertIndex(parent: Readonly<NodeAny>, index: number): number {
  const count = getNodeChildCount(parent);
  return index < 0 || index > count ? count : index;
}

// A property write on a node is a plain field assignment — the invalidation doctrine makes transforms
// recompute by default, so a command does not stamp a revision of its own.
function writeNodeProperty(target: NodeAny, property: string, value: unknown): void {
  (target as unknown as Record<string, unknown>)[property] = value;
}
