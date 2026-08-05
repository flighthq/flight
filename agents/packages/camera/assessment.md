---
package: '@flighthq/camera'
updated: 2026-07-21
basedOn: ./review.md
---

# camera — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Finish the single camera package migration.** `Camera2D` and `Camera3D` share `@flighthq/camera`; remove the obsolete `@flighthq/camera2d` cell/package references and rename any example workspace whose name still implies a separate package.
2. **~~Use draw-time viewport aspect for rendered projection.~~** — retired 2026-08-05. `prepareScene3DRender` accepts an authoritative draw-time aspect without mutating the camera's authored fallback, both backend draw paths derive it from the active viewport, and `render-pass-viewport.webgl.ts` renders one untouched Camera3D into tall and wide viewports on the same target with pixel assertions.
3. **Complete the Entity constructor invariant.** Camera2D must match Camera3D's Entity shape. The two
   projection create functions must either return Entity-backed descriptors or move to an explicitly
   non-create descriptor vocabulary.
4. **~~Migrate every Flight functional off the removed Camera surface.~~** — retired 2026-08-05. Functional scene source now uses `Camera3D`, `createCamera3D`, and the `setCamera3D*` view operations throughout; a source-wide check finds no remaining imports or calls to the removed `Camera`/`createCamera`/unqualified view-matrix surface, and the GL viewport functional exercises the migrated path.

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

- [2026-07-22 · completed] `Scene3DDocumentCamera` carries explicit near/far planes and glTF import
  preserves both projection kinds. An omitted glTF perspective far plane remains infinite; the shared
  perspective-matrix atom evaluates that limit without NaN. Authored aspect remains only the fallback,
  with a render viewport still authoritative.

## Backlog

- Reversed-Z.
- Off-axis/stereo projection.
- Frustum corner allocation fix.
