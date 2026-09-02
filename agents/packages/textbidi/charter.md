---
package: '@flighthq/textbidi'
role: package
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textbidi — Charter

## What it is

`@flighthq/textbidi` is the **Unicode bidirectional-text itemize layer** (UAX #9) — it resolves the embedding levels of a mixed left-to-right / right-to-left string and reorders its runs from *logical* (storage/typing) order to *visual* (display) order. It is the sibling of `@flighthq/textsegment` (grapheme/word/sentence boundaries): together they **itemize** a string before it is shaped, so that Arabic/Hebrew (and mixed LTR+RTL) text lays out correctly. Without it, an RTL run inside an LTR paragraph renders in the wrong order.

## North star

`resolveBidiLevels(text, baseDirection): Uint8Array` (per-character embedding levels, UAX #9), `reorderBidiLine(levels, start, end, out): void` (logical→visual index reordering for one line), and `getBidiRuns(text, baseDirection): readonly BidiRun[]` (`{ start, end, level, direction }` runs a shaper consumes, each shaped in its own direction). `baseDirection: 'ltr' | 'rtl' | 'auto'` (auto = first strong character). These feed `@flighthq/textlayout` (which places runs in visual order per line) and `@flighthq/textshaper` (which shapes each directional run). The result is a text stack that renders bidirectional text correctly.

## Boundaries

- **Itemize only.** It resolves levels + reorders runs; it does NOT shape glyphs (`textshaper`), lay out lines (`textlayout`), or segment graphemes (`textsegment`). It is pure `number`/index math over the string + a character-class lookup.
- **Bidi-class data behind a swappable seam, with a compact bundled default.** Unlike segmentation, `Intl` exposes NO bidi API, so there is no zero-bundle web backend — the algorithm needs each character's bidi class (L/R/AL/EN/AN/…). Default: a **compact bundled bidi-class table** (covering the common LTR + Arabic/Hebrew ranges) behind a `BidiClassBackend` seam. The COMPLETE Unicode table is heavy → a `flight-rs` `rust:` backend candidate (see Open directions); apps needing full coverage swap it in. Deps: `@flighthq/types` (the seam + `BidiRun`/level types); the compact table is the package's own data.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Compact bundled bidi-class table default; full table is a `rust:` backend.** The default ships a small table (common scripts) so the common path works with a few KB, not the full Unicode database. A `getBidiClassBackend`/`setBidiClassBackend` seam lets a complete-coverage backend replace it; that full-table backend is designated for `flight-rs` (Rust) — this repo owns the seam + the compact default + the UAX #9 algorithm.
- **[2026-07-11] Itemize sibling of `textsegment`, not folded into it.** Segmentation (UAX #29) and bidi (UAX #9) are distinct algorithms with distinct data; they stay separate cells that `textlayout` composes.

- **[2026-09-01] Bidi-class dependencies are explicit caller values; the installed-backend setter is a temporary source-compatible fallback.** This supersedes only the *delivery* wording of the 2026-07-10 decision — how a backend reaches the resolver. The compact-default-plus-`rust:`-full-table ruling itself is unchanged.

  `resolveBidiLevels(text, baseDirection, bidiClassBackend?)` and `getBidiRuns(...)` take the backend as an optional trailing parameter, and an explicitly passed backend always wins. Because it is a caller-local value rather than shared state, two callers interleaving different backends no longer disturb each other. When the argument is omitted, resolution falls back to the legacy installed backend, or to the lazily created compact default if none was installed, so existing call sites keep working unchanged.

  `setBidiClassBackend` is retained, `contract`-only, and marked `@deprecated`; `createCompactBidiClassBackend` and `getBidiClassBackend` are likewise contract-only. The public `index.ts` surface is `resolveBidiLevels`, `getBidiRuns`, and `reorderBidiLine` — an app never sees the setter.

  **Why:** A process-global backend is exactly the ambient dependency the explicit dependency model exists to remove: it makes the result of a pure-looking function depend on who called `set*` last, which is unreproducible under interleaving and does not lower to the port. Passing the backend makes the dependency visible at the call site. Landed in `a3d8f8898`.

  **What is deliberately not finished:** the module-scoped `_backend` still exists behind the deprecated setter. Until it is removed, the omitted-argument path is still ambient — the Decision makes the explicit route available and preferred, not yet exclusive. Removing the global is the remaining step and is recorded in `status.md`.

## Open directions

1. **`textbidi-data` full-table `rust:` backend.** The complete Unicode bidi-class + bracket-pairing tables as a `flight-rs` backend behind `BidiClassBackend` — the deterministic, full-coverage alternative to the compact default. Marked `rust:` when chartered.
2. **Paragraph + bracket-pair rules.** UAX #9's paragraph-level rules and the BD16 bracket-pair algorithm (N0) for correct mirrored-bracket handling in mixed text.
3. **Shaping/layout integration.** Wire `getBidiRuns` into `textlayout`'s line builder + `textshaper`'s per-run shaping, once a full-glyph shaper (`textshaper-harfbuzz`) lands.
