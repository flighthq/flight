---
package: '@flighthq/clip'
crate: flighthq-clip
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clip — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/clip` is the **data primitive** for geometric clipping / masking regions: a `ClipRegion` value describing a hard, transform-exact clip that constrains a node and its subtree to a region. Two forms live under one discriminant — an axis-aligned **rectangle** (scissor-eligible, the fast path) or a flattened-**path contour** stencil-then-cover region — with a `PathWinding` rule (`nonZero` / `evenOdd`). It is a value-typed, side-effect-free leaf: constructors, composition, queries, transform, clone/copy/set, a pool bracket, and shape conveniences (rounded-rect / ellipse / circle), all over plain data in `@flighthq/types` (`ClipRegion`, `HasClip`, `PathWinding`).

Where it ends: `clip` produces and operates on the region _descriptor_ only. It does **not** rasterize — turning a region into actual scissor / stencil pixels is the job of the per-backend `displayobject-<backend>` clip modules. It does **not** do soft/feathered masking — that is the matte's job (MatteFilter). And it does **not** wire clips onto nodes — per-node `HasClip` trait participation lives in `node` / `displayobject`. Path _flattening_ is borrowed from `@flighthq/path`; `clip` only consumes `flattenPath`.

## North star (proposed)

_Proposed from the design + the SDK structural forks — edit or promote into blessed Decisions after a direction session._

- **Value-typed, side-effect-free leaf.** `ClipRegion` is plain data (`number[][] | null` contours + rect + winding + version), `sideEffects: false`, single root `.` export, deps limited to `geometry` / `path` / `types`. This is the wasm-mixable shape (structural-fork D) and a clean early Rust↔TS conformance target — keep it that way.
- **Scissor-eligibility is a first-class invariant.** The rect form is the cheap GPU path; every operation that _can_ preserve it (axis-aligned transform, rect∩rect, rect∪rect, `normalizeClipRegion` promoting a 90°/180°/270° quad back to a rect) does, and only genuine rotation/skew/contour input promotes to a contour. Preserving the fast path through the pipeline is a design goal, not an accident.
- **Hard, transform-exact clipping; softness is delegated.** A clip here is a crisp geometric region. Feathering and soft mattes are explicitly out of band (MatteFilter), and the renderer's stencil-then-cover realizes the true geometry of a contour region.
- **House-style API discipline.** Full unabbreviated names (`createClipRegionFromRoundedRectangle`, not `createRoundedClip`); `out`-params on every compute/mutate function, all alias-safe; allocation verbs honored (`create*`/`clone*`/`acquire*` allocate, `copy*`/`set*`/transform/intersect write to `out`); sentinels over throws.
- **Conformance-grade determinism.** Deterministic, GPU-free, headlessly fingerprint-able — the kind of leaf that anchors the parity matrix and a `surface-rs`-style mixing story.

## Boundaries (proposed)

_Proposed in-scope / non-goals — confirm in a direction session._

**In scope:**

- The `ClipRegion` descriptor and its full operations: constructors (rect / path / contours / shape conveniences), composition (`intersect*` / `union*`), queries (contains-point, intersects-rect, contains-rect, bounds, empty, rectangular, equal), transform, clone/copy/set, invalidate, a pool bracket, and normalization back to scissor form.

**Non-goals (proposed — confirm):**

- **Rasterization** — scissor / stencil pixel realization belongs to `displayobject-<backend>` clip modules.
- **Soft / feathered masking** — MatteFilter's domain; `clip` is hard-edged only.
- **Per-node trait wiring** — attaching a `HasClip` to a scene node lives in `node` / `displayobject`.
- **Path tessellation / flattening internals** — borrowed from `@flighthq/path`.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. An agent **asks** here rather than assuming._

1. **Where does exact boolean algebra live? (the defining question.)** Today `intersectClipRegions` / `unionClipRegions` are exact only for rect∩rect / rect∪rect; any contour form is **conservative** (bounding-rect plus one input's contours kept verbatim), and there is no `subtractClipRegions` / `xorClipRegions` or true contour boolean. A region library's reason to exist is exact boolean composition. The fork: put a path-boolean kernel (Vatti / Weiler-Atherton / Martinez) in `@flighthq/path` or a new `@flighthq/path-boolean` neighbor and have `clip` compose exact `subtract` / `xor` / `intersect` over it — **versus** blessing conservative-bounds as the permanent contract because the renderer's stencil-then-cover realizes the true geometry anyway. The charter should state whether exact algebra is **in scope for `clip`** or explicitly delegated. (Touches structural-fork A — source-data vs. participation — and the bedrock test for a `path-boolean` cell.)
2. **Is conservative containment acceptable, or must `clipRegionContainsRectangle` be exact (or under-claim) for contour forms?** It currently tests only `clip.rect`, so a concave/holed contour yields a **false positive** — `true` when the rect is inside the bounding box but outside the real region. For a `contains` predicate the safe conservative direction is to _under_-claim; this does the opposite, and a consumer (culling / interaction) that trusts the `true` could skip a needed clip. This needs a blessed correctness ruling, not just a gap note.
3. **Contour storage: `number[][]` vs `Float32Array`.** The roadmap calls for flat typed-array contours for cheap transform / GPU upload (the current per-point `number[]` allocation in `transformClipRegion` and `.map(c => c.slice())` deep copies are GC-heavy on a per-frame animated clip). This is a breaking `@flighthq/types` change (`ClipRegion.contours`) that coordinates with every backend clip module — settle before the Rust port locks the seam.
4. **Ownership of `createClipRegionFromContours` input.** It captures the caller's array **by reference** (asserted by its test), whereas every other constructor clones — an inconsistent, undocumented borrow where a later caller mutation leaks into the region. Clone for symmetry, or document the borrow explicitly?
5. **Winding normalization ownership.** No `getClipRegionWinding`, explicit-winding constructors, or even-odd↔non-zero conversion exist; winding correctness lives entirely in backends. Does `clip` own winding conversion and explicit-winding constructors, or does that stay in the backends?
6. **Boundaries / non-goals — confirm the proposed set above.** Soft/feathered masking (MatteFilter), rasterization (`displayobject-<backend>` clip modules), and per-node trait wiring (`node` / `displayobject`) are proposed as stated non-goals, matching the current correct absences — bless or amend.
7. **Functional / visual coverage.** No scene exercises nested `intersectClipRegions` across Canvas/DOM/WebGL to confirm the descriptor's bounds match what each backend actually clips (jsdom can't reach this). Is a parity test in scope as the guard for the conservative-bounds behavior?
8. **Rust `flighthq-clip` crate.** Front matter declares `crate: flighthq-clip`; the crate does not exist yet. Track as TS-ahead-of-Rust (structural-fork D / the conformance map), sequenced after the TS surface stabilizes.
9. **Package `description` reword.** `package.json` still advertises a product ("ClipRegion: hard geometric clip product built from rectangles or paths"); post-expansion this is a clip _operations_ library. Candidate reword once the North star is blessed.
