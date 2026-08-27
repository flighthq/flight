# Command History Model

_2026-08-27. Architecture record — the undo/redo command history for Flight editor applications._

**Status: unratified.** Read before working on `command` or any editor undo/redo feature.

## What it is

`command` is a new package (`@flighthq/command`) that provides a command-pattern undo/redo history. Every user action in an editor (move a node, change a property, delete a child, reorder layers) is expressed as a command object that can be executed, undone, and redone. The history stack tracks these commands in order and provides undo/redo traversal.

## Why not `snapshot`

`snapshot` captures and restores full state snapshots. It is the right primitive for game-state netcode (capture frame N, restore frame N on desync). It is the wrong primitive for editor undo because:

- **Granularity** — an editor undo step is "move node 5px right," not "restore the entire scene to its state 200ms ago." A snapshot captures everything; a command captures one intent.
- **Memory** — snapshots of a large scene are expensive. Command objects are lightweight (a reference to the target, the old value, the new value).
- **Merge** — dragging a node for 60 frames should produce one undo entry, not 60. Command merging is natural; snapshot merging is not.
- **Description** — an undo history panel shows "Move 'hero' to (100, 200)" — the command knows what it did. A snapshot knows nothing about why it differs from the previous one.

`snapshot` and `command` are complementary. A command's `undo` implementation might use `restoreSnapshot` for complex multi-node operations where capturing the delta precisely would be fragile. But the history stack is commands, not snapshots.

## Design

### Command interface

A command is a plain object with `execute`, `undo`, and an optional `merge`:

```typescript
interface Command {
  readonly label: string;                    // human-readable description
  execute(): void;                           // apply the change
  undo(): void;                             // reverse the change
  redo?(): void;                            // re-apply (defaults to execute)
  merge?(next: Command): Command | null;    // merge with the next command, or null to keep separate
}
```

`merge` enables command coalescing: when a new command is pushed, the history first asks the top command whether it can merge with the new one. If `merge` returns a combined command, the top is replaced instead of a new entry being added. This collapses drag sequences, repeated property edits, and typing into single undo steps.

### History state

```typescript
const history = createCommandHistory({
  maxSize: 100,                  // optional — cap the stack depth
});

// Execute and push
executeCommand(history, command);

// Traverse
undoCommand(history);
redoCommand(history);

// Query
canUndoCommand(history): boolean;
canRedoCommand(history): boolean;
getCommandHistoryUndoLabel(history): string | null;
getCommandHistoryRedoLabel(history): string | null;
getCommandHistoryEntries(history): readonly Command[];
getCommandHistoryIndex(history): number;

// Reset
clearCommandHistory(history);

// Signals
getCommandHistorySignals(history).onChange   // Signal<() => void>  (after any execute/undo/redo)
```

Executing a command calls `command.execute()` and pushes it onto the stack. If there are redo entries ahead of the current position, they are discarded (the standard behavior — a new action after undo forks the timeline).

### Command factories

The package provides factory functions for common editor operations, so callers do not hand-write `execute`/`undo` for every property change:

```typescript
// Property change — captures old value, applies new value
const cmd = createPropertyCommand({
  label: 'Move hero',
  target: heroNode,
  property: 'x',
  value: 100,
});

// Multiple property changes as one command
const cmd = createPropertyBatchCommand({
  label: 'Move hero',
  entries: [
    { target: heroNode, property: 'x', value: 100 },
    { target: heroNode, property: 'y', value: 200 },
  ],
});

// Add child
const cmd = createAddChildCommand({
  label: 'Add sprite',
  parent: containerNode,
  child: newSprite,
  index: 3,                     // optional — insert position
});

// Remove child
const cmd = createRemoveChildCommand({
  label: 'Delete sprite',
  parent: containerNode,
  child: targetSprite,
});

// Reorder children
const cmd = createReorderChildCommand({
  label: 'Move to front',
  parent: containerNode,
  child: targetNode,
  fromIndex: 2,
  toIndex: 0,
});
```

These factories capture the state needed for undo at creation time (the old property value, the child's original parent and index) and implement `execute`/`undo` using Flight's graph functions (`addNodeChild`, `removeNodeChild`, `swapNodeChildren`).

### Command merging

The property command factory supports automatic merging:

```typescript
const cmd = createPropertyCommand({
  label: 'Move hero',
  target: heroNode,
  property: 'x',
  value: 100,
  mergeWindow: 300,              // merge with same-target-same-property commands within 300ms
});
```

When a second `createPropertyCommand` for the same target and property arrives within the merge window, `merge` returns a new command with the original's old value and the new command's new value. This collapses a 60-frame drag into one undo entry: the first frame captures the initial position, and each subsequent frame merges, so undo restores the position before the drag started.

The merge window is timestamp-based. After the window expires, the next change starts a new undo entry.

### Composite commands

For complex operations that touch multiple nodes or multiple properties atomically:

```typescript
const composite = createCompositeCommand({
  label: 'Align selection horizontally',
  commands: [
    createPropertyCommand({ target: node1, property: 'y', value: 100 }),
    createPropertyCommand({ target: node2, property: 'y', value: 100 }),
    createPropertyCommand({ target: node3, property: 'y', value: 100 }),
  ],
});
```

`execute` runs all sub-commands in order. `undo` runs them in reverse. The composite appears as one entry in the history.

### Transaction bracket

For operations where the full set of sub-commands is not known upfront:

```typescript
beginCommandTransaction(history, 'Paste selection');
// ... execute multiple commands during the paste operation ...
executeCommand(history, cmd1);
executeCommand(history, cmd2);
executeCommand(history, cmd3);
endCommandTransaction(history);
// All three collapse into one undo entry labeled "Paste selection"
```

If the transaction is aborted (`abortCommandTransaction`), all commands executed since `begin` are undone and discarded.

### Integration with gizmo

The `gizmo` package emits `onTransformBegin` and `onTransformEnd` signals. The editor uses these as a transaction bracket:

```
onTransformBegin → beginCommandTransaction(history, 'Transform')
onTranslate(dx, dy) → executeCommand(history, createPropertyBatchCommand({...}))
onTransformEnd → endCommandTransaction(history)
```

The entire drag gesture becomes one undo entry.

## Dependencies

- `node` — graph mutation functions for child add/remove/reorder commands
- `signals` — change notification
- `types` — all type definitions

Does not depend on: `selection`, `gizmo`, `gui`, `interaction`, `render`, `scene-document`, `snapshot`, `tween`.

## Scope boundaries

**In scope**: command interface, history stack with undo/redo, command factories for property/child/reorder operations, command merging, composite commands, transaction brackets, signals.

**Out of scope**: clipboard (copy/paste are commands that the caller composes using `clipboard` + `scene-document`), file save (saving is not undoable), selection state changes (selecting a node is not an undoable operation in most editors — the selection model is separate), view changes (pan/zoom are not undoable).
