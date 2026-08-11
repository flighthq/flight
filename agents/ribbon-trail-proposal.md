# Ribbon Trails — a recorder and a strip builder, not a node

**Status: proposal, awaiting ruling. Raised 2026-08-11 by the user, from a desire for a ribbon trail in
a sample; surveyed and written by principal against `89baf5804`.** Nothing described here is built. The
survey findings are verified against the tree; the proposed shape is not ratified.

Read this before adding a `Trail`, `Ribbon`, `Rope`, or `Line` node kind, before adding a width profile
to `StrokeStyle`, and before letting an example hand-roll a position history.

## Why this is a feature and not a sample detail

A trail/ribbon is canonical in every mature engine of this class — Unity ships `TrailRenderer` and
`LineRenderer`, Niagara has a ribbon renderer, Godot has `RibbonTrailMesh`/`TubeTrailMesh`, Pixi has
`MeshRope`. By the completeness standard in the map — a package should hold what a developer would look
for in a mature library of that name — this is on the list for `particles` and for the 3D scene, and its
absence is unfinished work rather than a scope decision.

Nothing in the tree implements it. There is no `Trail`, `Ribbon`, `Rope`, or `Line` kind among the
registered kinds, and no ribbon or trail module in any package. The nearest thing is the fire emitter in
`examples/packages/particles/src/app.ts`, commented "world-space trail" — that is discrete particle
emission along motion, not a connected strip, and it is a different look rather than a cheaper version of
the same one.

## The decomposition

A `RibbonTrail` node is complex because it silently bundles three things: a sample history, a strip
tessellation, and a draw. Two of those are missing primitives and one already exists, so the fix is to
extract rather than to absorb.

1. **Trail** — records motion into a ring buffer of samples. Missing.
2. **Ribbon** — builds strip geometry from a polyline with per-vertex width and color. Missing.
3. **Draw** — needs nothing new. See the evidence below.

The cut is in the right place because each piece is useful without the others. A trail with no ribbon
drives an echo/afterimage effect, a debug path visualization, or a netcode interpolation buffer. A ribbon
with no trail builds from an authored `Path` through `flattenPath`. Neither has to know the other exists,
so `ribbon` does **not** depend on `trail`.

## What exists, verified

**`@flighthq/mesh` is ready.** `MeshGeometry.vertices`/`indices` are the live typed arrays and are
rewritable in place; `topology` carries `'triangle-strip'`; `setMeshGeometryVertexPosition`,
`setMeshGeometryVertexColor0`, and `setMeshGeometryVertexUv0` write per-vertex attributes; and
`invalidateMeshGeometry` bumps `version` so a backend re-uploads on the next draw. That is the
invalidation doctrine's "payloads are versioned" rule already covering a per-frame geometry rewrite — the
hot-loop story for a ribbon is sanctioned rather than something to invent.

**A new 3D node kind costs no backend work.** `isMesh` in `packages/scene3d/src/mesh.ts` discriminates a
drawable leaf by *carrying geometry*, explicitly "robust across custom kinds (a Mesh need not use
`MeshKind`), so the scene render pass discriminates by this rather than by kind symbol." `Billboard` is
the precedent and says so in its own header: it carries geometry, so it "is drawn by the same
per-material mesh renderers as a Mesh on every backend — the only billboard-specific step is the
per-frame facing pass." A ribbon is the same shape with a vertex rewrite where the billboard has a
transform rewrite.

**The path stroker cannot be the tessellator as it stands.** `strokePath`, `buildStrokePathGeometry`, and
`tessellateStrokePath` exist and turn a polyline into triangles, but `StrokeStyle` is
`{cap, dash, dashOffset, join, miterLimit, width}` — `width` is one scalar, with no taper and no
per-vertex color. And `PathMesh` is `{vertices: number[], indices: number[]}` — positions and indices
only, **no UV channel and no color channel**. A tapered, textured, or gradient ribbon cannot come out of
`tessellateStrokePath` in its current output shape.

**Nothing records a history.** `@flighthq/particles` stores `prevX`/`prevY`/`prevZ` on the emitter — one
previous position at emitter level, not per particle — and has no linked or chained particle mode.
`VelocitySample` in `@flighthq/velocity` holds exactly one previous transform. `@flighthq/motionpath`
runs the other direction entirely: it advances a marker along an *authored* path by arc length and
reports position, tangent, and heading. There is no ring buffer, sample history, or polyline-over-time
primitive anywhere in `packages/`.

## Proposed shape

### `@flighthq/trail` — headless recorder

Depends on `types` and `math` only. No scene graph, no rendering.

```ts
createTrail(capacity: number): Trail
appendTrailSample(trail: Trail, x: number, y: number, z: number, time: number): number
pruneTrailSamples(trail: Trail, now: number): number
clearTrailSamples(trail: Trail): void
getTrailSampleCount(trail: Readonly<Trail>): number
getTrailSamplePosition(out: Vector3, trail: Readonly<Trail>, index: number): boolean
```

`Trail` is plain data — packed `positions` (stride 3) and `times` typed arrays plus `head`, `count`,
`capacity`, `lifetime`, and `minimumDistance`. `appendTrailSample` returns the ring index it wrote, or
`-1` when the sample is rejected for falling inside `minimumDistance` of the last one, which is the
sentinel convention rather than an error. `pruneTrailSamples` returns how many expired.

The buffer is GC-managed memory holding nothing external, so it takes neither a `destroy*` nor a
`dispose*` verb.

**Sampling is caller-driven.** Unity's `TrailRenderer` reads the transform implicitly every frame; that is
hidden state plus an eager per-frame side effect, the same shape as the `displayObject.filters` anti-goal.
Flight's trail is appended to by name, in the caller's update, the way `prepareScene3DRender` is invoked
by name.

### `@flighthq/ribbon` — polyline to strip geometry

Depends on `types`, `geometry`, `math`, and `mesh`. Deliberately **not** on `trail`.

```ts
createRibbonMeshGeometry(options: Readonly<RibbonGeometryOptions>): MeshGeometry
updateRibbonMeshGeometry(
  geometry: MeshGeometry,
  points: Readonly<Float32Array>,
  count: number,
  profile: Readonly<RibbonProfile>,
  orientation: Readonly<RibbonOrientation>,
): boolean
```

- `points` is a packed polyline (stride 3) plus a count, so trail samples, a flattened path, or a
  hand-built array all feed it unchanged.
- `RibbonProfile` carries width and color as LUTs sampled along normalized length. Colors are packed RGBA
  integers, per the SDK-wide convention.
- `RibbonOrientation` is explicit: a camera position for view-facing segments, or a fixed normal for a
  ribbon that lies in a plane. Unity spells this `alignment: View | TransformZ`; making it a parameter
  keeps it out of hidden mode state.
- The builder writes `position`, `color0`, and `uv0` with `u` as normalized distance along the ribbon and
  `v` across its width, at `topology: 'triangle-strip'`, then calls `invalidateMeshGeometry`.

### `Ribbon` node in `@flighthq/scene3d` — mirrors `Billboard`

```ts
interface Ribbon extends Node3D {
  geometry: MeshGeometry;
  materials: (Material | null)[];
  orientation: RibbonOrientation;
  profile: RibbonProfile;
  trail: Trail;
}
const RibbonKind = 'Ribbon';

updateRibbon(ribbon: Ribbon, cameraPosition: Readonly<Vector3>): void
updateScene3DRibbons(scene: Scene3D, cameraPosition: Readonly<Vector3>): void
```

Because it carries `geometry`, `isMesh` accepts it and the existing per-material mesh renderers draw it on
GL and WGPU with no registration and no new support-matrix column. The pair
`updateRibbon`/`updateScene3DRibbons` is the exact parallel of
`orientBillboardToCamera`/`orientScene3DBillboardsToCamera` — one explicit per-frame pass the caller
invokes before drawing.

## Why not the alternatives

- **`@flighthq/quadbatch`** — instances are independent, UVs are baked into the atlas region, and there is
  no connectivity between quads. A ribbon is a continuous strip with varying width and color, not a run of
  discrete atlas quads.
- **`PathMesh` from `tessellateStrokePath`** — positions and indices only, as above.
- **Adding taper to `StrokeStyle`** — worth doing on its own merits for tapered and textured 2D strokes,
  but it supplies neither the history nor the UV/color channels, so it does not reach a ribbon.
- **Particle emission along motion** — already available and already demonstrated; a different visual
  result, not a cheaper ribbon.

## Scope boundary: 3D only, deliberately

The 2D ribbon is out of scope here and should be decided on its own. `MeshKind` is owned by
`packages/scene3d/src/mesh.ts` and there is no 2D geometry node kind to host a strip, so 2D needs either a
new kind with renderers across GL, Canvas, and WGPU, or nothing. Canvas 2D is the sharp edge: it offers no
per-vertex color or UV interpolation across a strip, so a 2D ribbon there is a per-segment quad
approximation or a reduced feature. That is a render-backend-support decision to take deliberately, not
one to inherit from whatever the first implementation happens to do.

## Open questions for the user

1. **Node kind, or no node kind.** Either a plain `Mesh` whose geometry the caller rebuilds with
   `updateRibbonMeshGeometry` (maximum composition, more verbose user code), or the `Ribbon` kind above.
   Recommend the kind: `Billboard` is the precedent, and it costs no backend renderer work.
2. **Where curves live.** `ParticleCurve` is `ReadonlyArray<number>`, so a ribbon profile can accept
   `buildParticleCurve` output today with no change at all. The question is whether `buildParticleCurve`
   should be extracted to a shared home — `CurveKeyframe` and `ColorKeyframe` already sit in
   `@flighthq/types` — or whether ribbon simply takes a plain array and the two stay unrelated.
3. **One package or two.** `trail` and `ribbon` separately matches the `particles`/`particleemitter`
   precedent and keeps `trail` usable alone; folding both into `ribbon` is one fewer package but couples
   the recorder to the renderer-facing side.
4. **Particle ribbons.** Niagara's model runs ribbons over particle chains. Does that belong on this
   roadmap now, or only after the two primitives land?
