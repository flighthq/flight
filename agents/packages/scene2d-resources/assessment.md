---
package: '@flighthq/scene2d-resources'
updated: 2026-09-08
basedOn: ./review.md
---

# scene2d-resources — Assessment

Sorted from the 2026-09-02 review (`review.md`). All 5 review gaps verified open against source 2026-09-08. 39 test cases across 8 test files. 15 public exports, 9 source modules.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/scene2d-resources`, no unresolved design decision.

- **Move `@flighthq/scene2d` from `dependencies` to `devDependencies`.** Zero non-test source files import from it; all 5 test files do. Should match `@flighthq/image-codec` (already a devDependency). Trivial fix.
- **Add diagnostic seams.** No guard module or `explain*` query exists. The 3D twin ships `enableScene3DResourceFailureGuards` and `explainScene3DResourceCoverage`; this package has neither. Violates the project-wide diagnostics convention.

## Depth gaps

1. **SVG/Lottie adapters produce empty image-resource manifests.** Only the Rive adapter passes `imageResources` to `createScene2DDocument`. SVG and Lottie adapters do not bridge image URIs into `ImageResourceReference`s. Functional gap — images in SVG/Lottie documents cannot participate in the resource resolution pipeline.
2. **Cancellation is cooperative with no ownership token.** No concurrency token or invocation-order enforcement. Overlapping loads can commit in settlement order. Design-level work.
3. **`required` and slot `linkage` are metadata only.** Stored but no validation function, compatibility check, or structured explanation exists. Chartered open direction (slot typing/validation).

## Backlog

_None._

## Approved

_None._
