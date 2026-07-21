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

## Depth gaps

1. **Keep reversed-Z and off-axis/stereo projection behind the viewport contract.** They remain valuable later depth, but should not delay the render-view and sub-target bedrock now being settled.

## Recommended

1. Remove stream-of-consciousness comment in `basis.ts` ("wait, this is col 1 of R" / "Actually...").
2. Investigate `getCameraLinearDepth` ortho path -- may be load-bearing. Do NOT fix blindly; verify if any effects package depends on current behavior before changing.

## Approved

None.

## Backlog

- Reversed-Z.
- Off-axis/stereo projection.
- Frustum corner allocation fix.
