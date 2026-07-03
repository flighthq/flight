# Package TODO Index

_Generated 2026-07-03 by `node tools/agents/docs/packages/todo.mjs` — do not edit by hand. Sources: each cell's `review.md` (status/score), `assessment.md › Recommended` (the sweep-safe work queue), `charter.md` (chartered-unbuilt detection), and `register.md › Build queue`. Regenerate after assessments or the register change._

One line per actionable item. For detail, read only the named package's cell: `tools/agents/docs/packages/<name>/assessment.md` (and its `charter.md` for the rules). `Recommended` items are pre-sorted as sweep-safe but **not yet approved**; check `assessment.md › Approved` for blessed work.

## Create — chartered, not yet built

Blessed charters with no code behind them. Start from the charter; add a register + Package Map entry with the code.

- **`capture`** — `@flighthq/capture` is the **deterministic render capture and verification primitive** — the SDK-side home for reading back a rendered frame, fingerprinting it, comparing it against a baseline or against another backend, and defining the committed baseline format. The Rust workspace already reserves the matching crate (`flighthq-capture`, the headless offscreen wgpu → PNG / fingerprint conformance gate); this package is the TS upstream it conforms to.
- **`clock`** — `@flighthq/clock` is the **shared time primitive** for the SDK. A `Clock` entity with hierarchical clocking — child clocks inherit parent scale — providing pause, resume, speed, and time-step sourcing for any time-driven system. Tween, timeline, spritesheet player, and signal throttle/debounce all consume it.
- **`image-codec`** — `@flighthq/image-codec` is the **DOM-free image decode/encode seam** — `registerImageDecoder` / `registerImageEncoder` over swappable per-format backends that turn encoded bytes (`Uint8Array`) into raw RGBA pixels (`Uint8ClampedArray`) and back, without `HTMLImageElement` or any DOM dependency. Needed for the native Rust host, web workers, and off-main-thread decode.
- **`movieclip`** — `@flighthq/movieclip` is the **display-object composition layer** that wraps a `Timeline` and drives a `DisplayObject`. It is the consumer half of the timeline/movieclip split — timeline is the pure frame engine, movieclip is the display-object-specific wrapper that bridges timeline + spritesheet + display object concerns.
- **`particle-emitter`** — `@flighthq/particle-emitter` is the **display-object composition layer** for particles — wraps the `@flighthq/particles` simulation and drives a `ParticleEmitter` display object. Same decomposition pattern as timeline/movieclip: the sim is the bedrock primitive, the emitter node is a composition of it.
- **`path-boolean`** — `@flighthq/path-boolean` is a **neighbor package** of `@flighthq/path` for constructive solid geometry (CSG) boolean operations on 2D paths: union, intersection, difference, xor. A `-subpackage` suffix package that keeps the boolean kernel tree-shakable from the core path package.
- **`path-formats`** — `@flighthq/path-formats` is a **neighbor package** of `@flighthq/path` for path serialization/deserialization formats: SVG path data (`d` attribute), Canvas2D path recording, and potentially other path exchange formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core path package.
- **`shape-formats`** — `@flighthq/shape-formats` is a **neighbor package** of `@flighthq/shape` for shape serialization/deserialization formats. A `-subpackage` suffix package that keeps codec concerns tree-shakable from the core shape package.

## Create — ranked candidate queue (from register.md)

The remaining candidates ranked by how many stakeholder perspectives demand them and how severely their absence was rated. One line each; verdicts are in the tables below (candidate specs were part of the June report generation — regenerate on demand; see index.md).

1. `net` + `socket` — HTTP and WebSocket transport seam (URLLoader/URLRequest home); the largest single coverage hole, #1 for two perspectives.
2. `textshaper-harfbuzz` — full-glyph GSUB/GPOS shaper backend (rustybuzz on Rust); unblocked now the shaper seam is glyph-bearing; the text-typography bottleneck.
3. `assets` — id-keyed asset library over loader/resources: dedup, refcount, eviction, manifests, preload-by-group; the asset-pipeline keystone.
4. `collision` + `spatial` — overlap/swept tests + broadphase; game-2d's #1 category.
5. `camera2d` — follow/deadzone, zoom, worldToScreen, parallax, cull bounds; game-2d's single biggest hole.
6. `shadow` + `environment` — shadow-map pass + PCF seam; skybox + IBL bake; the top 3D blockers, sequenced by 3d-pipeline-architecture.md.
7. `accessibility` — role/label/focus tree over a backend (DOM ARIA first); category-level omission.
8. Scene serialization — **needs the naming/scope call first** (see the `scene-format` row below).
9. Then: `instancing` / `postprocess` / `compute-wgpu` (3D remainder; `render-graph` needs its own design pass), `host-capacitor` / `host-tauri`, `textbidi` / `textsegment` / `text-markup`, `texture-formats` / `atlas-packer` / `tilemap-formats`, `spring` / `motion-path`, `gamestate` / `permission` / `intl`.
10. Opportunistic: `mediasession`, `biometrics`, `purchase`, `calendar`, `contacts`, `devtools`, `testing`.

Design calls to settle before building the affected entries: the glyph-atlas seam (`font-atlas`/`text-gpu` — design once), scene serialization naming, `render-graph`'s reshaping of `render`, the 2D-skeletal question (`skeleton` landed 3D-shaped), and the `animation`/`skeleton`/`tween`/`timeline` boundary (anchor: the `clock` charter).

## Deepen — Recommended items by package (weakest first)

### video (stub 15)

- Loader options — `crossOrigin`, `muted`, `playsInline`, `preload`, and a readiness mode (`metadata` | `canplay` | `canplaythrough`)
- Lifecycle — `disposeVideoResource` (with the decoder-releasing `removeAttribute('src')` + `load()` sequence), `hasVideoResourceElement`, …
- Inspection getters — `getVideoResourceWidth`, `getVideoResourceHeight`, `getVideoResourceDuration`
- Non-URL sources — `loadVideoResourceFromBlob` and `createVideoResourceFromMediaStream`
- Format family symmetry — rename `inferVideoType` → `inferVideoMimeType`; add magic-byte `detectVideoMimeType` (`ftyp` boxes, EBML/Matrosk…
- Export the codec-negotiation primitive — `selectVideoResourceUrl` / `canPlayVideoType`

### audio (stub 18)

- Complete the loader matrix — `loadAudioResourceFromBytes`, `FromBlob`, `FromBase64`
- Lifecycle parity with image — `disposeAudioResource`, `cloneAudioResource`, `hasAudioResourceBuffer`, `isAudioResourceEmpty`
- Buffer inspection getters — `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceBy…
- Format family symmetry — rename `inferAudioType` → `inferAudioMimeType`; add magic-byte `detectAudioMimeType`
- Export the codec-negotiation primitive — `selectAudioResourceUrl` / `canPlayAudioType`
- Sample-tier constructors — `createAudioResourceFromSamples(channels, sampleRate)` and `getAudioResourceChannelData`
- Fix the stale package.json description

### scene-formats (stub 18)

- GLB (`.glb`) container parsing — the 12-byte header + JSON/BIN chunk walk
- `byteStride` de-striding and `normalized` integer attribute handling in `readAccessor` — silent-corruption correctness holes today (strid…
- Multi-primitive meshes — import every `primitives[]` entry, not just `[0]`; multi-material meshes currently drop geometry silently
- Import `TANGENT` into the existing canonical-layout slot when present (stop zero-filling), falling back to zero-fill otherwise
- Core-spec materials/textures/samplers import — parse `materials`/`textures`/`images`/`samplers` and map metallic-roughness onto `@flighth…
- Animations import into the `@flighthq/animation` core — glTF channel/sampler/clip map straight onto `AnimationTrack`/`AnimationChannel`/`…
- Validation and diagnostics: check `asset.version`; return a sentinel (with warning) on malformed JSON instead of a raw `JSON.parse` throw…
- OBJ/MTL importer — charter Decision 2026-07-03 ("the home for all 3D file format parsing"); cheap, high value for test assets, and justif…
- Narrow the public schema surface — export `GltfDocument` from the barrel and keep the remaining `Gltf*` wire types internal (they are for…

### tileset (stub 25)

- Fix the `buildTilesetRegions` correctness edges
- Pass `margin`/`spacing` through the loaders
- Add `disposeTileset`

### skeleton (stub 27)

- Entity quartet: `cloneSkeleton`, `disposeSkeleton`, `equalsSkeleton` (charter Decision 2026-07-03)
- CPU linear-blend-skinning kernel — a buffer-level `skinVertices(outPositions, outNormals, positions, normals, joints, weights, jointMatri…
- Joint names on `Skeleton` plus `getSkeletonJointIndexByName` (sentinel `-1`) — the importer/attachment seam; the type currently has no pl…
- `validateSkeleton` — sentinel-returning check that `inverseBindMatrices.length === joints.length × 16`; a mismatch currently reads/writes…
- Make the palette an explicit `out` parameter — `computeSkeletonJointMatrices` and `setSkeletonBindPose` take `Readonly<Skeleton>` yet wri…
- `getSkeletonJointWorldMatrix`-style attachment accessor (prop socketing by joint index/name), once names land

### filters-css (partial 30)

- Restore buildability — resolve the dangling `./svgFilterUrl` re-export
- Run `tsc -b` and `npm run exports:check` on the head before re-submitting

### filters-math (partial 30)

- Gaussian kernel weight generation
- Linear-sampling weight/offset pairing
- Downsample-level selection for large sigmas
- `getBevelFilterOffsets`
- Package Map entry

### shortcut (partial 30)

- Remove dead `'Enter'` display entry

### picking (partial 32)

- Extract `pickSceneWithRay3D(scene, ray, out)` and make `pickScene` the thin camera wrapper over it — the general primitive (VR controller…
- Enrich `SceneHit` with `triangleIndex` and the geometric face normal (flat `normalX/Y/Z` scalars, matching the existing flat-point shape)…
- Skip non-visible meshes by default — hidden meshes are pickable today
- Query options per the charter Decision set: optional predicate filter, near/far distance limits (`maxDistance`), and backface-cull vs dou…
- `pickSceneAll` (every hit, sorted by distance, into a caller-supplied array) — charter Decision 2026-07-03
- Coverage and hygiene: a transformed (rotated/scaled) mesh test — the exact path the local-space design exists for; an orthographic non-sq…

### font (partial 33)

- Fix the `loadFontFromName` quote-escaping bug
- Add magic-byte `detectFontFormat(bytes)`
- Load-status queries — `isFontLoaded(family, style?)` (`document.fonts.check`) and a `document.fonts.ready` wrapper
- Rename `inferFontFormat` → `inferFontFormatFromUrl`
- Strengthen the loader tests

### clipboard (partial 35)

- Fix `ClipboardFormat` constant usage

### device (partial 35)

- Evaluate `detectDesktopUa` refactor to use `@flighthq/useragent`

### geolocation (partial 35)

- Fix `floorLevel` bug
- Rename `Geo*` → `Geolocation*` prefix

### haptics (partial 35)

- Fix `triggerHapticImpact` default intensity

### ipc (partial 35)

- Fix test fixture method mismatches

### power (partial 35)

- Add `enablePowerSignals` opt-in gate

### screen (partial 35)

- Implement `getScreenNearestRect` with actual nearest-screen logic
- Remove structural divider comments in test file

### share (partial 35)

- Remove dead `_signalSubscriptions` map

### statusbar (partial 35)

- Make `enableStatusBarSignals` actually gate signal cost

### xml (partial 35)

- Fix `>` inside quoted attribute values
- Fix DOCTYPE internal-subset stripping
- Correct the "pull-style" package description
- Add the small query-helper layer

### application (partial 38)

- Rebuild missing types in `@flighthq/types`
- Remove dead `LoopState.accumulated`
- Package Map description update

### dialog (partial 38)

- Fix `buildFileSystemAccessTypes` empty-accept edge case

### loader (partial 38)

- Rebuild missing types in `@flighthq/types`
- Extend the `ResourceLoader` interface with missing signals/payloads
- Remove the false "tracking shim" comment
- Package Map description update

### textinput (partial 38)

- Fix Home/End to be line-relative
- Export the eight missing functions from the barrel
- Package Map description update

### timeline (partial 38)

- Add `disposeTimelineSignals(timeline)`
- Simplify or document the `setMovieClipSource` signal re-wire branch
- Document the frame-skip accounting contract

### tray (partial 38)

- Fix `getTrayIconBounds` return type to use `RectangleLike`

### animation (partial 40)

- Replace the linear keyframe scan in `sampleAnimationTrack` (from index 0 every call) with binary search — internal change, no API impact
- Promote the sample-every-channel loop into the core as `sampleAnimationClip` (caller-supplied output buffer or per-channel visitor) so `s…
- Finished/looped notification behind an `enableAnimationPlayerSignals` opt-in — the review notes the SDK's `@flighthq/signals` + `enable*`…
- Loop modes on `AnimationPlayer`: ping-pong and finite repeat count alongside the existing boolean `loop`
- Player verbs and accessors: `playAnimationPlayer` / `stopAnimationPlayer` (symmetric with the existing `seekAnimationPlayer`) and `getAni…
- `validateAnimationTrack` — sentinel-returning check for ascending times and `values.length === keyCount × components` (a malformed track …
- Track/clip utilities: `trimAnimationTrack`/subclip, key reduction, and `cloneAnimationTrack` / `cloneAnimationClip` / `cloneAnimationPlayer`

### log (partial 40)

- Rebuild missing types in `@flighthq/types`
- Remove 3 structural divider comments
- Package Map description update

### useragent (partial 42)

- Desktop-mode iPad correctness fix
- Fix the iOS third-party-browser version extractors
- Deduplicate the OS version regexes
- Document the frozen-UA caveats

### keyboard (partial 45)

- Document `transition.height` limitation

### network (partial 45)

- Fix `detectNetworkReachability` fallback
- Fix `anyAbortSignal` listener leak

### sensors (partial 45)

- Fix dead ternary

### shell (partial 45)

- Rename `openExternalUrl` to `openShellExternalUrl`

### textlayout (partial 45)

- Fix justification to distribute across actual word spaces
- Package Map description update

### textureatlas (partial 45)

- Draw-placement helpers
- Region management symmetry
- Tighten `setTextureAtlasRegion`
- Entity quartet + trivial predicates
- Explicit name index
- Rename `addTextureAtlasRegionRectangleXY` → `addTextureAtlasRegionCorners`
- Fix the stale package.json description

### textureatlas-formats (partial 50)

- Adopt the registry pattern from `spritesheet-formats`
- Add serializers
- Surface page/meta data

### filters-canvas (partial 58)

- Fix the `index.ts` export order
- Drop the `as number[]` cast in the `ColorMatrixFilter` arm
- Compose the three CSS arms over the existing leaves instead of re-implementing them
- Delegate the CSS-expressibility predicate to `filters-css` rather than re-deriving it

### protocol (partial 58)

- Fix type error

### render (partial 58)

- Delete `beginRenderProxyUpdate`
- Collapse `updateDisplayObjectRenderTransform` into `updateRenderProxy2DTransform`
- Convert `installRenderAdaptHook` from global to per-state
- Fix `computeRenderProxyWorldBounds` to use real world bounds
- Move `computeTextFormatFontString` to `@flighthq/text`
- Add `enableRenderGuards(state)` and `explainRenderState(state, root)` (sibling guard/explain modules)

### spritesheet-formats (partial 58)

- Unify dispatch to registry-only -- built-in formats self-register via import instead of hardcoded switch
- Update package description (ships 5 formats, description is stale)

### text (partial 58)

- Flag textlayout's `_text` parameter for removal

### texture (solid 58)

- Define CubeFace constants (`CubeFacePositiveX`, `CubeFaceNegativeX`, `CubeFacePositiveY`, `CubeFaceNegativeY`, `CubeFacePositiveZ`, `Cube…
- Remove unused `@flighthq/resources` dependency from package.json

### image (solid 62)

- Fix `loadImageResourceFromUrl` abort handling
- Type `crossOrigin` as `'anonymous' | 'use-credentials'`
- Extend `detectImageMimeType` with AVIF/HEIC (ISO BMFF `ftyp` brands), SVG (`<?xml`/`<svg` text sniff), and ICO signatures
- Rename `isImageResourceSameOrigin` → `isImageUrlSameOrigin`

### input (solid 62)

- Type `getGamepadAxisName`/`getGamepadButtonName` mapping parameter as `GamepadMappingKind`
- Name the key-repeat-timer handle
- Fix implicit `any` in test file
- Package Map description update

### sprite (partial 62)

- Add `@flighthq/signals` to `packages/sprite/package.json` dependencies
- Replace inline `{ x: number; y: number }` out-params with `Vector2Like`
- Add a named constant for the deletion sentinel

### media (partial 64)

- Fix `pauseAllAudioMixerChannels` / `resumeAllAudioMixerChannels`
- Add `destroyAudioMixer`
- Bound `busToMixerRuntimes`
- Package Map description update

### textshaper (partial 66)

- Rename `shapeText` → `measureText`
- Forward `options` through `shapeTextRunInto`
- Drop gratuitous cast in `getFontUnitScale`
- Fix signal type mismatch
- Normalize unused `format` parameter naming
- Package Map description update

### scene (solid 68)

- Remove dead no-op ternaries in raycaster
- Replace literal casts with `createVector3` in raycast hit construction

### filters (partial 70)

- Move `BitmapFilterMargin` to `@flighthq/types`
- Update Package Map description for filters

### velocity (solid 70)

- Remove `contributeAffineVelocity`
- Tighten `getVelocitySampleAt` matrix parameter to `Readonly<Matrix>`
- Add Package Map entry for velocity

### surface (solid 72)

- Collapse `SurfaceConvolutionEdge` into `SurfaceEdgeMode`
- Add `SurfaceEdgeMode` parameter to geometric ops missing it
- Add `SurfaceResizeMode` parameter to geometric ops missing it
- Update Package Map description for surface

### surface-rs (solid 72)

- Revert `floodFillSurface` to the 4-arg reference signature in `surfaceWasm.ts` — delete the `_visited` parameter
- Fix two reference call sites in `surfaceWasm.test.ts` — drop `refVisited`/`rsVisited` from `floodFillSurface` calls and `scratch` from `s…

### webcam (solid 74)

- Fix `null as any` cast

### scene-gl (solid 75)

- Wire `hasGlMeshGeometryUv1` into the standard-PBR `bind()` so the `HAS_UV1` path stops being dead surface
- Remove the dead `normalMatrix` field from the draw entry (or honor the placeholder)
- Collapse the two identical pool helpers into one `acquireDrawEntry(pool)`
- Capture the `mesh-blend-transparency` functional baseline

### tween (solid 76)

- Add the `onYoyo` (direction-flip) signal
- Document the unit-agnostic time contract in source
- Pin the `seekTween`-to-end completion behavior with a test + comment
- Fix the `Tween.onComplete` doc comment

### host-electron (solid 78)

- Add missing `@flighthq/storage` dependency

### scene-wgpu (solid 78)

- Mark the dormant `HAS_UV1` key field as inert in-source

### mesh (solid 80)

- Fix copy-paste doc comments (`getMeshGeometryVertexNormal` says "position")

### spritesheet (solid 80)

- Fix `seekSpritesheetPlayerToFrame` for non-forward directions
- Add non-forward-direction tests for the seek path
- Migrate `SpritesheetData`/`SpritesheetAnimationData`/`SpritesheetFrameData` to `@flighthq/types`
- Migrate `loop: boolean` to `repeatCount: number` on `SpritesheetAnimation`

### textshaper-canvas (solid 80)

- Fix the advance-cache key to include `letterSpacing` (and every advance-affecting field the context sets)
- Add a colocated regression test that pins the cache-key fix
- Return a non-zero `unitsPerEm` (identity `size`) from `getFontMetrics` instead of `0`
- Probe a descender glyph in the `getFontMetrics` ascent/descent fallback

### camera (solid 82)

- Remove stream-of-consciousness comment in `basis.ts` ("wait, this is col 1 of R" / "Actually...")
- Investigate `getCameraLinearDepth` ortho path -- may be load-bearing

### displayobject (solid 82)

- Drop the stale `@flighthq/textlayout` dependency
- Add guarded `setStageFullScreenWidth` / `setStageFullScreenHeight` setters
- Disconnect the prior loader's slots in `setLoaderResourceLoader`

### particles (solid 82)

- Resolve `computeParticleSpawnOffset` public/internal status
- Alphabetize `createParticleEmitterConfig` returned object fields
- Add a deterministic-replay test
- Document the redundant `'edge'` spawn shape
- Fix spawn shape type alignment

### displayobject-gl (solid 84)

- Fix the inaccurate word in the new `glTestHelper.ts` docstring
- Replace the `as unknown as` casts in `createGlShapeData` / `createGlTextLabelData` with a typed runtime-slot accessor
- Track the orphan `GlBitmapSamplingLike` so it cannot rot

### effects-gl (solid 84)

- Record GL effects + stand-ins in `render-backend-support.md`

### interaction (solid 84)

- `registerDefaultHitTestPoints()`
- Document traversal-order difference
- Spatial area queries
- Overlap family
- `HitTestResult` type
- `findGraphHitTargetDetailed(source, x, y, out, shapeFlag?)`
- `registerHitTestDetailed(kind, fn)`
- Per-node interaction gating
- `hitArea` proxy
- `suppressTouchHover`
- Shape-accurate picking
- Tilemap/QuadBatch real sub-index picking
- Clip-aware picking

### render-gl (solid 84)

- Fix the non-compiling `glFullscreenPass.test.ts` before this delta merges (blocking)
- Keep the three clean test files as-is
- (Contingent on keeping the fullscreen file) use a constructor for the `makeTarget` fixture

### render-wgpu (solid 84)

- Remove the dead branch and redundant runtime fetch in `drawWgpuFullscreenPass`
- Guard the timestamp readback against its multi-frame `mapAsync` hazard
- Add `generateWgpuTextureMipmaps` and mip/anisotropy sampler support
- Move `@flighthq/displayobject` from `dependencies` to `devDependencies` (after confirming it is test-only)

### shape (solid 84)

- Exact cubic bezier extrema in `computeShapeLocalBoundsRectangle`
- Per-span stroke-aware bounds
- Handle `drawTriangles` in bounds and fill
- Honor `drawPath` winding in `getShapeFillRegions`
- Remove the meaningless `getShapeBounds` aliasing comment
- Typed readback/round-trip: `shapeGraphicsData.ts`
- Add `@flighthq/path` as a dependency

### materials (solid 86)

- Migrate `LinearColor`, `HslColor`, `HsvColor` type definitions to `@flighthq/types`
- Fix stale `hslToRgb` doc comment (copy-pasted from `rgbToHsl`)
- Rename `createColorTransform` parameter from `obj` to `options` and add `Readonly<>`

### particles-formats (solid 86)

- Unify dispatch to registry-only -- merge hardcoded if-chain with open registry so built-in codecs self-register
- Remove or implement `PhaserParticleFormatKind` ghost in `@flighthq/types`
- Update package description (ships 6 formats, names only 3)

### node (solid 87)

- Drop stale "proposed" / "DRAFT" language from any remaining doc references

### displayobject-canvas (solid 88)

- `LineScaleMode 'horizontal'` / `'vertical'`
- Image-smoothing parity audit
- Draw-walk state-minimization extension
- Particle-emitter additive fast path
- Degenerate-input sentinel tests

### effects-canvas (solid 88)

- Remove the dead `cr`/`cg`/`cb` bindings in `canvasSharpenEffect.ts`
- Delete or correct the self-contradicting barrel comment
- Add a passthrough stub file for `ScreenSpaceShadowsEffect`
- Harden the `ToneMap`/`Exposure` `approximate`-tier comments

### effects-wgpu (solid 88)

- Fix the stale "45 effects / 45 runners" count to 44
- Add a deterministic unit-assertion tier the jsdom env can run, above the "is a function" floor

### filters-surface (solid 88)

- Replace raw kind-string literals with the imported `*Kind` constants in `surfaceFilterComposite.ts` and `surfaceFilterBounds.ts`

### lighting (solid 88)

- Fix non-re-entrant module-level scratch in `hasLightInfluenceOnBounds` (use local or pool)

### math (solid 88)

- Fix the `previousPowerOfTwo` doc comment
- Remove the duplicate `RandomSource` re-export
- Add an `lcm` overflow doc note
- Document `saturate`'s NaN behavior and implement GPU semantics
- Update `package.json` description
- Run `npm run order:check` confirmation

### path (solid 88)

- Cache the pen position so `getPathLastPoint` is O(1)
- Route the internal command walkers through `forEachPathSegment`
- Expose `dashPath` independently of `strokePath`
- Add `getPathContourLengths`
- Add `getPathNearestPoint` (closest-point-on-path)
- Add `simplifyPath` (Douglas-Peucker decimation)
- Add `fitPathCurves` (Schneider polyline → bezier fitting)
- Add `offsetPath` (inset/outset by distance)
- Promote `StrokeStyle` to `@flighthq/types`

### displayobject-dom (solid 89)

- HiDPI follow-up for `drawDomBitmap`
- Wire `enableDomRasterFilterSupport(state)`
- Further SVG exact-filter paths: `ConvolutionFilter` → `<feConvolveMatrix>`, `DisplacementMapFilter` → `<feDisplacementMap>`

### types (solid 89)

- ~~**Lift the notification seam to `id`.**~~ _Already done._ `notify` returns `Promise<string>` (the id), all subscribers use `id`
- Remove the "should become open" note from ParticleForce/ParticleCollider
- ~~**Fix DOM/Dom casing.**~~ _Already done._ Files are `DomRenderOptions.ts`, `DomStageRectangle.ts`
- Extract `TextDirection` alias
- Document `glyphCount` on `ShapedRun`

### displayobject-wgpu (solid 90)

- Stats integration test
- Degenerate-input sentinel hardening
- Velocity-writer coverage for the remaining drawable kinds

### effects (solid 90)

- Add `FilmicToneMapOptions` / `AgxToneMapOptions`
- Add Package Map entry for effects

### filters-gl (solid 90)

- Correct the `clearGlFilterProgramCache` documentation to match its actual behavior
- Add `getBlurFilterGlScratchCount`
- Note the blur scratch-count exception in the status framing

### filters-wgpu (solid 90)

- Document the gradient-ramp / pipeline-cache eviction split at the teardown call site

### geometry (solid 90)

- Fix `getQuaternionEuler` extraction (correctness defect)
- Closest-point / distance suite
- `expandAabbBySphere` should take `Readonly<BoundingSphereLike>`
- Document `setQuaternionLookRotation`'s axis convention in JSDoc
- Numerical / edge-case hardening
- Batch / performance pass
- Add `enableGeometryPoolGuards()` (guarded pool mode)

### sdk (solid 90)

- Add completeness check to `packages:check`

### signals (solid 90)

- Delete `disconnectAllSignals` alias
- Delete `connectSignalAtRate` alias

### entity (solid 92)

- Drop "node" from `package.json` description
- Migrate `guards.ts` warnings to `@flighthq/log`

### easing (authoritative 96)

- Tighten the `easeStep` doc-comment's CSS mapping
- Name `easeSmoothstepRange`'s return type in `@flighthq/types`
- Refresh the Package Map line for `@flighthq/easing`

## No open Recommended items

`storage` · `app` · `updater` · `notification` · `platform` · `filesystem` · `lifecycle` · `clip` · `menu`

## Liveness — which stage each stale cell needs next

Computed from cell front matter (dates are `updated:`/`lastDirection:` fields). The review loop works this list to keep everything above trustworthy; workers can ignore it.

- **Needs a direction session (charter stub or never directed):** `clock` · `movieclip` · `particle-emitter` · `path-boolean` · `path-formats` · `shape-formats` · `textshaper-canvas` · `textureatlas-formats` · `xml`
- **Needs a first review (built, no review.md):** _none_
- **Needs re-review (work landed after the survey):** `displayobject-wgpu (review 2026-06-24 < status 2026-06-25)` · `tween (review 2026-06-24 < status 2026-06-25)`
- **Needs assess refresh (review newer than assessment):** _none_
- **Open directions awaiting the user:** 513 across 103 charters — most-loaded: `scene` (13) · `displayobject-gl` (12) · `render-gl` (12) · `displayobject` (11) · `displayobject-dom` (10) · `effects-wgpu` (10) · `filters-css` (10) · `lighting` (10) · `scene-gl` (10) · `spritesheet-formats` (10) · `displayobject-canvas` (9) · `filters-canvas` (9) · `mesh` (9) · `render-wgpu` (9) · `displayobject-wgpu` (8) · `effects-gl` (8) · `filters-gl` (8) · `filters-surface` (8) · `geometry` (8) · `materials` (8) · `particles-formats` (8) · `scene-wgpu` (8) · `camera` (7) · `filters-wgpu` (7) · `render` (7) · `timeline` (7) · `capture` (6) · `effects-canvas` (6) · `filters` (6) · `image-codec` (6) · `loader` (6) · `tween` (6). Each charter's `## Open directions` section holds the questions; a direction session drains them.
