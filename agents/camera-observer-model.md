# Camera as Observer — the prepare/render separation

**Status: unratified.** Read before touching `renderTransform2D`, `prepareScene2DRender`,
`Camera2D`, or the root-transform handling in any 2D render backend.

## The problem

`state.renderTransform2D` is a mutable field on `RenderState` that callers set before
`prepareScene2DRender`. Prepare bakes it into every render proxy's `transform2D`, fusing the
device/viewport projection with the scene-space layout into one matrix per node. This coupling has
three consequences:

1. **Prepare results are tied to one observer.** Changing the root transform (a window resize, a
   DPI change, a different render target) invalidates every cached proxy transform and requires a
   full re-prepare, even when the scene itself has not moved.

2. **The root transform is hidden state.** Callers must know to mutate `state.renderTransform2D`
   between `begin*RenderPass` and `prepareScene2DRender` — a bare field assignment with no API
   surface, no parameter, and no name. The spritesheet renderer, offscreen capture path, and
   thumbnail generator all do this and each had to discover the convention independently.

3. **2D and 3D diverge without reason.** 3D render calls take the camera as an explicit argument:
   `renderGlScene3D(pass, scene, camera, lights)`. 2D render calls take no camera; the observation
   is hidden on mutable state.

## The design

The camera is an observer, not a scene participant. The scene graph describes what exists; prepare
compiles its layout; the camera describes where you are looking from. These are three independent
concerns.

### Prepare produces scene-space transforms

`prepareScene2DRender` stops reading `state.renderTransform2D`. Root nodes (those with no parent
proxy) multiply against identity — their `transform2D` is their scene-space world transform. The
prepare cache is now valid for every observer: one prepare, many renders.

### The camera is an explicit argument to render

```
renderCanvasScene2D(pass, scene, camera?)
renderGlScene2D(pass, scene, camera?)
renderWgpuScene2D(pass, scene, camera?)
```

`camera` is `Camera2D | null`. `null` (the default) means identity — draw in scene coordinates.
Inside the render function, the camera is immediately resolved to a matrix via
`getCamera2DViewMatrix(camera, viewportWidth, viewportHeight, out)` and applied per drawn object.
The `Camera2D` type does not propagate into rendering internals.

### Camera2D loses viewport dimensions

`Camera2D` becomes purely an observer — position, zoom, rotation:

```
interface Camera2D extends Entity {
  rotation: number;
  x: number;
  y: number;
  zoom: number;
}
```

`viewportWidth` and `viewportHeight` move off the type. The viewport is the render target's
concern, not the camera's — the same way `Camera3D` carries `aspect` on its projection descriptor
rather than pixel dimensions. `getCamera2DViewMatrix` takes viewport dimensions as parameters,
and the renderer supplies them from the render target.

### renderTransform2D is removed from RenderState

The field is deleted. Render passes no longer save/restore it. The save/restore in
`begin*RenderPass` / `end*RenderPass` concerned only this field's scoping and has no purpose once
the field is gone.

## What changes

| Component | Before | After |
|---|---|---|
| `RenderState` | carries `renderTransform2D: Matrix \| null` | field removed |
| `Camera2D` | carries `viewportWidth`, `viewportHeight` | position/zoom/rotation only |
| `prepareScene2DRender` | reads `state.renderTransform2D`, bakes device transform into every proxy | produces scene-space proxies; root nodes multiply against identity |
| `render*Scene2D` | `(pass, scene)` | `(pass, scene, camera?)` |
| `begin*RenderPass` | saves/restores `renderTransform2D` | no root-transform scoping needed |
| `getCamera2DViewMatrix` | `(camera, out)` | `(camera, viewportWidth, viewportHeight, out)` |
| App layer | mutates `state.renderTransform2D` from window DPI/size | constructs `Camera2D`, passes to render |
| Offscreen capture | mutates `state.renderTransform2D` with placement matrix | constructs `Camera2D` with position/zoom for the target bounds |

## Why Camera2D and not a raw Matrix

A camera is an observer with semantic fields (position, zoom, rotation). A matrix is opaque.
Committing to `Camera2D` for all 2D rendering means:

- **Camera utilities work everywhere.** `getCamera2DVisibleBounds` for culling,
  `updateCamera2DFollow` for game cameras, `getCamera2DParallaxOffset` for parallax layers — all
  take `Camera2D` and are available on every render path.
- **The API is dogfooded by every render path.** Spritesheet cells, offscreen captures, thumbnails,
  and app windows all go through `Camera2D`, so limitations in the camera API surface immediately
  in paths that run in CI. A raw-matrix escape hatch would let those paths bypass the camera and
  leave it undertested.
- **2D/3D parity is structural.** Both families share the shape
  `prepare(state, scene) → render(pass, scene, camera)`.

For the "I already know what matrix I want" case, helpers like
`setCamera2DFromBounds(camera, bounds)` express placement intent in camera terms without requiring
manual decomposition. `null` covers the identity/test case with no allocation.

### Camera operation surface

The camera types need a verb surface that covers day-to-day positioning, not just construction.
The `set*` verb mutates an existing camera (the workhorse in a loop or controller); `create*From*`
is one-shot construction convenience.

**Camera2D:**

- `setCamera2DLookAt(camera, x, y)` — center the camera on a world position. The most common
  operation: "look at this entity." Clearer than bare `camera.x = x; camera.y = y` because it
  names the intent.
- `setCamera2DFromBounds(camera, bounds)` — fit the camera to show a world-space rectangle.
  Computes position and zoom from the bounds and the viewport. Used for capture, spritesheet cells,
  and "zoom to selection."
- `createCamera2DForIdentityView(viewportWidth, viewportHeight)` — the identity-view camera:
  scene coordinates map 1:1 to screen pixels with the origin at screen top-left. Because Camera2D
  is center-anchored (the camera's x,y is the world point at screen center), identity is
  `(x: width/2, y: height/2, zoom: 1)`, not `(0, 0, 1)` — this helper hides that.

**Camera3D:**

- `setCamera3DLookAt(camera, eye, target, up)` — repoint an existing camera. Used every frame in
  follow-cams, orbit controllers, cutscenes. The `set*` form is the one you reach for in a loop;
  a `createCamera3DFromLookAt` factory exists for one-shot construction but is not the primary path.

### Open: Camera2D vs raw Matrix

The architectural change — view-independent prepare, explicit observation parameter — is valuable
regardless of whether the render parameter is `Camera2D` or `Matrix`. The question of whether to
commit exclusively to `Camera2D` or accept `Camera2D | Matrix` remains open:

- **Camera2D only:** camera utilities (visible bounds, follow, parallax) work everywhere; every
  render path dogfoods the camera API; 2D/3D parity is structural.
- **Camera2D | Matrix:** no conversion friction for callers who already have an affine transform;
  nonuniform scale and skew work without decomposition.
- **Risk of Camera2D only:** if most 2D usage is "I already know the matrix," Camera2D is a
  conversion step between the caller and a matrix the render function produces anyway.

This is a bet on whether the camera abstraction earns its keep as the mandatory interface. The
helpers above (`setCamera2DFromBounds`, `createCamera2DForIdentityView`) reduce the friction, but
the question settles during implementation when the real usage patterns are visible.

## What is NOT lost

- **Correctness.** Matrix multiplication is associative. Applying the camera per-object at render
  time produces identical pixel output to baking it during prepare.
- **Culling precision.** Viewport culling with a scene-space AABB is slightly looser than with a
  device-space AABB when the camera is rotated. In practice the root transform is almost always
  scale + translate (DPI, pan, zoom). Rotated-camera culling can tighten bounds with a
  post-prepare cull pass if needed — that is an optimization, not a correctness concern.
- **Dirty tracking.** Prepare's transform dirty-tracking (skip unchanged subtrees) is unchanged.
  The only difference is what "unchanged" compares against — scene-space parent, not
  device-space parent. The caching is more valuable, not less, because it survives observer changes.

## Migration scope

Packages touched: `types` (Camera2D, RenderState), `camera` (getCamera2DViewMatrix signature,
createCamera2D), `render` (renderTransform2d.ts, renderState.ts), `render-gl`, `render-wgpu`,
`scene2d-canvas`, `scene2d-dom`, `scene2d-gl`, `scene2d-wgpu`, `app` / `application` (window
device transform), `capture` (offscreen paths), `spritesheet` (cell rendering). Approximately
8-10 packages.
