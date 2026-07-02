---
package: '@flighthq/clip'
updated: 2026-07-02
basedOn: ./review.md
---

# clip — Assessment

Sorted from the depth review (partial, 45/100), the builder's Bronze+Silver+Gold expansion (23 exports, 55 tests), and the direction session (2026-07-02). Four decisions blessed. The builder landed the full operational surface: constructors (6 variants), conservative composition (intersect, union), queries (containsPoint with exact winding for contours, containsRectangle, intersectsRectangle, bounds, empty, rectangular, equal), transform with rect→contour promotion, normalize, clone/copy/set, invalidate, and a pool bracket. Two prior Recommended items already resolved by the builder (contours deep-copy, description reword). The package is substantially complete as a conservative clip-region operations library.

## Recommended

No sweep-safe within-package items remain. All remaining work is cross-package, design-gated, or an Open direction.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **`Float32Array` contour migration.** _Parked — cross-package, design needed._ Per Decision #2: blessed in scope, but the specific layout (flat `Float32Array` with sub-path offset array? single flat array with sentinel separators?) and the `@flighthq/types` `ClipRegion` interface change need design. Coordinates with every backend clip module. Charter Open direction #2.
- **Exact boolean algebra (`*Exact` functions).** _Parked — cross-package, kernel needed._ Per Decision #1: exact versions (`intersectClipRegionsExact`, `subtractClipRegionsExact`, `unionClipRegionsExact`, `xorClipRegionsExact`, `clipRegionContainsRectangleExact`) compose over a polygon-clipping kernel that does not exist yet. Kernel home (`@flighthq/path` or `@flighthq/path-boolean`) is an open design decision. Charter Open direction #1.
- **Functional / visual test.** _Parked — cross-tree._ No scene exercises clip composition across Canvas/DOM/WebGL. Needs `tests/functional/` scenes exercising the backend clip modules. Charter Open direction #3.
- **Rust `flighthq-clip` crate.** _Parked — cross-worktree._ Does not exist. Sequenced after TS stabilizes (especially `Float32Array` migration). Charter Open direction #4.

## Approved

_(None this session — no sweep-safe items to approve.)_
