# Dependency Alignment: @flighthq/text

**Verdict:** Clean — the dependency mapping reads exactly as the package's role predicts; the only note is that `@flighthq/entity` and `@flighthq/geometry` are test-only deps declared in `dependencies`, which is the pervasive repo convention (20+ packages) rather than a text-specific defect.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/entity`, `@flighthq/geometry` | Declared in `dependencies` but imported **only** from `*.test.ts` (`getEntityRuntime`, `createRectangle`). Not referenced in any shipped source. Strictly they are dev/test deps, not runtime deps. | Optional. If the repo ever splits test-only workspace deps into `devDependencies`, move these. **Not** worth fixing in isolation: this is the established house pattern — `displayobject` and `shape` declare `geometry` the same way, and ~20 packages declare test-only `@flighthq/*` in `dependencies`. `packages:check` (which passes) treats this as valid. Changing only `text` would diverge from the convention. |
| None | `@flighthq/sdk` | Not imported. Correct — the barrel ban is respected. | — |
| None | `internal.ts` `RichTextDataInternal` | Local `Omit<RichTextData,…> & {…}` widening of a `@flighthq/types` type. This is an internal narrowing of an owned header type (the documented `internal.ts` runtime-slot pattern), **not** an inline redefinition of a cross-package type. No new cross-package shape is invented here. | — (acceptable) |
| None | Layering | Edges are all "down" or sideways within the display-object family: `displayobject`, `node`, `textlayout`, `types`. No backend-to-backend edge, no reach upward, no render-core coupling. `textlayout` (the layout spine) is the expected primary edge for a text package. | — |
| None | Tree-shaking / type-only | `"sideEffects": false` declared. `import type` is used correctly and on its own lines for all type-only imports (`internal.ts`, the `import type {…}` blocks in `nativeText`/`richText`/`textLabel`/`textLabelLayout`). Value imports (`invalidateNode*`, `compute*`, `*Kind`, `getDisplayObjectRuntime`) are genuine runtime uses. | — |

## Declared vs used

**Runtime imports in shipped src** (`index.ts`, `internal.ts`, `nativeText.ts`, `richText.ts`, `textLabel.ts`, `textLabelLayout.ts`):

- `@flighthq/displayobject` — `createDisplayObjectGeneric`, `createDisplayObjectRuntime`, `getDisplayObjectRuntime`
- `@flighthq/node` — `invalidateNodeLocalBounds`, `invalidateNodeLocalContent`, `getNodeLocalContentRevision`
- `@flighthq/textlayout` — `computeRichTextContent`, `computeTextBoundsRectangle`, `getRichTextContent`, `createTextFormatRange`, plus type imports
- `@flighthq/types` — kind strings (`NativeTextKind`, `RichTextKind`, `TextLabelKind`) and type imports

**Unused (in shipped source):**

- `@flighthq/entity` — imported only by `richText.test.ts` (`getEntityRuntime`).
- `@flighthq/geometry` — imported only by `nativeText.test.ts`, `richText.test.ts`, `textLabel.test.ts` (`createRectangle`).

Both are _used_ in the workspace (tests), so they are not dead deps — just mis-tiered relative to a strict runtime/dev split. The repo currently keeps test-only workspace deps in `dependencies` by convention.

**Phantom (used but undeclared):** None. Every imported `@flighthq/*` (`displayobject`, `node`, `textlayout`, `types`, plus test-only `entity`, `geometry`) is declared.

**Pinning:** All six workspace deps pinned `"*"` per convention. `tsconfig.json` `references` mirror the declared deps exactly (displayobject, entity, geometry, node, textlayout, types). `packages:check` reports all 86 packages valid.
