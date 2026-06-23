# Breadth Review: OpenFL / Lime Feature-Parity Auditor

**Lens:** OpenFL+Lime define the feature target (not the API); audit whether every capability they offer — display list, vector drawing, BitmapData/pixel ops, filters, blend modes, text fields, tilemaps, sound, video, net, events, geom, system/stage, accessibility, and assets — has a reachable home somewhere in the package set.

**Coverage: 84/100**

## What a complete SDK owes this perspective

OpenFL is essentially the Flash Player API surface; Lime is the host/platform layer beneath it. A feature-parity SDK owes a home for each of these classic capability clusters:

- **Display list:** Sprite/MovieClip/Shape/Bitmap/DisplayObjectContainer, Stage, masks, scale9, blend modes, color transform, hit testing, depth/z-ordering.
- **Vector graphics:** the full `Graphics` command set — moveTo/lineTo/curveTo/cubicCurveTo, solid/gradient/bitmap fills and line styles, caps/joints/miter, winding, drawPath.
- **BitmapData / pixel ops:** getPixel/setPixel, copyPixels, fillRect, floodFill, colorTransform, threshold, noise/perlinNoise, draw(), scroll, hitTest, compare, channel copy, paletteMap.
- **Filters:** blur, glow, drop-shadow, bevel, gradient bevel/glow, color-matrix, convolution, displacement-map, shader filter.
- **Text:** TextField with `htmlText`, multi-format, scrollV/scrollH/maxScroll, selectable, editable input, `restrict`, password, antiAliasType/sharpness, embedded fonts, autoSize, hyperlinks (`a href` / TextEvent.LINK).
- **Tilemap:** Tilemap/Tile/Tileset batch rendering.
- **Sound:** play with loops/start offset, SoundChannel, **SoundTransform (volume + pan)**, SoundMixer, ID3, position, length, dynamic generated audio (`sampleData`).
- **Video / media:** NetStream-style video playback.
- **Net:** **URLLoader / URLRequest / URLVariables**, URLStream, binary/text/variables formats, request headers/method, SharedObject (local persistence), loader for SWF/image assets.
- **Events:** a dispatch model covering mouse, keyboard, touch/gesture, focus, enterFrame, resize, and a bubbling/capture phase semantics.
- **Geom:** Point, Rectangle, Matrix, Matrix3D, Vector3D, ColorTransform, Transform.
- **System / Stage:** stage size/scaleMode/align/quality, fullscreen, frame rate, Capabilities, mouse cursor, focus management.
- **Accessibility:** screen-reader exposure (Flash's `AccessibilityProperties` / `accessibilityImplementation`).
- **Assets:** an asset/embed registry (Lime `Assets`/`AssetLibrary` / `@:bitmap` embeds) — load-by-id, manifests, preloading, font/image/sound/data libraries.

## Well covered

- **Display list:** `displayobject` (bitmaps, shapes, containers, masks, stage, video), `node` (hierarchy/transform/bounds/appearance), `sprite` (sprite/tilemap/quad-batch) and four full backend renderer families (`-canvas`, `-dom`, `-gl`, `-wgpu`). Stage exists with signals, size, and stage-local bounds. Scale9 is a first-class node (`Scale9Shape`) across all backends. Blend modes are a real cross-backend capability (`applyCanvas/Dom/Gl/WgpuBlendMode`). This is genuinely AAA breadth — broader than OpenFL on the renderer axis.
- **Vector `Graphics`:** `shape` exposes the entire OpenFL Graphics surface — `appendShapeBeginFill/BeginGradientFill/BeginBitmapFill`, `lineStyle` with `pixelHinting/scaleMode/caps/joints/miterLimit`, `lineGradientStyle/lineBitmapStyle`, `curveTo/cubicCurveTo`, `drawCircle/Ellipse/Rect/RoundRect`, `appendShapePath` with winding. Plus a standalone `path` package for reusable geometry. Nothing material missing here.
- **BitmapData / pixel ops:** `surface` is a strong BitmapData analogue — `applySurfaceColorTransform`, `applySurfaceThreshold`, `fillSurfaceNoise`, `fillSurfacePerlinNoise`, `floodFillSurface`, `scrollSurface`, `drawSurface`, plus the filter/effect surface backends. A leaf `surface-rs` mirror exists for the Rust/wasm mixing path.
- **Filters:** `filters` as data descriptors (blur, glow, bevel, drop-shadow, color-matrix, convolution, median) with four backends (`-canvas`/`-css`/`-gl`/`-wgpu`/`-surface`). Plus an `effects` family (SSAO, Kuwahara, tilt-shift, bokeh DoF) that exceeds OpenFL's filter set.
- **Text fields:** `text` + `textlayout` + `textinput` + `textshaper`(+`-canvas`) cover the hard parts — single/multi-format (`TextLabel`/`RichText`), scrollV/scrollH/maxScroll/bottomScrollV, password character, native text, and editable input with `restrict`-style restriction, caret, selection, backward/forward delete, wheel scroll. A real text-shaping seam (HarfBuzz-tier) is designed for GPU/international text.
- **Sound & video:** `media` has audio/video channels with play/pause/resume/stop, currentTime seek, gain, and playback rate; `resources` loads audio/video from URL(s).
- **Geom & math:** `geometry` (rect/vector/matrix/pools) + `math` + `materials` (`ColorTransform` with concat/copy-to-arrays). Matrix3D/Vector3D are covered via the 3D `mesh`/`camera`/`scene` cluster.
- **Events:** `signals` (priority, cancellation, multi-listener), `interaction` (full hit-test + pointer dispatch incl. context-menu/right-click, capture, per-kind hit tests), `input` (raw→normalized). Enter-frame/lifecycle live in `application`/`lifecycle`.
- **Tilemap:** folded into `sprite` (tilemap/quad-batch) with `spritesheet`/`tween`/`timeline` rounding out animation. This matches OpenFL's Tilemap intent.
- **System/Stage & platform:** the platform suite (`platform`, `screen`, `device`, `dialog`, `clipboard`, `app`, `application` windowing) substantially exceeds Lime's system surface.

## Gaps & missing capabilities

- **No URLLoader / URLRequest / general HTTP fetch.** The `network` package is connectivity _status_ only (`isNetworkOnline`, `NetworkStatus`, online/offline backend) — it is not OpenFL's `URLLoader`/`URLRequest`/`URLVariables`/`URLStream`. `resources`/`loader` cover _typed asset_ loading (image/audio/video/font/atlas by URL), but there is no general-purpose request primitive for arbitrary text/binary/form-encoded HTTP with method, headers, and progress. This is one of the most-used OpenFL APIs and currently has no clean home. **This is the single biggest parity gap.**
- **SoundTransform pan / SoundMixer.** `media` exposes gain (volume) and playback rate but **no stereo pan**, and there is no `SoundMixer`-style global mix/soundTransform. Spatial/positional audio also absent. For a 2D game SDK targeting OpenFL parity, pan is table stakes.
- **Dynamic / generated audio.** No equivalent to Flash `Sound` `sampleData` (procedural PCM generation) or audio capture (`Microphone`). `webcam` exists; there is no microphone/audio-input sibling.
- **Accessibility has no home.** No `accessibility`/`a11y` package. OpenFL exposes `AccessibilityProperties` and an accessibility implementation hook; there is nothing here for screen-reader exposure, focus/role/label metadata, or ARIA mapping on the DOM backend. For the DOM renderer this is a natural, achievable win and its absence is conspicuous.
- **Asset library / embed registry.** There is no `assets` package analogous to Lime `Assets`/`AssetLibrary` — load-by-id, manifests, bundled libraries, preloading by group, `getBitmap/getSound/getText` by symbol. `loader` is a batch queue and `resources` is per-resource; neither provides the id-keyed library + manifest layer that OpenFL/Lime apps lean on heavily for content management.
- **Persistent SharedObject.** `storage` (sync KV over localStorage) is the closest analogue and reasonably covers `SharedObject.getLocal` use, but it is positioned as a platform capability, not as the AMF-style structured per-app store; worth confirming it satisfies SharedObject semantics (per-name namespaces, size). Minor.
- **DisplacementMapFilter / ShaderFilter / GradientBevel / GradientGlow.** The `filters` set lists blur/glow/bevel/drop-shadow/color-matrix/convolution/median. OpenFL also ships **DisplacementMapFilter**, **ShaderFilter**, **GradientGlowFilter**, and **GradientBevelFilter** — verify these exist; if not, they are concrete parity holes (displacement-map in particular has no obvious substitute).
- **Stage quality / scaleMode / align / cursor.** Stage has size and signals, but classic Stage knobs — `quality`, `scaleMode`, `align`, `frameRate`, and mouse-cursor control — were not visible. Some live in `application`; confirm `scaleMode`/`align` and a cursor API have a home (cursor may belong in a platform cell).

## Missing or too-thin packages I would expect

- **`net` (or expand `network`):** a real `URLLoader`/`URLRequest` cell — request method, headers, body, response as text/binary/JSON/form, progress + completion signals, over a swappable backend (fetch on web, native HTTP on host). This is the clearest missing package for OpenFL parity.
- **`accessibility`:** display-object accessibility metadata (role/label/description/focusable) with a DOM-backend mapping to ARIA and a native-host seam. Pairs naturally with `interaction`/focus.
- **`assets`:** an id-keyed asset library / manifest layer above `resources`+`loader` (`getAssetBitmap`/`getAssetSound`/`getAssetText`, preload-by-group, multiple libraries). Lime's `Assets` is a daily-driver API with no current home.
- **`media` thickening:** add pan to `AudioChannel`, a `SoundMixer`/global soundTransform, generated/streaming audio (`sampleData`), and a microphone/audio-input capability. Today `media` reads as a thin volume/rate wrapper relative to a mature audio sub-library.
- **`filters` completion:** add displacement-map, shader, gradient-glow, and gradient-bevel descriptors (with the existing four-backend pattern) if absent.

## Verdict

For the core Flash/OpenFL _content_ surface — display list, vector `Graphics`, BitmapData/surface pixel ops, filters, blend modes, text fields, tilemaps, geometry, color transform, and events — the breadth here is excellent and in several axes (four renderers, an `effects` family, a text-shaping seam) exceeds OpenFL. The package set clearly hangs together for building OpenFL-style content. The parity gaps cluster at the **edges of the runtime**, not the display engine: general **HTTP networking (URLLoader/URLRequest)** is the standout omission, followed by **audio completeness (pan/mixer/generated audio/microphone)**, an **asset library/embed layer**, and **accessibility**. None of these require architectural change — each is a self-contained cell that fits the existing backend-seam pattern. Close those four and this set is a genuine, complete OpenFL/Lime feature superset.
