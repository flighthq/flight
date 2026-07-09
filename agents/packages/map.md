# Package Map

Full per-package descriptions for the Flight SDK. Consult this when you need to understand a specific package's scope, API surface, or relationship to neighbors. For quick navigation, the compact list is in [index.md](../index.md#package-map).

Run `npm run api <name>` to query exported function signatures directly.

## Core and Primitives

- `@flighthq/types`: shared interfaces, kind symbols, and cross-package type contracts. This is the codebase's header layer — all public API shapes live here.
- `@flighthq/entity`: entity/runtime primitives used by higher-level packages.
- `@flighthq/geometry`: rectangles, vectors, matrices, typed-array capacity helpers, and pools.
- `@flighthq/math`: scalar math utilities — constants (EPSILON, TAU, DEG_TO_RAD), clamping/saturation, interpolation (lerp, inverseLerp, remap, smoothStep, smootherStep, damp, moveTowards, pingPong, repeat, lerpAngle), angles (degToRad, radToDeg, normalizeAngle, deltaAngle), rounding/quantization (roundTo, floorTo, ceilTo, fract, euclideanMod), comparison (approxEqual, approxEqualRelative, approxZero), power-of-two family (nextPowerOfTwo, previousPowerOfTwo, isPowerOfTwo, ceilPowerOfTwo, floorPowerOfTwo, nextMultipleOf), number theory (gcd, lcm, factorial, isEven, isOdd, hypot2, sign, quantize), seeded random and convenience helpers (randomRange, randomInt, randomBool, randomSign), random distributions (randomGaussian, randomGaussianPair, randomOnUnitCircle, randomInsideUnitDisc, randomOnUnitSphere, pick, shuffle, shuffleInPlace, randomWeighted), deterministic hashing (hashUint32, hashCombine, hash2D, hash3D, createRandomSourceFromHash), and statistics (mean, median, variance, standardDeviation, weightedAverage). Pure free functions, no allocation, tree-shakable.
- `@flighthq/node`: graph hierarchy, transforms, bounds, appearance, and invalidation.
- `@flighthq/signals`: strictly-typed signals and slots for event dispatching. Signals support multiple listeners, priority, and cancellation. The package is effectively always present in the SDK; specific signal groups are opt-in via `enable*` functions defined in the owning package. Signals is fundamental infrastructure and should have few dependencies.

## Scene Graph and Display

- `@flighthq/displayobject`: Flash/OpenFL-style display objects such as bitmaps, shapes, containers, masks, stages, and videos.
- `@flighthq/text`: text display objects — single-format `TextLabel` and multi-format `RichText` (built on the text-layout spine, with a lazily-ensured layout cache), plus `NativeText`, the platform-rendered text field measured outside the spine by the host engine. ("native-rendered text" is a property of the display object, not a package boundary — the `native` namespace is reserved for the platform/OS-integration suite.)
- `@flighthq/sprite`: sprite/tilemap/quad-batch graph for atlas-based batch rendering.
- `@flighthq/scene`: 3D world graph for spatial scene management. A doorway for future development; the road is mostly untaken and the package is not yet built out.
- `@flighthq/clip`: hard geometric clip regions as plain data — constructors (`createClipRegionFrom*` for rectangles, paths, rounded rectangles, ellipses, circles, and raw contours), composition (`intersectClipRegions`, `unionClipRegions`), queries (`clipRegionContainsPoint`, `clipRegionIntersectsRectangle`, `clipRegionContainsRectangle`), transform (`transformClipRegion`; axis-aligned matrices preserve scissor-eligibility, rotation/skew promotes to a quad contour), utilities (`cloneClipRegion`, `copyClipRegion`, `getClipRegionBounds`, `isClipRegionEmpty`, `isClipRegionRectangular`, `clipRegionsEqual`, `normalizeClipRegion`, `invalidateClipRegion`), and a pool bracket (`acquireClipRegion`/`releaseClipRegion`). No rendering; rendering is provided by the `displayobject-<backend>` clip modules.
- `@flighthq/interaction`: hit testing, pointer dispatch, and object overlap detection.

## Rendering

- `@flighthq/render`: renderer registration, render state/queue, render node data, update pipeline, transform/color propagation. Image render caching lives in the renderer packages (`imageRenderCache`, `canvasRenderCache`, `webglRenderCache`, `domRenderCache`), not in a standalone package.
- `@flighthq/render-canvas`, `@flighthq/render-dom`, `@flighthq/render-webgl`: concrete renderers.
- `@flighthq/filters`: blur, glow, bevel, drop-shadow, color-matrix, and convolution filters as plain data descriptors with explicit Canvas/CSS and multi-pass WebGL backends. Not OpenFL-style filter objects.
- `@flighthq/filters-gl`: GPU leaf-shader set for WebGL 2 — one `apply*FilterToGl` per filter descriptor, shared `applyGlBlitPass`/`applyGlTintPass` compositing primitives, and `clearGlFilterProgramCache` for deterministic GPU-resource release. This package is a collection of leaf shaders, not a chain applier; orchestration and scratch-target allocation belong to the caller (see `get*FilterGlScratchCount` helpers). Kernels are bounded: convolution ≤ `GL_CONVOLUTION_MAX_KERNEL_SIZE × GL_CONVOLUTION_MAX_KERNEL_SIZE` (7×7), median ≤ `GL_MEDIAN_MAX_RADIUS` (2). A chain dispatcher (`applyFiltersToGl`) is out of scope here by the tree-shaking rule; if needed, it belongs in `render-gl` or a `filters-gl-chain` neighbor.
- `@flighthq/materials`: the 3D material system — a full PBR material taxonomy (unlit, Blinn-Phong, metallic-roughness PBR with clearcoat/anisotropy/emissive/transmission, depth) plus color-transform. Built (the 20-material taxonomy, 922 tests); canonical design in [3d-materials-architecture.md](../3d-materials-architecture.md).
- `@flighthq/surface`: pixel-level manipulation of `ImageSource` values — read from or generate image data. Not used internally by renderers; user-facing.

## Resources

- `@flighthq/image`: image resources — pixel sources, MIME detection, and constructors (from canvas/ImageBitmap/element, load from URL/ArrayBuffer/Base64/Blob).
- `@flighthq/font`: font and font-resource types and constructors.
- `@flighthq/video`: video resources and URL constructors.
- `@flighthq/audio`: audio resources, URL constructors, and the shared audio context.
- `@flighthq/textureatlas`: texture atlases — regions, UVs, and constructors over image resources (depends on `@flighthq/image`).
- `@flighthq/tileset`: tilesets — uniform-grid texture atlases and constructors from images (depends on `@flighthq/textureatlas`).
- `@flighthq/loader`: batch queue for loading multiple resources in sequence or parallel.

## Animation and Simulation

- `@flighthq/spritesheet`: animation layer built on raw resources — a logical package providing sprite-based animation, analogous in structure to `particles`.
- `@flighthq/particles`: particle emitter simulation — `ParticleEmitter`, `ParticleEmitterConfig`, `createParticleEmitterConfig`, `updateParticleEmitter`, `emitParticleBurst`, `prewarmParticleEmitter`, force fields (`applyParticleForces`), colliders (`applyParticleCollisions`), and curve helpers (`particleColorCurveFromKeyframes`, `particleCurveFromKeyframes`, `sampleParticleCurve`).
- `@flighthq/particles-formats`: import/export of particle emitter configs to and from industry-standard authoring-tool formats — Particle Designer plist, Spine 4.x particle JSON, Unity Shuriken JSON. Full round-trip via `*Document` models, honest `warnings[]` channel, curve baking, and unified auto-detection via `detectParticleFormat`/`parseParticleConfig`.
- `@flighthq/timeline`: MovieClip-style keyframe and timeline support.
- `@flighthq/timeline-spritesheet`: timeline implementation backed by spritesheet animation internally.
- `@flighthq/tween`: tween managers, tweens, and timers.
- `@flighthq/clock`: hierarchical, pausable, scalable time primitive. A `Clock` tree driven by the app loop via `advanceClock(root, dtSeconds)`; child rate = product of ancestor scales, and a paused ancestor freezes its subtree. Consumers read scaled `deltaTime`/`elapsed` fields; opt-in `onTick` signal (via `enableClockSignals`) composes with the signal rate helpers. Depends only on `types` + `signals`.
- `@flighthq/easing`: easing functions for use with tween or any animation system.

## Input and Text

- `@flighthq/input`: unified input manager for keyboard, pointer, wheel, and gamepad — normalized signal dispatch (`onKeyDown`/`onKeyUp`/`onPointerDown`/`onPointerMove`/`onPointerUp`/`onWheel`/`onGamepadButtonDown`/`onGamepadButtonUp`/`onGamepadAxisMove`/`onGamepadConnect`/`onGamepadDisconnect`/`onTextInput`), held-state snapshots (`InputState` — per-key, per-button, per-axis queries), frame-edge queries (`wasInputKeyPressed`/`wasInputKeyReleased`), analog dead zones (`applyGamepadAxisDeadZone`/`applyGamepadStickDeadZone`), gamepad button/axis name mappings, key-repeat timers, pointer lock/capture. Attach via `attachKeyboardInput`/`attachPointerInput`/`attachGamepadInput`/`attachWheelInput`/`attachTextInput`.
- `@flighthq/textinput`: caret-based text editing — selection (word, line, all), clipboard (cut/copy/paste), undo/redo, Home/End (line-relative), Ctrl+Home/End (document-level), word-boundary navigation, insert/delete/backspace with selection awareness. Operates on a `TextInputSource` entity via `applyTextInputCommand`/`applyTextInputKeyboard`.
- `@flighthq/textlayout`: renderer-agnostic glyph layout engine — line breaking (word-wrap, character-wrap, explicit newlines), horizontal alignment (left/center/right/justify), interWord and interCharacter justification, leading/line-spacing, max-width constraint. Produces positioned `TextLayoutGroup` runs with per-character advance widths. Consumes text-shaper output for measurement.
- `@flighthq/textshaper`: text-shaping seam over a swappable `TextShaperBackend` (`setTextShaperBackend`/`getTextShaperBackend`). Two tiers: a measure-only default (`measureText` — string→width, sufficient for layout + Canvas text) and a full-glyph shaper (`shapeTextRun`/`shapeTextRunInto`/`shapeTextRuns` — glyphs with ids, advances, offsets, clusters, required for GPU text). Also: glyph extents (`getGlyphExtents`/`getGlyphExtentsBatch`/`getGlyphExtentsInto`), font metrics (`getFontMetrics`/`getFontMetricsInto`), caret positions (`getCaretPositionsForRun`), text itemization (`itemizeText`), shaped-run caching (`shapeTextRunCached`), and backend-change signals. Correct international text (Arabic/Indic/kerning/ligatures) needs a full-glyph backend (HarfBuzz). The Rust port mirrors this with `flighthq-textshaper` (rustybuzz backend). See [rust/text](../rust/text.md).
- `@flighthq/textshaper-canvas`: Canvas 2D text-shaper backend — advances-only shaping via the Canvas `measureText` API. Provides `createCanvasTextShaperBackend`/`clearCanvasTextShaperBackendCache`. Sufficient for Canvas-rendered text and layout measurement; does not produce glyph ids or cluster mappings.

## Application

- `@flighthq/application`: optional package providing a main loop, application lifecycle events, and the **windowing API** — `ApplicationWindow` (size/position/state + signals), web event wiring (`attach*`/`detach*`), and window-control commands (title, position, size, minimize/maximize/restore, fullscreen, always-on-top, constraints, `openWindow`, close-with-veto via `onCloseRequest`) over a swappable `WindowBackend` (web default; native hosts register their own), matching the platform suite's backend-seam pattern.
- `@flighthq/log`: leveled, structured, capture-aware logging. Emit side (`log`, `logError/Warn/Info/Debug/Verbose`, `logWith` context variants, `logAssert`, `logOnce`) plus a full listener side: multi-sink fan-out (`addLogSink`/`removeLogSink`/`clearLogSinks`), global and per-channel level gates, `LogContext`-bound contextual loggers, pluggable formatters (`createJsonLogFormatter`/`createTextLogFormatter`), a console-capture sink, an in-memory ring-buffer sink, and sink combinators (buffered/filter/fanout/rate-limited/sampled). Not Canvas/DOM-coupled. Tree-shakes: the emit-only import carries only the gate check and the `LogLevel` enum.
- `@flighthq/media`: audio and video playback channels.
- `@flighthq/sdk`: convenience barrel for applications and examples.

## Platform Integration Suite

Host/OS integration so applications need no escape hatch out of the SDK. Each capability is a self-contained cell: flat free functions over a swappable `*Backend` (defined in `@flighthq/types`). A web/DOM backend is always lazily available, so every function works on the web; a native host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via the capability's `set*Backend`. "Electron support" is one backend, not a coupling. Two shapes: **command** capabilities expose flat functions + `get*Backend`/`set*Backend`/`createWeb*Backend`; **event** capabilities expose an entity of signals with `create*`/`attach*`/`detach*`/`dispose*` (mirroring `@flighthq/application`'s window wiring). Web backends guard every API and return sentinels (`null`/`false`/`-1`/`''`/`[]`/no-op) when unavailable rather than throwing.

- `@flighthq/platform`: root identification seam — OS name, desktop/mobile/web kind, arch, locale, touch.
- `@flighthq/clipboard`: system clipboard read/write (text, HTML).
- `@flighthq/dialog`: file open/save and message/confirm/prompt dialogs.
- `@flighthq/filesystem`: file read/write/list/stat and standard directory paths (web backend over OPFS).
- `@flighthq/notification`: OS notifications and permission.
- `@flighthq/shell`: open external URLs/paths, reveal in folder, move to trash, beep.
- `@flighthq/menu`: native application-menu and context-menu descriptors (native host required to realize).
- `@flighthq/tray`: system tray / menu-bar icon (icon, tooltip, title, context menu, click events). The application/dock badge lives in `@flighthq/app`, not here.
- `@flighthq/shortcut`: global OS hotkeys (native host required).
- `@flighthq/screen`: display enumeration, work area, scale factor.
- `@flighthq/storage`: synchronous persistent key/value (web backend over localStorage).
- `@flighthq/device`: static device/OS identity — model, manufacturer, OS, memory, safe-area insets. Battery is _not_ here; it is a live concern owned by `@flighthq/power`.
- `@flighthq/share`: native share sheet.
- `@flighthq/haptics`: vibration and impact/notification/selection feedback.
- `@flighthq/geolocation`: current position and position watches.
- `@flighthq/webcam`: take photo / pick image.
- `@flighthq/statusbar`: mobile status-bar style, visibility, color.
- `@flighthq/network` (event): connectivity status and online/offline signals.
- `@flighthq/power` (event): battery/charging status, low-power and keep-awake.
- `@flighthq/lifecycle` (event): app active/inactive/background, resume/pause, back button.
- `@flighthq/keyboard` (event): on-screen keyboard visibility/height (type `SoftKeyboard`, avoiding the DOM `Keyboard`).
- `@flighthq/sensors` (event): accelerometer, gyroscope, device orientation.

Application/process layer (host shell integration beyond a single window):

- `@flighthq/app`: application identity (name/version/locale), control (quit/relaunch/focus), single-instance lock + `onSecondInstance`, the canonical app badge (`setAppBadgeCount`) + dock badge/menu/bounce, and app events (`onActivate`, `onOpenFile`).
- `@flighthq/protocol`: custom URI-scheme / deep-link registration plus an `onOpenURL` handler entity.
- `@flighthq/updater` (event): auto-update lifecycle — checking/available/progress/downloaded/error signals plus check/download/quit-and-install commands.
- `@flighthq/ipc`: inter-process messaging — `sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend (for split-process hosts like Electron main↔renderer).

Inbound host events are delivered through the same seam: command-style capabilities that also receive events expose a flat `on*(listener): () => void` over a backend `subscribe*` method — `onMenuSelect`, `onTrayEvent` (+ `setTrayContextMenu`), `onNotificationClick`/`onNotificationAction`, `onScreenChange`, power `onSuspend`/`onResume`. The window backend delivers OS-originated changes by mutating the `ApplicationWindow` and emitting its signals directly (it owns the `win`↔OS-window mapping from `openWindow`); native window backends additionally implement icon/opacity/progress/attention/skip-taskbar/menu-bar/parent controls.

Host backends (the concrete adapters that fill the seams) are a distinct package class — they carry a host dependency, are not tree-shakable, and are named `host-<runtime>`:

- `@flighthq/host-electron`: Electron main-process implementation of the window/app/dialog/clipboard/menu/tray/shortcut/screen/power/notification/shell/protocol/updater/ipc seams. The consumer passes the `electron` module explicitly — `registerElectronBackends(electron)` — typed against a local `ElectronApi` interface (the exact Electron surface Flight depends on), so the package needs no `electron` dependency and is unit-testable with a fake. Each `createElectron*Backend(electron)` is also exported for granular use. **Not** re-exported from `@flighthq/sdk` (it is an adapter you install in the host process, not app-facing API). Mobile seams and `filesystem` (node `fs`) are out of scope here — a future `host-capacitor` / a node-fs injection covers those. Future siblings: `host-tauri`, `host-capacitor`.
