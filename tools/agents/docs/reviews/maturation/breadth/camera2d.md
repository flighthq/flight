# New Package Spec: @flighthq/camera2d

**Represents:** A world-space 2D camera/viewport — position/zoom/rotation, follow-with-deadzone/lerp, world-bounds clamping, parallax layers, `worldToScreen`/`screenToWorld` transforms, and a visible-bounds rect for culling — as plain data over free functions, the gameplay sibling that the existing 3D `@flighthq/camera` is not.

**Requested by:** game-2d

## Fits

- **Net-new package, named `camera2d` to avoid the naming collision the review flagged.** `@flighthq/camera` is a 3D camera (perspective/orthographic `Projection`, `Matrix4` view-projection, lookAt, TAA jitter, motion-blur). It cannot be widened into a 2D world camera without overloading its type and conflating `Matrix4`/`Vector3` 3D math with the `Matrix`/`Vector2`/`Rectangle` 2D math a platformer wants. A separate cell keeps both tree-shakable and each authoritative-in-isolation. (See Open question 1 on the `camera`/`camera2d` naming pair.)
- **Depends on** `@flighthq/types` (the type header — `Camera2D` and friends defined there first) and `@flighthq/geometry` for the 2D primitives it operates over: `Matrix` (the existing 2D affine matrix), `Vector2`, `Rectangle`, plus their `create*`/`copy*`/`acquire*`/`out`-param helpers. It does **not** depend on `@flighthq/camera` (3D), `@flighthq/node`, `@flighthq/displayobject`, `@flighthq/sprite`, or any renderer — the camera produces a `Matrix` the caller applies to a root container's transform; it never reaches into the scene graph.
- **No platform `*Backend` seam.** This is pure value math (numbers in, `Matrix`/`Vector2`/`Rectangle` out) with no OS capability, exactly like `geometry`/`materials`. There is no `get*Backend`/`set*Backend`/`createWeb*Backend`. (Input that _drives_ a follow target — gamepad/pointer/keyboard — stays in `@flighthq/input`; the camera only consumes a `Vector2` target each frame.)
- **Signals are opt-in.** A camera does not enable signals by default. An `enableCamera2DSignals(camera)` group (defined in this package, per the house rule) exposes loose notifications (`onCamera2DMove`, `onCamera2DZoom`, `onCamera2DShake`) for HUD/minimap consumers that want them; the hot per-frame path uses no signals.
- **Neighbor packages it sits beside / hands off to:** `@flighthq/geometry` (math primitives), `@flighthq/easing` (shake/zoom-lerp curves, consumed by value — not a hard dep at Bronze), `@flighthq/tween` (an alternative way to animate camera fields; the camera stays tween-agnostic), and the review-flagged future `spatial` broadphase (consumes the camera's visible-bounds rect for culling — boundary, not built here). Parallax _factors_ parsed by `tilemap-formats` flow in as data the caller assigns to `Camera2DParallaxLayer`.
- **Rust crate:** `flighthq-camera2d` — a value-typed math leaf, **mixable** (wasm drop-in) and a strong early conformance target (deterministic, no GPU, headlessly fingerprint-able). Same function names snake_cased (`world_to_screen`, `update_camera2d_follow`, `get_camera2d_visible_bounds`); `Camera2D` and the descriptor types mirror into `flighthq-types`. The follow/shake/clamp math must be bit-reproducible for Rust↔TS conformance.

## Bronze

The minimum that lets a 2D game scroll, zoom, and convert coordinates without hand-rolling matrices on a root container — the 20% delivering 80% of the value: a camera you can position/zoom, derive a view `Matrix` from, and round-trip world↔screen.

**Types (in `@flighthq/types` first):**

- `Camera2D extends Entity` — `position: Vector2` (world-space center the camera looks at), `zoom: number` (1 = 1 world unit : 1 screen pixel; >1 zooms in), `rotation: number` (radians), `viewportWidth: number`, `viewportHeight: number`, `origin: Vector2` (the screen-space anchor the position maps to, default = viewport center). Plus a cached `view: Matrix` (world→screen) and `viewDirty: boolean` (invalidation, recomputed lazily).
- `Camera2DLike = EntityWithoutRuntime<Camera2D>` for structural inputs.
- `Camera2DOptions` — the `create*` input (`position?`, `zoom?`, `rotation?`, `viewportWidth`, `viewportHeight`, `origin?`).

**Functions (this package):**

- `createCamera2D(options: Readonly<Camera2DOptions>): Camera2D` — the only allocator at Bronze.
- `setCamera2DPosition(camera: Camera2D, x: number, y: number): void`, `setCamera2DZoom(camera: Camera2D, zoom: number): void`, `setCamera2DRotation(camera: Camera2D, rotation: number): void`, `setCamera2DViewport(camera: Camera2D, width: number, height: number): void` — field setters that flag `viewDirty`.
- `getCamera2DViewMatrix(out: Matrix, camera: Readonly<Camera2D>): void` — world→screen affine (translate by `-position`, rotate, scale by `zoom`, translate by `origin`). The matrix the caller assigns to the world root container's transform.
- `getCamera2DInverseViewMatrix(out: Matrix, camera: Readonly<Camera2D>): void` — screen→world.
- `worldToScreen(out: Vector2, camera: Readonly<Camera2D>, worldX: number, worldY: number): void` and `screenToWorld(out: Vector2, camera: Readonly<Camera2D>, screenX: number, screenY: number): void` — the bread-and-butter conversions (pointer-pick to world, world entity to HUD position). `out`-param, alias-safe.
- `getCamera2DVisibleBounds(out: Rectangle, camera: Readonly<Camera2D>): void` — the world-space AABB currently on screen (accounts for zoom; at Bronze, an axis-aligned bound that _encloses_ a rotated viewport). The rect a culler tests sprite bounds against.

**Behavior:** all math is `out`-param and alias-safe; setters are the only mutators; no allocation in the per-frame path beyond what the caller pools. Zoom of `0` or negative is API misuse (throw); an off-screen `worldToScreen` returns a valid out-of-bounds coordinate (not a sentinel — it is a legitimate result).

**Effort:** small–moderate. It is affine-matrix composition over existing `geometry` helpers plus the visible-bounds derivation; the design cost is the `Camera2D` field set and the `origin`/`zoom` sign conventions.

## Silver

Competitive with what a well-regarded 2D engine camera (Phaser, LibGDX `OrthographicCamera`, Godot `Camera2D`) ships: smooth follow with a deadzone, world-bounds clamping, parallax, screen shake, and a lerped zoom — the professional daily-use surface.

**Types (header additions):**

- `Camera2DFollow` — `target: Vector2` (read each frame), `lerp: Vector2` (per-axis smoothing 0–1, 1 = snap), `deadzone: Rectangle` (screen-space box the target moves freely within before the camera scrolls), `offset: Vector2` (lead/look-ahead). Attached to the camera as an optional `follow: Camera2DFollow | null` field.
- `Camera2DBounds` — `worldBounds: Rectangle | null` (clamp the visible region inside this), optional per-edge `clampEdges` so a level can clamp X but not Y. Field `bounds: Camera2DBounds | null`.
- `Camera2DParallaxLayer` — `factor: Vector2` (0 = static/background, 1 = moves with camera), `offset: Vector2`. Plain descriptors the caller keeps per render layer.
- `Camera2DShake` — `kind: Camera2DShakeKind` string (`'Camera2DShakeDecay'` to start), `amplitude: Vector2`, `frequency: number`, `durationMilliseconds: number`, `elapsedMilliseconds: number`, `seed: number`. `Camera2DShakeKind` is the string identifier (vendor-prefix convention for custom shakes).
- `Camera2DZoomTarget` — `target: number`, `lerp: number` for smooth zoom (`zoom` eased toward `target`).

**Functions:**

- `enableCamera2DFollow(camera, follow: Readonly<Camera2DFollow>): void` / `disableCamera2DFollow(camera): void`.
- `updateCamera2DFollow(camera: Camera2D, deltaMilliseconds: number): void` — advance position toward the deadzone-adjusted, offset target by `lerp`. Frame-rate-independent smoothing (exponential, deltaMilliseconds-aware), deterministic.
- `enableCamera2DBounds(camera, bounds: Readonly<Camera2DBounds>): void` and `clampCamera2DToBounds(camera: Camera2D): void` — keep `getCamera2DVisibleBounds` inside `worldBounds`; if the world is smaller than the viewport, center on that axis (the standard engine behavior).
- `getParallaxViewMatrix(out: Matrix, camera: Readonly<Camera2D>, layer: Readonly<Camera2DParallaxLayer>): void` — the per-layer view matrix (camera translation scaled by `factor`). What a parallax background container is transformed by.
- `startCamera2DShake(camera: Camera2D, shake: Readonly<Camera2DShake>): void`, `updateCamera2DShake(camera: Camera2D, deltaMilliseconds: number): void`, `stopCamera2DShake(camera: Camera2D): void`, `isCamera2DShaking(camera: Readonly<Camera2D>): boolean` — additive screen shake folded into the view matrix; decaying amplitude; seeded deterministic noise so Rust↔TS agree.
- `setCamera2DZoomTarget(camera: Camera2D, target: number, lerp: number): void` and `updateCamera2DZoom(camera: Camera2D, deltaMilliseconds: number): void` — smooth zoom.
- `updateCamera2D(camera: Camera2D, deltaMilliseconds: number): void` — the single per-frame driver: follow → zoom → shake → clamp → recompute view. The one call a game loop makes.
- `enableCamera2DSignals(camera: Camera2D): Camera2DSignals` exposing `onCamera2DMove`/`onCamera2DZoom`/`onCamera2DShake` (signal group lives here; opt-in cost).

**Cross-cutting:** colocated `*.test.ts` per source file (distinct-out and aliased-out cases for every `out`-param fn); `npm run exports:check`/`order:check` clean; full `Readonly<>` on inputs; `enable*`/`disable*`/`is*` verbs per house rules.

**Effort:** moderate–substantial. Deadzone follow math, bounds clamping with under-sized-world centering, and deterministic seeded shake are each real work; parallax and zoom-lerp are small once the view-matrix core is solid.

## Gold

The canonical Flight 2D camera: exhaustive feature coverage, multiple cameras/viewports, split-screen, exact rotated-frustum culling, pixel-perfect snapping, transitions, full edge handling, tests, docs, and 1:1 Rust parity.

**Type completeness (header):**

- `Camera2DViewport` — `rect: Rectangle` (screen-space sub-region), enabling **split-screen / picture-in-picture / minimap**: multiple cameras each rendering into a viewport rect of the surface. `getCamera2DViewportMatrix` composes the camera view with its viewport placement.
- `Camera2DShakeKind` family: `'Camera2DShakePerlin'`, `'Camera2DShakeDirectional'`, `'Camera2DShakeRotational'` (angular kick) beyond `Camera2DShakeDecay`, plus a `Camera2DShakeTrauma` model (trauma accumulates, shake ∝ trauma²) — the modern (Vlambeer-style) approach.
- `Camera2DTransition` — `kind: Camera2DTransitionKind`, `from`/`to` `Camera2D` snapshots, `easing` curve ref, `durationMilliseconds` — for cutscene/level-handoff camera moves; `updateCamera2DTransition`.
- `Camera2DPixelSnap` — `enabled`, `unit` (snap the view translation to whole pixels / a pixel grid for pixel-art games; avoids shimmer).
- `Camera2DConstraint` — composable post-update constraints (min/max zoom, rotation lock, axis lock) so games stack rules declaratively: `applyCamera2DConstraints`.
- `Camera2DConfine` vs `Camera2DBounds` — a hard confine (camera position clamped) distinct from the soft visible-bounds clamp, matching Godot's `limit`/`drag` split.

**Function completeness:**

- `getCamera2DVisibleBoundsExact(out, camera)` — the **rotated** visible polygon's tight AABB (Bronze's encloses-rotated approximation upgraded), plus `getCamera2DVisibleCorners(out: Vector2[], camera)` for exact OBB culling.
- `containsCamera2DPoint(camera, worldX, worldY): boolean` and `intersectsCamera2DBounds(camera, worldRect): boolean` — direct cull predicates so a renderer needn't materialize the rect.
- `focusCamera2DOnBounds(camera, worldRect, padding)` — set zoom+position to frame a world rect (level intro, "fit to room"), respecting `Camera2DConstraint`.
- `convertCamera2DPointBetween(out, fromCamera, toCamera, x, y)` — coordinate transfer across cameras (split-screen pointer routing).
- `acquireCamera2D()` / `releaseCamera2D()` pool pair for transient/snapshot cameras (transitions allocate snapshots).
- `getCamera2DZoomForWorldWidth(camera, worldWidth): number` and screen-DPI / `devicePixelRatio` integration helpers (`setCamera2DPixelRatio`) so HUD↔world stays exact on hi-dpi.

**Performance & correctness:**

- View-matrix recompute is gated by `viewDirty`; the per-frame `updateCamera2D` does zero allocation (all scratch from `geometry` pools or stack-resident `Matrix`).
- Exhaustive edge handling: zero/negative zoom (misuse → throw), under-sized world clamp (center), zero-duration shake/transition (instant), aliased `out` for every transform, `rotation` wrap.
- Full colocated unit coverage plus a `tests/functional/camera2d-*` scene set (follow, deadzone, parallax, shake, split-screen) capturing baselines across raster backends — the camera's effect is visible, so it earns functional + capture coverage, not just jsdom math tests.
- A `tools/agents/docs/` reference page: the view-matrix convention (origin/zoom/rotation order), deadzone semantics, and the world↔screen sign conventions.

**Rust parity:** `flighthq-camera2d` 1:1 — same names (`update_camera2d`, `world_to_screen`, `start_camera2d_shake`, `get_camera2d_visible_bounds_exact`), same `Camera2D`/descriptor shapes in `flighthq-types`. Deterministic shake/follow/clamp math shares conformance fixtures with TS (same inputs over N frames → identical `position`/`zoom`/`view`). Recorded in the conformance map as a value-leaf, fully mixable crate.

**Effort:** large. Split-screen viewports, exact rotated-frustum culling, trauma/Perlin shake models, transitions, and the functional/capture scene set are each non-trivial; Gold is a multi-session arc.

## Boundaries

- **No scene-graph access.** The camera produces a `Matrix`; the caller assigns it to a root container's transform (`@flighthq/node`/`@flighthq/displayobject`/`@flighthq/sprite`). The camera never imports those packages and never walks children — keeping it a pure leaf and tree-shakable.
- **No rendering.** Culling is _enabled_ by `getCamera2DVisibleBounds`, but the renderer decides what to skip. No draw calls, no render state, no `register*` here.
- **No input.** Follow consumes a `Vector2` target supplied each frame; reading gamepad/pointer/keyboard to _produce_ that target stays in `@flighthq/input`. A drag-to-pan or pinch-to-zoom _gesture_ is example/`input` glue, not camera API.
- **3D camera stays in `@flighthq/camera`.** No `Matrix4`, `Vector3`, projection, lookAt, or TAA here. The two packages are disjoint by dimension.
- **Spatial broadphase stays out.** Quadtree/grid/spatial-hash culling acceleration is the review-flagged future `spatial` package; `camera2d` only emits the query rect it consumes.
- **General tweening stays in `@flighthq/tween`.** `camera2d` ships first-class follow/zoom/shake/transition because they are camera-specific (deadzone, clamp interplay), but a game may also drive raw `position`/`zoom` from `tween`; the camera does not depend on it.
- **Parallax authoring data stays in the format importers.** `tilemap-formats` parses Tiled `parallaxx`/`parallaxy` into data; `camera2d` consumes a `Camera2DParallaxLayer` factor and produces the per-layer matrix. The camera does not parse files.
- **Audio "camera listener" position is out** — 2D spatial-audio panning relative to the camera is a `media`/audio-mixer concern (also review-flagged); `camera2d` only exposes `position`, which that system can read.

## Open design questions

1. **Naming: `camera2d` vs folding a 2D mode into `camera`.** This spec recommends a separate `camera2d` package (disjoint math, clean tree-shaking, no overloaded `Camera` type) and flags the existing `camera` for a possible rename to `camera3d` so the pair is symmetric (`camera2d`/`camera3d`) — but that rename touches `scene-gl`/`effects` consumers and is a coordination item, not autonomous. Confirm before building. (Pre-release status means the rename is cheap if chosen.)
2. **View-matrix convention and direction.** Is `view` world→screen (this spec) or screen→world, and what is the compose order of origin/position/rotation/zoom? Must match whatever a root container expects when the matrix is assigned to its transform — verify against `@flighthq/node` transform application so the camera and the graph agree without an inversion seam.
3. **Where the per-frame update is driven.** Does the game call `updateCamera2D(camera, dt)` manually (this spec — explicit, matches the SDK's "caller invokes work by name" rule) or does `@flighthq/application`'s main loop know about cameras? Recommend manual; keep `application` camera-agnostic.
4. **Deadzone coordinate space.** Deadzone as a screen-space `Rectangle` (intuitive, resolution-dependent) vs a normalized 0–1 box (resolution-independent) vs world-space. Phaser/Godot differ here; pick one and document. Normalized is most portable across viewport sizes.
5. **Shake determinism source.** Seeded shake must be bit-reproducible for Rust↔TS conformance. Use a small in-package deterministic noise (value/Perlin) seeded per shake, or depend on a future `math` RNG/noise surface? A self-contained seeded generator keeps the leaf dependency-free and conformance-stable; revisit if `math` grows a canonical noise API.
6. **Multiple cameras / viewport ownership.** At Gold, `Camera2DViewport` enables split-screen — but does the _surface_/host own the viewport rect→scissor mapping, or does the camera carry it? This spec keeps the rect as camera data and leaves scissor/viewport application to the renderer/host (boundary). Confirm the renderer can consume a per-camera viewport rect without a new render-state seam.
7. **Pixel-snapping placement.** Pixel-perfect snapping (Gold) interacts with the renderer's sub-pixel handling and the view matrix; decide whether snap is a camera concern (snap the view translation) or a render concern (snap at rasterization). Camera-side snap is simpler and backend-independent but can fight sub-pixel sprite positioning — needs a cross-check with the raster backends.
