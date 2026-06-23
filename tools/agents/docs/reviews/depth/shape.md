# Depth Review: @flighthq/shape

**Domain**: Vector Shape display node — the Flash/OpenFL `Graphics`-style retained drawing-command API: a command vocabulary (moveTo/lineTo/curves/primitives), fills and strokes, scale-9 grid stretching, local-bounds measurement, and per-command hit testing. (General path tessellation/boolean ops live in a sibling `@flighthq/path`; this package owns the _display node_ and its command stream, not the geometry kernel.)

**Verdict**: solid — 78/100

The package is a faithful, near-complete port of the Flash `Graphics` drawing surface, which is the right and well-chosen canonical target for "a vector shape display node." Within that target it is largely exhaustive: the full primitive set, all four fill kinds, the full stroke-style vocabulary, raw path injection, exact-bounds measurement (including quadratic extrema), scale-9, and an extensible hit-test registry. It falls short of "authoritative" because a handful of canonical `Graphics` commands are absent, hit testing ships no built-in command handlers, and the package contains no consumer-facing demonstration of the registries it exposes.

## Present capabilities

Drawing-command vocabulary (`shapeCommands.ts`), each an `appendShape*` free function that pushes onto a flat `[key, argCount, ...args]` buffer and invalidates geometry:

- Pen path: `appendShapeMoveTo`, `appendShapeLineTo`, `appendShapeCurveTo` (quadratic), `appendShapeCubicCurveTo` (cubic — beyond Flash's `cubicCurveTo`, present).
- Primitives: `appendShapeCircle`, `appendShapeEllipse`, `appendShapeRectangle`, `appendShapeRoundRectangle` (uniform `ellipseWidth/Height`), and a Flight extension `appendShapeRoundRectanglePath` with four independent corner radii.
- Fills: `appendShapeBeginFill` (solid color+alpha), `appendShapeBeginGradientFill` (linear/radial, colors/alphas/ratios, matrix, spread method, interpolation method, focal point ratio — the complete OpenFL gradient signature), `appendShapeBeginBitmapFill` (matrix/repeat/smooth), `appendShapeEndFill`.
- Strokes: `appendShapeLineStyle` with the full canonical signature (thickness, color, alpha, pixelHinting, scaleMode, caps, joints, miterLimit), plus `appendShapeLineGradientStyle` and `appendShapeLineBitmapStyle`.
- Raw path injection: `appendShapePath` (verb array + flat data + winding), bridging to `@flighthq/path`'s `PathCommand` vocabulary.
- Lifecycle: `clearShapeCommands`, `copyShapeCommands`, `invalidateShapeGeometry`.

Entity/runtime (`shape.ts`): `createShape` / `createShapeData` / `createShapeRuntime` / `getShapeRuntime` over the displayobject generic factory, with `ShapeKind`. `computeShapeLocalBoundsRectangle` is genuinely thorough — it handles every primitive, expands strokes by half-thickness, walks `drawPath` verb streams including WIDE_MOVE/WIDE_LINE, and crucially computes **quadratic bezier extrema** (solving derivative roots) rather than naively bounding by control points. Cubic bounds, however, fall back to the control-point hull (see gaps).

Scale-9 (`scale9Shape.ts`): full entity quartet `createScale9Shape` / `createScale9ShapeData` / `createScale9ShapeRuntime` / `getScale9ShapeRuntime` carrying a `scale9Grid` rectangle, reusing the shape runtime. This is a real, canonical capability most "shape" libraries omit.

GPU solid-fill extraction (`shapeFill.ts`): `getShapeFillRegions` resolves the command stream into solid `ShapeFillRegion` paths (primitives expanded to MOVE/LINE/CURVE/CUBIC verbs, ellipses via the KAPPA cubic approximation), returning `null` when any gradient/bitmap/stroke is present so callers fall back to raster. `hasNonSolidShapeFill` is the guard. This is well-bounded, documented, and correctly scoped.

Hit testing (`shapeHitTestRegistry.ts`): `registerShapeHitTestCommand` / `hitTestShapeCommandPoint` — a string-keyed registry returning a `boolean | null` sentinel (null = no handler). Clean extensibility seam matching the renderer-registration pattern.

Type spine (`@flighthq/types/ShapeCommand.ts`): all style enums (`CapsStyle`, `JointStyle`, `LineScaleMode`, `GradientType`, `SpreadMethod`, `InterpolationMethod`, `PathWinding`) and a declaration-mergeable `ShapeCommandRegistry` mapping each key to its arg tuple — a strong, header-first design.

## Gaps vs an authoritative Graphics/vector-shape library

Missing-by-omission (canonical `Graphics` API surface not present):

- **`appendShapeDrawTriangles`** — `drawTriangles(vertices, indices, uvtData, culling)`. A core OpenFL/Flash `Graphics` command for arbitrary indexed triangle meshes (and the standard path for 3D-ish / distortion fills). Its absence is the single most notable gap for "exhaustive `Graphics`."
- **`appendShapeDrawGraphicsData` / readback** — Flash exposes `drawGraphicsData(IGraphicsData[])` and `readGraphicsData()` to serialize/replay the command stream as typed records. Flight has the flat buffer but no typed-record round-trip helper (e.g. `getShapeGraphicsData`), which a mature library would offer for inspection, serialization, and tooling.
- **`appendShapeWindingFill` / explicit fill winding** — `beginFill` here has no winding parameter; Flash's modern `Graphics` ties winding to `drawPath`/`GraphicsPathWinding` but a fill-level even-odd vs non-zero control is part of the canonical surface. `getShapeFillRegions` hardcodes `winding: 'nonZero'`, dropping the `drawPath` winding the author specified.
- **Cubic-curve exact bounds** — `computeShapeLocalBoundsRectangle` solves quadratic extrema but bounds cubics by the control hull, so `cubicCurveTo` and `drawPath` cubics over-report bounds. An authoritative measurer would solve the cubic derivative roots too. (Curve flattening for fills correctly emits cubics, so this is purely a bounds-tightness gap.)
- **No built-in hit-test handlers** — `registerShapeHitTestCommand` is an empty registry in this package; `hitTestShapeCommandPoint` returns `null` for every command until something external registers handlers. For a self-contained library, shipping default handlers for the primitives (rect/circle/ellipse/round-rect, and a fill-region point-in-polygon for paths) would be expected. As shipped, shape hit testing is inert in isolation. (`@flighthq/interaction` provides a `defaultShapeHitTestPoint`, but that is out-of-package.)

Missing-by-design (correctly elsewhere, not a depth defect): path flattening, tessellation, stroke expansion to triangles, boolean ops, dashing, and actual rasterization all belong to `@flighthq/path` and the renderer packages (`displayobject-canvas/gl/wgpu`), which is consistent with the cellular architecture. `winding` plumbing into rendering is a renderer concern. These are correctly absent.

Minor:

- No `appendShapeArc` / `appendShapeArcTo` convenience (Flash lacks these too, so arguably out of scope, but a "canonical vector shape" author often expects them; circle/ellipse cover the common cases).
- No command-count / emptiness query (`isShapeEmpty`, `getShapeCommandCount`) — small ergonomics a mature retained-command API tends to expose.

## Naming / API-shape notes

- Naming is excellent and disciplined: every function carries the full `Shape` type word (`appendShapeBeginGradientFill`, `computeShapeLocalBoundsRectangle`), free functions throughout, `out` parameter on the bounds function, sentinel `boolean | null` from the hit-test lookup, `invalidate*` for the dirty-bump. Fully aligned with the project's design constraints.
- The `appendShape*` prefix is a deliberate and good rename of Flash's bare `graphics.beginFill(...)` into explicit, grep-able buffer-append semantics — a clear win for the "explicit over magic" rule.
- `appendShapeRoundRectanglePath` is slightly oddly named (it does not take a path; it expands four-radius corners inline). `appendShapeRoundRectangleVarying` or `...FourRadius` would read truer; the `Path` suffix implies raw-path input, which it is not.
- `getShapeFillRegions` / `hasNonSolidShapeFill` take `readonly unknown[]` rather than `Readonly<Shape>` or a typed command stream — a slight leak of the untyped flat-buffer representation into the public signature. A `Readonly<Shape>` overload would be friendlier and self-documenting.
- The flat `[key, argCount, ...args]` buffer is internally consistent and C-port-friendly, but its only typed view is the `ShapeCommandRegistry` interface; there is no public typed iterator/decoder, which is what makes a `readGraphicsData`-style helper worth adding.

## Recommendation

Treat as **solid**, close to authoritative for the `Graphics`-display-node domain it targets. To reach "authoritative" in isolation, add within-session: (1) `appendShapeDrawTriangles` (the headline missing command), (2) a typed `getShapeGraphicsData`/readback round-trip over the flat buffer, (3) exact cubic-bezier extrema in `computeShapeLocalBoundsRectangle`, (4) default built-in hit-test handlers registered by an opt-in `enable*`/`register*` so shape hit testing works without an external package, and (5) honor `drawPath` winding (and a fill-level winding option) in `getShapeFillRegions` instead of hardcoding `nonZero`. Smaller polish: rename `appendShapeRoundRectanglePath`, accept `Readonly<Shape>` in the fill-region functions, and add `isShapeEmpty`/`getShapeCommandCount`. The triangles command and the cubic-bounds fix are correctness/coverage gaps and should be surfaced as the priority items; the rest are ergonomics and completeness.
