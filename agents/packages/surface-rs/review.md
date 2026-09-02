---
package: '@flighthq/surface-rs'
status: solid
score: 65
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - packages/bitmap/ (upstream shadow target, local and live)
  - packages/surface-rs/ (absent — confirmed spun out)
  - scripts/ (no remaining references)
---

> **Spun-out cell — no local source.** `packages/surface-rs/` and `crates/` are absent from this monorepo; the code lives in `flight-rs`. This review surveys the cell's documentation health, its relationship to the upstream `@flighthq/bitmap` it shadows, and the accuracy of the prior review and assessment findings. There is no local source to survey; the score reflects the cell's documentary state and the upstream-tracking posture.

# Review: @flighthq/surface-rs

## Verdict

`solid — 65/100`. The cell is well-documented: the charter captures the pure-shadow posture, the five design pillars, the boundary between in-scope and out-of-scope work, and four recorded decisions. The status file accurately describes the spun-out disposition. The previous review (merge-gate, pre-spin-out) and assessment are preserved as history and remain internally consistent.

The score is lower than the prior review's 72 for two reasons. First, the cell is now a reference-only artifact with no local code to validate — the contract discipline (byte-exact conformance, signature parity, discriminant-map drift guards) is entirely in `flight-rs` and no gate in this repo can verify it. Second, the prior review identified three concrete defects (the `floodFillBitmap` 5-arg divergence, two non-compiling test call sites, and a false durable comment) whose resolution status is unknown from this repo's vantage point. The assessment recommended reverting those, but whether the work landed in `flight-rs` is not observable here.

## Present capabilities

**As a cell in this monorepo**, surface-rs provides:

- A charter with clear vision, boundaries, five decisions, and five open directions — one of the more thoroughly documented cells.
- A status file rewritten to the Open + Log contract (2026-08-08), accurately stating the spun-out disposition and the zero-local-code reality.
- A historical merge-gate review (pre-spin-out) documenting the wasm shadow conformance gate, discriminant-map cardinality tests, palette-map coverage, aliased-in-place tests, wasm memory-growth stability tests, and three blocking defects.
- An assessment derived from that review with two recommended items and a five-item backlog, all coherent with the charter.

**What the package provides when built (in `flight-rs`)**, per the charter:

- Wasm-backed drop-in shadow of `@flighthq/bitmap`, re-exporting its full API and selectively replacing bulk per-pixel operations with Rust/wasm implementations.
- Discriminant maps between TS string unions and Rust `repr(u8)` enums.
- A conformance test suite asserting byte-exact parity with JS reference (53 expected shadows at last count).
- Lazy wasm module loading (base64-embedded, no top-level instantiation).

## Gaps

1. **No local verification gate for upstream signature drift.** The charter's pure-shadow rule requires surface-rs to track `@flighthq/bitmap` signatures. When `bitmap` changes a function signature in this repo, nothing here gates or even warns about the downstream obligation in `flight-rs`. The status file notes this ("a `bitmap` edit here has a downstream obligation ... that no gate in this repo can see") but no mechanism addresses it.

2. **Prior review defects unresolvable from this repo.** The three defects the prior review identified — `floodFillBitmap` 5-arg vs 4-arg divergence, two non-compiling reference call sites in tests, and a false durable comment — are `flight-rs` concerns. Their resolution is not observable here, and the assessment's recommended items remain in an indeterminate state.

3. **Hidden-state removal blocked on upstream.** The charter decision (2026-07-03) records that `floodFillBitmap`, `scrollBitmap`, and `medianBitmap` carry module-level mutable buffers in `@flighthq/bitmap`, and the fix must originate upstream. Verified: `bitmapFill.ts` still uses a module-level `_floodFillVisited` buffer and `floodFillBitmap` remains 4-arg; `scrollBitmap` in `bitmapTransform.ts` remains 3-arg. The hidden state is still present upstream, so the charter's upstream-first constraint is still active.

4. **Rename pending.** The `@flighthq/surface-rs` to `@flighthq/bitmap-rs` rename (and `flighthq-surface-wasm` to `flighthq-bitmap-wasm`) is recorded as pending in `flight-rs`. The cell documents this clearly but cannot track its completion.

5. **`scripts/docs.ts` reference gone.** Status says "one comment in `scripts/docs.ts`" references the package outside `agents/`. Verified: no `scripts/docs.ts` file or any script file contains `surface-rs`, `bitmap-rs`, `surface-wasm`, or `bitmap-wasm`. The reference has been cleaned up (or `docs.ts` was restructured) since status was last written. The status claim is stale on this point.

## Charter contradictions

None found. The charter, status, prior review, and assessment are internally consistent. The charter's spun-out notice accurately describes the disposition. The `spunOut: flight-rs` front-matter marker, the `crate: null` declaration, and the `draft: false` state are all correct.

One minor tension: the charter says "this cell is kept for reference" and the CONTRACT.md says "a `spunOut:` cell keeps whichever of the four it accumulated while its code did live here" — which permits but does not require the review and assessment to stay current. Writing a review of a cell with no local code is inherently limited to documentary audit, which is what this review is.

## Contract and docs fit

- **Front matter** — charter, status, review, and assessment all carry valid YAML with correct `package` values. Charter has all required keys including `spunOut`, `crate: null`, and pointer fields.
- **Export lanes** — not applicable (no local code).
- **`sideEffects: false`** — not applicable (no local `package.json`).
- **Two-lane export structure** — not applicable.
- **Type home rule** — not applicable.
- **Status contract** — the status file has the correct `## Open` / `## Log` structure, is well under 6,000 characters, and the Open section is rewritten in present tense describing current reality.
- **No stale references outside `agents/`** — verified. No `scripts/`, `package.json`, `tsconfig`, or source file in this monorepo references `surface-rs`, `bitmap-rs`, `surface-wasm`, or `bitmap-wasm`.

## Candidate open directions

1. **Cross-repo signature-drift gate.** The charter identifies signature parity as the core contract, and the status identifies the absence of any local enforcement. A lightweight gate — even a generated checklist triggered when `bitmap` exports change, naming the downstream obligation in `flight-rs` — would close the gap without requiring build wiring for code that does not live here. This is the single highest-value improvement for this cell's role in the monorepo.

2. **Status staleness on the `scripts/docs.ts` claim.** The status file's Open section says `scripts/docs.ts` carries a reference. This is no longer true. A minor status rewrite would keep the file accurate.

3. **Assessment item resolution tracking.** The assessment's two Recommended items and five Backlog items are all `flight-rs` work. Whether to close them here (marking them as `flight-rs`-owned and outside this repo's pipeline) or to keep them as cross-repo obligations is a disposition question for the user.

4. **Charter rename update.** When the `surface-rs` to `bitmap-rs` rename lands in `flight-rs`, this cell's charter, status, review, and assessment should reflect the new names. The cell folder itself (`agents/packages/surface-rs/`) may or may not rename depending on whether the monorepo convention tracks the current or historical package name for spun-out cells.
