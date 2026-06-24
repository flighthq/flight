---
package: '@flighthq/clip'
updated: 2026-06-24
basedOn: ./review.md
---

# clip — Assessment

> Recommendation layer over `review.md` (solid, 80/100). Absorbs the prior maturation roadmap (`reviews/maturation/depth/clip.md`) — Bronze and nearly all of Silver have **landed** (3 → 24 exports), so this assessment carries only the residue: the small in-cell cleanups and the larger parked items. `Approved` is empty by design — approval is the user's verbal gate.
>
> Roadmap absorbed: `reviews/maturation/depth/clip.md` is now fully consumed (its Bronze + Silver are shipped; its Gold survives here as Backlog) and can be removed as one-time seed.

## Recommended

Strictly sweep-safe: within `@flighthq/clip`, no cross-package coupling, no breaking change, no open design decision. Safe to bless as a set.

- **Clone or document the `createClipRegionFromContours` borrow.** Today it captures the caller's array by reference (`clip.contours === the passed array`, asserted by its test) while every other constructor clones — an undocumented ownership inconsistency where a later caller mutation leaks into the region. Pick one: clone for symmetry with the rest of the `create*` family (the conventional, allocation-on-`create*` direction), or keep the borrow and document it explicitly as a deliberate zero-copy intake. In-cell, small, no API-shape decision. (review.md — "captures the caller's array by reference"; roadmap Silver `createClipRegionFromContours`.)
- **Reword the package `description` from product to library.** `package.json` still reads "ClipRegion: hard geometric clip product built from rectangles or paths" — pre-expansion framing. Post-expansion the package is a clip _operations_ library (composition / queries / transform / pool); the description undersells it. Pure metadata, no code change. (review.md — Contract & docs fit, "still advertises a product, not the library".)

## Backlog

Parked: each waits on a cross-package coordination, a breaking types-layer change, or an Open direction the charter must settle first. Not eligible for blanket approval.

- **Exact boolean algebra — the defining gap (parked: cross-package design fork).** `intersectClipRegions`/`unionClipRegions` are bounds-plus-one-input conservative on any contour form; there is no `subtractClipRegions`, no `xorClipRegions`, no true contour intersection/union. This is the single largest thing between `solid` and `authoritative`, but it needs a polygon- clipping kernel (Vatti / Weiler–Atherton / Martinez–Rueda) that does not exist anywhere in the monorepo (`@flighthq/path` has only `flatten`/`tessellate`). Per **structural-fork A** (source-data vs. graph participation) and the **bedrock test**, the kernel almost certainly belongs in `@flighthq/path` or a new `@flighthq/path-boolean` neighbor, with `clip` composing the _region semantics_ over the _geometry kernel_ — not embedding a clipper in this leaf. Routed to the charter's Open directions (#1): "where does exact boolean algebra live, and is it in scope for `clip` at all, or is conservative-bounds the permanent contract because the renderer's stencil-then-cover realizes the true geometry anyway?" Do not act autonomously.
- **`clipRegionContainsRectangle` contour-form false positive (parked: needs a blessed correctness ruling).** On a concave/holed contour it returns `true` when the rectangle is inside the bounding box but outside the actual region — the _unsafe_ direction for a `contains` predicate (a culling / interaction consumer that trusts a `true` could skip a needed clip). The mechanically-safe fix is to flip the conservative direction (under-claim: return `false` when unsure for contour forms), which is small and in-cell — but whether `contains` must be _exact_, must _under-claim_, or may stay approximate is a correctness-contract decision the review surfaces as Open direction #2. Held until the charter states the rule, so the cleanup and the contract land together rather than baking in an unblessed semantics. (Its sibling `clipRegionIntersectsRectangle` over-claims in the _safe_ direction and needs nothing.)
- **Contour storage `number[][]` → `Float32Array` (parked: breaking, cross-cutting types change).** The roadmap's Gold perf item — flat typed-array contours for cheap transform / GPU upload, removing the per-point `number[]` allocation in `transformClipRegion` and the `.map(c => c.slice())` deep copies. This is a breaking change to `ClipRegion.contours` in `@flighthq/types` that coordinates with every backend clip module. A types-layer decision (Open direction #3) to settle _before_ the Rust port locks the seam, not in-cell work.
- **Winding helpers / normalization ownership (parked: cross-package ownership decision).** `getClipRegionWinding`, explicit-winding constructors, and even-odd↔non-zero conversion are absent; winding correctness lives entirely in backends today. Whether `clip` owns the conversion (vs. `path` or the backends) is Open direction #5 — a boundary decision, not a sweep item.
- **Functional / visual parity test (parked: cross-backend, scoped against the conservative-bounds contract).** No scene exercises nested `intersectClipRegions` across Canvas/DOM/WebGL to confirm the descriptor's bounds match what each backend actually clips — exactly the drift jsdom unit tests cannot catch. Parked rather than recommended because what it should assert depends on the boolean- algebra and containment rulings above (testing conservative bounds as the contract vs. exact geometry); author it once those are blessed so the baseline is not rewritten. (review.md — "No functional/visual test"; roadmap Gold tests-and-docs.)
- **Rust `flighthq-clip` crate (parked: separate worktree, sequenced after the TS seam stabilizes).** The charter front matter declares `crate: flighthq-clip`; it does not exist. `clip` is a value-typed wasm-mixable leaf (structural-fork D) and a strong early Rust↔TS conformance target, but the port should mirror a _stable_ surface — naturally after the storage (`Float32Array`) and boolean-kernel decisions land, since the crate inherits both. Track as TS-ahead-of-Rust in the register / conformance map.

## Approved

_None. Approval is the user's verbal gate; populated only on explicit approval, frozen and stamped._
