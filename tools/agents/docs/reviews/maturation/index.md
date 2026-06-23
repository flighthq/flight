# Maturation Plans — Index

Two autonomous passes over the [breadth & depth review](index.md):

- **Pass 1 — Depth maturation** (86 packages): a Bronze/Silver/Gold roadmap to mature each existing package.
- **Pass 2 — New-package specs** (46 packages): a Bronze/Silver/Gold spec for each net-new package the breadth reviews found missing.

Tiers everywhere: **Bronze** = minimum viable (20% → 80%) · **Silver** = competitive/solid · **Gold** = authoritative/AAA/production + Rust-port parity.

## Pass 1 — Depth maturation roadmaps (weakest existing packages first)

| Package | Depth | Bronze (first move) |
| --- | --- | --- | --- | --- |
| [`math`](maturation/depth/math.md) | 🔴 8 | Decision + docs (gate): choose math (build-out) vs random (rename); add the chosen package to the Package Map in tools/a |
| [`loader`](maturation/depth/loader.md) | 🔴 18 | Item-descriptor input. Define ResourceLoadItem in @flighthq/types ({ key?: string; load: (signal: AbortSignal) => Promis |
| [`textshaper`](maturation/depth/textshaper.md) | 🔴 18 | ShapedGlyph — Readonly data: glyphId: number, cluster: number, xAdvance: number, yAdvance: number, xOffset: number, yOff |
| [`filters-canvas`](maturation/depth/filters-canvas.md) | 🔴 20 | getCanvasImageData(out, ctx, x, y, width, height) / putCanvasImageData(ctx, source, x, y) — the internal bridge between |
| [`menu`](maturation/depth/menu.md) | 🔴 22 | Extend MenuItemTemplate with the universally-present fields: visible?: boolean, toolTip?: string, sublabel?: string, ico |
| [`scene`](maturation/depth/scene.md) | 🔴 22 | Types first (@flighthq/types): add SceneNodeVisitor (a (node: Readonly<SceneNode>, depth: number) => boolean | void pred |
| [`shortcut`](maturation/depth/shortcut.md) | 🔴 28 | ShortcutModifier — \*Kind-style string identifiers, one per file-local const: 'Control', 'Alt', 'Shift', 'Meta', 'Super', |
| [`filters-css`](maturation/depth/filters-css.md) | 🟡 35 | computeColorMatrixFilterCss(ColorMatrixFilter): string | null — the single highest-value addition. Recognize the canonic |
| [`media`](maturation/depth/media.md) | 🟡 38 | Panning / stereo balance — the single most conspicuous omission alongside gain. Add setAudioChannelPan(channel, value): |
| [`path`](maturation/depth/path.md) | 🟡 38 | Authored closure (header + builder). Add CLOSE to the PathCommand set in @flighthq/types (consumes 0 data values). Add a |
| [`camera`](maturation/depth/camera.md) | 🟡 42 | Ray3D type (in @flighthq/types, owned by @flighthq/geometry) — { origin: Vector3; direction: Vector3 } plus Ray3DLike, c |
| [`clip`](maturation/depth/clip.md) | 🟡 45 | intersectClipRegions(out, a, b) — the defining real-world operation (nested clipping: a clipped node inside a clipped su |
| [`device`](maturation/depth/device.md) | 🟡 45 | Resolve the platform overload. In @flighthq/types rename the architecture concept to arch: string (CPU architecture, e.g |
| [`webcam`](maturation/depth/webcam.md) | 🟡 45 | WebcamStream entity + runtime in @flighthq/types (WebcamStream.ts): a plain-data handle (id, width, height, frameRate, d |
| [`effects-canvas`](maturation/depth/effects-canvas.md) | 🟡 48 | drawCanvasImageDataPass(dest, source, transform) in canvasEffectCompositing.ts — the missing per-pixel pass primitive: g |
| [`log`](maturation/depth/log.md) | 🟡 48 | Multi-sink fan-out (the foundational change). In @flighthq/types: keep LogSink. In @flighthq/log: |
| [`spritesheet`](maturation/depth/spritesheet.md) | 🟡 48 | Enrich the runtime types in @flighthq/types first (header layer): |
| [`timeline`](maturation/depth/timeline.md) | 🟡 48 | Arm the per-frame event lifecycle. Add enableTimelineSignals(timeline) and enableMovieClipSignals(clip) (own this packag |
| [`tray`](maturation/depth/tray.md) | 🟡 48 | setTrayIcon(tray, icon) — runtime icon swap (Electron setImage, Tauri set_icon). The single most glaring omission: today |
| [`displayobject`](maturation/depth/displayobject.md) | 🟡 52 | Correct the package description to name what the package actually owns (base display object + Bitmap / Stage / Video / R |
| [`mesh`](maturation/depth/mesh.md) | 🟡 52 | Attribute introspection in @flighthq/types first. Add to VertexAttributeLayout no new fields, but add free functions: ge |
| [`notification`](maturation/depth/notification.md) | 🟡 52 | Tri-state permission. Add NotificationPermission = 'default' | 'granted' | 'denied' to @flighthq/types. Add backend meth |
| [`screen`](maturation/depth/screen.md) | 🟡 55 | Coordinate converters (pure free functions, no host). Add screenToDipPoint(screen, point, out), dipToScreenPoint(screen, |
| [`sensors`](maturation/depth/sensors.md) | 🟡 55 | Types first (@flighthq/types/Sensors.ts): |
| [`resources`](maturation/depth/resources.md) | 🔵 62 | name on TextureAtlasRegion (in @flighthq/types first): add name: string | null. Single highest-leverage change for atlas |
| [`scene-gl`](maturation/depth/scene-gl.md) | 🔵 62 | Multi-light forward path (the single highest-leverage gap). Grow the choke point: |
| [`texture`](maturation/depth/texture.md) | 🔵 62 | equalsTexture(a, b) and equalsCubeTexture(a, b) — null-safe value equality mirroring equalsSampler (delegating to equals |
| [`tween`](maturation/depth/tween.md) | 🔵 64 | Relative values. Extend NumericProps<T> value type (or add a sibling TweenPropertyValue = number | RelativeTweenValue in |
| [`textlayout`](maturation/depth/textlayout.md) | 🔵 66 | Grapheme-cluster iteration (codepoint-level minimum). Replace charAt(i) / substr(i, 2) / charAt(i + 1) in buildGroups, b |
| [`interaction`](maturation/depth/interaction.md) | 🔵 68 | Honor shapeFlag for the two kinds that define it. |
| [`particles-formats`](maturation/depth/particles-formats.md) | 🔵 68 | detectParticleFormat(text): ParticleFormatKind | null — sniff plist-vs-JSON, then within JSON disambiguate Spine/Unity b |
| [`scene-wgpu`](maturation/depth/scene-wgpu.md) | 🔵 68 | Multi-light forward path. The light descriptor types (PointLight, SpotLight, HemisphereLight) already exist in @flighthq |
| [`spritesheet-formats`](maturation/depth/spritesheet-formats.md) | 🔵 68 | libGDX / Spine .atlas text format — the largest single hole; arguably the most ubiquitous open atlas format. |
| [`input`](maturation/depth/input.md) | 🔵 70 | Event timestamps. Add timeStamp: number (monotonic, ms) to InputKeyboardData, InputPointerData, InputGamepadButtonData, |
| [`lighting`](maturation/depth/lighting.md) | 🔵 70 | Reciprocal cone accessors. getSpotLightConeDegrees(out: Vector3Like, source: Readonly<SpotLight>) (or a small { inner, o |
| [`power`](maturation/depth/power.md) | 🔵 70 | Surface battery time fields. Add chargingTime: number and dischargingTime: number (seconds; -1 / Infinity-mapped-to--1 s |
| [`protocol`](maturation/depth/protocol.md) | 🔵 70 | Cold-start launch URL. Add ProtocolBackend.getLaunchUrl(): string | null to @flighthq/types first, then getProtocolLaunc |
| [`sprite`](maturation/depth/sprite.md) | 🔵 70 | QuadBatch per-instance accessors/mutators — setQuadBatchInstance(target, index, id, x, y) (vector2 form) and setQuadBatc |
| [`textshaper-canvas`](maturation/depth/textshaper-canvas.md) | 🔵 70 | Plumb letterSpacing into the measuring context. Set context.letterSpacing = ${format.letterSpacing ?? 0}px (the modern C |
| [`app`](maturation/depth/app.md) | 🔵 72 | App-level lifecycle signals (ready + quit veto + all-windows-closed). Add to the App entity in @flighthq/types: onReady: |
| [`application`](maturation/depth/application.md) | 🔵 72 | Extend the Application entity with read-only frame metrics fields written by the loop, not the caller: elapsedTime: numb |
| [`dialog`](maturation/depth/dialog.md) | 🔵 72 | FileDialogHandle type in @flighthq/types — an opaque, Readonly plain-data descriptor for a picked file/directory: { kind |
| [`effects`](maturation/depth/effects.md) | 🔵 72 | Uniform base-contract fields. Promote the ad-hoc, per-effect blend controls to RenderEffect in @flighthq/types: add opti |
| [`filesystem`](maturation/depth/filesystem.md) | 🔵 72 | Explicit directory verbs (split the conflated removeFile). Today removeFile recursively deletes directories too and rena |
| [`filters`](maturation/depth/filters.md) | 🔵 72 | BitmapFilterKind catalog (in @flighthq/types first, re-exported here). String constants for every concrete kind: BlurFil |
| [`haptics`](maturation/depth/haptics.md) | 🔵 72 | vibrateDevicePattern(pattern: Readonly<number[]>): boolean — expose the pattern path the web backend already builds for |
| [`ipc`](maturation/depth/ipc.md) | 🔵 72 | Document the invoke rejection + serialization contract on IpcBackend (in @flighthq/types/src/Ipc.ts). State explicitly: |
| [`lifecycle`](maturation/depth/lifecycle.md) | 🔵 72 | Produce the declared 'inactive' state on the web backend. Wire window.focus/window.blur (and document.visibilitychange) |
| [`platform`](maturation/depth/platform.md) | 🔵 72 | Fill arch on the web backend. Read navigator.userAgentData?.architecture + bitness (low-entropy is ''; arch is high-entr |
| [`render-gl`](maturation/depth/render-gl.md) | 🔵 72 | Context-loss survival. New glContextLoss.ts: attachGlContextLossHandlers(state, { onLost, onRestored }) / detachGlContex |
| [`render-wgpu`](maturation/depth/render-wgpu.md) | 🔵 72 | Fixed-function blend modes — in wgpuShader.ts, replace the null entries in BLEND_MODES for every mode expressible with a |
| [`share`](maturation/depth/share.md) | 🔵 72 | ShareFile descriptor in @flighthq/types/Share.ts — a portable, browser-File-agnostic shape so the Rust port and native b |
| [`signals`](maturation/depth/signals.md) | 🔵 72 | SignalConnection handle type in @flighthq/types — a plain-data binding record ({ signal, slot, connected: boolean } or a |
| [`statusbar`](maturation/depth/statusbar.md) | 🔵 72 | StatusBarInfo interface — { visible: boolean; style: StatusBarStyle; color: number; overlaysContent: boolean; height: nu |
| [`text`](maturation/depth/text.md) | 🔵 72 | Complete the RichText field mutators (each diffs, bumps invalidateNodeLocalContent, and invalidateNodeLocalBounds only w |
| [`updater`](maturation/depth/updater.md) | 🔵 72 | Queryable state surface (the single most impactful gap). Add to @flighthq/types: |
| [`velocity`](maturation/depth/velocity.md) | 🔵 72 | Affine baseline contributor — the package's own unfinished promise. Add contributeAffineVelocity(field, root) (or upgrad |
| [`materials`](maturation/depth/materials.md) | 🔵 74 | cloneMaterial(source: Readonly<Material>): Material — generic structural clone over the entity shape (shallow-copies sca |
| [`render`](maturation/depth/render.md) | 🔵 74 | @flighthq/types first — add the driver/queue value types as the header layer: |
| [`textinput`](maturation/depth/textinput.md) | 🔵 74 | Word-granular caret motion. moveTextInputCaretByWord(source, direction, extendSelection) reusing the existing isWordChar |
| [`clipboard`](maturation/depth/clipboard.md) | 🔵 78 | Generic format seam (the headline gap). Add to ClipboardBackend and export as free functions: |
| [`displayobject-canvas`](maturation/depth/displayobject-canvas.md) | 🔵 78 | registerCanvasDisplayObjectRenderers(state) — one-call umbrella that wires every defaultCanvas\*Renderer (BitmapKind, Sha |
| [`displayobject-dom`](maturation/depth/displayobject-dom.md) | 🔵 78 | Settle and document the sprite-graph decision (design gate, blocks the rest). Decide explicitly: does DOM get a canvas-e |
| [`displayobject-gl`](maturation/depth/displayobject-gl.md) | 🔵 78 | Native GPU gradient fills for drawGlShape. Add glGradientFill.ts with a gradient fragment shader (linear + radial) consu |
| [`entity`](maturation/depth/entity.md) | 🔵 78 | hasEntityRuntime(source: Readonly<Entity>): boolean — presence predicate, the canonical companion to a lazily-created sl |
| [`filters-surface`](maturation/depth/filters-surface.md) | 🔵 78 | Fix inner-shadow fidelity. Make applyInnerShadowFilterToSurface honor angle/distance (offset the shadow inside the bound |
| [`geolocation`](maturation/depth/geolocation.md) | 🔵 78 | getGeolocationPermission(): Promise<GeolocationPermissionState> — a permission _state_ read distinct from request, retur |
| [`geometry`](maturation/depth/geometry.md) | 🔵 78 | Vector lerp symmetry — interpolateVector3(out, a, b, t) and interpolateVector4(out, a, b, t) to match interpolateVector2 |
| [`network`](maturation/depth/network.md) | 🔵 78 | @flighthq/types — extend NetworkStatus (header layer first): |
| [`node`](maturation/depth/node.md) | 🔵 78 | Traversal primitive (the single biggest gap). Bring walkNode into this package as the base-graph depth-first visitor — i |
| [`particles`](maturation/depth/particles.md) | 🔵 78 | Richer spawn shapes. Extend ParticleEmitterShape (@flighthq/types) from 'point' | 'circle' | 'rect' to add 'ring', 'line |
| [`shape`](maturation/depth/shape.md) | 🔵 78 | appendShapeDrawTriangles — the headline missing command. appendShapeDrawTriangles(shape, vertices, indices, uvtData?, cu |
| [`shell`](maturation/depth/shell.md) | 🔵 78 | ShellOpenExternalOptions (in @flighthq/types first) — { activate?: boolean }. Mirrors Electron's openExternal(url, { act |
| [`storage`](maturation/depth/storage.md) | 🔵 78 | hasStorageItem(key): boolean — canonical presence accessor (getItem(key) !== null), resolving the absent-vs-stored-empty |
| [`effects-wgpu`](maturation/depth/effects-wgpu.md) | 🔵 80 | Land a sampleable scene depth attachment in render-wgpu (cross-package prerequisite). Today WgpuRenderTarget.depthStenci |
| [`host-electron`](maturation/depth/host-electron.md) | 🔵 80 | createElectronStorageBackend(electron) + register it — a file-backed synchronous StorageBackend (getItem/setItem/removeI |
| [`keyboard`](maturation/depth/keyboard.md) | 🔵 80 | Define in @flighthq/types (header first): |
| [`effects-gl`](maturation/depth/effects-gl.md) | 🔵 82 | registerDefaultGlRenderEffects(state) — opt-in batch registrar wiring every defaultGl\*EffectRunner into a GlRenderState' |
| [`types`](maturation/depth/types.md) | 🔵 82 | Replace missing.test.ts with colocated type-level assertion tests using expectTypeOf/assertType (Vitest's expectTypeOf r |
| [`displayobject-wgpu`](maturation/depth/displayobject-wgpu.md) | 🔵 84 | registerWgpuDisplayObjectRenderers(state) — one-call convenience that registers every built-in kind renderer (bitmap, sh |
| [`filters-gl`](maturation/depth/filters-gl.md) | 🔵 84 | applyDropShadowFilterToGl knockout support — implement the knockout branch instead of the current if (filter.knockout) r |
| [`filters-wgpu`](maturation/depth/filters-wgpu.md) | 🔵 84 | Confirm-and-test convolution parameter coverage. The current wgpuConvolutionFilter.ts already honors preserveAlpha, clam |
| [`surface`](maturation/depth/surface.md) | 🟢 88 | Gradient fill (highest value — the ramp half already exists in buildSurfaceGradientRamp): |
| [`easing`](maturation/depth/easing.md) | 🟢 90 | Curve combinators (new easeCombinators.ts) — free functions that lift an arbitrary user-supplied EasingFunction instead |
| [`surface-rs`](maturation/depth/surface-rs.md) | 🟢 92 | Override rotateSurface(dest, source, quarterTurns) — the mode-dispatching wrapper exported by @flighthq/surface and re-e |
| [`sdk`](maturation/depth/sdk.md) | 🟢 95 | Reachability spot-check test. Replace the bare loads successfully assertion in src/index.test.ts with a describe('packag |

## Pass 2 — New-package specs (alphabetical)

| Proposed package | Requested by | Bronze (MVP) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [`accessibility`](maturation/breadth/accessibility.md) |  | AccessibleRole — open string union of WAI-ARIA roles; \*Role kind constants: ButtonRole, ImageRole, TextRole, LinkRole, H |
| [`animation`](maturation/breadth/animation.md) | — spatial-3d (the "no 3D animation system at all" gap: `time | Types in @flighthq/types (header first): |
| [`assets`](maturation/breadth/assets.md) |  | AssetLibrary.ts (entity quartet): AssetLibraryData, AssetLibraryRuntime (the Map<AssetId, AssetEntry> registry, in-fligh |
| [`atlas-packer`](maturation/breadth/atlas-packer.md) |  | Types in @flighthq/types: |
| [`audio`](maturation/breadth/audio.md) |  | AudioPan semantics added to AudioChannel/AudioPlayOptions as a pan: number field (−1 left … 0 center … 1 right), matchin |
| [`biometrics`](maturation/breadth/biometrics.md) | application-platform | Types (@flighthq/types). |
| [`calendar`](maturation/breadth/calendar.md) |  | CalendarPermissionState — 'granted' | 'denied' | 'prompt' | 'restricted' (open string union; bare names reserved, vendor |
| [`camera2d`](maturation/breadth/camera2d.md) |  | Camera2D extends Entity — position: Vector2 (world-space center the camera looks at), zoom: number (1 = 1 world unit : 1 |
| [`clock`](maturation/breadth/clock.md) |  | Types in @flighthq/types: |
| [`collision`](maturation/breadth/collision.md) |  | Types in @flighthq/types: |
| [`compute-wgpu`](maturation/breadth/compute-wgpu.md) |  | Types in @flighthq/types: |
| [`contacts`](maturation/breadth/contacts.md) |  | Contact — the plain record entity: id (string, backend-stable or '' when the source is anonymous like a picker result), |
| [`devtools`](maturation/breadth/devtools.md) |  | FrameTiming — Readonly plain data: { frameDurationMs, updateDurationMs, renderDurationMs, fps, frameIndex, timestampMs } |
| [`displayobject-skia`](maturation/breadth/displayobject-skia.md) |  | SkiaRenderState — the skia-local render-state contract (analogue of GlRenderState / CanvasRenderState): owns the target |
| [`environment`](maturation/breadth/environment.md) | rendering-gpu, spatial-3d | Types (@flighthq/types). |
| [`font`](maturation/breadth/font.md) |  | Types in @flighthq/types: |
| [`font-atlas`](maturation/breadth/font-atlas.md) |  | Types in @flighthq/types: |
| [`gamestate`](maturation/breadth/gamestate.md) | — game-2d (the "No scene/screen state management" gap: "No s | Types in @flighthq/types (header first): |
| [`gltf`](maturation/breadth/gltf.md) |  | ParsedModel, ParsedNode, ParsedMesh, ParsedPrimitive, ParsedMaterial, ParsedTextureRef, ParsedAccessor, ParsedBufferView |
| [`host-capacitor`](maturation/breadth/host-capacitor.md) |  | createCapacitorHapticsBackend(capacitor): HapticsBackend — triggerHapticImpact → Haptics.impact({ style }), triggerHapti |
| [`host-tauri`](maturation/breadth/host-tauri.md) | — application-platform | tauriModule.ts — the TauriApi local interface (the analogue of ElectronApi): a structural type covering the precise Taur |
| [`image-codec`](maturation/breadth/image-codec.md) |  | Types in @flighthq/types (header first): |
| [`instancing`](maturation/breadth/instancing.md) |  | InstanceAttribute — { semantic: InstanceSemantic; format: VertexFormat; byteOffset: number }, reusing the existing Verte |
| [`intl`](maturation/breadth/intl.md) |  | Locale — plain data: { language: string; region: string; script: string; variants: readonly string[] } (parsed BCP-47 co |
| [`mediasession`](maturation/breadth/mediasession.md) | — application-platform | @flighthq/types first: |
| [`motion-path`](maturation/breadth/motion-path.md) |  | Types in @flighthq/types: |
| [`net`](maturation/breadth/net.md) |  | HttpMethod — 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' (open string union; bare names reserved). |
| [`permission`](maturation/breadth/permission.md) |  | PermissionKind — open string union of the gated capabilities, canonical PascalCase-keyed lowercase values matching the w |
| [`picking`](maturation/breadth/picking.md) |  | Ray3 / Ray3Like — { originX, originY, originZ, directionX, directionY, directionZ } (flat scalars, matching how Aabb/Pla |
| [`postprocess`](maturation/breadth/postprocess.md) | — spatial-3d, rendering-gpu | Types in @flighthq/types/Postprocess.ts first (header layer): |
| [`purchase`](maturation/breadth/purchase.md) |  | Types (in @flighthq/types first): |
| [`render-graph`](maturation/breadth/render-graph.md) |  | Types in @flighthq/types: |
| [`scene-format`](maturation/breadth/scene-format.md) |  | SceneDocument — the root document: { version: number; format: SceneFormatKind; root: SceneNodeRecord }. Plain data, JSON |
| [`shadow`](maturation/breadth/shadow.md) |  | ShadowMap.ts — ShadowMap (entity): width, height, lightViewProjection: Matrix4 (the world→light-clip matrix the caster p |
| [`skeleton`](maturation/breadth/skeleton.md) | animation-motion, spatial-3d | Types in @flighthq/types first: Joint (name, parent index, local Transform3D bind pose), Skeleton (ordered readonly Join |
| [`socket`](maturation/breadth/socket.md) | — missing-domains | Types in @flighthq/types/Socket.ts first: |
| [`spatial`](maturation/breadth/spatial.md) |  | Types in @flighthq/types: |
| [`spring`](maturation/breadth/spring.md) |  | Types in @flighthq/types: |
| [`testing`](maturation/breadth/testing.md) |  | FakeBackendRecorder — plain entity capturing calls: { calls: readonly FakeBackendCall[] }; FakeBackendCall = { method: s |
| [`text-gpu`](maturation/breadth/text-gpu.md) |  | GlyphKey — Readonly<{ glyphId: number; fontKey: string; pixelSize: number }>: the atlas cache key (one rasterized glyph |
| [`text-markup`](maturation/breadth/text-markup.md) |  | TextMarkupParseResult (the value the whole package revolves around): text: string, formatRanges: ReadonlyArray<TextForma |
| [`textbidi`](maturation/breadth/textbidi.md) |  | TextDirection — string kind, open contract: 'ltr' | 'rtl' (the resolved/base direction). Bronze does not include 'ttb' v |
| [`textsegment`](maturation/breadth/textsegment.md) |  | Types in @flighthq/types: |
| [`textshaper-harfbuzz`](maturation/breadth/textshaper-harfbuzz.md) |  | Types in @flighthq/types (header first — these promote the shaper seam from advances-only to glyph-bearing): |
| [`texture-formats`](maturation/breadth/texture-formats.md) |  | Add compressed: CompressedTexture | null slot to ImageResource (the already-reserved slot). |
| [`tilemap-formats`](maturation/breadth/tilemap-formats.md) |  | TileLevel (composite document): width, height, tileWidth, tileHeight, orientation: TileMapOrientation, layers: TileLevel |

---

_Generated from the `flight-maturation-passes` workflow (132 agents). Six agents (mature:camera, mature:surface-rs, newpkg:assets/intl/devtools/host-capacitor) hit transient API errors and were re-run individually; all 86 + 46 docs are present._
