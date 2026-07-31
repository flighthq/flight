# Package TODO Index

_Generated 2026-07-31 by `node agents/packages/todo.mjs` — do not edit by hand. Sources: each cell's `review.md` (status/score), `assessment.md` (Directed, Recommended, and Depth gaps), `charter.md` (chartered-unbuilt detection), and `register.md › Build queue`. Regenerate after assessments or the register change._

One line per tracked item. For detail, read only the named package's cell: `agents/packages/<name>/assessment.md` (and its `charter.md` for the rules). `Directed` is user-approved program work, `Recommended` is sweep-safe but **not yet approved**, and `Depth gaps` is surveyed domain depth awaiting prioritization.

## Create — chartered, not yet built

Blessed charters with no code behind them. Start from the charter; add a register + Package Map entry with the code.

- **`future`** — `@flighthq/future` is the SDK's **portable async contract**. It disambiguates *what Flight's
- **`markup-tokenizer`** — `@flighthq/markup-tokenizer` is the reserved home for the **lenient angle-bracket lexer** that sits *below* markup meaning — the layer that turns a `<b>hi <i>there</i></b>`-style string into a flat stream of text runs and open/close/void tag tokens (name + entity-decoded attributes), tolerating malformed input rather than rejecting it. It is the parse-structure half of markup, distinct from the meaning half (`text-markup`'s tag registry, which maps a tag name to its `TextFormat` contribution).
- **`physics3d`** — 3D rigid-body dynamics: a constraint solver over 3D collision shapes (sphere, box, capsule, convex hull, triangle mesh), producing contact resolution, friction, restitution, joints, and sleeping in three dimensions. The 3D physics engine — Bullet/Rapier/PhysX territory — as a plain-data simulation with explicit step.

## External — spun out to another repo (not built here)

Charter kept here for reference; the code and its crate live in the named repo. Not local work.

- **`surface-rs`** — built in `flight-rs`

## Absorbed — historical cells folded into another package

These cells retain their direction/review history, but are not packages to recreate or deepen independently.

- **`camera2d`** → `@flighthq/camera`
- **`lottie-formats`** → `scene2d-formats`
- **`rive-formats`** → `scene2d-formats`
- **`skeleton`** → `@flighthq/skeleton3d`
- **`sprite`** → `@flighthq/scene2d + @flighthq/quadbatch + @flighthq/tilemap + @flighthq/particleemitter`
- **`svg-formats`** → `scene2d-formats`

## Rust-intended — designated for a Rust impl elsewhere (this repo names + scopes; built there)

This repo is the upstream naming/architecture authority for these cells; the Rust implementation is built in the named repo (which treats this repo as upstream). The charter here fully specifies the intended contract — do NOT scaffold a TS package for it here.

- **`textshaper-harfbuzz`** → built in `flight-rs` — `@flighthq/textshaper-harfbuzz` is the **full-glyph text-shaping backend** — a `TextShaperBackend` (the swappable seam in `@flighthq/textshaper`) implemented over a HarfBuzz-equivalent shaper (**rustybuzz**), doing real OpenType **GSUB/GPOS** shaping: ligatures, contextual substitution, mark positioning, kerning, and complex-script (Arabic/Indic) shaping. It is the production upgrade from the advances-only `@flighthq/textshaper-canvas` default — the one that makes typographically-correct, complex-script text possible.

## Reserved — name/concept held, do NOT build yet

Deliberately not-yet-built cells; the charter reserves the name and records when it becomes worth building. Do not pick these up as work.

- **`session`** — **RESERVED — do not build yet.** `@flighthq/session` reserves the name and concept for a future **observable live-state container**: the mutable "current run / document / play session" model that the app reads and writes each frame, sitting between the `@flighthq/flow` mode machine (which sequences the app through modes) and `@flighthq/snapshot` (which freezes and restores that state).

## Create — ranked candidate queue (from register.md)

Re-ranked after the 2026-07 build-out. The 2026-07-03 queue's entire top tier is **built**: `net`, `socket`, `assets`, `collision`, `spatial`, unified `camera`, `accessibility`, plus the whole 2D-game / animation / `-formats` blocks (`flow`, `spring`, `motionpath`, `clock`, `intl`, `permissions`, `scene`, `picking`, `animation`, `skeleton3d`, `font`, `image-codec`, `texture-formats`, `tilemap-formats`, and the full text/glyph bitmap cluster `glyphatlas`/`bitmapfont`/`bitmapfont-formats`/`bitmaptext`).

**Struck 2026-07-31** — verified against `packages/` and found already built while still listed as queue items: the whole text itemization cluster `textsegment` / `textbidi` / `text-markup` (old tier 1), both host backends `host-tauri` / `host-capacitor` (old tier 3), and `mediasession` (old tier 4). The one unbuilt member of the old text tier, `textshaper-harfbuzz`, is a **rust-intended** cell — named and scoped here, implemented in `flight-rs` — so it is not local work and does not belong in this queue at all. What genuinely remains, re-ranked by foundational-ness and unblocked-ness:

1. **3D bedrock deepening** — execute in dependency order, with exhaustive GL behavior proof at each wave:
   1. **Frame/target contract:** integrate `ApplicationRenderView`, partial-target viewport/scissor and
      composable Extended PBR; finish truthful render-target storage axes, float capability negotiation,
      MSAA resolve isolation, deterministic GL teardown, and the HDR/output-transform contract.
   2. **Material/lighting transport:** make Standard/Extended PBR combinations physically coherent across
      punctual and IBL paths; assemble real opaque scene color for transmission; keep every extension and
      resource lister independently tree-shakable. Shadows/probes begin only on these settled inputs.
   3. **Prepared-scene semantics:** unify explicit scene preparation across rendering, bounds, picking,
      morph, skin, billboard, instance, and selected LOD. Prove morph+skin composition and clone-safe
      ownership before acceleration. Animation mixing/pose composition belongs in this wave.
   4. **Resource/import truth:** complete texture channel/format upload, mip/residency state, environment
      cache invalidation, scene-resource retry/diagnostics, and full scene-format material/texture/sampler/
      animation results with real fixtures.
   5. **Scene scale and breadth:** realize instancing and LOD end to end, then true-3D particle render feeds,
      unified transparent ordering, forward-light budgets, directional/spot/point shadows, and probes.
   6. **Advanced consumers:** explicit normal/material/velocity/history attachments followed by real
      SSAO/DoF/TAA/motion blur/SSR behavior, then optional BVH/refit and visibility acceleration.

   Commission WGPU parity only after each GL contract has raster evidence. A general render graph,
   occlusion system, reversed-Z, full mesh simplification, and physics3d remain later layers rather than
   prerequisites for these atoms.
2. **Platform-suite opportunistic** — clean cells like clipboard/dialog: `biometrics`, `purchase`, `calendar`, `contacts`.
3. **Infra / tooling** — `devtools`, `testing`. The `tool-*` suite has begun (`tool-capture`); `testing`/`devtools` may land as `tool-*` cells rather than SDK packages.
4. **`compute-wgpu`** — GPU compute backend (enables GPU particles/physics later).

Design calls to settle before building the affected entries:

- **Scene serialization** — the aligned name `scene-formats` is taken by the glTF importer; native save/load + versioned migration needs a fold-in or a distinct name (`scene-save`? `scene-document`?).
- **`render-graph`** — its own later design pass after explicit attachment/pass contracts are behaviorally proven; do not make it a prerequisite for viewport, PBR transmission, effects inputs, or shadows.
- **The `animation`/`skeleton3d`/`tween`/`timeline` boundary** — now that all four are built, revisit for overlap (anchor: the `clock` charter).

## Deepen — Recommended items by package (weakest first)

### tray (partial 38)

- Web-backend `isDestroyed` returns true for every id, including ids never created

### useragent (partial 42)

- Decide what `parseUserAgentEngineVersion` means on webkit

### textureatlas (partial 45)

- **Decide whether `TextureAtlasRegion.id` should be an opaque handle rather than a caller-visible
- `getTextureAtlasRegionSequence` allocates a new array per call
- `getTextureAtlasRegionTexture` keys its cache on the atlas *and* region object

### scene3d-formats (partial 46)

- Rule on the mesh encoding vocabulary before importing higher vertex channels (Depth gap 2)
- Rule on the extension-handler seam shape before porting `KHR_texture_transform` (Depth gap 3)
- Rule on a fixture policy before proving real files end to end (Depth gap 4)

### textureatlas-formats (partial 50)

- Surface page/meta data — but it needs somewhere to go first
- Add serializers — blocked on item 1

### font (partial 52)

- `Font` and `FontResource` carry two separate copies of the same load logic
- The failure contract is now pinned but was never stated

### spritesheet-formats (partial 58)

- Decide whether an overlapping detector should be resolvable without relying on order
- `libgdxAtlasParse` has no serializer

### text (partial 58)

- **`setRichTextContent`, `setRichTextDefaultTextFormat`, `setRichTextFormatRange`,

### shape-formats (partial 62)

- `explainShapeJsonParse` diagnostics query — still open, but the prescription needs re-confirming before it is built

### spatial (solid 66)

- De-allocate the pair enumeration's cell scan
- Finish the guard coverage `setSpatialIndexingGuard` opened
- Brute-force property tests
- Ray edge-case tests
- Extend the brute-force property tests over the overflow path

### textshaper (partial 66)

- `enableTextShaperGuards` for the pool brackets

### image (solid 68)

- Fix `loadImageResourceFromUrl` abort handling
- Type `crossOrigin` as `'anonymous' | 'use-credentials'`
- Rename `isImageResourceSameOrigin` → `isImageUrlSameOrigin`

### interaction (solid 68)

- Shape-accurate picking
- Per-node interaction gating
- `hitArea` proxy
- Detailed hit + sub-index
- `suppressTouchHover`
- Clip-aware picking
- Document the bounds fallbacks
- Fix doc slips
- Manifest hygiene
- Register `defaultTextInputHitTestHandler` or unexport it

### permissions (partial 68)

- `getPermissionStates(names)` batch query
- `screen-wake-lock` request router
- `midi` request router
- `explainPermissionState` query
- Justify or remove the identity descriptor table
- Guard module `enablePermissionGuards`

### texture-formats (solid 68)

- Add `explain*` diagnostics for parse rejection

### tilemap-formats (solid 68)

- Model object `rotation` and `visible`
- Model layer `tintColor`, `parallaxX`/`parallaxY`, and `class`
- Model map stagger/hex parameters
- Model tileset `tileOffset` and `objectAlignment`
- `formatTiledTmj` + standalone tileset formatters
- Diagnostics layer per the inversion rule

### tween (solid 68)

- Pin the `seekTween`-to-end completion behavior with a test + comment

### collision (solid 70)

- Degenerate-shape hardening tests
- Magnitude-relative epsilons
- Deterministic MTV tie-break
- `enableCollisionGuards` + `explainCollisionTest`
- Aliasing tests for `out` manifolds

### image-codec (solid 70)

- Add `explain*` queries for the silent sentinels
- Test the `decodeImagePremultiplied` auto-detect path

### assets (solid 72)

- `explainAssetLoad(library, id)` diagnostic query
- `enableAssetGuards` module
- Residency introspection

### bitmap (solid 72)

- Give `displaceBitmap` an explicit `BitmapEdgeMode`

### capture (solid 72)

- `explain*` queries for the silent sentinels
- Format-pinning tests against the tooling twin

### host-tauri (solid 72)

- Checkbox/radio menu items
- Window taskbar progress
- `subscribeQuitRequest` via `onCloseRequested`
- Deepen the fake-API tests
- Record the storage omission's reason at the seam
- Seam-coverage audit table

### ipc (solid 72)

- Fix test fixture method mismatches

### notification (solid 72)

- Extract the shared listener-registry + best-effort `setTimeout` scheduler primitive from the two ~95%-duplicated backend factories, leavi…

### textbidi (solid 72)

- N0/BD16 bracket pairing
- Conformance fixture suite
- `explainBidiClassBackend()` + `enableTextBidiGuards`
- Compact-table sanity test

### particles (solid 73)

- Resolve `computeParticleSpawnOffset` public/internal status
- Alphabetize `createParticleEmitterConfig` returned object fields
- Add a deterministic-replay test
- Document the redundant `'edge'` spawn shape
- Fix spawn shape type alignment

### tool-capture (solid 73)

- Real tests for the pure seams of the env-bound modules
- Deliver the clock pin in `launchBrowser`'s init script
- Hash raw decoded RGBA instead of PNG bytes in `captureEntry`
- Doc-comment the shipped `CaptureStatus` shape as the current contract

### binpack (solid 74)

- Best-Area-Fit heuristic
- Occupancy metric
- `explainUnpackedRectangles(rects, options): …`
- Edge-case pinning tests
- Seeded fuzz/property test
- Drop the redundant placement clone in `finalizeResult`

### bitmapfont-formats (solid 74)

- `explainBitmapFontParse(text)`
- Tolerant `chars`-as-object JSON reading
- Cross-variant fixture hardening
- BMFont binary `.fnt` parser

### color (solid 74)

- Split unclamped OkLab inversion from gamut handling
- Move exported HslColor and HsvColor types to the header layer
- Correct the Kelvin out-of-range documentation to match endpoint clamping

### path-formats (solid 74)

- `explainSvgPathData(d)` diagnostic query
- Atomic `appendSvgPathData` failure
- Fix the arc-after-`Z` corner
- Tokenizer edge-case tests
- Name the format options type

### render-gl (solid 74)

- Make render-target pool matching preserve every storage axis
- Preserve heterogeneous MRT formats across resize
- Close fullscreen-present resource ownership
- Replace the unit-blind texture cache with private state-owned binding facts

### socket (solid 74)

- Fix `disposeSocket` terminal state
- `explainSocketSendFailure(socket)` query
- `enableSocketGuards` module
- Test the disposed-socket surfaces
- Alias/`Readonly` audit on `sendSocketMessage`

### spring (solid 74)

- `addSpringImpulse(spring, velocity)`
- Numerical edge tests
- `isSpringSettled` + undamped interaction test/doc

### spritesheet (solid 74)

- Fix `seekSpritesheetPlayerToFrame` for non-forward directions
- Add non-forward-direction tests for the seek path
- Migrate `loop: boolean` to `repeatCount: number` on `SpritesheetAnimation`

### webcam (solid 74)

- Fix `null as any` cast

### scene3d-gl (solid 75)

- Keep UV1 as a vertex-layout fact, not a shader-registration feature
- Delete old IBL textures on rebake
- Add deterministic skybox teardown
- Fix the nonexistent invalidation contract

### bitmapfont (solid 76)

- Supplementary-plane-safe kerning key
- `hasBitmapFontGlyph(font, codepoint)`
- Guards + `explain*`
- Byte-size/summary reporting

### render (solid 76)

- Replace the `'pivotX' in source` duck-type sniff in `isSpatial2DNode` (`renderViewport.ts`)
- Complete the chartered guard/explain set (Approved 2026-07-03, still pending)
- Honor `sceneGraphSyncPolicy` in `prepareScene3DRender` — the 3D dirty short-circuit (Approved 2026-07-09, still pending)
- Delete the dead `RenderTargetSizeOptions` export (`renderTarget.ts`)
- Fix the stale `drawDriver` comment (`renderQueue.ts:114`)
- Convert `collectVisibleMeshes` (`sceneRender.ts`) to the package's explicit-stack walk pattern
- Give `computeRenderTargetSize` an `out`-parameter form (or document the allocation)

### sensors (solid 76)

- Fix dead ternary

### bitmaptext (solid 78)

- Whitespace-class widening (local)
- Truncation
- Guards + `explain*` for missing glyphs
- Document justify × letterSpacing
- Baseline/line query helpers

### dialog (solid 78)

- `FileDialogFilter` cannot express which extension belongs to which MIME type
- An extension-only filter is declared as `application/octet-stream`

### flow (solid 78)

- Reentrancy characterization tests
- `enableFlowGuards`
- Test deepening for lifecycle pairing

### host-electron (solid 78)

- Add missing `@flighthq/storage` dependency

### render-wgpu (solid 78)

- Remove the dead branch and redundant runtime fetch in `drawWgpuFullscreenPass`
- Guard the timestamp readback against its multi-frame `mapAsync` hazard
- Add `generateWgpuTextureMipmaps` and mip/anisotropy sampler support
- Move `@flighthq/scene2d` from `dependencies` to `devDependencies` (after confirming it is test-only)

### scene3d-wgpu (solid 78)

- Mark the dormant `HAS_UV1` key field as inert in-source

### textsegment (solid 78)

- Sentence navigation helpers
- `explain*` for the missing-engine sentinel
- `enableTextSegmentGuards`
- Boundary-helper allocation trim
- Conformance fixtures (light)

### haptics (solid 80)

- Fix `triggerHapticImpact` default intensity

### keyboard (solid 80)

- Document `transition.height` limitation

### mesh (solid 80)

- Extract the shared `vertexFormat.ts` primitive
- Stop allocating a `DataView` + object literal per packed-channel accessor call
- Add a metadata-only geometry clone for weld/compact/expand

### net (solid 80)

- `explainNetResponse(response)` query
- `enableNetGuards` module
- URL-encoded form body helper
- Test the multi-value header flattening
- Document/normalize `total` semantics in the no-stream progress fallback

### power (solid 80)

- Move `_wakeLockSentinel` into the web backend closure
- Trim the vacuous alias-safety comment in `getStatus`

### scene2d (solid 80)

- Delete the dead `internal.ts` module
- Drop the unused `@flighthq/geometry` dependency
- Add `setBitmapSmoothing` / `setBitmapSourceRectangle` setters
- Fix the `package.json` description drift

### shell (solid 80)

- Rename `openExternalUrl` to `openShellExternalUrl`

### shortcut (solid 80)

- Decide the shifted-punctuation key vocabulary
- Decide whether non-Electron physical keys belong in the vocabulary

### textshaper-canvas (solid 80)

- Fix the advance-cache key to include `letterSpacing` (and every advance-affecting field the context sets)
- Add a colocated regression test that pins the cache-key fix
- Return a non-zero `unitsPerEm` (identity `size`) from `getFontMetrics` instead of `0`
- Probe a descender glyph in the `getFontMetrics` ascent/descent fallback

### device (solid 82)

- Evaluate `detectDesktopUa` refactor to use `@flighthq/useragent`
- Remove the `// ---- ... ----` structural divider comment
- `matchMedia`-backed web fills for `colorGamut` / `isHdr`

### filesystem (solid 82)

- Resolve `..` segments in `normalizeFilePath` / `joinFilePath`

### geolocation (solid 82)

- Fix `floorLevel` bug
- Rename `Geo*` → `Geolocation*` prefix

### mediasession (solid 82)

- Widen `MediaSessionAction` to the current W3C registry
- `explainMediaSessionSupport()` probe
- Test the artwork copy and readonly discipline
- Doc-comment the required-fields stance

### particles-formats (solid 82)

- Execute Decision 1 — registry-only dispatch
- Execute Decision 3 — update `package.json` description
- Restore `*ParseResult` naming symmetry
- Remove structural divider comments
- Document and test the Pixi angle convention
- Repair test regressions

### shape (solid 82)

- Land the approved typed round-trip (`shapeGraphicsData.ts`)
- Add `drawTriangles` to `ShapeCommandRegistry`
- Backfill tests for the landed 2026-07-02 fixes
- Fix the false `enableShapeHitTesting` doc comment
- Fix the round-rect hit-test radius truncation
- Manifest hygiene: `@flighthq/geometry` dependency
- Refresh `status.md` on next ingest

### share (solid 82)

- Reconcile the charter's `isShareContentValid` with the shipped `hasShareContentFields`
- `ShareFile` validation seam

### text-markup (solid 82)

- Sanitization/drop guard + `explain*`
- Relative font size
- Linear-time `resolveMarkupFormats`
- Document the `<span class>` one-way rule

### velocity (solid 82)

- Fix the stale `VelocityContributor` doc comment
- Add `explainVelocity` (shakeable query)
- Add a subtree-walk test for `contributeTransformVelocity`
- Pin the reprojection-vs-override semantics with a test
- Rename the mislabeled `velocitySample.test.ts` case

### clip (solid 83)

- Add the guard/`explain*` diagnostics module
- Region-vs-region conservative predicates
- `setClipRegionToContours` in-place retarget
- Close the test blind spots
- Fix the test-file import order

### app (solid 84)

- Honor unsubscribe in the `subscribeReady` web fill
- Alphabetize `getLoginItem` in `createWebAppBackend`

### effects-gl (solid 84)

- Record GL effects + stand-ins in `render-backend-support.md`

### protocol (solid 84)

- Fix type error

### scene2d-gl (solid 84)

- Fix the inaccurate word in the new `glTestHelper.ts` docstring
- Replace the `as unknown as` casts in `createGlShapeData` / `createGlTextLabelData` with a typed runtime-slot accessor
- Track the orphan `GlBitmapSamplingLike` so it cannot rot

### statusbar (solid 84)

- Decide whether `StatusBarInfo.height` should be reported by the web backend at all

### path-boolean (solid 85)

- Add `out?: Path` to `offsetPath` and `simplifyPath`
- DRY the contour→path rebuild loop
- `explain*` queries for the silent empty-path sentinels
- Durable re-entrancy comment on the backend seam
- Same-winding self-overlap fuzz invariant

### materials (solid 87)

- Migrate `LinearColor`, `HslColor`, `HsvColor` type definitions to `@flighthq/types`
- Fix stale `hslToRgb` doc comment (copy-pasted from `rgbToHsl`)
- Rename `createColorTransform` parameter from `obj` to `options` and add `Readonly<>`
- Give the spec-gloss texture drop a shakeable diagnostics seam

### application (solid 88)

- Fold the triplicated `onError` emit guard into one internal helper

### effects-canvas (solid 88)

- Remove the dead `cr`/`cg`/`cb` bindings in `canvasSharpenEffect.ts`
- Delete or correct the self-contradicting barrel comment
- Add a passthrough stub file for `ScreenSpaceShadowsEffect`
- Harden the `ToneMap`/`Exposure` `approximate`-tier comments

### effects-wgpu (solid 88)

- Fix the stale "45 effects / 45 runners" count to 44
- Add a deterministic unit-assertion tier the jsdom env can run, above the "is a function" floor

### scene2d-canvas (solid 88)

- `LineScaleMode 'horizontal'` / `'vertical'`
- Image-smoothing parity audit
- Draw-walk state-minimization extension
- Particle-emitter additive fast path
- Degenerate-input sentinel tests

### types (solid 88)

- Remove the "should become open" note from ParticleForce/ParticleCollider
- Extract `TextDirection` alias
- Document `glyphCount` on `ShapedRun`
- Rename `ViewportAlign`/`ViewportScaleMode` → `StageAlign`/`StageScaleMode`

### node (solid 89)

- Fix the self-import
- Refresh the `invalidateNodeLocalTransform` doc comment
- Drop the type re-export in `hasTransform3d.ts`
- Unify the early-out callback convention
- Type the `computeViewportRenderTransform` casts

### scene2d-dom (solid 89)

- HiDPI follow-up for `drawDomBitmap`
- Wire `enableDomRasterFilterSupport(state)`
- Further SVG exact-filter paths: `ConvolutionFilter` → `<feConvolveMatrix>`, `DisplacementMapFilter` → `<feDisplacementMap>`

### effects (solid 90)

- Add `FilmicToneMapOptions` / `AgxToneMapOptions`
- Add Package Map entry for effects

### path (solid 90)

- Fix the `dashPath` alias bug
- Land the approved walker/flatten dedup (carry-over of approved item #2)
- Out-param tessellation so the pool actually avoids allocation
- Fix `getPathLastPoint` post-CLOSE pen semantics
- Add a curvature query
- Update the `package.json` description
- Replace `strokePath`'s result object literal with `createPath()`

### scene2d-wgpu (solid 90)

- Stats integration test
- Degenerate-input sentinel hardening
- Velocity-writer coverage for the remaining drawable kinds

### entity (solid 92)

- Drop "node" from `package.json` description
- Migrate `guards.ts` warnings to `@flighthq/log`

### geometry (authoritative 92)

- Fix the `translateMatrix` / `translateMatrixByVectorXY` out-param defect
- Document `setPerspectiveMatrix4`'s parameter as tan(fovY/2) and rename the param
- De-allocate the OBB hot paths
- Add the missing pair predicates on existing types
- Add the missing conventional singles
- `transformVector3ByMatrix3` should take `Readonly<Matrix3Like>`
- Doc/style hygiene pass

## Deepen — user-directed programs by package

These are explicit user directions whose implementation may span packages or require staged delivery; they are not blanket-sweep items.

### color (solid 74)

- Enforce create-to-Entity naming and shape

### render-gl (solid 74)

- Add a real partial-target GL pass
- Keep GL runtime noise state-owned and private
- Prove viewport behavior with raster functionals
- Do not create an upward application dependency

### scene3d-gl (solid 75)

- Realize ExtendedPbrMaterial through separately imported extension registrations
- Sample every declared extension map and compose lobes coherently
- Implement transmission as explicit reusable passes
- Follow diagnostics inversion
- Add exhaustive GL behavior tests
- Keep backend caches private to state/runtime
- Keep the vendor-extension seam in the header layer

### render (solid 76)

- Make `RenderTarget` + device-pixel `Viewport` the allocation-free sub-target primitive
- Treat viewport aspect as authoritative at draw time
- Keep `RenderState` as the explicit current command/destination context
- Retire `RenderViewport2D` without inventing a false world-space replacement

### scene3d-resources (solid 76)

- Compose Extended PBR texture discovery through a nested extension-kind registry

### render-wgpu (solid 78)

- Defer `ApplicationRenderView` and partial-target parity until the GL contract settles

### scene3d-wgpu (solid 78)

- Defer PBR-extension parity until the GL contracts and raster evidence settle

### camera (solid 82)

- Finish the single camera package migration
- Use draw-time viewport aspect for rendered projection
- Complete the Entity constructor invariant
- Migrate every Flight functional off the removed Camera surface

### materials (solid 87)

- Replace the standalone PBR-extension material families with one composable lane
- Keep `PbrExtension` open and individually tree-shakable
- Make the lane taxonomy explicit
- Model full extension inputs, including textures and coherent combinations
- Preserve the Entity constructor invariant
- Compose the standard property block, not a nested material
- Make extension names honest about their transport model
- Keep specular-glossiness conversion texture-truthful

### application (solid 88)

- Build `ApplicationRenderView` as the explicit 95% assembly
- Keep package arrows pointing downward
- Lead with GL and defer WGPU assembly parity
- Make synchronization idempotent and window-authoritative
- Complete the Entity constructor invariant in the application domain

### entity (solid 92)

- Enforce the repository-wide `create*` Entity invariant
- Make the migration semantic rather than a cast exercise

## Deepen — surveyed domain-depth gaps by package

These are observed maturity gaps, including intentionally deferred work. They require prioritization or a package direction before execution unless separately approved.

### scene3d-formats (partial 46)

- Make the complete import result truthful
- Carry every common vertex channel and topology
- Replace the remaining inline extension knowledge with open handlers
- Prove real files end to end

### texture (solid 58)

- Separate desired mip policy from effective per-state residency
- Keep scheduling caller-owned
- Complete declared channel/format paths with render proof

### animation (solid 62)

- Keep mixing policy decoupled from bindings
- Complete playback semantics
- Add authoring/runtime utilities without a kitchen sink

### swf (partial 62)

- Recover animated MovieClip timelines
- Materialize visible archive content
- Complete container seams and compatibility coverage

### scene3d (solid 68)

- Realize InstancedMesh around one versioned data entity
- Replace single-node LOD state with per-view selection
- Unify explicit scene preparation around draw entries, not `Mesh[]`
- Resolve shared-geometry deformation ownership
- Add acceleration after semantic correctness

### texture-formats (solid 68)

- Complete the compressed-payload realization seam
- Validate against real tool outputs
- Preserve remaining source interpretation metadata

### image-codec (solid 70)

- Verify decode behavior with canonical real files
- Expose progressive/multi-frame decode as separate seams when demanded

### picking (solid 70)

- Make CPU queries agree with rendered deformation
- Finish instance/LOD hit identity
- Add material-aware and non-triangle selection as opt-in layers
- Add acceleration after semantics

### assets (solid 72)

- Add caller-owned residency budgets and eviction
- Add dependency and progressive-load coordination
- Define the visibility-streaming seam

### capture (solid 72)

- Add behavior assertions above whole-frame fingerprints
- Make unsupported-path diagnostics capturable

### particles (solid 73)

- Finish the dimension-honest 3D simulation primitives
- Preserve a backend-neutral simulation seam
- Complete mature emitter behavior

### color (solid 74)

- Add explicit colorimetry primitives
- Add perceptual authoring spaces deliberately
- Provide the CPU reference for display transforms

### particleemitter (solid 74)

- Finish the 3D node and render feed as real composition
- Offer separable render modes
- Prove ordering and spatial behavior with raster functionals

### render-gl (solid 74)

- Define the HDR display-output contract
- Make float-target negotiation explicit and observable
- Grow color-space metadata beyond linear/sRGB when required
- Complete the device tier only as consumed primitives
- Make all state-owned GPU caches deterministically destructible
- Remove backend implementation noise from the `create*` Entity vocabulary
- Narrow the exported runtime seam
- Disambiguate the compressed-texture upload sentinel, and share one shape classifier

### scene3d-gl (solid 75)

- Make environment caches identity/version aware
- Honor CubeTexture.colorSpace
- Preserve or explicitly own GL state across auxiliary passes
- Define HDR scene presentation
- Unify transparent ordering across subject families
- Finish scene semantic depth before acceleration
- Turn the directional shadow proof into a composable pass
- Realize the declared specular-glossiness texture workflow

### skeleton3d (solid 75)

- Prove composed deformation behavior
- Finish clone-safe morph-plus-skin ownership
- Represent influences beyond the common top four
- Compose poses with animation
- Deepen rigging as separate primitives
- Commission WGPU only after GL evidence

### render (solid 76)

- Defer render-graph machinery until the attachment/pass contracts are proven
- Replace the prepared `Mesh[]` with a truthful draw-entry contract before scale features

### scene3d-resources (solid 76)

- Add residency rather than a larger resolver
- Prove resource realization behaviorally
- Discover specular-glossiness textures through an opt-in lister

### mesh (solid 80)

- Make the interleaved vertex stream byte-native
- Make every declared vertex channel usable end to end
- Complete topology-editing primitives
- Deepen normal/tangent/UV authoring
- Realize instancing and LOD instead of leaving header-only types

### camera (solid 82)

- Keep reversed-Z and off-axis/stereo projection behind the viewport contract
- Make Camera2D multi-viewport semantics explicit

### input (solid 82)

- Introduce the portable `InputBackend` seam
- Open gamepad mapping registration
- Model multi-device identity
- Resolve the signal cost model

### share (solid 82)

- Make asynchronous capability discovery honest
- Carry portable files through native backends

### effects-gl (solid 84)

- Build the reusable GL attachment/history substrate before claiming advanced effects
- Replace color-only stand-ins with behaviorally tested implementations
- Validate HDR-required chains against the effective target, not requested options
- Make adjustment color domains explicit in the pipeline
- Keep shadows outside the effects lane

### statusbar (solid 84)

- Make native state reads and changes honest
- Expose or realize animation capability
- Define style-stack arbitration

### lighting (solid 88)

- Extend the proven directional shadow atom into a separately paid primitive family
- Complete physical light realization
- Add environment/probe lighting as a separate composition tier

### effects (solid 90)

- Define explicit effect-input attachment requirements
- Stop treating stand-ins as feature completion
- Keep attachment production below effect recipes

## No open Recommended items

`storage` · `loader` · `updater` · `texture` · `video` · `animation` · `audio` · `menu` · `swf` · `snapshot` · `media` · `glyphatlas` · `motionpath` · `scene3d` · `timeline` · `picking` · `particleemitter` · `xml` · `skeleton3d` · `log` · `scene3d-resources` · `camera-controls` · `debug` · `lifecycle` · `textlayout` · `adjustments` · `clipboard` · `camera` · `input` · `platform` · `textinput` · `connectivity` · `screen` · `lighting` · `math` · `scene2d-resources` · `sdk` · `signals` · `easing` · `accessibility` · `application-gl` · `clock` · `host-capacitor` · `intl` · `movieclip` · `physics2d` · `scene2d-formats` · `shading` · `skeleton2d` · `skeleton2d-formats`

## Liveness — which stage each stale cell needs next

Computed from cell front matter (dates are `updated:`/`lastDirection:` fields). The review loop works this list to keep everything above trustworthy; it can be ignored when simply orienting in a package.

- **Needs a direction session (charter stub or never directed):** `application-gl` · `future` · `textshaper-canvas` · `textureatlas-formats` · `xml`
- **Needs a first review (built, no review.md):** `accessibility` · `application-gl` · `clock` · `host-capacitor` · `intl` · `movieclip` · `physics2d` · `scene2d-formats` · `shading` · `skeleton2d` · `skeleton2d-formats`
- **Needs re-review (work landed after the survey):** `audio (review 2026-07-13 < status 2026-07-30)` · `glyphatlas (review 2026-07-13 < status 2026-07-30)` · `image-codec (review 2026-07-13 < status 2026-07-31)` · `media (review 2026-06-24 < status 2026-07-30)` · `menu (review 2026-07-13 < status 2026-07-30)` · `particles-formats (review 2026-07-13 < status 2026-07-25)` · `picking (review 2026-07-21 < status 2026-07-31)` · `render-gl (review 2026-07-21 < status 2026-07-22)` · `scene2d-wgpu (review 2026-06-24 < status 2026-06-25)` · `scene3d-formats (review 2026-07-09 < status 2026-07-29)` · `shape-formats (review 2026-07-13 < status 2026-07-30)` · `snapshot (review 2026-07-13 < status 2026-07-30)` · `textshaper (review 2026-06-25 < status 2026-07-30)` · `texture (review 2026-06-25 < status 2026-07-22)` · `timeline (review 2026-07-13 < status 2026-07-31)` · `video (review 2026-07-09 < status 2026-07-30)`
- **Needs assess refresh (review newer than assessment):** `assets (assessment 2026-07-21 < review 2026-07-22)` · `audio (assessment 2026-07-03 < review 2026-07-13)` · `lighting (assessment 2026-07-22 < review 2026-07-31)` · `scene3d-wgpu (assessment 2026-07-21 < review 2026-07-31)` · `video (assessment 2026-07-03 < review 2026-07-09)`
- **Open directions awaiting the user:** 596 across 132 charters — most-loaded: `scene3d` (14) · `render-gl` (12) · `scene2d-gl` (12) · `scene2d` (11) · `lighting` (10) · `scene2d-dom` (10) · `scene3d-gl` (10) · `spritesheet-formats` (10) · `effects-wgpu` (9) · `mesh` (9) · `render-wgpu` (9) · `scene2d-canvas` (9) · `skeleton3d` (9) · `effects-gl` (8) · `geometry` (8) · `materials` (8) · `particles-formats` (8) · `render` (8) · `scene2d-wgpu` (8) · `scene3d-wgpu` (8) · `application` (7) · `scene3d-resources` (7) · `timeline` (7) · `camera` (6) · `capture` (6) · `color` (6) · `loader` (6) · `spatial` (6) · `texture-formats` (6) · `tween` (6). Each charter's `## Open directions` section holds the questions; a direction session drains them.
