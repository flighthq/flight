---
package: '@flighthq/clip'
crate: flighthq-clip
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clip — Charter

## What it is

`@flighthq/clip` is the **data primitive and operations library for geometric clipping regions**. A `ClipRegion` is a plain-data descriptor — either an axis-aligned rectangle (scissor-eligible, the fast path) or flattened contours (stencil-then-cover) — with a `PathWinding` rule. The package builds, queries, transforms, composes, pools, and normalizes clip regions. It does not rasterize them.

Two API stratifications coexist by design: **conservative** operations (the common, fast path — bounds-only for contour forms, always bundled) and **exact** operations (true polygon algebra, separately importable, arriving with the polygon kernel). A consumer knows which contract they opted into by the function name.

Where it ends: clip produces and operates on the region _descriptor_ only. Rasterization (scissor / stencil pixels) is the job of per-backend `displayobject-<backend>` clip modules. Soft/feathered masking is the matte's domain (MatteFilter). Per-node `HasClip` trait wiring lives in `node` / `displayobject`. Path _flattening_ and _winding conversion_ are borrowed from / belong to `@flighthq/path`; clip consumes `flattenPath` and carries the winding rule as metadata but does not own winding helpers.

## North star

1. **Value-typed, side-effect-free leaf.** `ClipRegion` is plain data (`contours` + `rect` + `winding` + `version`), `sideEffects: false`, single root `.` export, deps limited to `geometry` / `path` / `types`. Wasm-mixable shape and a clean early Rust↔TS conformance target.
2. **Scissor-eligibility is a first-class invariant.** The rect form is the cheap GPU path; every operation that _can_ preserve it (axis-aligned transform, rect∩rect, `normalizeClipRegion` promoting a quad back to rect) does. Only genuine rotation/skew/contour input promotes to contours.
3. **Hard, transform-exact clipping; softness is delegated.** A clip here is a crisp geometric region. Feathering and soft mattes are explicitly out of band (MatteFilter).
4. **Explicit fast/exact API stratification.** Conservative operations (bounds-only for contour forms) are the default surface — the names users reach for first. Exact operations (true polygon algebra) are separately importable with an `*Exact` qualifier, so the polygon kernel tree-shakes out for callers who don't need it. A consumer always knows which contract they opted into.
5. **House-style API discipline.** Full unabbreviated names; `out`-params on every compute/mutate function, all alias-safe; allocation verbs honored; sentinels over throws.
6. **Conformance-grade determinism.** Deterministic, GPU-free, headlessly fingerprint-able — anchors the parity matrix and the mixing story.

## Boundaries

**In scope:**

- The `ClipRegion` descriptor and its full operations: constructors (rect / path / contours / circle / ellipse / rounded-rect), composition (intersect / union — conservative by default, exact with `*Exact` variants), queries (contains-point with exact winding for contours, contains-rect, intersects-rect, bounds, empty, rectangular, equal), transform (with rect→contour promotion on rotation/skew), clone/copy/set, invalidate, normalize (quad→rect recovery), pool bracket.
- Future exact boolean algebra (`intersectClipRegionsExact`, `subtractClipRegionsExact`, `unionClipRegionsExact`, `xorClipRegionsExact`) composing over a polygon kernel from `@flighthq/path` or `@flighthq/path-boolean`.
- `Float32Array` contour storage migration for raw performance and C portability.

**Non-goals:**

- **Rasterization** — scissor / stencil pixel realization belongs to `displayobject-<backend>` clip modules.
- **Soft / feathered masking** — MatteFilter's domain; `clip` is hard-edged only.
- **Per-node trait wiring** — attaching `HasClip` to a scene node lives in `node` / `displayobject`.
- **Path internals** — path flattening and tessellation are borrowed from `@flighthq/path`.
- **Winding conversion** — even-odd↔non-zero conversion and winding helpers belong in `@flighthq/path`. Clip carries the winding rule as metadata and consumes it in `clipRegionContainsPoint` but does not own conversion.

## Decisions

- **[2026-07-02] Two API paths: conservative names are the current functions; exact versions get `*Exact` suffix.** Conservative composition (bounds-only for contour forms) keeps its current names (`intersectClipRegions`, `unionClipRegions`, `clipRegionContainsRectangle`, `clipRegionIntersectsRectangle`) — it's the common fast path and the one most callers want. Exact boolean algebra arrives as separate, independently-importable functions (`intersectClipRegionsExact`, `clipRegionContainsRectangleExact`, etc.) when the polygon kernel exists. Tree-shakes cleanly: you don't pay for the kernel if you only need bounds.

  **Why:** There's a difference between "good enough" (like `lengthSquared` in game code) and accurate-accurate. Both are valid — the consumer should know which they're opting into by the function name. Separate functions (not a boolean parameter) preserve tree-shaking: the polygon kernel is genuinely heavy, and a user who only needs conservative bounds shouldn't pay for it in their bundle.

- **[2026-07-02] `Float32Array` contour storage is in scope.** Breaking `@flighthq/types` change to `ClipRegion.contours` (from `number[][] | null` to a flat typed-array form) is approved. Pre-release, no backward-compat obligations. Flat typed arrays provide raw performance, cheaper transform/GPU upload, and C portability.

  **Why:** Industry-grade, fully developed, raw performance, C portability. The current `number[][]` involves per-contour allocation on transform and copy. This is a foundational storage decision that should be made before the Rust port locks the seam.

- **[2026-07-02] Winding conversion belongs in `@flighthq/path`, not clip.** Clip carries the winding rule as metadata and consumes it in `clipRegionContainsPoint` (winding-number ray-cast). Even-odd↔non-zero conversion and explicit-winding constructors belong in `path`, which owns fill-rule semantics. The `pointInContours` duplication in clip (vs path's `containsPathPoint`) is justified: clip operates on pre-flattened `number[][]` contours, path on unflattened command sequences — different input formats, same core algorithm.

  **Why:** Clip is the consumer of winding, not the owner. Path defines paths and their fill rules; clip applies them to a region descriptor. Keeping conversion in path avoids splitting fill-rule knowledge across packages.

- **[2026-07-02] Boundaries confirmed.** Rasterization → backends. Soft/feathered masking → MatteFilter. Per-node trait wiring → node/displayobject. Path internals and winding conversion → `@flighthq/path`.

  **Why:** The live code already respects all of these cleanly. Making them explicit prevents future drift.

## Open directions

1. **Exact boolean algebra kernel and home.** The `*Exact` functions need a polygon-clipping kernel (Vatti / Martinez-Rueda). This almost certainly belongs in `@flighthq/path` or a `@flighthq/path-boolean` neighbor, with clip composing over it. No kernel exists anywhere in the monorepo — this is genuinely new geometry work and a cross-package initiative. Decide on the kernel's home before starting.

2. **`Float32Array` contour migration design.** The storage change is blessed (Decision #2), but the specific layout (flat `Float32Array` with a sub-path offset array? single flat array with sentinel separators?) and the `@flighthq/types` `ClipRegion` interface change need design before implementation. Coordinates with every backend clip module.

3. **Functional / visual test.** No scene exercises clip composition across Canvas/DOM/WebGL to confirm the descriptor's bounds match what each backend actually clips. A parity test would guard the conservative-bounds contract.

4. **Rust `flighthq-clip` crate.** Does not exist. As a value-typed leaf with a plain-data seam, clip is in the mixable set — a strong early Rust↔TS conformance target. Sequenced after the TS surface stabilizes (especially the `Float32Array` migration).
