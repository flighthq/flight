---
package: '@flighthq/command'
role: package
crate: flighthq-command
draft: true
lastDirection: null
status: unblessed — cell authored 2026-08-27 alongside the package; pending user ratification
status_doc: ./status.md
---

# @flighthq/command — Charter (DRAFT)

> **This is an unblessed design draft.** Two things in it *are* user-directed and dated: the deliverable
> is the package alone with no editor application, and commands are plain kind-tagged data rather than
> closure-carrying objects (both 2026-08-27, recorded under Decisions). Everything else here records the
> shape that followed from those rulings and is not authoritative until blessed. The source architecture
> record, `command-history-model.md`, is itself marked unratified.

## What it is

`@flighthq/command` is the **undo/redo history for editors and tools** — the primitive that turns a user
action into a recorded, reversible entry. Every action an editor performs (move a node, change a
property, delete a child, reorder layers) becomes a command, and the history stack tracks them in order
with undo/redo traversal, coalescing, and transaction brackets.

It is a **command** history, not a snapshot history, and the two are complementary rather than
competing. `snapshot` captures whole state and is the right primitive for netcode; a command captures one
*intent*. That difference is what buys the four things an editor actually needs: granularity (an undo
step is "move 5px right", not "restore the scene to 200ms ago"), memory (a command is a target and two
values, not a copy of the scene), merge (a 60-frame drag is one undo entry, not sixty), and description
(a history panel can say what the entry *did*).

## North star

_Proposed, not blessed._ A complete editor undo/redo primitive that never puts a closure on the stack:
kind-tagged data commands with per-kind registered behaviour, so an entry can be inspected by a history
panel, compared, logged with a bug report, and — once nodes carry stable identity — persisted. The bar is
that everything a mature undo system offers (coalescing, composites, nestable transactions, a bounded
stack, change notification) is reachable without a single method-carrying command object.

## Boundaries

- **Depends on `node`, `signals` and `types`** — the three the source record names — **plus `registry`**,
  which the record predates: the per-kind binding table ruled in C2 is `KeyedTable` from
  `@flighthq/registry`, so binding behaviour to a kind at all requires it. No renderer, no scene graph
  beyond `node`'s graph functions, no `interaction`, no `scene-document`, no `snapshot`, no `tween`.
- **The package is the deliverable.** No editor application, shell, panel layout, project model, or file
  management belongs here. An editor is a possible follow-on, scoped separately.
- **Not clipboard, not save, not selection, not view state.** Copy/paste is a command a caller composes;
  saving is not undoable; selecting a node is not an undo step in most editors; pan/zoom is not either.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-27] The deliverable is the package only.** `command` is built as an SDK cell to AAA
  completeness, usable standalone by anyone building an editor or tool. No editor application ships from
  this work; the "editor data flow" in the source record is motivation, not a deliverable.
- **[2026-08-27] Commands are plain kind-tagged data, not closure-carrying objects.** A command is
  `{ kind, label, …fields }`; `execute`, `undo` and `merge` are free functions registered per kind in a
  keyed table and resolved at dispatch. Composite and batch commands are data too. This is the same
  answer Flight already gave for authored timeline cues, and the same open-registry shape ruled next door
  for `scene-document`; a stack of closures would contradict both, and closures cannot be serialized,
  inspected, or logged.
- **[2026-08-27] The live-node target is the accepted present limit.** A command addresses its target by
  live reference, so it is data with one non-serializable field until `scene-document` supplies stable
  node identity by key and path. Accepted deliberately as strictly better than closures, with the seam in
  the right place for the rest to follow.

## Open directions

1. **Serializable targets.** Once `scene-document` lands stable node identity, the `target` field becomes
   a key/path and a history can be persisted, diffed, and shipped with a bug report. This is the payoff
   the data-command ruling was made for, and the one open direction with a known unblocking event.
2. **Where the merge clock comes from.** Coalescing is driven by caller-supplied `time` and `mergeWindow`
   fields, so the package takes no clock dependency and both fields stay serializable. Whether an editor
   should instead pass a `@flighthq/clock` reading, and whether that belongs in a helper rather than in
   this package, is undecided.
3. **A gizmo transaction bracket.** The source record sketches `onTransformBegin`/`onTransformEnd`
   driving `begin`/`endCommandTransaction`. That wiring belongs to whoever owns `gizmo`, not here, but it
   is the first real consumer and may reveal that the bracket API needs something it does not have.
4. **Undo grouping policy beyond time.** Merging currently keys on same-target/same-property within a
   window. Editors also group by gesture identity or by an explicit "coalesce with previous" flag, which
   registered mergers could express — but only one policy has a caller asking for it today.
