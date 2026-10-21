# Crate layout analysis: flight-types at the bottom vs sugar-bearing types

Source: `refs/flight/packages` (TS). Scripts and raw data are in the scratchpad:
`analyze.py` (DAG + type inventory -> `data.json`), `violations.py` (-> `viol_value.json`, `viol_broad.json`),
`contam.py`, `hubs.py`, `ctx.py` (-> `ctx_value.json`, per-edge field context), `dag.txt` (full DAG by level).

## 1. Package DAG

- 162 implementation packages (excluding `types`), 785 package edges from non-test `src` imports of `@flighthq/<pkg>`
  (including `/contract` subpaths and dynamic `import()`).
- **No cycles.** Max depth 10 (L0 leaves: math, entity, color, encoding, compression, registry, ...; L10: sdk, tool-manifest, vite-plugin-manifest).
- Relevant low layers: `math` L0 (no deps), `entity` L0, `color` L0, `path` L1 (entity, math), `log` L2 (signals),
  `geometry` L3 (entity, log, math), `materials` L3 (color, entity, log), `mesh`/`texture`/`camera`/`node` L4, `render` L5.
- Full list: `dag.txt`.

## 2. Sugar-bearing types

Method: for each `types/src/X.ts` primary type, count exported functions per package whose *name* contains the
type name (word-boundary, longest match) AND whose signature mentions the type (or `XLike`). Owner = package with max count.

### Value types (recommended sugar set, 19)
| Type | Owner | fns | Type | Owner | fns |
|---|---|---|---|---|---|
| Matrix4 | geometry | 60 | Aabb | geometry | 23 |
| Vector3 | geometry | 50 | Plane | geometry | 13 |
| Rectangle | geometry | 45 | Ray3D | geometry | 12 |
| Vector2 | geometry | 39 | BoundingSphere | geometry | 11 |
| Vector4 | geometry | 38 | Obb | geometry | 10 |
| Matrix | geometry | 36 | Capsule | geometry | 8 |
| Matrix3 | geometry | 32 | Frustum | geometry | 7 |
| Quaternion | geometry | 26 | Transform3D / Transform2D | geometry | 4 / 3 |
| Path | path | 47 | ColorScaleBias | materials | 17 |

Color itself is a packed `number` (no struct), so `color` has no sugar type; `HslColor` has 1 fn.

### Object/handle types with many functions (40 more at >=10 fns; "broad" scenario)
MeshGeometry (mesh 76), Host (host 67), Node (node 57), RichText (text 43), Shape (shape 31), Camera3D (camera 29),
Texture (texture 28), ClipRegion, Skeleton2D, QuadBatch, Bitmap, ParticleEmitter2D/3D, AppLoop, Tween, AudioResource,
BitmapText, InstancedMesh, MovieClip, Timeline, Clock, NodeOrderList, Physics2DAbi/3DAbi, Tilemap, SpritesheetPlayer,
BitmapFont, Skeleton3D, VideoResource, Node3D, OrbitCameraController, RenderTexture (render-gl), StandardPbrMaterial,
TextureAtlas(+Region), TextLabel, ByteReader, Camera2D, MotionPath, Scene3DDocument.
**These should NOT be sugar-bearing** (see 5): making them so yields 201 pure->sugar edges and 165 imports of
secondary names (NodeAny x22, NodeTraits x16, TextureColorSpace x9, NodeOf x8, ~35 HostXCapabilities ...) from their files.
Texture alone is referenced by 45 pure files. Keep them pure data in flight-types; their functions stay free fns
(optionally an extension trait per impl crate).

## 3. Violations (value sugar set, sugar types in their owning impl crate)

- Sugar -> sugar cross-crate missing/cyclic edges: **0** (geometry types reference only each other + Entity;
  Path imports only Entity + `PathWinding` from ShapeCommand.ts; ColorScaleBias only Entity).
- Secondary names imported out of sugar files: **0** (but see PathWinding, class a).
- **Pure -> sugar (hard cycle: flight-types would depend on an impl crate): 85 edges in 67 pure files.**
  - by target owner: geometry 69, path 9, materials(ColorScaleBias) 7
  - by target type: Vector3 17, Rectangle 15, Vector2 9, Matrix4 9, Matrix 9, Path 9, ColorScaleBias 7, Aabb 4,
    Plane 2, Transform3D 2, Quaternion 1, Matrix3 1.
- **Transitive contamination** (pure files that reach a sugar type through pure files): **314 of 1005** type files.
  Per type: Vector2 290, Matrix 219, Path 206, Rectangle 205, ColorScaleBias 203, Vector3 92, Matrix4 74, Quaternion 71,
  Aabb 64, Plane 56, Matrix3 42, Transform3D 12 (Vector4, Obb, Capsule, Ray3D, Frustum, BoundingSphere, Transform2D: 0).
  All geometry together: 313; Path+ColorScaleBias alone: 209.
- Hubs (direct violator -> # of pure files depending on it): TextureUvTransform 207 (Vector2; pulled in by Texture),
  NodeInteraction 200 (HitArea = Rectangle|Path|NodeAny; via NodeInteractionState on NodeRuntime),
  ColorAdjustmentRuntime 200 (ColorScaleBias; `NodeRuntime extends ColorAdjustmentRuntime`, Node.ts:23),
  ShapeCommand 136 (Matrix), HasTransform2D 128, ClipRegion 127, HasBoundsRectangle 126, MeshGeometry 62,
  CanvasShapeDrawState 62, RenderState 61, RenderProxy2D 61, RenderProxy 61, HasTransform3D 59, Camera3D 54.

### Full edge list (file: imported type -> declaration.field @line)
Class codes: **b** = pure data/options holding a value type; **c** = generic/backend/plug-in/runtime state; **a** = misplaced; **d** = other.

| File | Uses | Class |
|---|---|---|
| Accessibility | Rectangle: AccessibilityNode.bounds@68 | b |
| AnimatedNormalModifier(+Options) | Vector2Like: scroll, secondaryScroll | b |
| AreaLight(+Options) | Vector3(Like): direction, position, right, up | b |
| PointLight(+Options), SpotLight(+Options), DirectionalLight(+Options) | Vector3(Like): position/direction | b |
| LightProbe | Vector3 position@26; AabbLike LightProbeGrid.bounds@41 | b |
| Camera2D | Rectangle: Camera2DFollowOptions.worldBounds@38 | b |
| Camera3D | Matrix4 view@22, inverseViewProjection@17, RawProjection.matrix@54; Plane nearClipPlane@20; Vector2 jitter@18 | b |
| Camera3DOptions, RawProjectionOptions | Plane / Matrix4Like | b |
| FlyCameraController, OrbitCameraController | Vector3 position/target (+Options) | b |
| TooltipController | Vector2Like offset@15 | b |
| Tray | RectangleLike/Vector2Like in TrayInteractionEvent, HostTrayPopupMenuCapability.popup@207 | b |
| TiledObject | Vector2Like[] polygon/polyline | b |
| Scale9Shape, Scale9Sprite | RectangleLike scale9Grid | b |
| ClipRegion | Rectangle rect@21 | b |
| TextureUvTransform | Vector2 uvOffset@16, uvScale@18 | b (hub) |
| CreateRenderTextureOptions | Vector2Like uvOffset/uvScale | b |
| MeshGeometry | Aabb bounds@57 | b |
| InstancedMesh | Matrix4[] instanceMatrices@11; Aabb InstancedMeshCullRuntime@30 | b + c |
| HasTransform3D | Vector3 position/scale, Quaternion rotation (public); Matrix4 in Runtime@20,25 | b + c |
| HasColorScaleBias, ColorScaleBiasAdjustment | ColorScaleBias(Like) | b |
| VertexDisplaceModifier(+Options) | Vector3Like axis/direction | b |
| Velocity | Matrix VelocitySample.previousWorldTransform@21 | b |
| EffectCaptureGeometry | RectangleLike bounds, MatrixLike captureTransform | b |
| Scene3DDocument | Transform3D (camera/light/node .transform), Matrix4Like inverseBind@144 | b |
| GltfExtension | Transform3D return of buildNodeTransform@26,62 (callback) | b |
| SvgRegistry | Matrix SvgGradient.transform@82; Rectangle SvgImportContext@100 | b |
| LottieRegistry | Path in painter/modifier callbacks + context.paths@188 | b |
| MorphShape | Matrix x5 (gradient/texture bindings), Path x2 | b |
| MotionPath, ShapeFillRegion, SwfMorphShapePaths, GlyphOutlineSource | Path field / callback arg | b |
| ShapeCommand | Matrix in ShapeCommandRegistry + `ShapeCommandToken = Matrix | Texture | ...`@88 | b (hub) |
| GizmoState | Rectangle/Vector2Like in GizmoNode2DFeatures callbacks@34-35 | b |
| NodeInteraction | `HitArea = Rectangle | Path | NodeAny | 'bounds'`@21, stored by NodeInteractionState on NodeRuntime | c (plug-in on Node) |
| ColorAdjustmentRuntime | ColorScaleBias resolved cache; `NodeRuntime extends ColorAdjustmentRuntime` | c (plug-in on Node) |
| RenderState | Path in `StrokeTessellator` (RenderRegistries.strokeTessellator)@87 | c (backend slot) |
| GlRenderState / WgpuRenderState | ColorScaleBias in *ColorAdjustmentMaterialFeature(+Guard), *RenderStateRuntime | c (backend) |
| GlScene3DRuntime / WgpuScene3DRuntime | Matrix4 *Scene3DShadow.matrix | c (backend) |
| RenderProxy, RenderProxy2D, RenderCache, Scene3DRenderProxy, Scene3DRenderList, CanvasShapeDrawState | ColorScaleBias / Matrix / Matrix3 / Matrix4 | c (renderer internals) |
| HasTransform2D, HasBoundsRectangle, BitmapText, ParticleEmitter2D, QuadBatch, Mesh, LassoSelectionRuntime, MarqueeSelectionRuntime | Matrix/Rectangle/Aabb/Path only in `*Runtime` (package-private runtime tier) | c (runtime tier) |
| Path.ts -> ShapeCommand.ts (`PathWinding`, ShapeCommand.ts:9); also PathMorph.ts:2 | | a |
| Geometry types `extends Entity` (Vector2.ts:3 etc.) | geometry below flight-types cannot extend Entity | d |

## 4. Classification counts (67 files / 85 edges)
- **(a) misplaced small type: 1** - `PathWinding` lives in ShapeCommand.ts but is Path vocabulary; move to Path.ts
  (needed so Path can sit below flight-types without dragging ShapeCommand -> Matrix/Texture).
- **(b) pure data referencing a value type: ~43 files** (lights, cameras, controllers, modifiers, options, documents,
  importer registries, ShapeCommand, TextureUvTransform, MeshGeometry...). These are genuine public data shapes - they
  cannot be "fixed" by relocation; they force the value types below or into flight-types.
- **(c) generic/backend/plug-in/runtime state: ~22 files**
  - plug-in state on generic Node runtime: ColorAdjustmentRuntime (adjustments), NodeInteractionState/HitArea (interaction)
    -> move to slots (`getNodeColorAdjustmentRuntime(node)`, interaction slot), mirroring `registerNodeRenderer`.
  - backend state: GlRenderState, WgpuRenderState, Gl/WgpuScene3DRuntime -> belong in render-gl/render-wgpu crates, not flight-types.
  - RenderState.strokeTessellator (Path) -> backend-specific (only enabled by enableGl/WgpuStrokePathTessellation) -> GlRenderState/WgpuRenderState or a registry slot.
  - renderer internals (RenderProxy*, RenderCache, Scene3DRender*, CanvasShapeDrawState) -> render/scene crates.
  - `*Runtime` tier structs (HasTransform2DRuntime, HasBoundsRectangleRuntime, QuadBatchRuntime, ...) -> owning impl crate.
  Fixing (c) is good hygiene and removes the biggest hubs (ColorAdjustmentRuntime 200, NodeInteraction 200), but
  (b) still remains, so (c) alone does not avoid moving geometry.
- **(d) other: 1** - geometry/ColorScaleBias/Path `extends Entity` (runtime slot) in TS.

## 5. Conclusions / recommendation

1. Geometry value types are the dominant conflict: 69/85 direct edges and 313/1005 type files transitively. Many are
   *public* fields (HasTransform3D.position/rotation/scale, Camera3D.view, MeshGeometry.bounds, light positions, all
   *Options). They cannot live in an impl crate above flight-types.
2. Do NOT put them in flight-types with extension traits if avoidable (loses inherent methods, `use` noise, and the
   existing `crates/flight-geometry` already has `impl Vector2`). Instead **put a foundation tier *below* flight-types**:
   `flight-math` -> `flight-geometry` -> (`flight-path`), plus ColorScaleBias in `flight-color` (or flight-geometry),
   with `flight-types` depending on them. This works because:
   - TS geometry type files import only Entity + each other; Rust `flight-geometry` already has zero deps.
   - ColorScaleBias functions (materials/src/colorScaleBias.ts) import only entity + the type -> relocate ownership to color (L0).
   - Path type deps: Entity + PathWinding (move it, class a); path package uses only Path, PathMesh(Typed), PathSegment,
     StrokeStyle, PathMorph*, MatrixLike, RectangleLike - all self-contained or geometry. Rust flight-path already depends only on flight-geometry.
   - Cost: drop `extends Entity` for these value types in Rust (already the case), and geometry's `log` pool guards must not pull flight-types (log -> signals).
   With this, value-scenario violations drop to **0**.
3. Object/handle types (Node, Texture, Host, MeshGeometry, Camera3D ...) must stay pure in flight-types; give them free
   functions (optionally per-crate extension traits). Making them sugar-bearing produces 201 hard edges + 165 secondary-name edges.
   (Only 5 sugar->sugar missing edges would arise and all are acyclic: QuadBatch/Tilemap/ParticleEmitter2D -> TextureAtlas,
   Skeleton3D -> Node3D, StandardPbrMaterial -> Texture.)
4. Still do the (c) moves for renderer hygiene: Node plug-in runtimes (ColorAdjustmentRuntime, NodeInteractionState) to slots;
   Gl/Wgpu state and StrokeTessellator to backend crates.
