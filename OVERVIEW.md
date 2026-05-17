# @flighthq Engine — Package Overview

_Run `npm run overview` to regenerate. Import from `@flighthq/engine` for a single entry point._
_Types from `@flighthq/types` are shown with their logical package rather than as a separate section._

## Packages

| Package | Description |
|---------|-------------|
| `@flighthq/types` | Shared TypeScript interfaces, enums, and symbol constants used across all packages |
| `@flighthq/foundation` | Core entity/node/runtime data model and binding system |
| `@flighthq/geometry` | 2D/3D math primitives: vectors, matrices, rectangles, and object pools |
| `@flighthq/assets` | Asset types and utilities: image sources, texture atlases, tilesets |
| `@flighthq/animation-spritesheet` | Spritesheet frame animation playback |
| `@flighthq/scene-graph-core` | Base scene graph: transform hierarchy, bounds, appearance traits, child management |
| `@flighthq/scene-graph-display` | Display object tree for composited 2D rendering: bitmaps, shapes, text, masks, blend modes |
| `@flighthq/scene-graph-world` | 3D world graph for spatial scene management |
| `@flighthq/interaction` | Hit testing: point-in-node tests and object overlap detection |
| `@flighthq/materials` | Color transforms, filters, and material utilities |
| `@flighthq/scene-graph-sprite` | Sprite graph for atlas-based batch rendering: sprites, quad batches, tilemaps |
| `@flighthq/render-core` | Renderer abstraction: render state, node tracking, transform and color update pipeline |
| `@flighthq/render-canvas` | Canvas 2D renderer implementation |
| `@flighthq/signals` | Strictly-typed signals and slots for event dispatching |

---

## @flighthq/foundation

> Core entity/node/runtime data model and binding system

**Types:** `Entity`, `EntityWithoutRuntime`, `MethodsOf`, `Node`, `NodeData`, `NodeDataFactory`, `NodeRuntimeFactory`, `PartialNode`, `Runtime`

**Functions:** `attachBinding`, `createEntity`, `createNode`, `createRuntime`, `getBinding`, `getRuntime`, `reserveFloat32Array`, `reserveInt16Array`, `reserveUint16Array`

**Values/Enums:** `NodeKind`, `RuntimeKey`

---

## @flighthq/geometry

> 2D/3D math primitives: vectors, matrices, rectangles, and object pools

**Types:** `Matrix3x2`, `Matrix3x2Like`, `Matrix3x3`, `Matrix3x3Like`, `Matrix4x4`, `Matrix4x4Like`, `Rectangle`, `RectangleLike`, `Vector2`, `Vector2Like`, `Vector3`, `Vector3Like`, `Vector4`, `Vector4Like`

**Functions:** `createMatrix3x2`, `createMatrix3x3`, `createMatrix4x4`, `createRectangle`, `createVector2`, `createVector3`, `createVector4`

**Values/Enums:** `matrix3x2`, `matrix3x2Pool`, `matrix3x3`, `matrix3x3Pool`, `matrix4x4`, `matrix4x4Pool`, `rectangle`, `rectanglePool`, `vector2`, `vector3`, `vector3Pool`, `vector4`

---

## @flighthq/assets

> Asset types and utilities: image sources, texture atlases, tilesets

**Types:** `ImageSource`, `TextureAtlas`, `TextureAtlasRegion`, `Tileset`

**Functions:** `addTextureAtlasRegion`, `addTextureAtlasRegionRect`, `addTextureAtlasRegionRectXY`, `addTextureAtlasRegionVec2`, `createImageSource`, `createTextureAtlas`, `createTextureAtlasRegion`, `createTileset`, `initTextureAtlasRegion`, `initTilesetRegions`

---

## @flighthq/animation-spritesheet

> Spritesheet frame animation playback

**Types:** `Spritesheet`, `SpritesheetAnimation`, `SpritesheetFrame`, `SpritesheetPlayer`

**Functions:** `createSpritesheet`, `createSpritesheetAnimation`, `createSpritesheetFrame`, `createSpritesheetPlayer`, `getSpritesheetAnimation`, `getSpritesheetPlayerFrame`, `queueSpritesheetAnimation`, `showSpritesheetAnimation`, `updateSpritesheetPlayer`

---

## @flighthq/scene-graph-core

> Base scene graph: transform hierarchy, bounds, appearance traits, child management

**Types:** `GraphNode`, `GraphNodeData`, `GraphNodeDataFactory`, `GraphNodeOf`, `GraphNodeRuntime`, `GraphNodeRuntimeFactory`, `GraphNodeTraits`, `HasAppearance`, `HasBoundsRect`, `HasBoundsRectRuntime`, `HasTransform2D`, `HasTransform2DRuntime`

**Functions:** `addChild`, `addChildAt`, `calculateBoundsRect`, `contains`, `createGraphNode`, `createGraphNodeRuntime`, `defaultComputeLocalBoundsRect`, `defaultGraphNodeRuntimeCallback`, `defaultGraphNodeRuntimeCanAddChild`, `ensureBoundsRect`, `ensureLocalBoundsRect`, `ensureLocalTransform2D`, `ensureWorldBoundsRect`, `ensureWorldTransform2D`, `getAppearanceID`, `getBoundsRect`, `getChildAt`, `getChildByName`, `getChildIndex`, `getGraphNodeRuntime`, `getHeight`, `getLocalBoundsID`, `getLocalBoundsRect`, `getLocalTransform2D`, `getLocalTransformID`, `getNumChildren`, `getParent`, `getRoot`, `getWidth`, `getWorldBoundsRect`, `getWorldTransform2D`, `getWorldTransformID`, `globalToLocal2D`, `initHasAppearance`, `initHasBoundsRect`, `initHasBoundsRectRuntime`, `initHasTransform2D`, `initHasTransform2DRuntime`, `invalidate`, `invalidateAppearance`, `invalidateLocalBounds`, `invalidateLocalTransform`, `invalidateParentReference`, `invalidateWorldBounds`, `localToGlobal2D`, `recomputeWorldTransformID`, `removeChild`, `removeChildAt`, `removeChildren`, `setAlpha`, `setBlendMode`, `setChildIndex`, `setColorTransform`, `setEnabled`, `setHeight`, `setRotation`, `setScaleX`, `setScaleY`, `setShader`, `setVisible`, `setWidth`, `setX`, `setY`, `swapChildren`, `swapChildrenAt`

**Values/Enums:** `GraphNodeKind`, `NullGraph`

---

## @flighthq/scene-graph-display

> Display object tree for composited 2D rendering: bitmaps, shapes, text, masks, blend modes

**Types:** `Bitmap`, `BitmapData`, `DOMElement`, `DOMElementData`, `DisplayContainer`, `DisplayGraphNodeDataFactory`, `DisplayGraphNodeRuntimeFactory`, `DisplayObject`, `DisplayObjectData`, `DisplayObjectRuntime`, `DisplayObjectTraits`, `Graphics`, `InputText`, `InputTextData`, `MovieClip`, `MovieClipData`, `RichText`, `RichTextData`, `Shape`, `ShapeData`, `SpriteBatch`, `SpriteBatchData`, `Stage`, `StageAlign`, `StageData`, `StageDisplayState`, `StageQuality`, `StageScaleMode`, `Text`, `TextAutoSize`, `TextData`, `TextFormat`, `Video`, `VideoData`

**Functions:** `computeBitmapLocalBoundsRect`, `createBitmap`, `createBitmapData`, `createBitmapRuntime`, `createDOMElement`, `createDOMElementData`, `createDisplayContainer`, `createDisplayObject`, `createDisplayObjectGeneric`, `createDisplayObjectRuntime`, `createInputText`, `createInputTextData`, `createMovieClip`, `createMovieClipData`, `createRichText`, `createRichTextData`, `createSpriteBatch`, `createSpriteBatchData`, `createStage`, `createStageData`, `createText`, `createTextData`, `createVideo`, `createVideoData`, `getDisplayObjectRuntime`, `getStage`, `isDisplayObject`, `setCacheAsBitmap`, `setCacheAsBitmapMatrix`, `setFilters`, `setMask`, `setOpaqueBackground`, `setScale9Grid`, `setScrollRect`

**Values/Enums:** `BitmapKind`, `DOMElementKind`, `DisplayGraph`, `DisplayObjectKind`, `InputTextKind`, `MovieClipKind`, `RichTextKind`, `ShapeKind`, `SpriteBatchKind`, `StageKind`, `TextKind`, `VideoKind`

---

## @flighthq/scene-graph-world

> 3D world graph for spatial scene management

---

## @flighthq/interaction

> Hit testing: point-in-node tests and object overlap detection

**Types:** `HitTestPoint`

**Functions:** `defaultBitmapHitTestPoint`, `defaultDOMElementHitTestPoint`, `defaultDisplayObjectHitTestPoint`, `defaultInputTextHitTestPoint`, `defaultMovieClipHitTestPoint`, `defaultQuadBatchHitTestPoint`, `defaultRichTextHitTestPoint`, `defaultShapeHitTestPoint`, `defaultSpriteBatchHitTestPoint`, `defaultSpriteHitTestPoint`, `defaultStageHitTestPoint`, `defaultTextHitTestPoint`, `defaultTilemapHitTestPoint`, `defaultVideoHitTestPoint`, `hitTestLocalBoundsRect`, `hitTestObject`, `hitTestPoint`, `registerHitTestPoint`

---

## @flighthq/materials

> Color transforms, filters, and material utilities

**Types:** `ColorTransform`, `Filter`, `Shader`

**Values/Enums:** `BlendMode`, `colorTransform`

---

## @flighthq/scene-graph-sprite

> Sprite graph for atlas-based batch rendering: sprites, quad batches, tilemaps

**Types:** `QuadBatch`, `QuadBatchData`, `QuadTransformType`, `Sprite`, `SpriteData`, `SpriteGraphNodeDataFactory`, `SpriteGraphNodeRuntimeFactory`, `SpriteNode`, `SpriteNodeData`, `SpriteNodeRuntime`, `SpriteNodeTraits`, `Tilemap`, `TilemapData`

**Functions:** `computeQuadBatchLocalBoundsRect`, `computeSpriteLocalBoundsRect`, `computeTilemapLocalBoundsRect`, `createQuadBatch`, `createQuadBatchData`, `createQuadBatchRuntime`, `createSprite`, `createSpriteData`, `createSpriteNode`, `createSpriteNodeRuntime`, `createSpriteRuntime`, `createTilemap`, `createTilemapData`, `createTilemapRuntime`, `getQuadBatchCapacity`, `getQuadTransformStride`, `getSpriteNodeRuntime`, `isSpriteNode`, `reserveQuadBatch`, `resizeQuadBatch`

**Values/Enums:** `QuadBatchKind`, `SpriteGraph`, `SpriteKind`, `TilemapKind`

---

## @flighthq/render-core

> Renderer abstraction: render state, node tracking, transform and color update pipeline

**Types:** `DisplayObjectRenderNode`, `DisplayObjectRenderer`, `RenderNode`, `RenderNode2D`, `RenderState`, `Renderable`, `Renderer`, `RendererData`, `SpriteRenderNode`, `SpriteRenderer`

**Functions:** `createDisplayObjectRenderNode`, `createNullRendererData`, `createRenderNode`, `createRenderNode2D`, `createRenderState`, `createSpriteRenderNode`, `getDisplayObjectRenderNode`, `getRenderNode`, `getSpriteRenderNode`, `prepareRenderQueue`, `registerRenderer`, `setBackgroundColor`, `updateAppearance`, `updateColorTransform`, `updateDisplayObjectBeforeRender`, `updateDisplayObjectRenderTransform2D`, `updateRenderTransform2D`, `updateSpriteBeforeRender`

**Values/Enums:** `AppearanceFlags`

---

## @flighthq/render-canvas

> Canvas 2D renderer implementation

**Types:** `CanvasRenderOptions`, `CanvasRenderState`

**Functions:** `applyCanvasMask`, `createCanvasRenderState`, `drawCanvasBitmap`, `drawCanvasBitmapMask`, `drawCanvasDisplayObject`, `drawCanvasDisplayObjectMask`, `drawCanvasQuadBatch`, `drawCanvasSprite`, `popCanvasClipRect`, `popCanvasMask`, `popCanvasScrollRect`, `pushCanvasClipRect`, `pushCanvasMask`, `pushCanvasScrollRect`, `renderCanvasBackground`, `renderCanvasDisplayObject`, `renderCanvasSprite`, `setCanvasBlendMode`, `setCanvasTransform`, `updateCanvasCacheBitmap`

**Values/Enums:** `defaultCanvasBitmapRenderer`, `defaultCanvasDisplayObjectRenderer`, `defaultCanvasQuadBatchRenderer`, `defaultCanvasSpriteRenderer`

---

## @flighthq/signals

> Strictly-typed signals and slots for event dispatching

**Types:** `Signal`, `SignalConnectOptions`, `SignalNode`

**Functions:** `cancelSignal`, `connectSignal`, `createSignal`, `disconnectAllSignals`, `disconnectSignal`, `emitSignal`, `hasSignalListener`

---
