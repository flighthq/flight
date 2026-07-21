---
package: '@flighthq/camera'
updated: 2026-07-21
basedOn: ./review.md
---

# camera — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Finish the single camera package migration.** `Camera2D` and `Camera3D` share `@flighthq/camera`; remove the obsolete `@flighthq/camera2d` cell/package references and rename any example workspace whose name still implies a separate package.
2. **Use draw-time viewport aspect for rendered projection.** A stored perspective aspect remains useful for headless/standalone matrix queries, but a render pass with a viewport is authoritative. Functional coverage must render one camera into differently shaped viewports without editing camera state between draws.
3. **Complete the Entity constructor invariant.** Camera2D must match Camera3D's Entity shape. The two
   projection create functions must either return Entity-backed descriptors or move to an explicitly
   non-create descriptor vocabulary.
4. **Migrate every Flight functional off the removed Camera surface.** Search all functional sources,
   update Camera3D types/constructors/view operations, and require build:functional plus representative
   GL captures so stale API usage cannot hide behind package-only checks.

## Depth gaps

1. **Keep reversed-Z and off-axis/stereo projection behind the viewport contract.** They remain valuable later depth, but should not delay the render-view and sub-target bedrock now being settled.
2. **Make Camera2D multi-viewport semantics explicit.** Decide whether visible-bounds/projection queries
   take active Viewport dimensions or whether stored dimensions are only a mutable authored default;
   avoid silently coupling one camera to one surface.

## Recommended

None. The basis comment is corrected. `getCamera3DLinearDepth` had no consumers outside camera, and its
orthographic path incorrectly used the perspective inverse; it now uses the affine orthographic depth
mapping with near/mid/far tests while the perspective path is unchanged.

## Approved

None.

## Backlog

- Reversed-Z.
- Off-axis/stereo projection.
- Frustum corner allocation fix.
