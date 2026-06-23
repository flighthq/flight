# Filename Alignment: @flighthq/types

**Verdict:** Strongly aligned. This is the single-implementation header package (NOT a backend-variant package), so the rule is "filename = the primary exported type name, one concept per file" — backend tokens appear because they are part of the _type name_ (`GlShader`, `WgpuRenderTarget`, `CanvasRenderState`), not as a prefix folder convention. Three files have casing/name drift between the filename and the type they actually export; everything else is clean.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `DOMRenderOptions.ts` | Exports `DomRenderOptions` (Dom, not DOM). Filename casing mismatches the type name and diverges from the sibling `DomRenderState.ts`. | `DomRenderOptions.ts` |
| `DOMStageRectangle.ts` | Exports `DomStageRectangle` (Dom, not DOM). Same casing drift; the type referenced from `DomRenderState.ts` is `DomStageRectangle`. | `DomStageRectangle.ts` |
| `Keyboard.ts` | Exports no `Keyboard` type — it exports `SoftKeyboard`, `SoftKeyboardInfo`, `SoftKeyboardBackend`. The codebase map explicitly names this concept `SoftKeyboard` to avoid colliding with the DOM `Keyboard`. The bare filename `Keyboard.ts` claims the very name the type was designed to avoid and reads as the wrong domain. | `SoftKeyboard.ts` |

## Clean

The remaining ~320 files each name their single exported domain/type and pass the folder-removal test:

- **Geometry / math:** `Aabb`, `Matrix`, `Matrix3`, `Matrix4`, `Quaternion`, `Vector2/3/4`, `Plane`, `Frustum`, `BoundingSphere`, `Rectangle`, `Viewport` — each a self-describing value type.
- **Display / scene:** `DisplayObject`, `DisplayContainer`, `Bitmap`, `Shape`, `Stage`, `Sprite`, `Tilemap`, `Tileset`, `QuadBatch`, `SceneNode`, `Node`, `Entity`.
- **Feature traits:** `HasTransform2D`, `HasTransform3D`, `HasAppearance`, `HasBoundsRectangle`, `HasClip`, `HasColorTransform`, `HasMaterial` — name the capability domain, not a function.
- **Filters / effects / materials:** `BlurFilter`, `BevelFilter`, `ColorMatrixFilter`, `BloomEffect`, `CrtEffect`, `StandardPbrMaterial`, `ToonMaterial`, etc. — each names the descriptor object.
- **Backend-named types (correct here):** `CanvasRenderState`, `CanvasRenderTarget`, `GlShader`, `GlRenderState`, `GlFullscreenProgram`, `WgpuRenderTarget`, `WgpuRenderState`, `DomRenderState` — the backend token is part of the exported type name, giving correct file-level "which backend" clarity for a header package.
- **Utility type files (named after their one type, not generic):** `MethodsOf`, `PartialNode`, `Renderable`, `RandomSource` — these are `MethodsOf<T>` / `PartialNode<T>` etc., not generic dumping grounds like `utils.ts` or `helpers.ts`.
- **Domain clusters named after the domain:** `Log` (LogLevel/LogData/LogEntry/LogSink), `Velocity` (Velocity2D/VelocitySample/VelocityField), `Material`, `Entity` — a small family of tightly-related types under one domain word.
- **Platform / host seams:** `Clipboard`, `Dialog`, `FileSystem`, `Notification`, `Shell`, `Tray`, `Screen`, `Storage`, `Device`, `Platform`, `Ipc`, `Protocol`, `Updater`, `Webcam`, `Geolocation`, `Haptics`, `Sensors`, `Power`, `Network`, `Lifecycle`, `StatusBar`, `Share`, `Shortcut`, `Menu` — one capability domain per file.

No generic-name violations (`data.ts`, `format.ts`, `query.ts`, `utils.ts`, `helpers.ts`, `math.ts`, `common.ts`) exist. `index.ts` is a pure 327-line `export *` barrel, not a dumping ground. The sole colocated test is `missing.test.ts` (the exports/missing-test guard), consistent with this package being declarations-only.
