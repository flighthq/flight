---
package: '@flighthq/surface-rs'
updated: 2026-08-08
by: principal
---

# surface-rs — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

There is no `packages/surface-rs/` and no `crates/` in this repo. The charter carries `spunOut:
flight-rs`: the package and its `flighthq-surface-wasm` crate are built and maintained there, and a
rename to `@flighthq/bitmap-rs` / `flighthq-bitmap-wasm` is pending on that side. Nothing in this
monorepo references either name outside `agents/` and one comment in `scripts/docs.ts`.

For a reader who arrives here looking for code:

- **The upstream it shadows is `@flighthq/bitmap`** (`packages/bitmap/`), which is local and live.
  Under the charter's pure-shadow rule, an upstream signature change is what forces a matching change
  in `flight-rs` — so a `bitmap` edit here has a downstream obligation, in the same merge, that no
  gate in this repo can see.
- **Nothing here is buildable or testable for this cell.** No wasm binary, no glue, no Rust toolchain
  wiring. Do not scaffold `packages/surface-rs/`; the `spunOut` marker keeps the cell out of the
  chartered-unbuilt queue on purpose.
- **The open design questions are recorded in `charter.md › Open directions`**, not here — the
  `filters-surface-rs` neighbor shape, the discriminant-map drift guard, and the wasm loading
  strategy. They are `flight-rs` decisions with an upstream-first constraint, so they belong to the
  charter's direction surface rather than to a local work list.
- **`review.md` and `assessment.md` in this cell survey the pre-spin-out source** and describe code
  that is not in this tree. They are kept as history under the contract's rule that a spun-out cell
  does not shed the files it accumulated while its code lived here.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewrote the file to the Open + Log contract and cut the 2026-06-24 and 2026-06-25
  session reports, which surveyed source that is not in this repo. No local-code claims were kept, and
  none were checked against source because there is none to check; verified only the disposition —
  `packages/surface-rs/` and `crates/` are absent, `packages/bitmap/` is present.
- **2026-07-10** — Spun out to `flight-rs`; continue the log there.
- **2026-06-25** — Widened the wasm seam with ten previously-unbridged helpers completing the
  color-matrix story, plus conformance tests against the JS reference.
- **2026-06-24** — Discriminant-map cross-references, the 53-function conformance-drift guard,
  marshalling edge cases, and memory-stability regression tests.
