# Unit Test Depth Review

Dispatched review of unit test depth across 78 packages. 12 parallel review agents scanned source and test files for behavioral coverage depth, followed by a synthesis agent that prioritized gaps.

## Maturity Summary

- **52 solid** — deep behavioral coverage, edge cases, out-parameter aliasing, sentinel returns.
- **21 adequate** — primary-path testing with meaningful assertions but missing edge cases in specific functions.
- **1 thin** — textbidi: full UAX #9 implementation with almost no rule-level tests.
- **0 stub** — every package has at least meaningful happy-path tests.

### Solid (52)

geometry, math, node, signals, displayobject, sprite, clip, text, textlayout, textshaper, textsegment, bitmapfont, bitmaptext, glyphatlas, text-markup, tween, spring, animation, timeline, movieclip, spritesheet, clock, motionpath, application, log, flow, debug, useragent, scene, mesh, materials, lighting, camera, texture, skeleton, picking, binpack, collision, camera2d, particles, particleemitter, path-boolean, render, adjustments, velocity, input, loader, audio, video, font, textureatlas, tileset, texture-formats, particles-formats, bitmapfont-formats, image, image-codec.

### Adequate (21)

entity, shape, textinput, easing, snapshot, surface, assets, spatial, path, path-formats, shape-formats, render-gl, render-wgpu, effects, interaction, intl, scene-formats, spritesheet-formats, textureatlas-formats, tilemap-formats.

### Thin (1)

textbidi.

## High-Priority Gaps

These are the 10 most important missing tests, concentrated in correctness-critical math/geometry code paths and data-integrity seams.

### 1. shape: `computeShapeLocalBoundsRectangle`

Quadratic/cubic bezier extrema solvers (`quadPoint`, `cubicPoint`, `expandCubicExtrema`) are completely untested. Only rectangles and lines covered. Circles, ellipses, arcs, and `curveTo` all use these paths.

**Add:** test cases for `drawCircle`, `drawEllipse`, `curveTo` (quadratic), `cubicCurveTo`. Verify bounds tightly enclose the curve by checking known parametric extrema points.

### 2. textbidi: `resolveBidiLevels`

Full UAX #9 implementation (X1-X8 embeddings, X5a-X6a isolates, W1-W7 weak types, N1-N2 neutrals, L1 trailing whitespace) with almost no tests exercising these rules.

**Add:** tests with explicit LRE/RLE/LRO/RLO/PDF markers, LRI/RLI/FSI/PDI isolates, Arabic+European number sequences (W2/W5), mixed neutrals between strong types (N1/N2), and strings ending in whitespace after RTL (L1).

### 3. path: `containsPathPoint`

Missing self-intersecting path (figure-8), point on boundary edge, and degenerate zero-area contour. These are primary winding-number correctness cases.

**Add:** figure-8/bowtie path with point inside one lobe, point on an edge segment, zero-area path (collinear points), and point at a vertex.

### 4. assets: `releaseAsset`

No test for releasing an asset while its load is still in-flight. The `.then()` callback handles orphaned resources but this path is untested.

**Add:** create a deferred-promise loader, call `acquireAsset` then `releaseAsset` before resolving, then resolve and verify dispose is called (not leaked). Also test acquire-release-acquire dedup correctness.

### 5. textinput: `dispatchTextInputPointerDown`

Only tests focus set. Double-click word selection and triple-click line selection via `clickCount` + layout are untested.

**Add:** create a mock layout provider returning character positions. Test `clickCount=2` selects word boundaries, `clickCount=3` selects line boundaries.

### 6. textinput: `dispatchTextInputPointerMove`

Only tests does-not-throw when unfocused. Drag-to-extend selection via layout is completely untested.

**Add:** with mock layout, test pointer-down then move extends selection range, selection direction follows pointer, clamping at text boundaries.

### 7. snapshot: `restoreSnapshot`

Missing: target with extra keys not in snapshot, nested field type change (object to array), primitive top-level snapshot no-op.

**Add:** test restore into target with extra keys and verify preservation/removal behavior. Test type mismatch at nested level. Test number/string top-level snapshot.

### 8. scene-formats: `createSceneFromGltf`

No test for quaternion rotation, scale transforms, matrix transform path, uint32 index buffers, or multi-scene documents.

**Add:** synthetic glTF docs with: `node.rotation` quaternion, `node.scale`, `node.matrix` (16-element), accessor with `componentType=5125` (uint32), and document with scene index != 0.

### 9. textbidi: `getBidiRuns`

Only 3 trivial tests. Missing pure RTL, numbers-in-RTL producing multiple runs, embedding/isolate-induced level changes.

**Add:** pure RTL string, Arabic text with embedded numbers (should produce LTR run for digits), text with explicit LRE/RLE markers producing distinct level runs.

### 10. path: `getQuadraticBezierTangent`

Only tests `t=0`. Missing `t=1` and `t=0.5` verification.

**Add:** `t=1` (should equal end-control direction) and `t=0.5` midpoint tangent with known expected values for a simple quadratic curve.

## Medium-Priority Gaps (top 20)

| Package | Function | Issue |
|---------|----------|-------|
| snapshot | `interpolateSnapshots` | Missing different-shape inputs, number-to-non-number mismatch, dotted-path schema |
| snapshot | `equalsSnapshot` | Missing array-vs-object type mismatch and deep nesting inequality |
| shape | `appendShapePath` | No test for cross-package bridge from `@flighthq/path` Path into shape commands |
| shape | `appendShapeDrawTriangles` | No test for triangle drawing with indices/vertices/uvs arrays |
| geometry | `transposeMatrix4` | Out-parameter aliasing test missing (transpose is a classic aliasing hazard) |
| surface | `drawSurface` | All 3 tests only assert does-not-throw, no pixel verification |
| materials | `concatColorTransform` | Test claims alias coverage but uses a fresh out object (`out===a` and `out===b` untested) |
| tween | `updateTweens` | Zero-duration tweens (division by zero) and negative deltaTime untested |
| textinput | `selectWordAtTextInputIndex` | Only 1 test case; missing whitespace, punctuation, boundaries, empty text |
| textinput | `selectLineAtTextInputIndex` | Only 1 test case; missing multiline, line boundary, empty text, last line |
| clip | `unionClipRegions` | Alias-safe implementation but no alias test (intersect has them) |
| assets | `loadAssetGroup` | No test for partial failure (one asset fails while others succeed) |
| path | `dashPath` | Out-parameter alias-safe test missing (`out === source`) |
| path | `getQuadraticBezierPoint` | Only tests `t=0` and `t=1` endpoints; missing midpoint verification |
| scene | `applyAnimationClipToScene` | Rotation (quaternion) channel path untested |
| clock | `advanceClock` | No test for negative deltaTime, negative scale, or 3+ level hierarchy |
| easing | `easeSmoothstepRange` | Degenerate `edge0 === edge1` not tested (division by zero) |
| surface | `getSurfacePixel` | Never tests last pixel at `(width-1, height-1)` |
| surface | `setSurfacePixel` | Same boundary gap: no test writes to the last pixel |
| tilemap-formats | `buildTilemapLayersFromTiled` | Missing multi-tileset, group layers, image layers, object groups with polygon/ellipse |

## Functional Test Candidates

These features require visual/browser verification and should be covered by functional tests rather than (or in addition to) unit tests:

- Display-object renderer output correctness (transform propagation, blend modes, masking, clipping, alpha, tint) across all 4 backends.
- Effects visual output (blur, bloom, drop-shadow, glow, bevel, displacement, convolution, tone-mapping).
- Adjustments color matrix and LUT application on actual rendered pixels.
- 3D forward renderer output (PBR materials, lighting, shadows, depth, normal mapping).
- BitmapText glyph quad rendering (letter spacing, word wrap, alignment, multi-page atlas).
- Text/RichText rendered layout (line breaking, alignment, justification, vertical alignment).
- Shape vector drawing with fills and strokes (gradient fills, bitmap fills, complex paths, Scale9Shape).
- Sprite/QuadBatch atlas-based rendering (UV mapping, rotation, tint, batch breaking).
- Interaction hit testing accuracy with transformed display objects.
- Particle emitter visual output (spawn patterns, color curves, blend modes).
- Path-boolean visual verification of CSG operations.
- Camera2D view matrix application to rendered scene.
- Clip region rendering across backends.
