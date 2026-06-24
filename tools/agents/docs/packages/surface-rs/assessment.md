---
package: '@flighthq/surface-rs'
updated: 2026-06-24
basedOn: ./review.md
---

# surface-rs — Assessment

Sorted from `review.md` (score `authoritative — 94`) and the prior `reviews/maturation/depth/surface-rs.md` roadmap (absorbed here; verdict-of-record there is the older 92, the review's 94 supersedes it). This is a near-authoritative binding leaf, so the assessment looks very different from a stub package: most of the maturation roadmap's **Bronze** tier already landed in this diff (builder-67dc46d64) — `rotateSurface` is overridden, the shadow-conformance gate and per-discriminant cardinality tests exist, the `repr(u8)` maps carry cross-reference comments naming their Rust decode functions, and the BlendMode audit is resolved. What remains splits cleanly: a few genuinely sweep-safe doc-hygiene fixes, and a large parked set that is either gated on a Rust toolchain rebuild (absent in this environment), crosses a package boundary, or needs a charter decision.

surface-rs is the **lead Wasm-mixing leaf** ([structural fork D](../structural-forks.md#d-two-seam-dimensions--runtime-backend-vs-wasm-mixing-distinguish)) — the value-in/value-out drop-in over `flighthq-surface-wasm`, `crate: null` by design. Fork D is the dimension that frames almost every Open direction below: how far the mixing seam reaches (ergonomic filter wrappers, fingerprint/compare) and whether the standalone-NPM-drop-in is an actual goal are all fork-D questions, not within-package sweeps. The charter is authored only through `What it is`; North star, Boundaries, Decisions, and Open directions are all `TODO`, which is what keeps `Recommended` deliberately small.

## Recommended

Strictly sweep-safe: within `@flighthq/surface-rs` (or its own cell docs), no cross-package coupling, no breaking change, no Rust rebuild, no open design decision.

- **Drop the stale status-doc suggestion / concern about the BlendMode discriminant audit.** The status lists "BlendMode discriminant audit" as a future suggestion (#3) and "BlendMode discriminant map is not in surfaceWasm.ts" as a concern, but the review verified both are stale — the 15-variant comment block and the `BlendMode passes 15 variants` cardinality test both landed this session. A pure continuity-log correction (mark the suggestion done / the concern resolved), no code change. — review.md (Contract & docs fit, "Status-doc vs. diff drift").

- **Record the deliberate non-overrides as an auditable list in the cell (divergence-map seed).** The review and roadmap both name a stable, well-reasoned set left as JS _by choice_: `compareSurface` / `getSurfaceMismatch` / `createSurfaceFingerprint` (full-buffer scans), the string-format fingerprint helpers, allocation/setup constructors, single-pixel getters/setters, allocate-once math builders, and the browser-API-bound `encodeSurface` / `drawSurface` / `createSurfaceFromCanvas`. Today this lives only as scattered comments and review prose. Writing it down once (in `status.md` or as a short divergence list the eventual conformance-map entry can lift) turns "JS by choice" from an inference into an auditable record — no code, no boundary crossed. — review.md (Gaps, "Correctly not overridden"); maturation Bronze ("Document the divergence in the conformance map").

The roadmap's third Bronze item — the "every bulk export is shadowed" guard test — is **already done** (`wasm shadow conformance` at `surfaceWasm.test.ts:1132`), so it is not re-recommended; it is noted here only so a "do all recommended / Bronze" sweep does not re-open closed work.

## Backlog

Parked: needs a charter decision, crosses a package boundary, requires a Rust toolchain rebuild not available in this environment, or belongs to another doc's owner. Each carries why.

- **Override the fingerprint/compare full-buffer scans** (`createSurfaceFingerprint`, `compareSurface`, `getSurfaceMismatch`). Single-crossing work that fits the model, and the conformance-reference path for the whole port. **Parked twice over:** (1) it needs new `*_wasm` exports in `flighthq-surface-wasm`
  - a `npm run wasm` rebuild (no Rust toolchain here), and (2) whether these test/diagnostic-time scans are even _in scope_ for the binding is itself an Open direction the review flags as "borderline." Gate the override on that scope decision. — review.md (Gaps; Candidate open directions #2); maturation Silver.

- **Close the `apply*FilterToSurface` ergonomic-wrapper interposition gap.** The single largest depth gap: the filter wrappers live in `@flighthq/filters-surface` and call the bulk primitives by module-internal reference, so a wasm override never interposes — calling the ergonomic wrapper silently gets JS. **Parked:** every fix (an injection seam in `@flighthq/surface` / `@flighthq/filters-surface`, or a sibling `@flighthq/filters-surface-rs`) crosses a package boundary and is a fork-D design decision. The worker correctly surfaced it as a question rather than acting. Routed to Open directions. — review.md (Gaps; Candidate open directions #1); maturation Silver.

- **Generated single-source `repr(u8)` enum bridge.** The discriminant maps are guarded today by cross-reference comments + cardinality tests (the Bronze floor, landed). The Gold target replaces the hand-maintained literals with a build-time-generated TS module emitted from the Rust crate, plus a `packages:check`-style drift gate. **Parked:** needs the Rust crate to emit the constants + a generator wired into `scripts/embed-wasm.ts` (toolchain/build change), and whether the comment-plus-test guard is _sufficient_ vs. the generated bridge being a committed goal is an Open direction. — review.md (Candidate open directions #4); maturation Gold.

- **`@flighthq/types`-first audit of the binding wire-types.** The `descOf` 6-element region pack, the 256-byte channel map, the 1024-entry histogram, and the rect 4-tuple are inline typed arrays rather than named `@flighthq/types` shapes. **Parked:** whether these wasm-ABI marshalling shapes _belong_ in the header layer at all (they are arguably package-private binding details) is a genuine layering question, not a mechanical rename — and moving them touches `@flighthq/types`. Routed to Open directions. — review.md (Contract & docs fit; Candidate open directions #5); maturation Gold.

- **Exhaustive assertion-port across every option permutation + float-determinism / byte-exactness audit.** Gold-tier conformance hardening: assert wasm against the JS reference for every `edge` mode, every displacement `mode`, every `ThresholdOperation`, every resize mode, premultiplied/grayscale on/off, multi-pass counts — and lock the float-sensitive ops (Gaussian kernel weights, bicubic/bilinear resize, color-matrix rounding, Perlin/noise RNG) to a recorded tolerance in the divergence map. **Parked:** broad, ongoing, and the tolerance entries are themselves divergence-map decisions; also needs the rebuilt wasm to run. — review.md (Verdict, `expectByteClose`); maturation Gold.

- **Add the `surface-rs` line to the codebase Package Map.** The map lists `@flighthq/surface` but not `@flighthq/surface-rs`, though CONTRACT.md enumerates it among the `crate: null` packages and the Rust map names it the canonical Wasm-mixing example. **Parked:** the fix edits `tools/agents/docs/index.md`, an admin doc owned outside this package cell, not a `@flighthq/surface-rs` source change. — review.md (Contract & docs fit, candidate admin-doc revisions).

- **Carve-out for the cross-cutting test `describe` order.** The mechanical-gate blocks (`wasm shadow conformance`, `wasm discriminant map cardinality`) do not correspond to exported functions, so they cannot mirror the source's alphabetized export order the way per-op blocks do. **Parked:** this is a convention-doc question (whether `order:check` should formally exempt cross-cutting gate blocks), owned by the order-check / convention docs, not a within-package fix. — review.md (Contract & docs fit, candidate admin-doc revisions).

- **Published-mixing-crate hardening + measured near-zero-copy benchmark.** A documented zero-copy contract for `ImageSource`/`Surface.data` buffers, a stable wasm ABI version stamped in `surfaceWasmBytes.ts`, an `npm run size` baseline for the embedded-bytes cost, and a JS-vs-wasm micro-benchmark across buffer sizes documenting the small-surface crossover. **Parked:** this presumes the mixing-posture decision (is the standalone NPM drop-in an actual goal? — fork D, Open direction) and spans tooling/build/size infrastructure beyond a within-package sweep. — review.md (Candidate open directions #6); maturation Gold.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub past `What it is`; the review already enumerates these, and the assessment confirms they are the forks that keep the bulk of the backlog parked. Fork D ([Wasm-mixing seam](../structural-forks.md#d-two-seam-dimensions--runtime-backend-vs-wasm-mixing-distinguish)) frames items 1, 2, and 6.

1. **Mixing posture (fork D).** surface is the lead Wasm-mixable leaf. Is shipping surface-rs as a standalone `surface-rs` NPM drop-in (the Rust map's named example) an actual goal, or is this only the in-repo acceleration path? The answer defines what "authoritative" means here and gates the published-crate hardening backlog item.
2. **The `apply*FilterToSurface` interposition seam — injection vs. sibling package.** Should the ergonomic filter wrappers get the wasm path, and via an injection seam in `@flighthq/surface` / `@flighthq/filters-surface` or a sibling `@flighthq/filters-surface-rs`? A real cross-package fork-D-adjacent decision (the largest remaining depth gap).
3. **Fingerprint/compare acceleration — in scope?** Are the full-buffer scans inside surface-rs's mandate, or deliberately left as JS because they are test/diagnostic-time? Decide the boundary so it stops being "borderline" and the Silver override stops being conditional.
4. **Boundaries / non-goals.** `Boundaries` is empty. The package has a clear implicit boundary (accelerate bulk per-pixel ops; never reimplement allocation, browser-API, or string work) that should be written down so future sessions do not over-extend it.
5. **Drift-guard ceiling — comments now, generated bridge later?** Is the comment-plus-cardinality-test guard sufficient (a Decision to record), or is the build-time-generated `repr(u8)` bridge a committed Gold goal?
6. **Where do the binding wire-types live?** Decide whether the wasm-ABI marshalling shapes are package-private (stay inline) or header-layer types (move to `@flighthq/types`). This gates the types-first audit and is a layering question, not a rename.
