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
   selected LOD. Explicit CPU morph/skin updates now refresh cached bounds, and a pick-before/after
   morph test proves broad and narrow phases move together; GPU-skinned geometry, billboard, instance,
   and selected-LOD agreement remain.
2. **Finish instance/LOD hit identity.** UV0, inverse-transpose smooth normal, orthogonalized tangent
   with mirror-aware handedness, material/subset identity, and face orientation are now independent
   on-demand queries rather than fields bloating every nearest hit. Instance and selected-LOD identity
   follow their end-to-end scene contracts. Picking must consume the same prepared draw entry or an
   immutable snapshot of its instance handle and per-view LOD choice; independently re-running LOD
   selection or reading node-global `activeLevelIndex` can disagree with what was drawn.
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
- [2026-07-21 · completed] Narrow-phase triangle decoding now consumes mesh's shared logical-triangle
  primitive. Indexed/non-indexed triangle strips use alternating CCW winding rather than the old
  triangle-list-only `triangleIndex * 3` address, with a backface-culling pick proof.
- [2026-07-21 · completed] Surface attributes stay compositional: six separately importable queries
  derive UV0, smooth normal, tangent/handedness, subset, material, and face orientation from the core
  hit and current prepared geometry. Missing channels return false without touching caller output.
