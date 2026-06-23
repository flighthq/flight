# API Consistency — Cross-Package

Synthesis over all 2432 exported functions across 85 packages (`npm run api:json`), looking only for inconsistencies that are visible **globally** — the same concept named or shaped differently in different packages. Findings are graded by confidence; package-local style choices that are internally consistent are noted but not treated as defects.

## Verb inconsistencies

### `copy*` direction and out-name are not uniform (high confidence)

The "copy A into B" concept is spelled three different ways:

- `(out, source)` — the dominant convention, used everywhere in `geometry` (`copyMatrix`, `copyVector3`, `copyRectangle`, all the row/column copies), `materials` (`copyColorTransform`), `surface`/`surface-rs` (`copySurfaceChannel`, `copySurfacePixels`), and `texture` (`copyTexture`, `copySampler`).
- `(target, source)` — `render`: `copyRenderersFromRenderState(target, source)`, `copyAllRenderersFromRenderState(target, source)`. Destination first (good) but named `target`, not `out`.
- `(source, target)` — `shape`: `copyShapeCommands(source: Readonly<Shape>, target: Shape)`. **Reversed**: destination is last, and named `target`.

Recommendation: pick `(out, source)` as the one form. `shape.copyShapeCommands` is the clear outlier (both reversed order and `target` naming) and should become `copyShapeCommands(out: Shape, source: Readonly<Shape>)`. The `render` copies should rename `target` → `out` for consistency with the rest of the SDK's value-copy verbs (or stay `target` only if these are deliberately treated as "render-target" destinations, which they are not — they are plain registry copies).

### `make*` used where `create*` is the allocation verb (medium confidence)

`create*` is the SDK's allocation verb (376 uses). Two functions use `make*` instead:

- `render-gl.makeGlState(...)` — allocates and returns a `GlRenderState` (plus gl/canvas/locations). This is a `create*` by the allocation rule; should be `createGlState` (also aligns with `destroyGlRenderState`, its teardown counterpart, which already uses the canonical verb).
- `filesystem.makeDirectory(path)` — weaker case (`mkdir` is the established domain verb), but it is still the only `make*` in the host suite; `createDirectory` would match `create*` everywhere else.

### `compute*` is allocating + returning (medium confidence)

`compute*` is not one of the SDK's documented allocation verbs (`create*`/`clone*`/`acquire*`), yet:

- `application.computeWindowDeviceTransform(win, out): Matrix` both writes `out` **and** returns a freshly-allocated `Matrix`. A pure out-writer should return `void` (or the `out` it filled, like `setSurfaceRegion`), not allocate a second value.
- `render.computeRenderTargetSize(...)` allocates and returns an object literal `{ width, height }`.

These read as "create/derive a new value" — either rename to a `create*`/`get*`-writes-`out` form or make them pure out-writers. Other `compute*` functions return `string | null` / scalars and are fine.

### `equals*` / `intersects*` / `encloses*` / `contains*` predicates vs the `is*`/`has*` rule (low confidence — package convention)

`geometry`, `materials`, and `texture` expose boolean predicates with bare verbs: `equalsMatrix`, `equalsVector3`, `equalsColorTransform`, `equalsMaterial`, `equalsSampler`, `intersectsRectangle`, `enclosesRectangle`, `nearEqualsVector2`. The map's rule says boolean-returning functions use `has*`/`is*`. This is internally consistent (a deliberate math-style verb set) and reads well, so it is flagged as a documented exception to reconcile, not a bug: either bless "predicate verbs (`equals*`/`intersects*`/`contains*`) are allowed for value-type math" in the conventions doc, or migrate to `is*` forms. The inconsistency is that the **same domains** also ship `is*` type guards (`isMesh`, `isOrthographicProjection`), so a reader sees both styles side by side.

### `enable*` covers two different concepts (low confidence)

`enable*` is the signal-group opt-in verb (`enableNodeSignals → NodeSignals`, `enableInteractionSignals → InteractionSignals`, `enableStageSignals → StageSignals`). The renderer packages reuse `enable*` for feature-support registration that returns `void` (`enableCanvasClipSupport`, `enableGlBlendModeSupport`, `enableWgpuFrameCapture`, …). Same verb, two meanings (return-a-signal-entity vs register-a-capability). Defensible as a single "opt in to a capability" umbrella, but worth a one-line note in the conventions so the void-returning sense is intentional.

## Naming collisions

**No problematic global collisions.** Every duplicated export name is the intentional `@flighthq/surface` ↔ `@flighthq/surface-rs` drop-in twin (84 functions, identical signatures by design per the Mixing section of the Rust map — `surface-rs` is the wasm drop-in that must match `surface` byte-for-byte at the seam). Excluding that pair, there are **zero** exported names shared across packages. Package-root barrels are globally unique, as required.

One sub-note for the twin: the signatures are currently kept manually in lockstep. That is correct and intended, but it is a maintenance coupling — a divergence between the two would be invisible to the collision check (it only flags _shared_ names, not _drifted_ signatures). If a conformance check does not already diff the two signature sets, that is the place to enforce it.

## Out-param / ordering drift

Convention across the SDK is **out/dest first**: `get*`-writes-`out` functions all lead with `out` (`getAabbCenter(out, aabb)`, `getRectangleSize(out, source)`, `getMatrix4Position(out, source)`, `getCameraViewProjectionMatrix4(out, camera, aspect)`, `getTextMetrics(out, layout)`, `getRichTextSelectionRectangles(out, …)`), and the `copy*` math family is `(out, source)`. The GPU pass families (`effects-*`, `filters-*`) are uniformly `(state, source, dest, …)` — consistent within and across the three backends. Two functions break the out-first rule:

- `velocity.getVelocity(field: VelocityField, source: object, out: Velocity2D): Velocity2D` — `out` is **last**, unlike every other `get*`-writes-out in the SDK. Should be `getVelocity(out, field, source)` to match `getAabbCenter`/`getRectangleSize`/etc.
- `particles.sampleParticleColorCurve(lut, t, out, offset)` — `out` is in the **middle** (third of four). Should lead with `out`.

`get*`-returns-boolean — these are out-writers whose name says "get" but whose return value is a success flag, conflicting with the `get*` = accessor / `is*`/`has*` = boolean rule:

- `geometry.getAabbContainsPoint(aabb, point): boolean` and `geometry.getBoundingSphereContainsPoint(sphere, point): boolean` — pure predicates; should be `aabbContainsPoint` / `sphereContainsPoint` (or `is*`), matching the bare-verb predicates the same package already uses (`enclosesRectangle`, `intersectsRectangle`). As-is, geometry spells "contains" with `get*` but "encloses"/"intersects" without — an in-package split.
- `camera.getCameraInverseViewProjectionMatrix4(out, camera, aspect): boolean` — writes `out`, returns invertibility. Its sibling `getCameraViewProjectionMatrix4(out, camera, aspect): void` is identical in shape but returns void. The boolean here mirrors `geometry.inverseMatrix4(out, source) : boolean` (which is correctly _not_ named `get*`). Rename to drop `get*` (e.g. `invertCameraViewProjectionMatrix4`) so the boolean-return signals "may fail" rather than reading as an accessor.
- `textlayout.getRichTextCharBoundaries(out, text, layout, charIndex): boolean` — writes `out`, returns found/not-found. Same pattern; the `get*` prefix hides that the boolean is the real signal.

`remove*` return asymmetry (low confidence): `node.removeNodeChild → NodeOf<Traits>` vs `removeNodeChildAt → NodeOf<Traits> | null`. The `*At` variant can miss and returns a sentinel (correct); the by-reference variant assumes presence. Reasonable, but the asymmetry is worth a deliberate confirmation that `removeNodeChild` of a non-child is a programmer error (throw/assert) rather than an expected miss.

## Recommendations

Ranked by payoff vs churn:

1. **Fix the two out-param order outliers** (`velocity.getVelocity`, `particles.sampleParticleColorCurve`) to lead with `out`. Cheap, removes the only real out-ordering drift.
2. **Normalize `copy*`** on `(out, source)` with the name `out`: fix `shape.copyShapeCommands` (reversed + `target`) and rename `target` → `out` in the two `render` renderer-copy functions.
3. **Rename the four `get*`-returning-boolean functions** off the `get*` prefix (`getAabbContainsPoint`, `getBoundingSphereContainsPoint`, `getCameraInverseViewProjectionMatrix4`, `getRichTextCharBoundaries`) so accessors and predicates stay distinct, and so the camera inverse matches `geometry.inverseMatrix4`'s naming.
4. **Rename `makeGlState` → `createGlState`** (pairs with `destroyGlRenderState`); consider `filesystem.makeDirectory → createDirectory`.
5. **Make `compute*` pure**: `computeWindowDeviceTransform` should not both write `out` and allocate a return; decide between out-writer (`void`) and allocator (`create*`).
6. **Document the intentional exceptions** so future audits don't re-flag them: value-type math predicates (`equals*`/`intersects*`/`encloses*`) as an allowed boolean-verb set, and the void-returning `enable*` capability-registration sense distinct from `enable*Signals`.
7. **Add a signature-diff guard** (if not already present) for the `surface` ↔ `surface-rs` twin, so the deliberate name-sharing cannot mask a silent signature divergence.
