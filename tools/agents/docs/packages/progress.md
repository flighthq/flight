# Package Direction Progress

Track which packages have had a direction session, what was dispatched, and what's landed. Updated by the review agent after each session.

## States

| State        | Meaning                                             |
| ------------ | --------------------------------------------------- |
| `—`          | Untouched — no direction session yet                |
| `direction`  | Had a direction session, decisions blessed verbally |
| `dispatched` | Work sent to a builder agent                        |
| `landed`     | Builder work committed                              |

## Core

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| types | direction | 2026-07-02 | 6 decisions blessed: header-layer identity, assertion tests welcome not mandated, Rectangle-shaped types consolidate, ParticleForce/Collider intentionally closed, Signal<T> divergence intentional, notification id model. 2 items already landed (notification id, Dom casing). Builder parcel: 3 tasks (particle notes, TextDirection alias, glyphCount doc). |
| entity | direction | 2026-07-02 | 4 decisions blessed: never-an-ECS, getEntityRuntime asserting fast path, unchecked binding cast intentional, drop "node" from pkg description. Open: guard mode alignment review. Package is feature-complete (92/100). |
| geometry | dispatched | 2026-07-01 | Blessed all 5 open directions: collision math stays, OBB/Capsule in scope, `is*Intersecting*` naming, standard quaternion convention, TS advances independently of Rust. Builder2 parcel: renames + quaternion fix + OBB/Capsule. |
| math | direction | 2026-07-02 | 6 decisions blessed: noise in math, randomColor in math, saturate GPU NaN semantics, particles adopt math exports, as-needed growth model, pkg description update. Approved: 6 sweep items (doc fixes + saturate NaN impl + description + order check). |
| node | landed | 2026-07-02 | 7 decisions blessed: trait boundary, 3D raw-matrix, 3D bounds on node, signals hierarchy-only, skewX/skewY, reparentNode = world-preserving, serialization = new package. Skew + reparentNode code landed. |
| signals | direction | 2026-07-02 | 4 decisions blessed: sync-only boundary, void slot contract, no weak connections, hard-rename policy. Approved: delete 2 deprecated aliases. Open: throttle/debounce home (time pkg?), dispatch-during-dispatch safety (tombstone). |
| clock | — | 2026-07-02 | New package, blessed during tween session. Shared time primitive — hierarchical clocking. Awaiting direction session. Referenced by: tween, spritesheet, timeline. |

## Scene graph — display objects

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| displayobject | dispatched | 2026-07-01 | Reversed prior drop of `sourceRectangle` on Bitmap. Blessed charter decisions: drop cacheAsBitmap/scrollRect/opaqueBackground, Loader, lifecycle signals, traversal wrappers, pixelSnapping. Builder2 parcel: stale-reference cleanup + textlayout dep removal. |
| text | direction | 2026-07-02 | 4 decisions blessed: entity layer identity, programmatic mutation on text / interactive on textinput, \*Value suffix dropped, pre-release no-backward-compat rule. Builder landed most depth-review work (setters, read accessors, signals, insert/replace). Open: signal ownership (text vs textinput), text-formats neighbor, package rename. 1 approved item (textlayout \_text param removal). |
| sprite | direction | 2026-07-02 | 5 decisions blessed: compact sentinel is user-facing API, ParticleEmitter signals intentionally absent, transformType no-guard for perf, Vector2Like for all {x,y} out-params, Int32Array for tile flags. Builder parcel: 3 items (signals dep, Vector2Like swap, named sentinel constant). |
| movieclip | — | 2026-07-02 | New package, blessed during timeline session. Display-object composition layer wrapping timeline. Awaiting direction session. Source in timeline/movieClip.ts. |
| clip | direction | 2026-07-02 | 4 decisions blessed: two API paths (conservative default / `*Exact` suffix), Float32Array contours in scope, winding conversion belongs in path, boundaries confirmed. No sweep-safe items — all remaining work cross-package (Float32Array migration, exact polygon kernel, functional test, Rust crate). |
| interaction | dispatched | 2026-07-02 | 6 decisions blessed: gestures separate package, DisplayObject typing for overlap, `*Handler` suffix intentional, clip-aware picking in scope, shapeFlag stays with honest fallback, broadphase is interaction's opt-in. Prior builder work lost — tiers 1–3 re-queued: registerDefaultHitTestPoints, spatial queries, overlap, HitTestResult + detailed hit, gating, hitArea, suppressTouchHover, shape-accurate picking, tilemap/quad-batch sub-index, clip-aware picking. |
| shape | dispatched | 2026-07-02 | 5 decisions blessed: closed switch is tight-loop exception (fork B), stroke geometry → path, shape-formats neighbor approved, path dependency needed, keep unknown[] buffer. Approved: exact cubic bounds, per-span stroke bounds, drawTriangles in bounds/fill, honor drawPath winding, remove aliasing comment, typed round-trip (shapeGraphicsData), add path dep. |

## Scene graph — 3D

| Package   | State | Last visited | Note                      |
| --------- | ----- | ------------ | ------------------------- |
| scene     | —     |              | 52/100, early stage       |
| mesh      | —     |              |                           |
| lighting  | —     |              |                           |
| texture   | —     |              |                           |
| camera    | —     |              |                           |
| skeleton  | —     |              | Thin, undocumented in map |
| picking   | —     |              | Thin, undocumented in map |
| animation | —     |              | Undocumented in map       |
| materials | —     |              |                           |

## Rendering — core + backends

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| render | direction | 2026-07-02 | 6 decisions blessed: shared draw driver, render-graph in scope, font-string → text, 3D prepare boundary (render composes / lighting defines), viewport culling = real world bounds, housekeeping sweep. Builder parcel: delete no-op + alias, per-state adapt hook, fix viewport culling, move computeTextFormatFontString. |
| render-gl | — |  |  |
| render-wgpu | — |  |  |
| displayobject-canvas | — |  |  |
| displayobject-dom | — |  |  |
| displayobject-gl | — |  |  |
| displayobject-wgpu | — |  |  |
| scene-gl | — |  |  |
| scene-wgpu | — |  |  |

## Filters / effects

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| filters | direction | 2026-07-02 | 6 decisions blessed: registry not closed union for utility dispatch, BitmapFilterMargin → types, filters-math correct decomposition, effects/filters separate domains, color-matrix presets stay affine, TS-leads Rust-follows. Approved: 2 items (BitmapFilterMargin → types, Package Map update). Open: registry migration scope, bevel margin, backend de-duplication, constructor throw policy. |
| filters-canvas | — |  |  |
| filters-css | — |  |  |
| filters-gl | — |  |  |
| filters-math | — |  |  |
| filters-surface | — |  |  |
| filters-wgpu | — |  |  |
| effects | direction | 2026-07-02 | 8 decisions blessed: effects owns intents+math (same dep direction as filters), per-kind handler registration on pipeline state (dissolving central tables — renderer-registration pattern, tree-shakes naturally), effects owns interpolation via registered field-role metadata (fixes packed-color corruption), enabled/intensity backends must honor (tracked obligation), serialization deferred to SDK-wide story, catalog keeps growing, Package Map entry, TS-leads. Approved: 2 items (FilmicToneMapOptions/AgxToneMapOptions, Package Map entry). Open: registration migration scope/handler shape, ColorGrade vs LiftGammaGain, AutoExposure vs EyeAdaptation, backend math migration. |
| effects-canvas | — |  |  |
| effects-gl | — |  |  |
| effects-wgpu | — |  |  |

## Resources

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| image | direction | 2026-07-02 | 6 decisions blessed: at natural scope ceiling (18 exports), image-codec blessed as DOM-free neighbor (named codec not formats), detectImageMimeType migrates to image-codec, standardize byte input on Uint8Array, Package Map update, TS-leads. Approved: 2 items (loadImageResourceFromArrayBuffer → Uint8Array/rename, Package Map update). New package: image-codec (pre-direction stub). |
| font | direction | 2026-07-02 | 5 decisions blessed: clarify dual API identity (Font = string handle, FontResource = FontFace holder), ArrayBuffer → Uint8Array rename, DRY inferFontFormat, scope ceiling TBD (needs breadth review), TS-leads. Approved: 2 items (DRY helper, Uint8Array rename). Open: unify Font/FontResource, breadth review, textshaper relationship. |
| video | direction | 2026-07-02 | 4 decisions blessed: remove fire-and-forget create\*FromUrl (dishonest API), DRY inferVideoType, scope ceiling TBD, TS-leads. Approved: 2 items (remove fire-and-forget, DRY helper). |
| audio | direction | 2026-07-02 | 5 decisions blessed: move AudioContext singleton out (smell), remove fire-and-forget create\*FromUrl, DRY inferAudioType, audio needs expansion (not at ceiling), TS-leads. Approved: 3 items (remove fire-and-forget, move AudioContext, DRY helper). |
| textureatlas | direction | 2026-07-02 | 6 decisions blessed: Uint8Array rename, scope ceiling (atlas description not production), remove xml re-exports from formats barrel, detectTextureAtlasFormat, Cocos plist parser backlogged, TS-leads. Approved: 4 items (Uint8Array rename, remove re-exports, detect function, Package Map). |
| textureatlas-formats | direction | 2026-07-02 | Covered in textureatlas session. Remove xml re-exports, add detectTextureAtlasFormat, Cocos plist parser backlogged. |
| tileset | direction | 2026-07-02 | 4 decisions blessed: Uint8Array rename, near scope ceiling, tileset-formats blessed as neighbor (Tiled TSX primary target), TS-leads. Approved: 2 items (Uint8Array rename, Package Map). |
| loader | direction | 2026-07-02 | 6 decisions blessed: rebuild missing types (lost work), byte progress must be built, decompose 657-line monolith, AbortSignal for TS cancellation, configurable fail policy, TS-leads. Approved: 4 items (rebuild types, extend interface, remove false comment, Package Map). Review was reject/38 — blocking type issues. |
| scene-formats | — |  |  |
| spritesheet-formats | — |  |  |
| particles-formats | — |  |  |
| surface | direction | 2026-07-02 | 7 decisions blessed: unify SurfaceEdgeMode as single edge-mode type (collapse SurfaceConvolutionEdge), unified sampling contract for all geometric ops (explicit edge mode + interpolation mode), noise architecture supports additional types, room for both CPU pixel ops and GPU-parity software rendering, wasm-mixing awareness standing context, Package Map update, TS-leads. Approved: 4 items (SurfaceConvolutionEdge consolidation, SurfaceEdgeMode on geometric ops, SurfaceResizeMode on geometric ops, Package Map update). |
| surface-rs | — |  |  |
| image-codec | — | 2026-07-02 | New package, blessed during image session. DOM-free decode/encode seam with per-format registries. Awaiting direction session. Breadth review spec at reviews/maturation/breadth/image-codec.md. |
| resource-formats | — |  | Redirect verdict → `textureatlas-formats` |

## Animation / simulation

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| spritesheet | dispatched | 2026-07-02 | 8 decisions blessed: SpritesheetData → types, frame events in scope, repeatCount replaces loop boolean, bitmap binding in spritesheet, pivot/rotation is player's job, validation stays (tree-shakes), clock integration, TS-leads Rust-follows. Approved: 4 items (seek fix, seek tests, data types migration, loop→repeatCount). Open: frame event design, gotoAndStop, loader integration, clock dependency. |
| particles | direction | 2026-07-02 | 8 decisions blessed: sim/node split (particles = pure sim, particle-emitter = display wrapper), closed unions left for now, sort-key in sim, object-pool secondary tier, sub-emitters in scope (backlogged), spawn shape type alignment, GPU seam don't-close-the-door, TS-leads Rust-follows. 5 recommended items (spawnOffset status, field order, deterministic test, edge doc, shape type fix). Open: particle-emitter shape, sub-emitter design, collision response, path/polygon shapes. |
| particle-emitter | — | 2026-07-02 | New package, blessed during particles session. Display-object wrapper for particle sim. Awaiting direction session. Source in particles/updateParticleEmitter.ts + emitParticleBurst.ts. |
| timeline | dispatched | 2026-07-02 | 8 decisions blessed: timeline/movieclip split (pure engine vs display-object layer), MovieClipSignals separate interface, dependency direction (movieclip→timeline+types), createSpritesheetTimelineSource→movieclip, timeline-spritesheet absorbed into movieclip, updateTimeline non-recursive, clock integration, TS-leads Rust-follows. Approved: 3 items (disposeTimelineSignals, setMovieClipSource dead branch, frame-skip contract comment). Open: signal payloads, updateMovieClip recursion, frame-skip policy, play ranges/reverse/speed, MovieClipSignals shape. |
| tween | dispatched | 2026-07-02 | 6 decisions blessed: interpolator seam (open registry, perf-first), retire createColorTween for generic, tween signals fundamental (exempt from enable\*), tween owns single-object sequencing, @flighthq/clock blessed as shared time primitive, TS-leads Rust-follows. Approved: 4 items (onYoyo, time docs, seekTween pin, onComplete doc fix). Open: defaultManager, clock design, shared sequencing primitive, tween-formats, perf pass. |
| easing | direction | 2026-07-02 | 5 decisions blessed: normalized spring in easing / unbounded in tween, output-range combinators stay, -formats gated on consumer, TS-leads Rust-follows, Readonly<> callable exception. Approved: 3 polish items (easeStep doc, ScalarRemap type, pkg description). Open: physics taxonomy, pkg description update, easeSmoothstepRange type, perf/determinism gate. |
| velocity | direction | 2026-07-02 | 5 decisions blessed: remove duplicate contributeAffineVelocity, WeakMap stays, tighten getVelocitySampleAt matrix type, add Package Map entry, TS-leads Rust-follows. Approved: 3 items (remove duplicate, type tightening, Package Map entry). Open: broader velocity role, 3D velocity, transform-trait hardening. |
| path | dispatched | 2026-07-02 | 5 decisions blessed: path-boolean neighbor, path-formats neighbor, StrokeStyle → types, path editing in scope, multiple tessellation strategies. Approved: 9 items (pen cache, walker dedup, dashPath, contour lengths, nearest point, simplifyPath, fitPathCurves, offsetPath, StrokeStyle promotion). Open: PathMeasure shape, stroke dash-phase semantics, pkg description, Rust crate. |
| path-boolean | — | 2026-07-02 | New package, blessed during path session. CSG boolean ops on 2D paths. Awaiting direction session. |
| path-formats | — | 2026-07-02 | New package, blessed during path session. Path serialization (SVG path data, etc.). Awaiting direction session. |
| shape-formats | — | 2026-07-02 | New package, blessed during shape session. Shape serialization formats. Awaiting direction session. |

## Input / text

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| input | direction | 2026-07-02 | 5 decisions blessed: full input library (refactor as needed), InputBackend seam required, 3 neighbors (input-bindings/gestures/gamepad-mappings), GamepadMappingKind open registry with presets, TS-leads. Approved: 4 items (mapping param type, timer handle, test fix, Package Map). |
| textinput | direction | 2026-07-02 | 6 decisions blessed: types present (false alarm), two managers stay separate (selectable != input), IME in scope long-term, grapheme-cluster in scope long-term, Home/End bug fix, TS-leads. Approved: 3 items (Home/End fix, barrel exports, Package Map). |
| textlayout | direction | 2026-07-02 | 5 decisions blessed: types present (false alarm), decompose buildGroups into passes, fix justification (bug), font metrics tier-dependent, TS-leads. Approved: 2 items (justification fix, Package Map). |
| textshaper | direction | 2026-07-02 | 6 decisions blessed: rename shapeText→measureText, shapeTextRunInto options bug, drop gratuitous cast, fix signal type mismatch, itemization stays in textshaper, TS-leads. Approved: 6 items (rename, options forward, cast, signal fix, param naming, Package Map). |
| textshaper-canvas | direction | 2026-07-02 | Covered in textshaper session. Affected by shapeText→measureText rename. |

## Application

| Package | State | Last visited | Note |
| --- | --- | --- | --- |
| application | landed | 2026-07-02 | 4 decisions blessed: types were present (false alarm), remove dead LoopState.accumulated, entry-point orchestrator candidate for decomposition, TS-leads. Builder landed: dead accumulated removed, Package Map updated. |
| log | landed | 2026-07-02 | 5 decisions blessed: types were present (false alarm), decompose 61-export monolith, near scope ceiling, remove divider comments, TS-leads. Builder landed: divider comments removed, Package Map updated. |
| media | landed | 2026-07-02 | 4 decisions blessed: fix correctness holes (bugs), lost work rebuild (destination TBD), AudioContext ownership open, TS-leads. Builder landed: pause/resume fixed, destroyAudioMixer added, runtime map bounded, Package Map updated. Central open direction: should media exist? |
| sdk | direction | 2026-07-02 | 3 decisions blessed: no blood-from-stone tests, completeness check belongs in packages:check, TS-leads. Approved: 1 item (packages:check completeness rule). 95/100, effectively complete. |

## Platform integration suite

| Package      | State | Last visited | Note |
| ------------ | ----- | ------------ | ---- |
| platform     | —     |              |      |
| screen       | —     |              |      |
| device       | —     |              |      |
| storage      | —     |              |      |
| network      | —     |              |      |
| power        | —     |              |      |
| lifecycle    | —     |              |      |
| keyboard     | —     |              |      |
| sensors      | —     |              |      |
| clipboard    | —     |              |      |
| dialog       | —     |              |      |
| filesystem   | —     |              |      |
| notification | —     |              |      |
| shell        | —     |              |      |
| menu         | —     |              |      |
| tray         | —     |              |      |
| shortcut     | —     |              |      |
| share        | —     |              |      |
| haptics      | —     |              |      |
| geolocation  | —     |              |      |
| webcam       | —     |              |      |
| statusbar    | —     |              |      |
| useragent    | —     |              |      |

## App / process

| Package  | State | Last visited | Note |
| -------- | ----- | ------------ | ---- |
| app      | —     |              |      |
| protocol | —     |              |      |
| updater  | —     |              |      |
| ipc      | —     |              |      |

## Host backends

| Package       | State | Last visited | Note |
| ------------- | ----- | ------------ | ---- |
| host-electron | —     |              |      |
