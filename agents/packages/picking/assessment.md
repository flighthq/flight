---
package: '@flighthq/picking'
updated: 2026-07-21
basedOn: ./review.md
---

# picking — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

None remaining.

## Recommended

No sweep-safe implementation follows from this review. The meaningful corrections touch scene
preparation, mesh deformation, materials, or future instancing/LOD contracts.

## Depth gaps

1. **Make CPU queries agree with rendered deformation.** Define one explicit preparation/evaluation
   seam shared by bounds and picking for morph, skin, billboard orientation, instance transforms, and
   selected LOD; add pick-before/after-update and composed morph+skin functional tests.
2. **Complete hit attributes.** Add interpolated UV and vertex normal/tangent, material/subset identity,
   face orientation, and eventually instance/LOD identity without bloating the nearest-hit core.
3. **Add material-aware and non-triangle selection as opt-in layers.** Alpha-mask coverage,
   point/line/gizmo thresholds, and region selection should compose over the base hit family.
4. **Add acceleration after semantics.** A per-geometry BVH/refit path and scene broad phase should be
   explicit optional structures; GPU ID-buffer picking belongs in backend packages with functional
   CPU↔GPU identity checks.

## Backlog

- Pixel-to-NDC mapping should consume the active Viewport contract rather than duplicate application
  coordinate math.
- Module-level scratch can become caller-owned query scratch if reentrancy becomes a requirement.

## Approved

- [2026-07-21 · completed] `SceneHit` extends Entity and `createSceneHit` uses `createEntity`, preserving
  caller-owned reuse and flat result fields.
