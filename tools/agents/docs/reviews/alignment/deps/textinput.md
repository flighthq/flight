# Dependency Alignment: @flighthq/textinput

**Verdict:** One unused declared dependency (`@flighthq/displayobject`); otherwise clean — no `@flighthq/sdk` import, no inline cross-package types, correct `import type` discipline, and a dependency set that reads predictably from the package's purpose.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/displayobject` | Declared in `dependencies` but never imported in `src/` (no reference in any source or test file). It is already a transitive dependency of `@flighthq/text`, so removing it does not lose any reachable type. Carrying it inflates the declared graph and breaks the "deps predictable from purpose" rule — a textinput editing layer has no direct edge to display objects. | Remove `@flighthq/displayobject` from `dependencies`. |
| Info | `@flighthq/text` → `@flighthq/textlayout` split | The package imports runtime accessors from `@flighthq/text` (`getRichTextRuntime`, `setRichTextScrollV`) and layout/hit-testing helpers from `@flighthq/textlayout` (`getRichTextCharIndexAtPoint`, `getRichTextSelectionRectangles`). Both edges are real and correct; noted only because a reader might expect one text dependency. No action — this is the intended layering (text owns the entity, textlayout owns glyph geometry). |

## Declared vs used

**Unused (declared, not imported):**

- `@flighthq/displayobject` — no occurrence anywhere under `src/`. Available transitively via `@flighthq/text`; safe to drop from this package's manifest.

**Phantom (imported, not declared):** none.

**Used and correctly declared:**

- `@flighthq/node` — `invalidateNodeAppearance` (value).
- `@flighthq/signals` — `connectSignal`, `disconnectSignal` (value).
- `@flighthq/text` — `getRichTextRuntime`, `setRichTextScrollV` (value).
- `@flighthq/textlayout` — `getRichTextCharIndexAtPoint`, `getRichTextSelectionRectangles` (value).
- `@flighthq/types` — `KeyCode` (value enum) plus all cross-package types (`RichText`, `RichTextRuntime`, `InputKeyboardData`, `TextInputOptions`, `TextInputState`, `SelectableRichTextManager`, etc.), all imported via `import type`.

**Other hygiene checks (all pass):**

- No import of `@flighthq/sdk`.
- No cross-package types redefined inline — every shared type comes from `@flighthq/types`.
- `import type` is on its own statements; runtime value imports are kept separate (no mixed `{ type Foo, bar }`).
- All workspace deps pinned `"*"`; `"sideEffects": false` declared.
- `npm run packages:check` passes (86 packages valid); this review adds the unused-dep judgment it does not catch.
