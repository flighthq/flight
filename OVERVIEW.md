# @flighthq Engine — Package Overview

_Run `npm run overview` to regenerate. Import from `@flighthq/sdk` for a single entry point._ _Types from `@flighthq/types` are shown with their logical package rather than as a separate section._

## Packages

| Package | Description |
| --- | --- |
| `@flighthq/types` | Shared TypeScript interfaces, enums, and symbol constants used across all packages |
| `@flighthq/entity` | Core entity/node/runtime data model and binding system |
| `@flighthq/geometry` | 2D/3D math primitives: vectors, matrices, rectangles, and object pools |
| `@flighthq/assets` | Asset types and utilities: image sources, texture atlases, tilesets |
| `@flighthq/signals` | Strictly-typed signals and slots for event dispatching |
| `@flighthq/scenegraph-core` | Base scene graph: transform hierarchy, bounds, appearance traits, child management |
| `@flighthq/scenegraph-display` | Display object tree for composited 2D rendering: bitmaps, shapes, text, masks, blend modes |
| `@flighthq/scenegraph-world` | 3D world graph for spatial scene management |
| `@flighthq/interaction` | Hit testing: point-in-node tests and object overlap detection |
| `@flighthq/materials` | Color transforms, filters, and material utilities |
| `@flighthq/scenegraph-sprite` | Sprite graph for atlas-based batch rendering: sprites, quad batches, tilemaps |
| `@flighthq/render-core` | Renderer abstraction: render state, node tracking, transform and color update pipeline |
| `@flighthq/text-layout` | Renderer-agnostic text layout engine: measures and positions glyphs into layout groups |
| `@flighthq/render-canvas` | Canvas 2D renderer implementation |
| `@flighthq/render-dom` | DOM renderer implementation |
| `@flighthq/render-webgl` | WebGL2 renderer implementation |
| `@flighthq/spritesheet` | Spritesheet frame animation playback |
| `@flighthq/surface` | Pixel-level image manipulation using browser ImageData |
| `@flighthq/timeline` | Timeline-based animation sequencing |
| `@flighthq/timeline-spritesheet` | Spritesheet animation driven by the Timeline system |
| `@flighthq/tween-easing` | Easing functions for animation |
| `@flighthq/tween` | Tween animation system with easing functions |

---

## @flighthq/entity

> Core entity/node/runtime data model and binding system

**Functions:** `attachBinding`, `createEntity`, `createNode`, `createRuntime`, `getBinding`, `getRuntime`

---

## @flighthq/geometry

> 2D/3D math primitives: vectors, matrices, rectangles, and object pools

**Functions:** `createMatrix3x2`, `createMatrix3x3`, `createMatrix4x4`, `createRectangle`, `createVector2`, `createVector3`, `createVector4`, `reserveFloat32Array`, `reserveInt16Array`, `reserveUint16Array`

**Values/Enums:** `matrix3x2`, `matrix3x2Pool`, `matrix3x3`, `matrix3x3Pool`, `matrix4x4`, `matrix4x4Pool`, `rectangle`, `rectanglePool`, `vector2`, `vector2Pool`, `vector3`, `vector3Pool`, `vector4`, `vector4Pool`

---

## @flighthq/assets

> Asset types and utilities: image sources, texture atlases, tilesets

**Types:** `AudioSource`, `AudioSourceURL`, `FontURL`

**Functions:** `addTextureAtlasRegion`, `addTextureAtlasRegionRect`, `addTextureAtlasRegionRectXY`, `addTextureAtlasRegionVec2`, `createAudioSource`, `createAudioSourceFromURL`, `createAudioSourceFromURLs`, `createFont`, `createImageSource`, `createImageSourceFromCanvas`, `createImageSourceFromImageBitmap`, `createImageSourceFromImageElement`, `createTextureAtlas`, `createTextureAtlasFromCanvas`, `createTextureAtlasFromImageBitmap`, `createTextureAtlasFromImageElement`, `createTextureAtlasFromImageSource`, `createTextureAtlasRegion`, `createTileset`, `createTilesetFromAtlas`, `createTilesetFromImageSource`, `detectImageMimeType`, `initTextureAtlasRegion`, `initTilesetRegions`, `isImageSourceSameOrigin`, `loadAudioSourceFromURL`, `loadAudioSourceFromURLs`, `loadFontFromArrayBuffer`, `loadFontFromName`, `loadFontFromURL`, `loadFontFromURLs`, `loadImageSourceFromArrayBuffer`, `loadImageSourceFromBase64`, `loadImageSourceFromBlob`, `loadImageSourceFromURL`, `loadTextureAtlasFromArrayBuffer`, `loadTextureAtlasFromBase64`, `loadTextureAtlasFromBlob`, `loadTextureAtlasFromURL`, `loadTilesetFromArrayBuffer`, `loadTilesetFromBase64`, `loadTilesetFromBlob`, `loadTilesetFromURL`, `playAudioSource`

---

## @flighthq/signals

> Strictly-typed signals and slots for event dispatching

**Types:** `Signal`, `SignalConnectOptions`

**Functions:** `cancelSignal`, `connectSignal`, `createSignal`, `disconnectAllSignals`, `disconnectSignal`, `emitSignal`, `isSlotConnected`, `noop`

---

## @flighthq/scenegraph-core

> Base scene graph: transform hierarchy, bounds, appearance traits, child management

**Functions:** `addChild`, `addChildAt`, `calculateBoundsRect`, `contains`, `createGraphNode`, `createGraphNodeRuntime`, `createGraphNodeSignals`, `defaultComputeLocalBoundsRect`, `defaultGraphNodeRuntimeCanAddChild`, `ensureBoundsRect`, `ensureLocalBoundsRect`, `ensureLocalTransform2D`, `ensureWorldBoundsRect`, `ensureWorldTransform2D`, `getAppearanceID`, `getBoundsRect`, `getChildAt`, `getChildByName`, `getChildIndex`, `getGraphNodeRuntime`, `getGraphNodeSignals`, `getHeight`, `getLocalBoundsID`, `getLocalBoundsRect`, `getLocalTransform2D`, `getLocalTransformID`, `getNumChildren`, `getParent`, `getRoot`, `getWidth`, `getWorldBoundsRect`, `getWorldTransform2D`, `getWorldTransformID`, `globalToLocal2D`, `initHasAppearance`, `initHasBoundsRect`, `initHasBoundsRectRuntime`, `initHasTransform2D`, `initHasTransform2DRuntime`, `invalidate`, `invalidateAppearance`, `invalidateLocalBounds`, `invalidateLocalTransform`, `invalidateParentReference`, `invalidateRender`, `invalidateWorldBounds`, `localToGlobal2D`, `recomputeWorldTransformID`, `removeChild`, `removeChildAt`, `removeChildren`, `setAlpha`, `setBlendMode`, `setChildIndex`, `setColorTransform`, `setEnabled`, `setHeight`, `setRotation`, `setScaleX`, `setScaleY`, `setShader`, `setVisible`, `setWidth`, `setX`, `setY`, `swapChildren`, `swapChildrenAt`

---

## @flighthq/scenegraph-display

> Display object tree for composited 2D rendering: bitmaps, shapes, text, masks, blend modes

**Functions:** `beginBitmapFill`, `beginFill`, `beginGradientFill`, `clearShapeCommands`, `computeBitmapLocalBoundsRect`, `computeRichTextLocalBoundsRect`, `computeShapeLocalBoundsRect`, `computeStageLocalBoundsRect`, `copyShapeCommands`, `createBitmap`, `createBitmapData`, `createBitmapRuntime`, `createDOMElement`, `createDOMElementData`, `createDOMElementRuntime`, `createDisplayContainer`, `createDisplayContainerRuntime`, `createDisplayObject`, `createDisplayObjectGeneric`, `createDisplayObjectRuntime`, `createInputText`, `createInputTextData`, `createInputTextRuntime`, `createMovieClip`, `createMovieClipData`, `createMovieClipRuntime`, `createRichText`, `createRichTextData`, `createRichTextRuntime`, `createScale9Shape`, `createScale9ShapeData`, `createScale9ShapeRuntime`, `createShape`, `createShapeData`, `createShapeRuntime`, `createSpriteBatch`, `createSpriteBatchData`, `createSpriteBatchRuntime`, `createStage`, `createStageData`, `createStageRuntime`, `createText`, `createTextData`, `createTextRuntime`, `createVideo`, `createVideoData`, `createVideoRuntime`, `cubicCurveTo`, `curveTo`, `drawCircle`, `drawEllipse`, `drawPath`, `drawRect`, `drawRoundRect`, `drawRoundRectComplex`, `endFill`, `getBitmapRuntime`, `getDOMElementRuntime`, `getDisplayContainerRuntime`, `getDisplayObjectRuntime`, `getInputTextRuntime`, `getMovieClipRuntime`, `getRichTextRuntime`, `getScale9ShapeRuntime`, `getShapeRuntime`, `getSpriteBatchRuntime`, `getStage`, `getStageRuntime`, `getTextRuntime`, `getVideoRuntime`, `hitTestCommand`, `isDisplayObject`, `lineBitmapStyle`, `lineGradientStyle`, `lineStyle`, `lineTo`, `moveTo`, `registerShapeHitTestCommand`, `setCacheAsBitmap`, `setCacheAsBitmapMatrix`, `setFilters`, `setMask`, `setOpaqueBackground`, `setScrollRect`

**Values/Enums:** `GraphicsPathCommand`

---

## @flighthq/scenegraph-world

> 3D world graph for spatial scene management

---

## @flighthq/interaction

> Hit testing: point-in-node tests and object overlap detection

**Functions:** `createDisplayObjectInteractionSignals`, `defaultBitmapHitTestPoint`, `defaultDOMElementHitTestPoint`, `defaultDisplayObjectHitTestPoint`, `defaultInputTextHitTestPoint`, `defaultMovieClipHitTestPoint`, `defaultQuadBatchHitTestPoint`, `defaultRichTextHitTestPoint`, `defaultShapeHitTestPoint`, `defaultSpriteBatchHitTestPoint`, `defaultSpriteHitTestPoint`, `defaultStageHitTestPoint`, `defaultTextHitTestPoint`, `defaultTilemapHitTestPoint`, `defaultVideoHitTestPoint`, `dispatchPointerDown`, `findHitTarget`, `getDisplayObjectInteractionSignals`, `hitTestLocalBoundsRect`, `hitTestObject`, `hitTestPoint`, `registerHitTestPoint`

---

## @flighthq/materials

> Color transforms, filters, and material utilities

**Values/Enums:** `colorTransform`

---

## @flighthq/scenegraph-sprite

> Sprite graph for atlas-based batch rendering: sprites, quad batches, tilemaps

**Functions:** `computeQuadBatchLocalBoundsRect`, `computeSpriteLocalBoundsRect`, `computeTilemapLocalBoundsRect`, `createQuadBatch`, `createQuadBatchData`, `createQuadBatchRuntime`, `createSprite`, `createSpriteData`, `createSpriteNode`, `createSpriteNodeRuntime`, `createSpriteRuntime`, `createTilemap`, `createTilemapData`, `createTilemapRuntime`, `fillTiles`, `getQuadBatchCapacity`, `getQuadBatchRuntime`, `getQuadTransformStride`, `getSpriteNodeRuntime`, `getSpriteRuntime`, `getTile`, `getTilemapRuntime`, `isSpriteNode`, `reserveQuadBatch`, `resizeQuadBatch`, `resizeTilemap`, `setTile`

---

## @flighthq/render-core

> Renderer abstraction: render state, node tracking, transform and color update pipeline

**Functions:** `createDisplayObjectRenderNode`, `createNullRendererData`, `createRenderNode`, `createRenderNode2D`, `createRenderState`, `createSpriteRenderNode`, `getDisplayObjectRenderNode`, `getRenderNode`, `getSpriteRenderNode`, `prepareRenderQueue`, `registerRenderer`, `setBackgroundColor`, `updateAppearance`, `updateColorTransform`, `updateDisplayObjectBeforeRender`, `updateDisplayObjectRenderTransform2D`, `updateRenderTransform2D`, `updateSpriteBeforeRender`

---

## @flighthq/text-layout

> Renderer-agnostic text layout engine: measures and positions glyphs into layout groups

**Types:** `TextFormatRange`, `TextLayoutGroup`, `TextLayoutParams`, `TextLayoutResult`, `TextMeasureFn`

**Functions:** `createTextFormatRange`, `createTextLayoutGroup`, `createTextLayoutResult`, `getFormatAscent`, `getFormatDescent`, `getFormatHeight`, `getFormatLeading`, `getLineBreakIndex`, `getLineBreaks`, `layoutText`, `mergeTextFormat`

---

## @flighthq/render-canvas

> Canvas 2D renderer implementation

**Functions:** `applyCanvasMask`, `colorToHex`, `createCanvasElement`, `createCanvasRenderState`, `drawCanvasBitmap`, `drawCanvasBitmapMask`, `drawCanvasDisplayObject`, `drawCanvasDisplayObjectMask`, `drawCanvasQuadBatch`, `drawCanvasRichText`, `drawCanvasRichTextMask`, `drawCanvasScale9Shape`, `drawCanvasShape`, `drawCanvasSprite`, `drawCanvasText`, `drawCanvasTextMask`, `drawCanvasTilemap`, `formatToCanvasFont`, `getCanvasShapeCommand`, `popCanvasClipRect`, `popCanvasMask`, `popCanvasScrollRect`, `pushCanvasClipRect`, `pushCanvasMask`, `pushCanvasScrollRect`, `registerCanvasShapeCommand`, `registerCanvasShapeCommands`, `remapScale9Commands`, `renderCanvasBackground`, `renderCanvasDisplayObject`, `renderCanvasShapeCommands`, `renderCanvasSprite`, `setCanvasBlendMode`, `setCanvasTransform`, `updateCanvasCacheBitmap`

**Values/Enums:** `defaultCanvasBeginBitmapFill`, `defaultCanvasBeginFill`, `defaultCanvasBeginGradientFill`, `defaultCanvasBitmapRenderer`, `defaultCanvasCubicCurveTo`, `defaultCanvasCurveTo`, `defaultCanvasDisplayObjectRenderer`, `defaultCanvasDrawCircle`, `defaultCanvasDrawEllipse`, `defaultCanvasDrawPath`, `defaultCanvasDrawRect`, `defaultCanvasDrawRoundRect`, `defaultCanvasEndFill`, `defaultCanvasLineBitmapStyle`, `defaultCanvasLineGradientStyle`, `defaultCanvasLineStyle`, `defaultCanvasLineTo`, `defaultCanvasMoveTo`, `defaultCanvasQuadBatchRenderer`, `defaultCanvasRichTextRenderer`, `defaultCanvasScale9ShapeRenderer`, `defaultCanvasShapeCommands`, `defaultCanvasShapeRenderer`, `defaultCanvasSpriteRenderer`, `defaultCanvasTextRenderer`, `defaultCanvasTilemapRenderer`

---

## @flighthq/render-dom

> DOM renderer implementation

**Functions:** `applyDOMStyle`, `colorToCSS`, `createDOMRenderState`, `drawDOMBitmap`, `drawDOMBitmapMask`, `drawDOMElement`, `drawDOMElementMask`, `drawDOMQuadBatch`, `drawDOMRichText`, `drawDOMRichTextMask`, `drawDOMShape`, `drawDOMShapeMask`, `drawDOMSprite`, `drawDOMText`, `drawDOMTextMask`, `drawDOMTilemap`, `formatToFont`, `htmlEscape`, `initDOMElement`, `renderDOMBackground`, `renderDOMDisplayObject`, `renderDOMSprite`, `setDOMBlendMode`, `setDOMTransform`, `setDOMTransformWithOffset`

**Values/Enums:** `defaultDOMBitmapRenderer`, `defaultDOMElementRenderer`, `defaultDOMQuadBatchRenderer`, `defaultDOMRichTextRenderer`, `defaultDOMShapeRenderer`, `defaultDOMSpriteRenderer`, `defaultDOMTextRenderer`, `defaultDOMTilemapRenderer`

---

## @flighthq/render-webgl

> WebGL2 renderer implementation

**Functions:** `createWebGLElement`, `createWebGLRenderState`, `drawWebGLBitmap`, `drawWebGLBitmapMask`, `drawWebGLQuadBatch`, `drawWebGLShape`, `drawWebGLShapeMask`, `drawWebGLSpriteNode`, `drawWebGLText`, `drawWebGLTextMask`, `drawWebGLTilemap`, `registerWebGLShapeCommands`, `renderWebGLBackground`, `renderWebGLDisplayObject`, `renderWebGLSprite`

**Values/Enums:** `defaultWebGLBeginBitmapFill`, `defaultWebGLBeginFill`, `defaultWebGLBeginGradientFill`, `defaultWebGLBitmapRenderer`, `defaultWebGLCubicCurveTo`, `defaultWebGLCurveTo`, `defaultWebGLDrawCircle`, `defaultWebGLDrawEllipse`, `defaultWebGLDrawRect`, `defaultWebGLDrawRoundRect`, `defaultWebGLEndFill`, `defaultWebGLLineStyle`, `defaultWebGLLineTo`, `defaultWebGLMoveTo`, `defaultWebGLQuadBatchRenderer`, `defaultWebGLShapeCommands`, `defaultWebGLShapeRenderer`, `defaultWebGLSpriteRenderer`, `defaultWebGLTextRenderer`, `defaultWebGLTilemapRenderer`

---

## @flighthq/spritesheet

> Spritesheet frame animation playback

**Functions:** `createSpritesheet`, `createSpritesheetAnimation`, `createSpritesheetFrame`, `createSpritesheetFromTileset`, `createSpritesheetPlayer`, `getSpritesheetAnimation`, `getSpritesheetPlayerFrame`, `queueSpritesheetAnimation`, `showSpritesheetAnimation`, `updateSpritesheetPlayer`

---

## @flighthq/surface

> Pixel-level image manipulation using browser ImageData

**Types:** `ColorBoundsRect`, `ColorTransformData`, `ImageFormat`, `ThresholdOperation`

**Functions:** `cloneSurface`, `colorTransform`, `compareSurface`, `copyChannel`, `copyPixels`, `createImageSourceFromSurface`, `createSurface`, `createSurfaceFromCanvas`, `createSurfaceFromImageSource`, `drawSurface`, `encodeSurface`, `fillRect`, `floodFill`, `getColorBoundsRect`, `getPixel`, `getPixel32`, `getPixels`, `merge`, `scroll`, `setPixel`, `setPixel32`, `setPixels`, `threshold`

**Values/Enums:** `ImageChannel`

---

## @flighthq/timeline

> Timeline-based animation sequencing

**Functions:** `createTimeline`, `getMovieClipCurrentFrame`, `getMovieClipTotalFrames`, `gotoAndPlayMovieClip`, `gotoAndPlayTimeline`, `gotoAndStopMovieClip`, `gotoAndStopTimeline`, `isMovieClipPlaying`, `nextFrameMovieClip`, `nextFrameTimeline`, `playMovieClip`, `playTimeline`, `prevFrameMovieClip`, `prevFrameTimeline`, `resolveTimelineLabel`, `stopMovieClip`, `stopTimeline`, `updateMovieClip`, `updateTimeline`

---

## @flighthq/timeline-spritesheet

> Spritesheet animation driven by the Timeline system

**Functions:** `attachSpritesheetTimeline`

---

## @flighthq/tween-easing

> Easing functions for animation

**Values/Enums:** `Back`, `Bounce`, `Cubic`, `Elastic`, `Expo`, `Linear`, `Quad`, `Quart`, `Quint`, `Sine`

---

## @flighthq/tween

> Tween animation system with easing functions

**Types:** `NumericProps`, `StopTweenOptions`, `Tween`, `TweenManager`, `TweenManagerOptions`, `TweenOptions`

**Functions:** `applyTween`, `completeTween`, `createColorTween`, `createTimer`, `createTween`, `createTweenManager`, `pauseAllTweens`, `pauseTween`, `pauseTweens`, `resetTweens`, `resumeAllTweens`, `resumeTween`, `resumeTweens`, `stopAllTweens`, `stopTween`, `updateTweens`

**Values/Enums:** `defaultManager`

---
