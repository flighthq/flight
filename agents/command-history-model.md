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

---

# Manager rulings — PRESERVED VERBATIM after a records collision, 2026-08-28

★ **Why this section exists.** A records rewrite built from a base that predated these rulings landed and
dropped every ruling section below. The code still implements them and tests pin several, but the
*reasoning* was lost while the conclusions survived — and the reasoning is the part that stops a future
agent re-deriving a decision that was already withdrawn.

Reproduced **verbatim** rather than re-summarised, because summarising a ruling is exactly how this was
lost the first time. Where a ruling is already pinned by a test, the test is the enforcement and this is
the explanation. Where anything here conflicts with the sections above, the *conclusions* above are
current wherever the user has since ruled; this is what those conclusions were built on.

## Manager rulings — 2026-08-27

**Deliverable ruled by the user: THE PACKAGES ONLY.** `gui`, `selection`, `gizmo` and `command` are built
as SDK cells to AAA completeness, each usable standalone by anyone building an editor or tool. **No
editor application ships from this work.** The "editor data flow" in the handoff is motivation, not a
deliverable — do not let an app shell, panel layout, project model, or file management appear in any of
these packages. An editor is a possible follow-on the user will scope separately.

**Sequencing ruled by the user: PARALLEL with `scene-document`.** `selection` and `command` depend only
on `node`, `signals`, `geometry` and `types` and touch nothing `scene-document` touches, so they start
immediately. `gui` needs `interaction`, which exists. Only `gizmo` has real coupling, through the
overlay scene.

**C1. The package, and `snapshot` versus `command` — APPROVED.** The four reasons given (granularity,
memory, merge, description) are correct and the complementary relationship is stated well.

**C2. ★ COMMANDS ARE PLAIN KIND-TAGGED DATA, NOT CLOSURE-CARRYING OBJECTS. This is a redesign of the
central interface in this record, and it is not optional.**

The record defines `Command` as an object carrying `execute()`, `undo()`, and `merge()` — methods over
captured state. That loses on four counts:

1. **It is the default unit this SDK rejects.** Functions, not methods; free functions over classes;
   explicit ownership over GC-reliant patterns; portable to C/C++ idioms. A stack of closures is none
   of those.
2. **Flight has already made this exact call once.** The timeline cue model rules that authored cues
   are plain kind-dispatched data and that importers emit **zero closures**. An undo history is the
   same problem — recorded intent replayed later — and must not get the opposite answer.
3. **It contradicts the ruling already made next door.** `scene-document` Q3 commissions open,
   kind-keyed registries with caller-owned pre-registration. Two adjacent new packages should not
   disagree about how behavior is bound to a kind.
4. **Closures are unserializable, and that forecloses the feature that matters most.** Data commands
   can be persisted, inspected in a history panel, diffed, logged with a bug report, or replayed.
   A closure can do none of it, and the loss is silent — nobody discovers it until someone asks for
   "save my undo history" and finds it was designed out in the first commit.

Ruling: a command is `{ kind, …fields }` — for example
`{ kind: 'setNodeProperty', target, property, before, after }`. `execute`, `undo` and `merge` are
**functions registered per kind** in a keyed table, resolved at dispatch, so unused command kinds
tree-shake out and callers register their own. Composite and batch commands are data too
(`{ kind: 'composite', children: [...] }`). Merging becomes a registered per-kind merge function rather
than a method the top-of-stack object happens to carry.

**The one real cost, stated honestly:** `target` is a live node reference, so a command is only fully
serializable once nodes have stable identity. `scene-document` supplies exactly that, by key and path.
Until it lands, commands are data with one non-serializable field — still strictly better than
closures, and the seam is in the right place for the rest to follow.

