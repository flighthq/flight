# SDK Issues Blocking AwayJS Example Parity

Discovered during side-by-side comparison of all 26 AwayJS examples (Flight vs AwayJS original) in `flight-reference`.

## 1. AWD parser does not extract embedded textures/materials

**Package:** `@flighthq/scene-formats` — `awdParse.ts`
**Impact:** `intermediate-awd-viewer` (shambler model renders as untextured gray instead of detailed textured skin)

`createSceneFromAwd` extracts geometry and skeleton data but has zero texture/material handling — no matches for `texture`, `diffuseMap`, `bitmap`, `image`, or `embed` in the parser. AWD files can embed textures and material definitions. Without this, every AWD model requires manual material/texture assignment in example code, and models with embedded-only textures (no separate image files on disk) cannot be textured at all.

## 2. `drawGlScene` does not draw `ParticleEmitter3D` nodes

**Package:** `@flighthq/scene-gl` — `drawGlScene.ts`
**Impact:** `intermediate-particle-explosions`, `basic-fire`

`drawGlScene` only handles `Mesh` nodes. 3D particle emitters require a separate `drawGlSceneParticleEmitters(state, scene, camera, lights)` call. This is a footgun — users must know to call both functions. Every example that uses 3D particles needs this second call or particles are invisible.

## 3. No per-particle color support in 3D particle emitter

**Package:** `@flighthq/particles` / `@flighthq/particleemitter`
**Impact:** `intermediate-particle-explosions` (particles render white instead of matching source image pixel colors)

`emitParticleBurst3D(emitter, state, config, count, x, y, z)` only accepts position. The example samples pixel colors from browser logo images but has no way to pass per-particle color/tint to the emitter. The AwayJS original renders colored particles matching the Chrome/Firefox/Safari/IE logos.

## 4. Blinn-Phong shading does not support multi-pass / night-side lighting

**Package:** `@flighthq/scene-gl`
**Impact:** `intermediate-globe` (dark globe missing night city lights, atmosphere halo, specular water reflection)

The AwayJS globe uses `CompositeDiffuseMethod` with a separate night-side texture (city lights), `SimpleWaterNormalMethod` for ocean specular, and a `FresnelSpecularMethod` for atmospheric rim. Flight's single-pass Blinn-Phong cannot replicate this. The globe renders correctly but looks significantly darker and less detailed than the AwayJS version.

## 5. ColorTransform does not work on GPU-tessellated solid fills (Shape Path A)

**Package:** `@flighthq/displayobject-gl` — `glShape.ts` / `glShapeMesh.ts`
**Impact:** `graphics-drawing` (required workaround: rewrote example to use direct fill colors instead of colorTransform)

Shape rendering has two paths: Path A (solid fills → GPU tessellated mesh via `glShapeMesh.ts`, only applies `u_color` uniform, ignores colorTransform) and Path B (gradients/bitmaps → raster to canvas, uploads texture, uses quad batch which respects colorTransform). `enableGlColorAdjustment(state)` only affects Path B. This means `createColorTransform` cannot be used to tint solid-fill shapes.

## 6. OBJ/3DS parsers create nested hierarchy that's easy to miss

**Package:** `@flighthq/scene-formats` — `objParse.ts`, `threeDsParse.ts`
**Impact:** `obj-loader-master-chief`, `aircraft-demo`, `basic-load-3ds` (all required `forEachNodeDescendant` workaround)

`createSceneFromObj` wraps meshes inside `SceneNode` groups (from `g`/`o` directives). `createSceneFrom3ds` wraps named meshes in `SceneNode` wrappers (line ~349-351). In both cases, `getNodeChildren(scene)` returns wrapper nodes with `geometry: null`, not actual `Mesh` nodes. Users must use `forEachNodeDescendant` to find actual meshes. This is a documentation/API discoverability issue — the returned scene's immediate children are NOT the meshes.

## 7. Linear HDR pipeline requires significant lighting intensity tuning

**Package:** `@flighthq/scene-gl` (Blinn-Phong / PBR materials)
**Impact:** Nearly every 3D example needed manual intensity adjustment

Flight outputs linear HDR radiance and applies gamma correction. AwayJS works in sRGB space. This means AwayJS lighting values cannot be reused — directional lights typically need 3-8x intensity, ambient needs 1.5-2x. The `awd-suzanne` example was overexposed at intensity 8 (clipped to white) but underlit at AwayJS-equivalent values. There's no guidance or conversion helper for porting lighting values from sRGB-space engines.

## 8. BitmapText / GlyphAtlas does not render in headless Chromium

**Package:** `@flighthq/glyphatlas` / `@flighthq/bitmaptext`
**Impact:** `basic-generate-fnt` (blank gray background, no text visible)

`loadFontFromUrl` and `createGlyphAtlas` complete without errors, the atlas canvas is created (2048x2048), but no glyphs appear in the rendered output. The `createWebGlyphRasterizerBackend` uses OffscreenCanvas `fillText` which may not have access to the loaded font in headless Chromium. Works in a real browser. This may not be a bug per se, but it means BitmapText cannot be tested in CI/headless environments.
