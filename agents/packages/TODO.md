# Package TODO Index

_Generated 2026-07-11 by `node agents/packages/todo.mjs` — do not edit by hand. Sources: each cell's `review.md` (status/score), `assessment.md › Recommended` (the sweep-safe work queue), `charter.md` (chartered-unbuilt detection), and `register.md › Build queue`. Regenerate after assessments or the register change._

One line per actionable item. For detail, read only the named package's cell: `agents/packages/<name>/assessment.md` (and its `charter.md` for the rules). `Recommended` items are pre-sorted as sweep-safe but **not yet approved**; check `assessment.md › Approved` for blessed work.

## Create — chartered, not yet built

Blessed charters with no code behind them. Start from the charter; add a register + Package Map entry with the code.

- **`text-markup`** — `@flighthq/text-markup` is the **styled-text markup codec** — the explicit, Flight-way realization of styled-text **`htmlText`** markup. It parses an HTML subset (the `htmlText` tag set) into Flight's rich-text data model — a `RichTextContent` plus its `TextFormatRange[]` — which the existing `RichText`/`TextLabel` display nodes already render. A codec neighbor of `@flighthq/textlayout`'s rich-text model, matching `path-formats`/`shape-formats` (markup string ↔ rich-text data).
- **`textbidi`** — `@flighthq/textbidi` is the **Unicode bidirectional-text itemize layer** (UAX #9) — it resolves the embedding levels of a mixed left-to-right / right-to-left string and reorders its runs from *logical* (storage/typing) order to *visual* (display) order. It is the sibling of `@flighthq/textsegment` (grapheme/word/sentence boundaries): together they **itemize** a string before it is shaped, so that Arabic/Hebrew (and mixed LTR+RTL) text lays out correctly. Without it, an RTL run inside an LTR paragraph renders in the wrong order.

## External — spun out to another repo (not built here)

Charter kept here for reference; the code and its crate live in the named repo. Not local work.

- **`surface-rs`** — built in `flight-rs`

## Rust-intended — designated for a Rust impl elsewhere (this repo names + scopes; built there)

This repo is the upstream naming/architecture authority for these cells; the Rust implementation is built in the named repo (which treats this repo as upstream). The charter here fully specifies the intended contract — do NOT scaffold a TS package for it here.

- **`textshaper-harfbuzz`** → built in `flight-rs` — `@flighthq/textshaper-harfbuzz` is the **full-glyph text-shaping backend** — a `TextShaperBackend` (the swappable seam in `@flighthq/textshaper`) implemented over a HarfBuzz-equivalent shaper (**rustybuzz**), doing real OpenType **GSUB/GPOS** shaping: ligatures, contextual substitution, mark positioning, kerning, and complex-script (Arabic/Indic) shaping. It is the production upgrade from the advances-only `@flighthq/textshaper-canvas` default — the one that makes typographically-correct, complex-script text possible.

## Reserved — name/concept held, do NOT build yet

Deliberately not-yet-built cells; the charter reserves the name and records when it becomes worth building. Do not pick these up as work.

- **`session`** — **RESERVED — do not build yet.** `@flighthq/session` reserves the name and concept for a future **observable live-state container**: the mutable "current run / document / play session" model that the app reads and writes each frame, sitting between the `@flighthq/flow` mode machine (which sequences the app through modes) and `@flighthq/snapshot` (which freezes and restores that state).

## Create — ranked candidate queue (from register.md)

Re-ranked after the 2026-07 build-out. The 2026-07-03 queue's entire top tier is **built**: `net`, `socket`, `assets`, `collision`, `spatial`, `camera2d`, `accessibility`, plus the whole 2D-game / animation / `-formats` blocks (`flow`, `spring`, `motionpath`, `clock`, `intl`, `permissions`, `scene`, `picking`, `animation`, `skeleton`, `font`, `image-codec`, `texture-formats`, `tilemap-formats`, and the full text/glyph bitmap cluster `glyphatlas`/`bitmapfont`/`bitmapfont-formats`/`bitmaptext`). What genuinely remains, re-ranked by foundational-ness and unblocked-ness:

1. **Text itemization + shaping cluster** — the typography bottleneck, now unblocked (the shaper seam is glyph-bearing and bitmap text just landed). `textsegment` (grapheme/word/line segmentation; upstream `unicode-segmentation`) and `textbidi` (bidi itemization; upstream `unicode-bidi`) are the itemize layers correct international layout sits on; `textshaper-harfbuzz` (GSUB/GPOS shaping — the TS backend seam + registrar is local, the heavy rustybuzz impl → `flight-rs` like `surface-rs`); `text-markup` (markup → rich-text `-formats`).
2. **3D lighting build-out** — defers to [`render-architecture.md`](../render-architecture.md) / [`3d-materials-architecture.md`](../3d-materials-architecture.md) as authoritative; sequence core-lit → shadow → IBL. `shadow` (shadow-map pass + PCF seam), `environment` (skybox + IBL bake), `instancing` (GPU instancing). **`render-graph` needs its own design pass FIRST** (it reshapes `render`).
3. **Host backends** — mechanical, mirror `host-electron`: `host-tauri`, `host-capacitor`.
4. **Platform-suite opportunistic** — clean cells like clipboard/dialog: `mediasession`, `biometrics`, `purchase`, `calendar`, `contacts`.
5. **Infra / tooling** — `devtools`, `testing`. The `tool-*` suite has begun (`tool-capture`); `testing`/`devtools` may land as `tool-*` cells rather than SDK packages.
6. **`compute-wgpu`** — GPU compute backend (enables GPU particles/physics later).

Design calls to settle before building the affected entries:

- **Scene serialization** — the aligned name `scene-formats` is taken by the glTF importer; native save/load + versioned migration needs a fold-in or a distinct name (`scene-save`? `scene-document`?).
- **`render-graph`** — its own design pass (reshaping `render`) before shadow/lighting sequencing hardens.
- **The `animation`/`skeleton`/`tween`/`timeline` boundary** — now that all four are built, revisit for overlap (anchor: the `clock` charter).

Resolved / redundant — removed from the candidate set:

- `postprocess` → **covered by the built `effects`** + `effects-gl`/`effects-wgpu`/`effects-canvas` (substrate-agnostic post-process descriptors + per-backend execution).
- `atlas-packer` → **covered by the built `binpack`** (general 2D MaxRects packer under `textureatlas`/`tileset`).

_(A full multi-perspective re-poll of severity/demand — the original June-report methodology — is available on request; this regeneration is the prune-and-rerank against actual built state.)_

## Deepen — Recommended items by package (weakest first)

### filters-css (partial 30)

- Restore buildability — resolve the dangling `./svgFilterUrl` re-export
- Run `tsc -b` and `npm run exports:check` on the head before re-submitting

### shortcut (partial 30)

- Remove dead `'Enter'` display entry

### device (partial 35)

- Evaluate `detectDesktopUa` refactor to use `@flighthq/useragent`

### geolocation (partial 35)

- Fix `floorLevel` bug
- Rename `Geo*` → `Geolocation*` prefix

### haptics (partial 35)

- Fix `triggerHapticImpact` default intensity

### ipc (partial 35)

- Fix test fixture method mismatches

### share (partial 35)

- Remove dead `_signalSubscriptions` map

### statusbar (partial 35)

- Make `enableStatusBarSignals` actually gate signal cost

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

### clipboard (partial 40)

- Fix `ClipboardFormat` constant usage

### log (partial 40)

- Rebuild missing types in `@flighthq/types`
- Remove 3 structural divider comments
- Package Map description update

### screen (partial 42)

- Implement `getScreenNearestRect` with actual nearest-screen logic
- Remove structural divider comments in test file

### useragent (partial 42)

- Desktop-mode iPad correctness fix
- Fix the iOS third-party-browser version extractors
- Deduplicate the OS version regexes
- Document the frozen-UA caveats

### connectivity (partial 45)

- Fix `detectConnectivityReachability` fallback
- Fix `anyAbortSignal` listener leak

### keyboard (partial 45)

- Document `transition.height` limitation

### power (partial 45)

- Add `enablePowerSignals` opt-in gate

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

### xml (partial 45)

- Fix `>` inside quoted attribute values
- Fix DOCTYPE internal-subset stripping
- Correct the "pull-style" package description
- Add the small query-helper layer

### textureatlas-formats (partial 50)

- Adopt the registry pattern from `spritesheet-formats`
- Add serializers
- Surface page/meta data

### skeleton (partial 52)

- Entity quartet: `cloneSkeleton`, `disposeSkeleton`, `equalsSkeleton` (charter Decision 2026-07-03)
- CPU linear-blend-skinning kernel — a buffer-level `skinVertices(outPositions, outNormals, positions, normals, joints, weights, jointMatri…
- Joint names on `Skeleton` plus `getSkeletonJointIndexByName` (sentinel `-1`) — the importer/attachment seam; the type currently has no pl…
- `validateSkeleton` — sentinel-returning check that `inverseBindMatrices.length === joints.length × 16`; a mismatch currently reads/writes…
- Make the palette an explicit `out` parameter — `computeSkeletonJointMatrices` and `setSkeletonBindPose` take `Readonly<Skeleton>` yet wri…
- `getSkeletonJointWorldMatrix`-style attachment accessor (prop socketing by joint index/name), once names land

### filters-math (solid 55)

- Gaussian kernel weight generation
- Linear-sampling weight/offset pairing
- Downsample-level selection for large sigmas
- `getBevelFilterOffsets`
- Package Map entry

### tileset (solid 55)

- Fix the `buildTilesetRegions` correctness edges
- Pass `margin`/`spacing` through the loaders
- Add `disposeTileset`

### filters-canvas (partial 58)

- Fix the `index.ts` export order
- Drop the `as number[]` cast in the `ColorMatrixFilter` arm
- Compose the three CSS arms over the existing leaves instead of re-implementing them
- Delegate the CSS-expressibility predicate to `filters-css` rather than re-deriving it

### font (solid 58)

- Fix the `loadFontFromName` quote-escaping bug
- Add magic-byte `detectFontFormat(bytes)`
- Load-status queries — `isFontLoaded(family, style?)` (`document.fonts.check`) and a `document.fonts.ready` wrapper
- Rename `inferFontFormat` → `inferFontFormatFromUrl`
- Strengthen the loader tests

### picking (solid 58)

- Extract `pickSceneWithRay3D(scene, ray, out)` and make `pickScene` the thin camera wrapper over it — the general primitive (VR controller…
- Enrich `SceneHit` with `triangleIndex` and the geometric face normal (flat `normalX/Y/Z` scalars, matching the existing flat-point shape)…
- Skip non-visible meshes by default — hidden meshes are pickable today
- Query options per the charter Decision set: optional predicate filter, near/far distance limits (`maxDistance`), and backface-cull vs dou…
- `pickSceneAll` (every hit, sorted by distance, into a caller-supplied array) — charter Decision 2026-07-03
- Coverage and hygiene: a transformed (rotated/scaled) mesh test — the exact path the local-space design exists for; an orthographic non-sq…

### protocol (partial 58)

- Fix type error

### render (partial 58)

- Delete `beginRenderProxyUpdate`
- Collapse `updateDisplayObjectRenderTransform` into `updateRenderProxy2DTransform`
- Convert `installRenderAdaptHook` from global to per-state
- Fix `computeRenderProxyWorldBounds` to use real world bounds
- Move `computeTextFormatFontString` to `@flighthq/text`
- Add `enableRenderGuards(state)` and `explainRenderState(state, root)` (sibling guard/explain modules)
- Honor `sceneGraphSyncPolicy` in `prepareSceneRender` — a 3D dirty short-circuit

### spritesheet-formats (partial 58)

- Unify dispatch to registry-only -- built-in formats self-register via import instead of hardcoded switch
- Update package description (ships 5 formats, description is stale)

### text (partial 58)

- Flag textlayout's `_text` parameter for removal

### texture (solid 58)

- Define CubeFace constants (`CubeFacePositiveX`, `CubeFaceNegativeX`, `CubeFacePositiveY`, `CubeFaceNegativeY`, `CubeFacePositiveZ`, `Cube…
- Remove unused `@flighthq/resources` dependency from package.json

### audio (solid 60)

- Complete the loader matrix — `loadAudioResourceFromBytes`, `FromBlob`, `FromBase64`
- Lifecycle parity with image — `disposeAudioResource`, `cloneAudioResource`, `hasAudioResourceBuffer`, `isAudioResourceEmpty`
- Buffer inspection getters — `getAudioResourceDuration`, `getAudioResourceSampleRate`, `getAudioResourceChannelCount`, `getAudioResourceBy…
- Format family symmetry — rename `inferAudioType` → `inferAudioMimeType`; add magic-byte `detectAudioMimeType`
- Export the codec-negotiation primitive — `selectAudioResourceUrl` / `canPlayAudioType`
- Sample-tier constructors — `createAudioResourceFromSamples(channels, sampleRate)` and `getAudioResourceChannelData`
- Fix the stale package.json description

### video (solid 60)

- Loader options — `crossOrigin`, `muted`, `playsInline`, `preload`, and a readiness mode (`metadata` | `canplay` | `canplaythrough`)
- Lifecycle — `disposeVideoResource` (with the decoder-releasing `removeAttribute('src')` + `load()` sequence), `hasVideoResourceElement`, …
- Inspection getters — `getVideoResourceWidth`, `getVideoResourceHeight`, `getVideoResourceDuration`
- Non-URL sources — `loadVideoResourceFromBlob` and `createVideoResourceFromMediaStream`
- Format family symmetry — rename `inferVideoType` → `inferVideoMimeType`; add magic-byte `detectVideoMimeType` (`ftyp` boxes, EBML/Matrosk…
- Export the codec-negotiation primitive — `selectVideoResourceUrl` / `canPlayVideoType`

### animation (solid 62)

- Replace the linear keyframe scan in `sampleAnimationTrack` (from index 0 every call) with binary search — internal change, no API impact
- Promote the sample-every-channel loop into the core as `sampleAnimationClip` (caller-supplied output buffer or per-channel visitor) so `s…
- Finished/looped notification behind an `enableAnimationPlayerSignals` opt-in — the review notes the SDK's `@flighthq/signals` + `enable*`…
- Loop modes on `AnimationPlayer`: ping-pong and finite repeat count alongside the existing boolean `loop`
- Player verbs and accessors: `playAnimationPlayer` / `stopAnimationPlayer` (symmetric with the existing `seekAnimationPlayer`) and `getAni…
- `validateAnimationTrack` — sentinel-returning check for ascending times and `values.length === keyCount × components` (a malformed track …
- Track/clip utilities: `trimAnimationTrack`/subclip, key reduction, and `cloneAnimationTrack` / `cloneAnimationClip` / `cloneAnimationPlayer`

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
- ~~**Add `simplifyPath` (Douglas-Peucker decimation).**~~ **Done** — ships as `decimatePath` (renamed 2026-07-09 so the CSG `simplifyPath`…
- Add `fitPathCurves` (Schneider polyline → bezier fitting)
- ~~**Add `offsetPath` (inset/outset by distance).**~~ **Done, reassigned** — a correct region offset needs the boolean kernel for self-int…
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

`storage` · `app` · `updater` · `notification` · `platform` · `scene-formats` · `filesystem` · `lifecycle` · `clip` · `menu` · `accessibility` · `assets` · `binpack` · `bitmapfont` · `bitmapfont-formats` · `bitmaptext` · `camera2d` · `capture` · `clock` · `collision` · `debug` · `flow` · `glyphatlas` · `host-capacitor` · `host-tauri` · `image-codec` · `intl` · `mediasession` · `motionpath` · `movieclip` · `net` · `particleemitter` · `path-boolean` · `path-formats` · `permissions` · `shape-formats` · `snapshot` · `socket` · `spatial` · `spring` · `textsegment` · `texture-formats` · `tilemap-formats` · `tool-capture`

## Liveness — which stage each stale cell needs next

Computed from cell front matter (dates are `updated:`/`lastDirection:` fields). The review loop works this list to keep everything above trustworthy; workers can ignore it.

- **Needs a direction session (charter stub or never directed):** `textshaper-canvas` · `textureatlas-formats` · `xml`
- **Needs a first review (built, no review.md):** `accessibility` · `assets` · `binpack` · `bitmapfont` · `bitmapfont-formats` · `bitmaptext` · `camera2d` · `capture` · `clock` · `collision` · `debug` · `flow` · `glyphatlas` · `host-capacitor` · `host-tauri` · `image-codec` · `intl` · `mediasession` · `motionpath` · `movieclip` · `net` · `particleemitter` · `path-boolean` · `path-formats` · `permissions` · `shape-formats` · `snapshot` · `socket` · `spatial` · `spring` · `textsegment` · `texture-formats` · `tilemap-formats` · `tool-capture`
- **Needs re-review (work landed after the survey):** `displayobject-wgpu (review 2026-06-24 < status 2026-06-25)` · `geometry (review 2026-06-24 < status 2026-07-09)` · `render (review 2026-06-25 < status 2026-07-09)` · `tween (review 2026-06-24 < status 2026-06-25)`
- **Needs assess refresh (review newer than assessment):** `animation (assessment 2026-07-03 < review 2026-07-09)` · `audio (assessment 2026-07-03 < review 2026-07-09)` · `filters-math (assessment 2026-07-03 < review 2026-07-09)` · `font (assessment 2026-07-03 < review 2026-07-09)` · `picking (assessment 2026-07-03 < review 2026-07-09)` · `scene-formats (assessment 2026-07-03 < review 2026-07-09)` · `skeleton (assessment 2026-07-03 < review 2026-07-09)` · `tileset (assessment 2026-07-03 < review 2026-07-09)` · `video (assessment 2026-07-03 < review 2026-07-09)` · `xml (assessment 2026-07-03 < review 2026-07-09)`
- **Open directions awaiting the user:** 591 across 129 charters — most-loaded: `scene` (13) · `displayobject-gl` (12) · `render-gl` (12) · `displayobject` (11) · `displayobject-dom` (10) · `effects-wgpu` (10) · `filters-css` (10) · `lighting` (10) · `scene-gl` (10) · `spritesheet-formats` (10) · `displayobject-canvas` (9) · `filters-canvas` (9) · `mesh` (9) · `render-wgpu` (9) · `displayobject-wgpu` (8) · `effects-gl` (8) · `filters-gl` (8) · `filters-surface` (8) · `geometry` (8) · `materials` (8) · `particles-formats` (8) · `scene-wgpu` (8) · `camera` (7) · `filters-wgpu` (7) · `render` (7) · `timeline` (7) · `capture` (6) · `effects-canvas` (6) · `filters` (6) · `loader` (6) · `texture-formats` (6) · `tween` (6). Each charter's `## Open directions` section holds the questions; a direction session drains them.
