---
package: '@flighthq/textshaper'
updated: 2026-06-25
basedOn: ./review.md
---

# textshaper — Assessment (merge gate: integration-b2824e3d8 → origin/main eb73c3d74)

Sorted from `review.md` (`partial — 66`, merge-gate pass over the eb73c3d74→b2824e3d8 delta). The delta is mergeable after two small grounded fixes; everything larger is either a charter decision or out of the delta's scope. The charter is an empty stub, so "what good means here" is mostly an open design question — which keeps `Recommended` to the genuinely sweep-safe, within-package items the review grounded in the diff.

## Recommended

Strictly sweep-safe: within `@flighthq/textshaper` (or its already-touched `@flighthq/types` files in this delta), no cross-package coupling, no breaking change, no open design decision.

- **Drop the gratuitous cast in `getFontUnitScale`.** `textShaperRun.ts:55` casts `(format as { size?: number }).size` even though `TextFormat.size?: number` is a declared field. Replace with `format.size ?? 12`. Pure within-file fix, no signature change. — review.md (Delta defects, 1).

- **Forward `options` through `shapeTextRunInto`.** `textShaperRun.ts:113-116` omits the `options?: Readonly<ShapeRunOptions>` parameter that its allocating sibling `shapeTextRun` forwards, so the alias-safe/pooled path cannot pass `direction`/`script` hints to `backend.shapeRun`. Add the param and forward it; add a colocated test asserting the captured options reach the backend (mirroring `shapeTextRun`'s existing "passes options to the backend" test). Within-package, no other caller depends on the narrower shape (pre-release, no back-compat duty). — review.md (Delta defects, 2).

- **Normalize the unused `format` parameter naming on the glyph-introspection wrappers.** `getGlyphExtentsBatch` (`textShaperRun.ts:67`) and `getGlyphExtentsInto` (line 85) name an unused `format` while the single-glyph siblings honestly use `_format`. Make them consistent (underscore the unused ones) so the "this argument is currently ignored" signal is uniform. Cosmetic, within-file, leaves the file cleaner. (Whether the methods _should_ be format-aware is a design fork — see Open directions, not this sweep.) — review.md (Delta defects, 3).

- **Reconcile `status.md` signatures with shipped code.** The status (distributed as-claimed from the larger `builder-67dc46d64` report) lists `shapeTextRunInto(text, format, out, options?)` and a format-taking backend `getGlyphExtents` — neither matches this integration head. Correct the status entry to the actual surface, or append a verifying note that this branch carries the trimmed subset. Admin-doc only. — review.md (Delta defects, 4).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Land `@flighthq/textshaper-harfbuzz` (the full-glyph backend).** Until it exists, every glyph-producing function in this delta is an inert sentinel delegate. **Parked:** a separate package with a wasm-asset/load-strategy and font-access design decision — not a within-package sweep, and explicitly deferred in status. The seam this delta ships is ready for it.

- **`shapeText`-returning-`number` naming.** The advances-only fast path "shape" implies glyphs but only measures. **Parked:** unchanged from the approved base (not in this delta) and a naming fork the charter must rule on (keep beside `shapeTextRun`, or rename `measureText`).

- **Full Unicode Bidi / itemization, cluster navigation, cache, pool, signals.** These existed in the larger `builder-67dc46d64` head but are **absent from this integration head**. **Parked:** re-introducing them is feature work, not a fix to this delta; sequencing is a charter/scope decision.

- **textlayout measure-provider → `ShapedRun` migration; richTextQuery → real clusters.** **Parked — cross-package:** a coordinated migration across `textlayout`/`textinput`; status flags "do not perform autonomously."

- **Rust `flighthq-textshaper` crate parity to the new seam.** Needs `shape_text_run`, `ShapedRun`/`ShapedGlyph`, metrics, `ShapeRunOptions`, and the rustybuzz sibling. **Parked:** a Rust-session task that mirrors this TS seam 1:1.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here until the user blesses it in a direction session. This section is append-only and stays empty until then._

## Notes for the charter's Open directions

Surfaced here rather than acted on, because each is a design fork or crosses a boundary:

- **North star for the shape layer.** Bless textshaper as the canonical home of itemize/bidi → **shape** → (layout/rasterize elsewhere); heavy full-glyph backends stay opt-in neighbors per the bundle rule.
- **Should glyph-introspection methods carry `format`?** The delta made `getGlyphExtents`/`getGlyphName`/`getCodePointForGlyph`/`getGlyphIndexForCodePoint` glyphId-only on the backend, leaving the wrappers' `format` parameter dead. Decide format-aware (a real font face is selected by the format) vs. format-free (drop the wrapper param). A seam-shape ruling that should precede the harfbuzz backend.
- **harfbuzz backend timing + wasm asset strategy** — the gate that turns this inert seam into a real pipeline.
- **textlayout/richTextQuery migration** — when a full-glyph backend exists.
