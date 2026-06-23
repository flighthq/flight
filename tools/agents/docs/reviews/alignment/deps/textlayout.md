# Dependency Alignment: @flighthq/textlayout

**Verdict:** Clean. Two declared deps (`@flighthq/types`, `@flighthq/textshaper`), both used, both pinned `"*"`; no phantom/unused deps, no `@flighthq/sdk` import, `sideEffects: false`, and the edge to `textshaper` reads exactly as the layout→shaper seam the docs describe. One minor judgment note on a locally-exported structural spec type.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/textshaper` (runtime value import) | The single non-`type` external import: `textLayoutMeasure.ts` imports `getTextShaperBackend` + `shapeText` as values. This is correct and intentional — it is the layout→shaper seam (`getTextLayoutMeasureProvider` resolves the registered shaper as its `TextMeasureFunction`). Because `textshaper` is `sideEffects: false` and the import is referenced lazily inside a function, it tree-shakes when unused. No action; flagged only because it is the lone runtime edge in an otherwise type-only dependency graph. | None. |
| Info | `TextBoundsSpec` (exported from `textBounds.ts`) | A package-local structural spec type exported from the package root but only ever consumed _within_ this package — the `text` package satisfies it structurally by passing `RichTextData`/`TextLabelData` into `computeTextBounds*`, never by naming `TextBoundsSpec`. It is a deliberate `*Like`-style decoupling (comment explains it), not an inline redefinition of a cross-package type, so it does not violate the "cross-package types live in `@flighthq/types`" rule. Judgment: since it is genuinely a cross-boundary contract (text package's data must conform to it), it is a borderline candidate to promote into `@flighthq/types` as the header-level "text box sizing policy" so the design surface is navigable from the header alone. Low priority; the structural-`Like` pattern is defensible here. | Optionally lift `TextBoundsSpec` into `@flighthq/types` if the box-sizing contract should be header-visible; otherwise leave as-is. |
| None | `Attributes` interface (`richTextContent.ts:434`) | Local `{ [name: string]: string }` helper for the HTML-ish rich-text parser; not exported, not a cross-package type. Correctly inline. | None. |

## Declared vs used

- **Declared:** `@flighthq/types` `"*"`, `@flighthq/textshaper` `"*"` (deps); `typescript` (devDep).
- **Used in src:** `@flighthq/types` (18 imports, all `import type`), `@flighthq/textshaper` (1 file, value import).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.
- **Pinning:** both workspace deps pinned `"*"` per convention. ✓
- **`@flighthq/sdk` import:** none. ✓
- **Layering:** depends only on the header (`types`) and a sibling seam crate (`textshaper`) it owns the integration with — reaches neither "up" into renderers/SDK nor sideways into another backend. The mapping is predictable from the package's purpose ("renderer-agnostic text layout that measures via a swappable shaper"). ✓

`npm run packages:check` passes (86 packages valid) and reported nothing specific to this package; the above is judgment beyond it.
