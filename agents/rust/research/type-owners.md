# Flight consolidated type/export ownership table

Pinned TypeScript source: `@flighthq/types` at `a627849` (`packages/types/src`; tests, `index.ts`, and `contract.ts` excluded).

This is the corrected review artifact for WP9. It applies the first-pass owner data, the 58 dominator re-homes and 90 cycle-breaking fixes, the later text/host decisions, the approved `textformat`, `resource`, `hostcapability`, and `meshgeometry` placements, and Principal's dead-code ruling. It does not create a central types crate.

## Validation summary

- Coverage: **complete** — 1024 source files, 3436 declaration spans, and 3377 unique `file::symbol` rows.
- Export coverage: 3399 exported declaration spans; declaration merging is retained as multiple source locations on one row.
- Ownership inputs: 58 dominator file moves, all 90 fix entries, and all 84 reviewed ambiguous files were applied and target-checked.
- Entity closure: 340 direct, 10 factory-proven concrete objects, 242 transitive, 1 root, 1 union-of-entities, and 2783 non-Entity symbols. Runtime-bearing Entity rows total 593; the union-of-entities is represented as an enum of Entity variants and carries no runtime slot. 865 type aliases were analyzed by top-level composition, direct Entity declarations occur in 238 files, and factory-proven declarations occur in 8 files.
- Settled alias correction remains unchanged: 532 Entity rows before, 583 after; 51 rows changed classification.
- Factory-return refinement: 583 classified rows before, 594 after (593 runtime-bearing Entity rows plus 1 union-of-entities); 11 rows changed classification from 16 exact Entity-intersection create* signatures. 13 evidence records across 12 concrete declared types qualify, while 2 records for 2 plain-record unions are retained as rejected evidence.
- Entity validation examples: `Sprite -> Node2D -> Node -> Entity`, `Mesh -> Node3D -> Node -> Entity`, `Node2D -> Node -> Entity`, `Node3D -> Node -> Entity`, `NodeOf -> Node -> Entity`, and the all-Entity union `TrayCreateResult -> Entity`.
- False-positive guards: generic constraints, typed fields, arrays, utility types, conditional types, ordinary create* returns, non-create return usage, implementation bodies, dispatch infrastructure, and analogy do not create Entity edges; `CollisionBuiltInShape2D` and `CollisionColliderShape3D` remain non-Entity because they are unions of plain records, and `EntityConstruction`, `EntityWithoutRuntime`, `SpatialIndexRuntime2D`, `SpatialIndexRuntime3D`, and the mixed union `HitArea` also validate as non-Entity.
- TS-only: 227 symbols are owned by D11 TS-only packages and therefore have no Rust crate.
- Dropped: **14 symbols** are marked `dropped: unused (principal)` and have no owner or Rust crate.
- Unresolved: **0 symbols** remain; no new ownership guess was made.
- Input consistency: **pass** — declaration/file/name key sets match, the pinned source file set matches the first-pass inventory, all fix targets exist, and all ambiguous-review rows resolve to concrete source files.

Entity values mean: `root` = `Entity`; `direct` = immediate interface/class heritage or a top-level alias operand names `Entity`; `factory` = an exported `create*` factory explicitly returns `X & Entity` for concrete object type `X`; `transitive` = interface/class or non-union alias composition reaches Entity through another declared symbol; `union-of-entities` = every union member is an Entity but the union/enum itself has no runtime slot; `none` = no Entity path. Intersections require any Entity operand. A union of non-Entity members does not become Entity merely because one consumer factory returns `X & Entity`. Generic constraints, generic arguments, typed fields, arrays, conditional types, opaque utility types, factory bodies, arbitrary return usage, and backend analogy do not create edges.

## Dropped declarations

| Source | Symbol | Reason |
|---|---|---|
| `packages/types/src/BatchBarrier.ts:4-15` | `BatchBarrier` | dropped: unused (principal) |
| `packages/types/src/CanvasEffectSupport.ts:1-2` | `CanvasEffectSupport` | dropped: unused (principal) |
| `packages/types/src/CdlValues.ts:1-6` | `CdlValues` | dropped: unused (principal) |
| `packages/types/src/Group.ts:2-2` | `Group` | dropped: unused (principal) |
| `packages/types/src/Group.ts:3-3` | `GroupRuntime` | dropped: unused (principal) |
| `packages/types/src/Group.ts:4-5` | `GroupKind` | dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:3-6` | `LodLevel` | dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:7-10` | `LodMesh` | dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:11-11` | `LodMeshRuntime` | dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:12-13` | `LodMeshKind` | dropped: unused (principal) |
| `packages/types/src/MouseButton.ts:1-6, packages/types/src/MouseButton.ts:7-8` | `MouseButton` | dropped: unused (principal) |
| `packages/types/src/PlayMode.ts:1-2` | `PlayMode` | dropped: unused (principal) |
| `packages/types/src/TextListMarker.ts:7-8` | `TextListMarker` | dropped: unused (principal) |
| `packages/types/src/TextSelectionRange.ts:1-6` | `TextSelectionRange` | dropped: unused (principal) |

## Entity correction delta

The prior interface/class-only closure missed these rows. Every path below is regenerated from the pinned source graph; alias references and source spans remain in the JSON companion.

| Symbol | Before | After | Entity path |
|---|---|---|---|
| `AppWindow::WindowResizeTargetHandle` | `none` | `direct` | `AppWindow::WindowResizeTargetHandle -> Entity::Entity` |
| `Billboard::Billboard` | `none` | `transitive` | `Billboard::Billboard -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `BitmapText::BitmapText` | `none` | `transitive` | `BitmapText::BitmapText -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `CapacitorHost::CapacitorHost` | `none` | `transitive` | `CapacitorHost::CapacitorHost -> Host::Host -> Entity::Entity` |
| `DisplayObject::DisplayObject` | `none` | `transitive` | `DisplayObject::DisplayObject -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `GlShaderLocations::GlBitmapShader` | `none` | `direct` | `GlShaderLocations::GlBitmapShader -> Entity::Entity` |
| `Group::Group` | `none` | `transitive` | `Group::Group -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `HasAppearance::AppearanceNode` | `none` | `transitive` | `HasAppearance::AppearanceNode -> Node::NodeOf -> Node::Node -> Entity::Entity` |
| `HasBlendMode::BlendModeNode` | `none` | `transitive` | `HasBlendMode::BlendModeNode -> Node::NodeOf -> Node::Node -> Entity::Entity` |
| `HasBoundsRectangle::BoundsNode` | `none` | `transitive` | `HasBoundsRectangle::BoundsNode -> HasBoundsRectangle::HasBoundsRectangle -> Entity::Entity` |
| `HasBoundsRectangle::BoundsNodeAny` | `none` | `transitive` | `HasBoundsRectangle::BoundsNodeAny -> HasBoundsRectangle::HasBoundsRectangle -> Entity::Entity` |
| `HasBoundsRectangle::Spatial2DNode` | `none` | `transitive` | `HasBoundsRectangle::Spatial2DNode -> HasBoundsRectangle::HasBoundsRectangle -> Entity::Entity` |
| `HasClip::ClipNode` | `none` | `transitive` | `HasClip::ClipNode -> HasClip::HasClip -> Entity::Entity` |
| `HasColorScaleBias::ColorScaleBiasNode` | `none` | `transitive` | `HasColorScaleBias::ColorScaleBiasNode -> Node::NodeOf -> Node::Node -> Entity::Entity` |
| `HasMaterial::MaterialNode` | `none` | `transitive` | `HasMaterial::MaterialNode -> Node::NodeOf -> Node::Node -> Entity::Entity` |
| `HasTransform2D::Transform2DNode` | `none` | `transitive` | `HasTransform2D::Transform2DNode -> HasTransform2D::HasTransform2D -> Entity::Entity` |
| `HasTransform3D::Transform3DNode` | `none` | `transitive` | `HasTransform3D::Transform3DNode -> Node::NodeOf -> Node::Node -> Entity::Entity` |
| `HostFullscreen::FullscreenTargetHandle` | `none` | `direct` | `HostFullscreen::FullscreenTargetHandle -> Entity::Entity` |
| `HtmlView::HtmlView` | `none` | `transitive` | `HtmlView::HtmlView -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `InstancedMesh::InstancedMesh` | `none` | `transitive` | `InstancedMesh::InstancedMesh -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `LodMesh::LodMesh` | `none` | `transitive` | `LodMesh::LodMesh -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `Mesh::Mesh` | `none` | `transitive` | `Mesh::Mesh -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `Midi::MidiPort` | `none` | `transitive` | `Midi::MidiPort -> Midi::MidiInputPort -> Entity::Entity` |
| `MorphShape::MorphShape` | `none` | `transitive` | `MorphShape::MorphShape -> Shape::Shape -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `MovieClip::MovieClip` | `none` | `transitive` | `MovieClip::MovieClip -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `NativeText::NativeText` | `none` | `transitive` | `NativeText::NativeText -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Node2D::Node2D` | `none` | `transitive` | `Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Node2DInteractionSignals::Node2DInteractionSignals` | `none` | `transitive` | `Node2DInteractionSignals::Node2DInteractionSignals -> InteractionSignals::InteractionSignals -> Entity::Entity` |
| `Node3D::Node3D` | `none` | `transitive` | `Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `Node::NodeOf` | `none` | `transitive` | `Node::NodeOf -> Node::Node -> Entity::Entity` |
| `ParticleEmitter2D::ParticleEmitter2D` | `none` | `transitive` | `ParticleEmitter2D::ParticleEmitter2D -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `ParticleEmitter3D::ParticleEmitter3D` | `none` | `transitive` | `ParticleEmitter3D::ParticleEmitter3D -> Node3D::Node3D -> Node::Node -> Entity::Entity` |
| `ParticleObject::ParticleObject` | `none` | `transitive` | `ParticleObject::ParticleObject -> HasTransform2D::HasTransform2D -> Entity::Entity` |
| `Physics3D::Physics3DBallAndSocketJoint` | `none` | `transitive` | `Physics3D::Physics3DBallAndSocketJoint -> Physics3D::Physics3DJoint -> Entity::Entity` |
| `Physics3D::Physics3DFixedJoint` | `none` | `transitive` | `Physics3D::Physics3DFixedJoint -> Physics3D::Physics3DJoint -> Entity::Entity` |
| `QuadBatch::QuadBatch` | `none` | `transitive` | `QuadBatch::QuadBatch -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `RenderCacheAdapter::RenderCacheAdapter` | `none` | `direct` | `RenderCacheAdapter::RenderCacheAdapter -> Entity::Entity` |
| `RichText::RichText` | `none` | `transitive` | `RichText::RichText -> TextLabel::TextLabel -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Scale9Shape::Scale9Shape` | `none` | `transitive` | `Scale9Shape::Scale9Shape -> Shape::Shape -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Scale9Sprite::Scale9Sprite` | `none` | `transitive` | `Scale9Sprite::Scale9Sprite -> Sprite::Sprite -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Shape::Shape` | `none` | `transitive` | `Shape::Shape -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Sprite::Sprite` | `none` | `transitive` | `Sprite::Sprite -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `TauriHost::TauriHost` | `none` | `transitive` | `TauriHost::TauriHost -> Host::Host -> Entity::Entity` |
| `TextLabel::TextLabel` | `none` | `transitive` | `TextLabel::TextLabel -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Texture::Texture` | `none` | `transitive` | `Texture::Texture -> Texture::TextureCommon -> Entity::Entity` |
| `Tilemap::Tilemap` | `none` | `transitive` | `Tilemap::Tilemap -> Node2D::Node2D -> Node::Node -> Entity::Entity` |
| `Tray::TrayCreateResult` | `none` | `direct` | `Tray::TrayCreateResult -> Entity::Entity` |
| `WgpuDualSourceEffectPipeline::WgpuDualSourceEffectPipeline` | `none` | `transitive` | `WgpuDualSourceEffectPipeline::WgpuDualSourceEffectPipeline -> WgpuEffectPipeline::WgpuEffectPipeline -> Entity::Entity` |
| `WgpuEffectPipeline::WgpuEffectPipeline` | `none` | `direct` | `WgpuEffectPipeline::WgpuEffectPipeline -> Entity::Entity` |
| `WgpuRenderState::WgpuOffscreenRenderStateResult` | `none` | `direct` | `WgpuRenderState::WgpuOffscreenRenderStateResult -> Entity::Entity` |
| `WgpuRenderTarget::WgpuRenderTargetPool` | `none` | `direct` | `WgpuRenderTarget::WgpuRenderTargetPool -> Entity::Entity` |

## Factory-return Entity refinement delta

These are the only rows newly affected by accepted exact exported `create*` return annotations in pinned non-test package source. Concrete object targets become `factory`; an all-Entity union becomes `union-of-entities` and carries no runtime slot. Factory coordinates below are the evidence reached by each row's regenerated path. The JSON companion also retains already-Entity evidence, the two rejected plain-record collision unions, and the intentionally unmapped generic `createGuardedEntity<Type>` signature.

| Symbol | Before | After | Factory return evidence | Entity path |
|---|---|---|---|---|
| `DomScene2DRectangle::DomScene2DRectangle` | `none` | `factory` | `packages/scene2d-dom/src/domClipRectangle.ts:68-71 createDomScene2DRectangle(): DomScene2DRectangle & Entity` | `DomScene2DRectangle::DomScene2DRectangle -> Entity::Entity` |
| `FlightDocument::FlightDocumentScene` | `none` | `union-of-entities` | `packages/scene-document/src/sceneDocumentScene2DMaterialization.ts:48-53 createFlightDocumentFromScene2D(): FlightDocumentScene2D & Entity; packages/scene-document/src/sceneDocumentScene3DMaterialization.ts:65-72 createFlightDocumentFromScene3D(): FlightDocumentScene3D & Entity` | `FlightDocument::FlightDocumentScene -> FlightDocument::FlightDocumentScene2D -> Entity::Entity` |
| `FlightDocument::FlightDocumentScene2D` | `none` | `factory` | `packages/scene-document/src/sceneDocumentScene2DMaterialization.ts:48-53 createFlightDocumentFromScene2D(): FlightDocumentScene2D & Entity` | `FlightDocument::FlightDocumentScene2D -> Entity::Entity` |
| `FlightDocument::FlightDocumentScene3D` | `none` | `factory` | `packages/scene-document/src/sceneDocumentScene3DMaterialization.ts:65-72 createFlightDocumentFromScene3D(): FlightDocumentScene3D & Entity` | `FlightDocument::FlightDocumentScene3D -> Entity::Entity` |
| `GlyphOutlineSource::GlyphOutlineSource` | `none` | `factory` | `packages/font-formats/src/openTypeGlyphOutlineSource.ts:66-70 createGlyphOutlineSourceFromOpenTypeFont(): (GlyphOutlineSource & Entity) \| null` | `GlyphOutlineSource::GlyphOutlineSource -> Entity::Entity` |
| `Keyboard::SoftKeyboard` | `none` | `factory` | `packages/keyboard/src/keyboard.ts:52-52 createSoftKeyboard(): SoftKeyboard & Entity` | `Keyboard::SoftKeyboard -> Entity::Entity` |
| `RequirementCodegen::RequirementCodegenPlan` | `none` | `factory` | `packages/requirement-codegen/src/requirementCodegen.ts:14-18 createRequirementCodegenPlan(): RequirementCodegenPlan & Entity` | `RequirementCodegen::RequirementCodegenPlan -> Entity::Entity` |
| `Scene2DKindUsage::Scene2DKindUsage` | `none` | `factory` | `packages/scene2d/src/sceneKindUsage.ts:13-13 createScene2DKindUsage(): Scene2DKindUsage & Entity` | `Scene2DKindUsage::Scene2DKindUsage -> Entity::Entity` |
| `ShapedRun::ShapedRun` | `none` | `factory` | `packages/textshaper/src/textShaperRun.ts:23-23 createShapedRun(): ShapedRun & Entity` | `ShapedRun::ShapedRun -> Entity::Entity` |
| `Spatial::SpatialIndexBackend2D` | `none` | `factory` | `packages/spatial/src/uniformGrid.ts:48-48 createUniformGridSpatialBackend2D(): SpatialIndexBackend2D & Entity` | `Spatial::SpatialIndexBackend2D -> Entity::Entity` |
| `Spatial::SpatialIndexBackend3D` | `none` | `factory` | `packages/spatial/src/bvh3D.ts:35-35 createBvhSpatialBackend3D(): SpatialIndexBackend3D & Entity; packages/spatial/src/uniformGrid3D.ts:19-19 createUniformGridSpatialBackend3D(): SpatialIndexBackend3D & Entity` | `Spatial::SpatialIndexBackend3D -> Entity::Entity` |

## Complete table

`Rust crate` is blank for TS-only, dropped, and unresolved symbols. `Owner basis` is the final, highest-precedence decision; the JSON companion retains the complete ownership trace, alias references, and Entity path.

| Source | Symbol | Kind | Exported | Owner package | Rust crate | Entity | TS-only | Owner basis / notes |
|---|---|---|:---:|---|---|---|:---:|---|
| `packages/types/src/Aabb.ts:7-11` | `Aabb` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Aabb.ts:12-16` | `AabbLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:9-20` | `AbcFile` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:21-30` | `AbcConstantPool` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:31-40` | `AbcNamespace` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:41-54` | `AbcMultiname` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:55-68` | `AbcMethod` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:69-74` | `AbcOptionalValue` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:75-80` | `AbcMetadata` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:81-86` | `AbcMetadataItem` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:87-99` | `AbcInstance` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:100-105` | `AbcClass` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:106-114` | `AbcScript` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:115-136` | `AbcTrait` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:137-150` | `AbcMethodBody` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:151-160` | `AbcException` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:161-174; packages/types/src/Abc.ts:175-176` | `AbcMultinameKind` | `const,type` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:177-186; packages/types/src/Abc.ts:187-192` | `AbcTraitKind` | `const,type` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Abc.ts:193-201` | `AbcInstruction` | `interface` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Abc.ts:202-370; packages/types/src/Abc.ts:371-372` | `AbcOpcode` | `const,type` | yes | `abc` | `flight-abc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accelerator.ts:5-6` | `Accelerator` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AcceleratorParseError.ts:3-8` | `AcceleratorParseError` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AcceleratorParseError.ts:9-15` | `AcceleratorParseErrorReason` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:10-33` | `AccessibilityRole` | `type` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:34-39` | `AccessibilityLiveness` | `type` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:40-60` | `AccessibilityState` | `interface` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:61-71` | `AccessibilityNode` | `interface` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:72-75` | `AccessibilityOperationBlockReason` | `type` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:76-81` | `AccessibilityOperationOutcome` | `type` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Accessibility.ts:82-90` | `HostAccessibilityCapability` | `interface` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AccessibilityDescriptor.ts:1-6` | `AccessibilityDescriptor` | `interface` | yes | `accessibility` | `flight-accessibility` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/Adjustment.ts:15-18` | `Adjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AdjustmentKind.ts:7-8` | `AdjustmentKind` | `type` | yes | `adjustments` | `flight-adjustments` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AdvancedBlendMode.ts:27-42; packages/types/src/AdvancedBlendMode.ts:43-44` | `AdvancedBlendMode` | `const,type` | yes | `effects` | `flight-effects` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AgxToneMapOptions.ts:1-5` | `AgxToneMapOptions` | `interface` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AlphaType.ts:15-16` | `AlphaType` | `type` | yes | `texture` | `flight-texture` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AmbientLight.ts:6-15` | `AmbientLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AmbientLight.ts:16-17` | `AmbientLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AmbientLightOptions.ts:3-11` | `AmbientLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimatedNormalModifier.ts:11-20` | `AnimatedNormalModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimatedNormalModifier.ts:21-22` | `AnimatedNormalModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimatedNormalModifierOptions.ts:4-11` | `AnimatedNormalModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationBlendTree.ts:9-15` | `AnimationBlendTreeInput` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/AnimationBlendTree.ts:16-22` | `AnimationBlendTreeChannelSource` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationBlendTree.ts:23-30` | `AnimationBlendTreeChannel` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationBlendTree.ts:31-37` | `AnimationBlendTree` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationChannel.ts:7-11` | `AnimationChannel` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationClip.ts:8-13` | `AnimationClip` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationClipEvent.ts:5-10` | `AnimationClipEvent` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationCrossfade.ts:8-16` | `AnimationCrossfadeChannel` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationCrossfade.ts:17-25` | `AnimationCrossfadeOptions` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationCrossfade.ts:26-37` | `AnimationCrossfade` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationInterpolation.ts:4-5` | `AnimationInterpolation` | `type` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AnimationInterpolation.ts:6` | `AnimationInterpolationCubic` | `const` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AnimationInterpolation.ts:7` | `AnimationInterpolationLinear` | `const` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AnimationInterpolation.ts:8-9` | `AnimationInterpolationStep` | `const` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AnimationLayerStack.ts:7-15` | `AnimationLayerOptions` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLayerStack.ts:16-24` | `AnimationLayer` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLayerStack.ts:25-30` | `AnimationLayerStackChannelSource` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLayerStack.ts:31-37` | `AnimationLayerStackChannel` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLayerStack.ts:38-46` | `AnimationLayerStack` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLoopMode.ts:5-6` | `AnimationLoopMode` | `type` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLoopMode.ts:7` | `AnimationLoopModePingPong` | `const` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationLoopMode.ts:8-9` | `AnimationLoopModeRepeat` | `const` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationPlayer.ts:18-30` | `AnimationPlayer` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationRootMotionExtractor.ts:8-20` | `AnimationRootMotionExtractor` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationSampleAccumulator.ts:6-12` | `AnimationSampleAccumulator` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationStateMachine.ts:9-14` | `AnimationStateMachineState` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/AnimationStateMachine.ts:15-22` | `AnimationStateMachineChannel` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationStateMachine.ts:23-37` | `AnimationStateMachine` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationTrack.ts:13-22` | `AnimationTrack` | `interface` | yes | `animation` | `flight-animation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationTrackValidationDiagnostic.ts:4-10` | `AnimationTrackValidationCode` | `type` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnimationTrackValidationDiagnostic.ts:11-16` | `AnimationTrackValidationDiagnostic` | `interface` | yes | `animation` | `flight-animation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnisotropyPbrExtension.ts:6-13` | `AnisotropyPbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AnisotropyPbrExtension.ts:14-15` | `AnisotropyPbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:8-10` | `AppActivationPolicy` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:11-22` | `AppLoginItem` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:23-31` | `AppLoginItemLike` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:32-34` | `AppPathKind` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:35-44` | `AppEvents` | `interface` | yes | `app` | `flight-app` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/App.ts:45-46` | `MobileOsProfile` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:47-50` | `HostAppActivateCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:51-54` | `HostAppActivationPolicyCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:55-58` | `HostAppAllWindowsClosedCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:59-62` | `HostAppBadgeCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:63-71` | `HostAppDockCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:72-75` | `HostAppFocusCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:76-81` | `HostAppLocaleCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:82-86` | `HostAppLoginItemCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:87-90` | `HostAppNameCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:91-94` | `HostAppNameWriteCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:95-98` | `HostAppOpenFileCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:99-104` | `HostAppPathCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:105-108` | `HostAppQuitCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:109-112` | `HostAppQuitRequestCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:113-116` | `HostAppReadyCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:117-121` | `HostAppRecentDocumentsCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:122-125` | `HostAppRelaunchCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:126-129` | `HostAppSecondInstanceCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:130-135` | `HostAppSingleInstanceCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:136-139` | `HostAppUserModelIdCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:140-143` | `HostAppVersionCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:144-147` | `HostAppHideCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/App.ts:148-151` | `HostAppShowCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppearanceFlags.ts:1-38` | `AppearanceFlags` | `enum` | yes | `node` | `flight-node` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/AppLoop.ts:5-27` | `AppLoop` | `interface` | yes | `app` | `flight-app` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppLoopOptions.ts:2-15` | `AppLoopOptions` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppLoopOptions.ts:16-17` | `AppStepOptions` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppRenderView.ts:14-23` | `AppRenderView` | `interface` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-fixes.json:MODULE |
| `packages/types/src/AppRenderView.ts:24-30` | `AppRenderViewResize` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:MODULE |
| `packages/types/src/AppRenderView.ts:31-32` | `AppRenderViewTargetOptions` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:MODULE |
| `packages/types/src/AppRenderView.ts:33-38` | `GlAppRenderViewOptions` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:BACKEND |
| `packages/types/src/AppRenderView.ts:39-44` | `GlAppRenderView` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:BACKEND |
| `packages/types/src/AppRenderView.ts:45-50` | `GlRenderViewResources` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-fixes.json:BACKEND |
| `packages/types/src/AppWindow.ts:4-53` | `AppWindow` | `interface` | yes | `app` | `flight-app` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:54-76` | `WindowOptions` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:77-86` | `WindowBounds` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:87-90` | `NativeWindowHandle` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:91-94` | `WindowAttachmentOwnership` | `type` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:95-96` | `WindowResizeTargetHandle` | `type` | yes | `app` | `flight-app` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:97-102` | `HostWindowAppearanceCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:103-106` | `HostWindowAttachCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:107-111` | `HostWindowAttentionCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:112-115` | `HostWindowContentProtectionCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:116-119` | `HostWindowFocusCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:120-123` | `HostWindowFullscreenCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:124-135` | `HostWindowGeometryCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:136-139` | `HostWindowHierarchyCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:140-145` | `HostWindowLifecycleCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:146-149` | `HostWindowProgressCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:150-153` | `HostWindowShadowCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:154-158` | `HostWindowShellCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:159-166` | `HostWindowSizeConstraintsCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:167-172` | `HostWindowStateCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:173-178` | `HostWindowVisibilityCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AppWindow.ts:179-182` | `HostWindowZOrderCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AreaLight.ts:11-38` | `AreaLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AreaLight.ts:39-40` | `AreaLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AreaLightOptions.ts:6-31` | `AreaLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:8-14` | `AsepriteRect` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:15-19` | `AsepriteSize` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:20-31` | `AsepriteFrameTag` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:32-37` | `AsepriteLayer` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:38-48` | `AsepriteBaseFrame` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:49-51` | `AsepriteHashFrame` | `type` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:52-55` | `AsepriteArrayFrame` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:56-68` | `AsepriteMeta` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:69-74` | `AsepriteHashDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:75-79` | `AsepriteArrayDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:80-82` | `AsepriteDocument` | `type` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:83-87` | `AsepriteParsed` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AsepriteSchema.ts:88-92` | `AsepriteSerializeOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:15-28` | `AssetType` | `type` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:29-37` | `AssetDescriptor` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:38-43` | `AssetManifest` | `type` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:44-51` | `AssetLoaderAdapter` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:52-61` | `AssetEntry` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:62-73` | `AssetLibraryRuntime` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:74-79` | `AssetLibrary` | `interface` | yes | `assets` | `flight-assets` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Assets.ts:80-88` | `AssetLoadExplanation` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:89-91` | `AssetAcquireGuard` | `type` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:92-98` | `AssetLoadProgress` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Assets.ts:99-102` | `AssetGroupLoadOptions` | `interface` | yes | `assets` | `flight-assets` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Attachment2D.ts:9-13` | `Attachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AttachmentSkin2D.ts:7-26` | `SkinAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AttachmentSkin2D.ts:27-31` | `AttachmentSkin2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/AttractorForce.ts:3-12` | `AttractorForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/AttractorForce.ts:13-14` | `AttractorForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/AudioBus.ts:3-8` | `AudioBus` | `interface` | yes | `media` | `flight-media` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioBus.ts:9-14` | `AudioBusOptions` | `interface` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioBus.ts:15-18` | `AudioMixer` | `interface` | yes | `media` | `flight-media` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/AudioBus.ts:19-24` | `AudioMixerOptions` | `interface` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioBus.ts:25-29` | `AudioBusMixerOperation` | `type` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioBus.ts:30-31` | `AudioBusMixerGuard` | `type` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioDeviceHandle.ts:1-2` | `AudioBufferHandle` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AudioDeviceHandle.ts:3-4` | `AudioDeviceHandle` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AudioDeviceHandle.ts:5-6` | `AudioSourceHandle` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/AudioResource.ts:4-5` | `AudioChannelState` | `type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResource.ts:6-26` | `AudioChannel` | `interface` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/AudioResource.ts:27-33` | `AudioPlayOptions` | `interface` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResource.ts:34-37` | `AudioResource` | `interface` | yes | `audio` | `flight-audio` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResource.ts:38-42` | `AudioResourceUrl` | `interface` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:26-30; packages/types/src/AudioResourceReference.ts:31-32` | `AudioResourceReferenceKind` | `const,type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:33-37; packages/types/src/AudioResourceReference.ts:38-41` | `AudioResourceFailureKind` | `const,type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:42-47` | `AudioResourceFailure` | `interface` | yes | `audio` | `flight-audio` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/AudioResourceReference.ts:48-69` | `AudioResourceReferenceBase` | `interface` | no | `audio` | `flight-audio` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:70-77` | `EmbeddedAudioResourceReference` | `interface` | yes | `audio` | `flight-audio` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/AudioResourceReference.ts:78-83` | `ExternalAudioResourceReference` | `interface` | yes | `audio` | `flight-audio` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/AudioResourceReference.ts:84-87` | `AudioResourceReference` | `type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:88-97` | `AudioResourceFetch` | `type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:98-110` | `AudioDecoder` | `type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:111-112` | `AudioDecoderRegistry` | `type` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AudioResourceReference.ts:113-119` | `AudioResourceReferenceResolutionExplanation` | `interface` | yes | `audio` | `flight-audio` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/AutoExposureEffect.ts:2-9` | `AutoExposureEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:17-34` | `Awd2Block` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:35-61` | `Awd2BlockHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:62-71` | `Awd2BlockDispatch` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Awd2Block.ts:72-106` | `Awd2ParseState` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Awd2Block.ts:107-118` | `Awd2ParsedCamera` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:119-124` | `Awd2ParsedContainer` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:125-133` | `Awd2ParsedGeometry` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:134-139` | `Awd2ParsedJoint` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:140-167` | `Awd2ParsedLight` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:168-172` | `Awd2ParsedLightPicker` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:173-186` | `Awd2ParsedMaterial` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:187-194` | `Awd2ParsedMeshInstance` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:195-199` | `Awd2ParsedSkeleton` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:200-204` | `Awd2ParsedSkeletonAnimation` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:205-215` | `Awd2ParsedSkeletonPose` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Block.ts:216-222` | `Awd2ParsedTexture` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2Header.ts:9-21` | `Awd2Header` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Awd2ParseOptions.ts:21-36` | `Awd2ParseOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BackendExplanation.ts:1-7` | `BackendExplanation` | `interface` | yes | `hostcapability` | `flight-hostcapability` | `none` | no | foreman-WP9-approved-placement |
| `packages/types/src/BackendOperationExplanation.ts:15-30` | `BackendOperationExplanation` | `interface` | yes | `hostcapability` | `flight-hostcapability` | `none` | no | foreman-WP9-approved-placement |
| `packages/types/src/BarrelDistortionEffect.ts:2-7` | `BarrelDistortionEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BatchBarrier.ts:4-15` | `BatchBarrier` | `enum` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/BatchFormat.ts:13-17` | `BatchFormat` | `enum` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/BevelEffect.ts:7-48` | `BevelEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:17-44` | `BidiClass` | `type` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:45-49` | `BidiClassKernel` | `interface` | yes | `textbidi` | `flight-textbidi` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Bidi.ts:50-54` | `BidiClassKernelKind` | `type` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:55-62` | `BidiClassKernelExplanation` | `interface` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:63-68` | `BidiCodePointRange` | `interface` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:69-72` | `TextBidiGuard` | `type` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:73-78` | `BidiDirection` | `type` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bidi.ts:79-85` | `BidiRun` | `interface` | yes | `textbidi` | `flight-textbidi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Billboard.ts:4` | `BillboardMode` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Billboard.ts:5-9` | `Billboard` | `interface` | yes | `scene3d` | `flight-scene3d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Billboard.ts:10` | `BillboardRuntime` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Billboard.ts:11-12` | `BillboardKind` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:10-13` | `RectangleId` | `type` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:14-22` | `PackableRectangle` | `interface` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:23-32` | `PackedRectangle` | `interface` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:33-69` | `BinPackOptions` | `interface` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:70-80` | `PackResult` | `interface` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:81-91` | `BinPackHeuristic` | `type` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:92-93` | `UnpackedRectangleReason` | `type` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BinPack.ts:94-101` | `UnpackedRectangleExplanation` | `interface` | yes | `binpack` | `flight-binpack` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bitmap.ts:9-14` | `Bitmap` | `interface` | yes | `bitmap` | `flight-bitmap` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapBevelOptions.ts:3-23` | `BitmapBevelOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapBevelType.ts:1-2` | `BitmapBevelType` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/BitmapBoxBlurOptions.ts:1-6` | `BitmapBoxBlurOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapCompositeMode.ts:12-40; packages/types/src/BitmapCompositeMode.ts:41-42` | `BitmapCompositeMode` | `const,type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapConvolutionOptions.ts:3-13` | `BitmapConvolutionOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapDisplacementEffect.ts:5-11` | `BitmapDisplacementEffectEdgeMode` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapDisplacementEffect.ts:12-26` | `BitmapDisplacementEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapDisplacementMapMode.ts:1-2` | `BitmapDisplacementMapMode` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/BitmapDisplacementMapOptions.ts:5-31` | `BitmapDisplacementMapOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapDropShadowOptions.ts:3-11` | `BitmapDropShadowOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapEdgeMode.ts:9-10` | `BitmapEdgeMode` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapEncodeFailureExplanation.ts:3-7` | `BitmapEncodeFailureExplanation` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFingerprint.ts:8-15` | `BitmapFingerprint` | `interface` | yes | `bitmap` | `flight-bitmap` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:9-20` | `BitmapFontEncoding` | `type` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:21-33` | `BitmapFont` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:34-45` | `BitmapFontData` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:46-60` | `BitmapFontGlyphData` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:61-69` | `BitmapFontKerningData` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:70-83` | `BitmapFontKerningPair` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFont.ts:84-87` | `BitmapFontParseOptions` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontFormatKind.ts:5-6` | `BitmapFontFormatKind` | `type` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontFormatKind.ts:7-8` | `BitmapFontFormatKindBmFontBinary` | `const` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontFormatKind.ts:9-10` | `BitmapFontFormatKindBmFontText` | `const` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontFormatKind.ts:11-12` | `BitmapFontFormatKindBmFontXml` | `const` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontFormatKind.ts:13-14` | `BitmapFontFormatKindBmFontJson` | `const` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontGlyphExplanation.ts:6-23` | `BitmapFontGlyphExplanation` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontGlyphExplanation.ts:24-25` | `BitmapFontGlyphExplanationReason` | `type` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontImportOptions.ts:14-28` | `BitmapFontFormatEntry` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontImportOptions.ts:29-50` | `BitmapFontFormatDescriptor` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontImportOptions.ts:51-54` | `BitmapFontImportOptions` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontParseExplanation.ts:1-2` | `BitmapFontParseExplanationFormat` | `type` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontParseExplanation.ts:3-9` | `BitmapFontParseExplanationReason` | `type` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontParseExplanation.ts:10-19` | `BitmapFontParseExplanation` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontRecord.ts:7-20` | `BitmapFontCharRecord` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontRecord.ts:21-28` | `BitmapFontKerningRecord` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontRecord.ts:29-38` | `BitmapFontPageRecord` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontRecord.ts:39-47` | `BitmapFontRecord` | `interface` | yes | `bitmapfont-formats` | `flight-bitmapfont-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapFontSummary.ts:5-18` | `BitmapFontSummary` | `interface` | yes | `bitmapfont` | `flight-bitmapfont` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapGlowOptions.ts:3-10` | `BitmapGlowOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapGradientBevelOptions.ts:3-16` | `BitmapGradientBevelOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapGradientGlowOptions.ts:1-8` | `BitmapGradientGlowOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapHistogram.ts:1-7` | `BitmapHistogram` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapInnerGlowOptions.ts:3-10` | `BitmapInnerGlowOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapInnerShadowOptions.ts:3-18` | `BitmapInnerShadowOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapMismatch.ts:7-17` | `BitmapMismatch` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapReadback.ts:5-19` | `BitmapReadbackExplanation` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapReadback.ts:20-21` | `BitmapReadbackBlockReason` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapRegion.ts:3-10` | `BitmapRegion` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapResizeMode.ts:1-2` | `BitmapResizeMode` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapResizeOptions.ts:4-14` | `BitmapResizeOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapShadowBlurOptions.ts:1-6` | `BitmapShadowBlurOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapSharpenOptions.ts:1-10` | `BitmapSharpenOptions` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapText.ts:9-16` | `BitmapTextAlign` | `type` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapText.ts:17-44` | `BitmapTextData` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/BitmapText.ts:45-51` | `BitmapTextPage` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapText.ts:52-73` | `BitmapTextRuntime` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/BitmapText.ts:74-79` | `BitmapText` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapText.ts:80-89` | `BitmapTextOptions` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapText.ts:90-91` | `BitmapTextKind` | `const` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BitmapTextMissingGlyphs.ts:1-5` | `BitmapTextMissingGlyphs` | `interface` | yes | `bitmaptext` | `flight-bitmaptext` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BlendEffect.ts:13-19` | `BlendEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BlendMode.ts:16-24; packages/types/src/BlendMode.ts:25-26` | `BlendMode` | `const,type` | yes | `materials` | `flight-materials` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/BlinnPhongMaterial.ts:10-21` | `BlinnPhongMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BlinnPhongMaterial.ts:22-23` | `BlinnPhongMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BloomEffect.ts:3-10` | `BloomEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BlurEffect.ts:8-13` | `BlurEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BokehDepthOfFieldEffect.ts:3-9` | `BokehDepthOfFieldEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Bone2D.ts:15-28` | `Bone2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/BoundingBoxAttachment2D.ts:16-22` | `BoundingBoxAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BoundingBoxAttachment2D.ts:23-24` | `BoundingBoxAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BoundingSphere.ts:6-10` | `BoundingSphere` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BoundingSphere.ts:11-12` | `BoundingSphereLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BrightnessContrastAdjustment.ts:3-8` | `BrightnessContrastAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/BufferedLogSink.ts:5-8` | `BufferedLogSink` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ButtonController.ts:7-8` | `ButtonControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ButtonController.ts:9-12` | `ButtonController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ButtonController.ts:13-23` | `ButtonControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ButtonController.ts:24-29` | `ButtonControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ByteReader.ts:5-9` | `ByteReader` | `interface` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera2D.ts:16-33` | `Camera2D` | `interface` | yes | `camera` | `flight-camera` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera2D.ts:34-42` | `Camera2DFollowOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera2D.ts:43-49` | `Camera2DOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera3D.ts:15-24` | `Camera3D` | `interface` | yes | `camera` | `flight-camera` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera3D.ts:25-27` | `Camera3DLike` | `type` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera3D.ts:28-31` | `Projection` | `type` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Camera3D.ts:32-39` | `PerspectiveProjection` | `interface` | yes | `camera` | `flight-camera` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Camera3D.ts:40-51` | `OrthographicProjection` | `interface` | yes | `camera` | `flight-camera` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Camera3D.ts:52-56` | `RawProjection` | `interface` | yes | `camera` | `flight-camera` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Camera3DOptions.ts:5-11` | `Camera3DOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Camera3DViewExplanation.ts:4-16` | `Camera3DViewExplanation` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CameraMotionBlurEffect.ts:3-8` | `CameraMotionBlurEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CameraShake.ts:10-24` | `CameraShake` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CameraShake.ts:25-32` | `CameraShakeOptions` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CameraShake.ts:33-41` | `CameraShakeOffset` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/CanvasEffectSourceMode.ts:1-2` | `CanvasEffectSourceMode` | `type` | yes | `effects-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasEffectState.ts:16-26` | `CanvasEffectContext` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-fixes.json:RELOCATE; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasEffectState.ts:27-32` | `CanvasEffectRunner` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-fixes.json:RELOCATE; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasEffectState.ts:33-42` | `CanvasRenderTargetPool` | `interface` | yes | `scene2d-canvas` | `` | `direct` | yes | dissolve-types-fixes.json:RELOCATE; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasEffectState.ts:43-51` | `CanvasEffectState` | `interface` | yes | `effects-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasEffectSupport.ts:1-2` | `CanvasEffectSupport` | `type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/CanvasImageSourceKind.ts:3-4` | `CanvasImageSourceKind` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasMaterialState.ts:10-14` | `CanvasMaterialState` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types.md:rule-c; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasQuadMaterialRenderer.ts:12-15` | `CanvasQuadMaterialRenderer` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderOptions.ts:3-10` | `CanvasRenderOptions` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderPass.ts:13-21` | `CanvasRenderPass` | `interface` | yes | `scene2d-canvas` | `` | `direct` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderPass.ts:22-29` | `CanvasRenderPassViewport` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderPass.ts:30-39` | `CanvasSavedPassState` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderPass.ts:40-41` | `CanvasSavedBlendMode` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderState.ts:12-28` | `CanvasRenderState` | `interface` | yes | `scene2d-canvas` | `` | `transitive` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderState.ts:29-45` | `CanvasRenderRegistries` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderState.ts:46-73` | `CanvasRenderStateRuntime` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-ctor; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderStateOptions.ts:11-18` | `CanvasRenderStateOptions` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTarget.ts:9-19` | `CanvasRenderTarget` | `interface` | yes | `scene2d-canvas` | `` | `direct` | yes | text-host-ownership.md:C5; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTarget.ts:20-26` | `CanvasRenderTargetSurfaceOwnership` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | text-host-ownership.md:C5; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTarget.ts:27-32` | `CanvasScreenRenderTarget` | `interface` | yes | `scene2d-canvas` | `` | `transitive` | yes | text-host-ownership.md:C5; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTarget.ts:33-36` | `CanvasTextureRenderTarget` | `interface` | yes | `scene2d-canvas` | `` | `transitive` | yes | text-host-ownership.md:C5; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTexture.ts:7-8` | `CanvasRenderTextureStatus` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTexture.ts:9-14` | `CanvasRenderTextureExplanation` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTexture.ts:15-21` | `CanvasRenderTextureEntry` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasRenderTexture.ts:22-29` | `CanvasRenderTexturePool` | `interface` | yes | `scene2d-canvas` | `` | `direct` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasShapeDrawState.ts:5-30` | `CanvasShapeDrawState` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasShapeRegistry.ts:6-12` | `CanvasShapeHandler` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasShapeRegistry.ts:13-16` | `CanvasShapeCommand` | `interface` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasSurface.ts:7-11` | `CanvasSurface` | `interface` | yes | `surface` | `flight-surface` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CanvasTextInputOverlay.ts:4-5` | `CanvasTextInputOverlay` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasTextShaperBackend.ts:10-13` | `CanvasTextShaperBackend` | `interface` | yes | `host-web` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasTextureResolver.ts:10-25` | `CanvasTextureResolver` | `type` | yes | `scene2d-canvas` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CanvasTextureResolver.ts:26-57` | `CanvasTextureResolvers` | `interface` | yes | `scene2d-canvas` | `` | `direct` | yes | dissolve-types-owners-firstpass.json:a-ctor; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:35-51` | `CapacitorApi` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:52-57` | `CapacitorPluginListenerHandle` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:58-71` | `CapacitorAppPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:72-81` | `CapacitorAppInfo` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:82-86` | `CapacitorClipboardPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:87-91` | `CapacitorClipboardReadResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:92-100` | `CapacitorClipboardWriteOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:101-105` | `CapacitorDevicePlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:106-109` | `CapacitorDeviceId` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:110-123` | `CapacitorDeviceInfo` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:124-129` | `CapacitorDialogPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:130-135` | `CapacitorDialogAlertOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:136-142` | `CapacitorDialogConfirmOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:143-146` | `CapacitorDialogConfirmResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:147-155` | `CapacitorDialogPromptOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:156-164` | `CapacitorDialogPromptResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:165-177` | `CapacitorFilesystemPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:178-181` | `CapacitorFilesystemPathOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:182-186` | `CapacitorFilesystemReadOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:187-190` | `CapacitorFilesystemReadResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:191-197` | `CapacitorFilesystemWriteOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:198-201` | `CapacitorFilesystemWriteResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:202-206` | `CapacitorFilesystemCopyOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:207-211` | `CapacitorFilesystemMkdirOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:212-216` | `CapacitorFilesystemRmdirOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:217-222` | `CapacitorFilesystemReaddirResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:223-231` | `CapacitorFileInfo` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:232-243` | `CapacitorFilesystemStatResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:244-256` | `CapacitorGeolocationPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:257-262` | `CapacitorGeolocationOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:263-267` | `CapacitorGeolocationPermissionOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:268-272` | `CapacitorGeolocationPermissionStatus` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:273-277` | `CapacitorPosition` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:278-290` | `CapacitorPositionCoords` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:291-303` | `CapacitorHapticsPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:304-323` | `CapacitorKeyboardPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:324-337` | `CapacitorLocalNotificationsPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:338-348` | `CapacitorLocalNotificationSchema` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:349-352` | `CapacitorLocalNotificationsScheduleResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:353-356` | `CapacitorLocalNotificationsPending` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:357-360` | `CapacitorLocalNotificationsPermission` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:361-368` | `CapacitorLocalNotificationAction` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:369-377` | `CapacitorNetworkPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:378-384` | `CapacitorConnectionStatus` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:385-388` | `CapacitorSharePlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:389-396` | `CapacitorShareOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:397-403` | `CapacitorShareResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:404-412` | `CapacitorStatusBarPlugin` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorApi.ts:413-419` | `CapacitorStatusBarInfoResult` | `interface` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorAppCapabilitiesFor.ts:4` | `CapacitorCommonAppCapabilities` | `type` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorAppCapabilitiesFor.ts:5-7` | `CapacitorAndroidAppCapabilities` | `type` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorAppCapabilitiesFor.ts:8-11` | `CapacitorAppCapabilitiesFor` | `type` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorHost.ts:20-41` | `CapacitorHost` | `type` | yes | `host-capacitor` | `` | `transitive` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/CapacitorProtocolCapabilities.ts:3-4` | `CapacitorProtocolCapabilities` | `type` | yes | `host-capacitor` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Capsule.ts:5-14` | `Capsule` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Capsule.ts:15-16` | `CapsuleLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CaptureBaseline.ts:9-10` | `CaptureBaseline` | `type` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CaptureBaselineField.ts:7-8` | `CaptureBaselineField` | `type` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CaptureBaselineProvenance.ts:18-52` | `CaptureBaselineProvenance` | `interface` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/CaptureBaselineProvenanceField.ts:8-9` | `CaptureBaselineProvenanceField` | `type` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CaptureCheckResult.ts:7-12` | `CaptureCheckResult` | `interface` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CaptureCheckTier.ts:10-11` | `CaptureCheckTier` | `type` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/CaptureColumnBaseline.ts:10-42` | `CaptureColumnBaseline` | `interface` | yes | `capture` | `flight-capture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CdlValues.ts:1-6` | `CdlValues` | `interface` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/CffTable.ts:7-12` | `CffIndex` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/CffTable.ts:13-20` | `CffIndexEntry` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CffTable.ts:21-35` | `CffTable` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ChannelMixerAdjustment.ts:3-7` | `ChannelMixerAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ChromaticAberrationEffect.ts:3-8` | `ChromaticAberrationEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CircleCollider.ts:3-10` | `CircleCollider` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CircleCollider.ts:11-12` | `CircleColliderKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClearcoatPbrExtension.ts:5-17` | `ClearcoatPbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClearcoatPbrExtension.ts:18-19` | `ClearcoatPbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:2-8` | `ClipboardBookmark` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:9-15` | `ClipboardWriteItem` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:16-22` | `HostClipboardBookmarkCapability` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:23-28` | `HostClipboardChangeCapability` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:29-42` | `HostClipboardFormatsCapability` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:43-49` | `HostClipboardImageCapability` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clipboard.ts:50-56` | `HostClipboardTextCapability` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipboardFormat.ts:1` | `ClipboardFormatBookmark` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardFormat.ts:2` | `ClipboardFormatHtml` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardFormat.ts:3` | `ClipboardFormatImage` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardFormat.ts:4` | `ClipboardFormatRtf` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardFormat.ts:5` | `ClipboardFormatText` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardFormat.ts:6-7` | `ClipboardFormatUriList` | `const` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ClipboardWatch.ts:7-10` | `ClipboardWatch` | `interface` | yes | `clipboard` | `flight-clipboard` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClippingAttachment2D.ts:16-24` | `ClippingAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClippingAttachment2D.ts:25-26` | `ClippingAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:20-27` | `ClipRegion` | `interface` | yes | `clip` | `flight-clip` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:28-32` | `ClipRegionExplanation` | `interface` | yes | `clip` | `flight-clip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:33-38` | `ClipRegionContoursExplanation` | `interface` | yes | `clip` | `flight-clip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:39-47` | `ClipRegionContoursGuard` | `type` | yes | `clip` | `flight-clip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:48-49` | `ClipRegionReleaseGuard` | `type` | yes | `clip` | `flight-clip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClipRegion.ts:50-51` | `ClipRegionUseGuard` | `type` | yes | `clip` | `flight-clip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Clock.ts:9-29` | `Clock` | `interface` | yes | `clock` | `flight-clock` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ClockOptions.ts:3-9` | `ClockOptions` | `interface` | yes | `clock` | `flight-clock` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CocosPlistSchema.ts:8-24` | `CocosPlistFrame` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CocosPlistSchema.ts:25-33` | `CocosPlistMetadata` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CocosPlistSchema.ts:34-41` | `CocosPlistDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CocosPlistSchema.ts:42-46` | `CocosPlistParsed` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:14-22` | `ColladaDecodedSkin` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:23-30` | `ColladaDecodedAnimationChannel` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:31-38` | `ColladaPerspectiveCameraDefinition` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:39-46` | `ColladaOrthographicCameraDefinition` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:47` | `ColladaCameraDefinition` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:48-54` | `ColladaDecodedMorph` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:55` | `ColladaLightKind` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:56-83` | `ColladaLightDefinition` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:84-124` | `ColladaParseContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:125-167` | `ColladaElementDecoder` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:168-183` | `ColladaBuildContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:184-191` | `ColladaDeferredControllerBinding` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:192-197` | `ColladaDeferredCameraBinding` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaDecoding.ts:198-202` | `ColladaDeferredLightBinding` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaParse.ts:4` | `ColladaUpAxis` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaParse.ts:5-15` | `ColladaImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColladaParse.ts:16-22` | `ColladaParseResult` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:31-41` | `CollisionShapeKind2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:42-49` | `CollisionCircle2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:50-58` | `CollisionAabb2D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:59-80` | `CollisionObb2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:81-91` | `CollisionCapsule2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:92-97` | `CollisionPolygon2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:98-105` | `CollisionSegment2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:106-113` | `CollisionPoint2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:114-137` | `CollisionBuiltInShape2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:138-142` | `CollisionVendorShape2D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:143-147` | `CollisionVendorKind2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:148-155` | `CollisionShape2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:156-165` | `CollisionManifold2D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:166-177` | `CollisionRaycastHit2D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:178-187` | `CollisionTimeOfImpact2D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:188-195` | `CollisionTestExplanation2D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:196-215` | `CollisionTestStatus` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:216-224` | `CollisionSupport2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Collision.ts:225-232` | `CollisionPairTest2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:233-241` | `CollisionTestGuard2D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:242-267` | `CollisionContactPoint2D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:268-291` | `CollisionContactManifold2D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:292-302` | `CollisionShapeKind3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:303-312` | `CollisionSphere3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:313-327` | `CollisionAabb3D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:328-347` | `CollisionBox3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:348-363` | `CollisionCapsule3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:364-377` | `CollisionConvex3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:378-394` | `CollisionCylinder3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:395-404` | `CollisionCone3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:405-415` | `CollisionBuiltInShape3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:416-420` | `CollisionVendorKind3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:421-425` | `CollisionVendorShape3D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:426-439` | `CollisionShape3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:440-460` | `CollisionTriangleMesh3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:461-480` | `CollisionHeightfield3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:481-484` | `CollisionStaticShape3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:485-492` | `CollisionColliderShape3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:493-506` | `CollisionManifold3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:507-516` | `CollisionSupport3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Collision.ts:517-524` | `CollisionPairTest3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:525-536` | `CollisionTestGuard3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:537-547` | `CollisionTestExplanation3D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:548-568` | `CollisionContactPoint3D` | `interface` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:569-582` | `CollisionContactManifold3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:583-597` | `MAX_COLLISION_CONTACT_POINTS_3D` | `const` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:598-608` | `CollisionFaceQuery3D` | `type` | yes | `collision` | `flight-collision` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Collision.ts:609-638` | `CollisionRaycastHit3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:639-657` | `CollisionDistance3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Collision.ts:658-667` | `CollisionTimeOfImpact3D` | `interface` | yes | `collision` | `flight-collision` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/CollisionResponse.ts:3-7` | `CollisionResponse` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/ColorAdjustmentRuntime.ts:6-14` | `ColorAdjustmentRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorBlindSimulationAdjustment.ts:6-15` | `ColorBlindType` | `type` | yes | `adjustments` | `flight-adjustments` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorBlindSimulationAdjustment.ts:16-20` | `ColorBlindSimulationAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorGradeAdjustment.ts:7-19` | `ColorGradeAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorLut.ts:7-11` | `ColorLut` | `interface` | yes | `adjustments` | `flight-adjustments` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorLutAdjustment.ts:9-12` | `ColorLutAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorLutCache.ts:11-15` | `ColorLutCache` | `interface` | yes | `adjustments` | `flight-adjustments` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorMatrixAdjustment.ts:9-12` | `ColorMatrixAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorScaleBias.ts:9-19` | `ColorScaleBias` | `interface` | yes | `materials` | `flight-materials` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorScaleBias.ts:20-21` | `ColorScaleBiasLike` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorScaleBiasAdjustment.ts:7-11` | `ColorScaleBiasAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ColorTransformFunction.ts:7-8` | `ColorTransformFunction` | `type` | yes | `adjustments` | `flight-adjustments` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ComboBoxController.ts:8-9` | `ComboBoxControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ComboBoxController.ts:10-13` | `ComboBoxController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ComboBoxController.ts:14-20` | `ComboBoxControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ComboBoxController.ts:21-25` | `ComboBoxControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:18-28` | `Command` | `interface` | yes | `command` | `flight-command` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:29-36` | `CommandBinding` | `interface` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Command.ts:37-43` | `CommandBindingTable` | `type` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:44-66` | `CommandHistory` | `interface` | yes | `command` | `flight-command` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Command.ts:67-75` | `CommandPropertyEntry` | `interface` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:76-79` | `CompositeCommand` | `interface` | yes | `command` | `flight-command` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:80-86` | `AddNodeChildCommand` | `interface` | yes | `command` | `flight-command` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:87-94` | `RemoveNodeChildCommand` | `interface` | yes | `command` | `flight-command` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:95-103` | `ReorderNodeChildCommand` | `interface` | yes | `command` | `flight-command` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:104-116` | `SetNodePropertyCommand` | `interface` | yes | `command` | `flight-command` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Command.ts:117-123` | `CommandDispatchExplanation` | `interface` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:124` | `AddNodeChildCommandKind` | `const` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:125` | `CompositeCommandKind` | `const` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:126` | `RemoveNodeChildCommandKind` | `const` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:127` | `ReorderNodeChildCommandKind` | `const` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Command.ts:128-129` | `SetNodePropertyCommandKind` | `const` | yes | `command` | `flight-command` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CompositeEffect.ts:13-18` | `CompositeEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CompositeOperator.ts:13-26; packages/types/src/CompositeOperator.ts:27-28` | `CompositeOperator` | `const,type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CompressedImageData.ts:6-10` | `CompressedImageData` | `interface` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CompressedImageResource.ts:9-13` | `CompressedImageResource` | `interface` | yes | `image` | `flight-image` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:8-16` | `Decompressor` | `type` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:17-21; packages/types/src/Compression.ts:22-27` | `CompressionFraming` | `const,type` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:28-37; packages/types/src/Compression.ts:38-44` | `Compression` | `const,type` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:45-48` | `HostDecompressBrotliCapability` | `interface` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:49-52` | `HostDecompressDeflateCapability` | `interface` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:53-59` | `HostDecompressLzmaCapability` | `interface` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:60-63` | `HostCompressDeflateCapability` | `interface` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Compression.ts:64-67` | `HostCompressLzmaCapability` | `interface` | yes | `compression` | `flight-compression` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:4-16` | `ConnectivityConnectionType` | `type` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:17-35` | `ConnectivityStatus` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:36-42` | `ConnectivityReachability` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:43-54` | `ConnectivityReachabilityOptions` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:55-58` | `HostConnectivityStatusCapability` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:59-66` | `HostConnectivityChangeCapability` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:67-75` | `HostConnectivityReachabilityCapability` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Connectivity.ts:76-83` | `Connectivity` | `interface` | yes | `connectivity` | `flight-connectivity` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ContactShadowsEffect.ts:2-14` | `ContactShadowsEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ConvolutionEffect.ts:8-23` | `ConvolutionEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CreateCubeTextureOptions.ts:4-9` | `CreateCubeTextureOptions` | `interface` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CreateExternalTextureOptions.ts:4-12` | `CreateExternalTextureOptions` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/CreateRenderTextureOptions.ts:7-24` | `CreateRenderTextureOptions` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/CreateTextureOptions.ts:4-8` | `CreateTextureVariantOptions` | `type` | no | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CreateTextureOptions.ts:9-16` | `CreateTextureOptions` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CreateTextureOptions.ts:17-18` | `CreateTexture2DOptions` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CrtEffect.ts:3-10` | `CrtEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CubeTexture.ts:3-4` | `CubeTexture` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CurlNoiseForce.ts:1-10` | `CurlNoiseForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/CurlNoiseForce.ts:11-12` | `CurlNoiseForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/Cursor.ts:7-50` | `Cursor` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Cursor.ts:51-54` | `CursorBackend` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/CustomShaderEffect.ts:2-7` | `CustomShaderEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CustomShaderMaterial.ts:10-16` | `CustomShaderMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/CustomShaderMaterial.ts:17-18` | `CustomShaderMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Debug.ts:9-26` | `DebugSubsystemName` | `type` | yes | `debug` | `flight-debug` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Debug.ts:27-37` | `DebugSubsystemHooks` | `interface` | yes | `debug` | `flight-debug` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Debug.ts:38-44` | `DebugOptions` | `interface` | yes | `debug` | `flight-debug` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DecodedImage.ts:5-10` | `DecodedImage` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DepthMaterial.ts:6-11` | `DepthMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DepthMaterial.ts:12-13` | `DepthMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Device.ts:8-38` | `DeviceInfo` | `interface` | yes | `device` | `flight-device` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Device.ts:39-47` | `SafeAreaInsets` | `interface` | yes | `device` | `flight-device` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Device.ts:48-56` | `HostDeviceCapability` | `interface` | yes | `device` | `flight-device` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DeviceCapabilities.ts:4-9` | `DeviceCapabilities` | `interface` | yes | `device` | `flight-device` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DeviceDisplayMetrics.ts:4-13` | `DeviceDisplayMetrics` | `interface` | yes | `device` | `flight-device` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DeviceFormFactor.ts:3` | `DeviceFormFactorCar` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:4` | `DeviceFormFactorDesktop` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:5` | `DeviceFormFactorPhone` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:6` | `DeviceFormFactorTablet` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:7` | `DeviceFormFactorTV` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:8` | `DeviceFormFactorUnknown` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:9-14` | `DeviceFormFactorWatch` | `const` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/DeviceFormFactor.ts:15-16` | `DeviceFormFactor` | `type` | yes | `useragent` | `flight-useragent` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Dialog.ts:6-13` | `FileDialogFilter` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:14-21` | `FileDialogHandle` | `interface` | yes | `dialog` | `flight-dialog` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Dialog.ts:22-28` | `FileDialogHandleOperations` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:29-32` | `FileDialogHandleRuntime` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:33-38` | `OpenFileDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:39-42` | `OpenDirectoryDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:43-48` | `SaveFileDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:49-54` | `FileOpenDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:55-60` | `DirectoryOpenDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:61-66` | `FileSaveDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:67-72` | `OpenImageDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:73-74` | `MediaCaptureDialogFacingMode` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:75-79` | `CapturePhotoDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:80-84` | `CaptureVideoDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:85-91` | `DialogImage` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:92-98` | `DialogVideo` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:99-104` | `ImageOpenDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:105-110` | `PhotoCaptureDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:111-117` | `VideoCaptureDialogResult` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:118-127` | `PromptDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:128-129` | `MessageDialogKind` | `type` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:130-150` | `MessageDialogOptions` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Dialog.ts:151-156` | `MessageDialogResult` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalBlurEffect.ts:3-21` | `DirectionalBlurEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalLight.ts:11-42` | `DirectionalLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalLight.ts:43-47` | `DirectionalLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalLight.ts:48-52` | `DIRECTIONAL_SHADOW_MAP_SIZE` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalLight.ts:53-54` | `MAX_DIRECTIONAL_SHADOW_PCF_RADIUS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DirectionalLightOptions.ts:4-29` | `DirectionalLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DisplacementEffect.ts:5-11` | `DisplacementEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DisplayObject.ts:3-4` | `DisplayObjectRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/DisplayObject.ts:5-6` | `DisplayObject` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DissolveModifier.ts:11-20` | `DissolveModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DissolveModifier.ts:21-22` | `DissolveModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DissolveModifierOptions.ts:3-11` | `DissolveModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DitherEffect.ts:3-7` | `DitherEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DomBlendModeFidelity.ts:1-2` | `DomBlendModeFidelity` | `type` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomImageSourceKind.ts:3-4` | `DomImageSourceKind` | `type` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderOptions.ts:8-40` | `DomRenderOptions` | `interface` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:11-20` | `DomRenderState` | `interface` | yes | `scene2d-dom` | `` | `transitive` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:21-29` | `DomRenderRegistries` | `interface` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:30-56` | `DomRenderStateRuntime` | `interface` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-ctor; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:57-66` | `DomClipContourEntry` | `interface` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:67-71` | `DomClipEntry` | `type` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomRenderState.ts:72-75` | `DomClipHooks` | `interface` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomScene2DRectangle.ts:1-7` | `DomScene2DRectangle` | `interface` | yes | `scene2d-dom` | `` | `factory` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomTextInputOverlay.ts:4-5` | `DomTextInputOverlay` | `type` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DomTextureResolver.ts:4-5` | `DomTextureResolver` | `type` | yes | `scene2d-dom` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/DragForce.ts:1-5` | `DragForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/DragForce.ts:6-7` | `DragForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/DragonBonesRegistry.ts:9-16; packages/types/src/DragonBonesRegistry.ts:17-18` | `DragonBonesSectionKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:19-26; packages/types/src/DragonBonesRegistry.ts:27-28` | `DragonBonesTimelineKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:29-44` | `DragonBonesSectionContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:45-46` | `DragonBonesSectionHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:47-51` | `DragonBonesSectionHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:52-59` | `DragonBonesTimelineContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:60-65` | `DragonBonesTimelineHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:66-70` | `DragonBonesTimelineHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DragonBonesRegistry.ts:71-75` | `DragonBonesRegistry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/DropShadowEffect.ts:7-43` | `DropShadowEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EasingFunction.ts:1-2` | `EasingFunction` | `type` | yes | `easing` | `flight-easing` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/EasingSegment.ts:2-6` | `EasingSegment` | `interface` | yes | `easing` | `flight-easing` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Effect.ts:13-16` | `Effect` | `interface` | yes | `effects` | `flight-effects` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectCaptureGeometry.ts:5-12` | `EffectCaptureGeometry` | `interface` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectFieldRole.ts:5-8` | `EffectFieldRole` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectFieldRole.ts:9-13` | `EffectKindFieldRoles` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectFieldRole.ts:14-15` | `EffectFieldRoles` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectInput.ts:1-2` | `EffectInput` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectPadding.ts:4-10` | `EffectPadding` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/EffectPadding.ts:11-12` | `EffectPaddingResolver` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectPadding.ts:13-14` | `EffectPaddingStatus` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectPadding.ts:15-20` | `EffectPaddingExplanation` | `interface` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EffectSourceMode.ts:5-8` | `EffectSourceMode` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/EffectSourceMode.ts:9-10` | `InnerEffectSourceMode` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/ElectronApi.ts:20-41` | `ElectronApi` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:42-49` | `ElectronFs` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:50-84` | `ElectronApp` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:85-90` | `ElectronLoginItemSettings` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:91-97` | `ElectronLoginItemSettingsLike` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:98-104` | `ElectronDock` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:105-122` | `ElectronClipboard` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:123-130` | `ElectronClipboardData` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:131-144` | `ElectronShell` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:145-154` | `ElectronShortcutDetails` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:155-169` | `ElectronDialog` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:170-176` | `ElectronOpenDialogOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:177-182` | `ElectronSaveDialogOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:183-195` | `ElectronMessageBoxOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:196-202` | `ElectronGlobalShortcut` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:203-210` | `ElectronScreen` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:211-228` | `ElectronDisplay` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:229-237` | `ElectronPowerMonitorEvent` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:238-248` | `ElectronPowerMonitor` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:249-254` | `ElectronPowerSaveBlocker` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:255-259` | `ElectronNativeImageModule` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:260-265` | `ElectronNativeImage` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:266-274` | `ElectronIpcMain` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:275-281` | `ElectronIpcRenderer` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:282-285` | `ElectronIpcTarget` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:286-293` | `ElectronAutoUpdater` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:294-299` | `ElectronBrowserWindowConstructor` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:300-317` | `ElectronBrowserWindowOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:318-324` | `ElectronRectangle` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:325-369` | `ElectronBrowserWindow` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:370-375` | `ElectronMenuConstructor` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:376-379` | `ElectronMenu` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:380-391` | `ElectronMenuItemOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:392-437` | `ElectronMenuItemRole` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:438-441` | `ElectronTrayConstructor` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:442-458` | `ElectronTray` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:459-468` | `ElectronTrayBalloonOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:469-473` | `ElectronNotificationConstructor` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:474-482` | `ElectronNotificationOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronApi.ts:483-488` | `ElectronNotification` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronAppCapabilitiesFor.ts:4-21` | `ElectronCommonAppCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronAppCapabilitiesFor.ts:22-36` | `ElectronMacosAppCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronAppCapabilitiesFor.ts:37` | `ElectronLinuxAppCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronAppCapabilitiesFor.ts:38-40` | `ElectronWindowsAppCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronAppCapabilitiesFor.ts:41-46` | `ElectronAppCapabilitiesFor` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronHost.ts:24-27` | `ElectronNotificationCapabilitiesFor` | `type` | no | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronHost.ts:28-32` | `ElectronShellCapabilitiesFor` | `type` | no | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronHost.ts:33-73` | `ElectronHost` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronHost.ts:74-75` | `ElectronMacosHost` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronHostOptions.ts:3-10` | `ElectronHostOptions` | `interface` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronProtocolCapabilities.ts:3-6` | `ElectronProtocolCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronTrayCapabilitiesFor.ts:4-9` | `ElectronCommonTrayCapabilities` | `type` | no | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronTrayCapabilitiesFor.ts:10-11` | `ElectronMacosTrayCapabilities` | `type` | no | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronTrayCapabilitiesFor.ts:12-14` | `ElectronWindowsTrayCapabilities` | `type` | no | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ElectronTrayCapabilitiesFor.ts:15-20` | `ElectronTrayCapabilitiesFor` | `type` | yes | `host-electron` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/EmissiveMaterial.ts:7-13` | `EmissiveMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EmissiveMaterial.ts:14-15` | `EmissiveMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EmissiveModifier.ts:10-15; packages/types/src/EmissiveModifier.ts:16-22` | `EmissiveModifierFacing` | `const,type` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EmissiveModifier.ts:23-33` | `EmissiveModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EmissiveModifier.ts:34-35` | `EmissiveModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EmissiveModifierOptions.ts:4-12` | `EmissiveModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:1` | `Kind` | `type` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:2-4` | `Entity` | `interface` | yes | `entity` | `flight-entity` | `root` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:5` | `EntityConstruction` | `type` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:6` | `EntityWithoutRuntime` | `type` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:7-10` | `EntityRuntime` | `interface` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Entity.ts:11-16` | `EntityRuntimeKey` | `const` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:17-18` | `EntityRuntimeWriteSlot` | `type` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:19-24` | `EntityRuntimeWriteGuard` | `type` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Entity.ts:25-30` | `EntityRuntimeWriteExplanation` | `interface` | yes | `entity` | `flight-entity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Environment.ts:6-12` | `Environment` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Environment.ts:13-14` | `EnvironmentKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EnvironmentOptions.ts:3-8` | `EnvironmentOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EnvReflectModifier.ts:14-22` | `EnvReflectModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EnvReflectModifier.ts:23-24` | `EnvReflectModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EnvReflectModifierOptions.ts:1-7` | `EnvReflectModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/EulerOrder.ts:5-6` | `EulerOrder` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ExposureAdjustment.ts:7-11` | `ExposureAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ExtendedPbrMaterial.ts:8-13` | `ExtendedPbrMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ExtendedPbrMaterial.ts:14-15` | `ExtendedPbrMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ExternalTexture.ts:8-11` | `ExternalTexture` | `interface` | yes | `render` | `flight-render` | `transitive` | no | text-host-ownership.md:C5 |
| `packages/types/src/FileLogSink.ts:8-12` | `FileLogSink` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileLogSink.ts:13-18` | `FileLogSinkDestroyOutcome` | `interface` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:2-3` | `FileSystemPathKind` | `type` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:4-9` | `FileEntry` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:10-11` | `FileWatchEventType` | `type` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:12-16` | `FileWatchEvent` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:17-26` | `FileStat` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:27-34` | `FilePermissions` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:35-40` | `FileSystemUsage` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:41-61` | `FileSystemBasicOperations` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:62-72` | `HostFileSystemCapability` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FileSystem.ts:73-78` | `FileWalkOptions` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FilmEmulationEffect.ts:2-9` | `FilmEmulationEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FilmGrainEffect.ts:3-9` | `FilmGrainEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FilmicToneMapOptions.ts:1-9` | `FilmicToneMapOptions` | `interface` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:19-29` | `FlightDocumentNode` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:30-38` | `FlightDocument` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:39-40` | `FlightDocumentScene` | `type` | yes | `scene-document` | `flight-scene-document` | `union-of-entities` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:41-48` | `FlightDocumentScene2D` | `interface` | yes | `scene-document` | `flight-scene-document` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:49-57` | `FlightDocumentScene3D` | `interface` | yes | `scene-document` | `flight-scene-document` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocument.ts:58-63` | `FlightDocumentScene2DMaterialization` | `interface` | yes | `scene-document` | `flight-scene-document` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/FlightDocument.ts:64-71` | `FlightDocumentScene3DMaterialization` | `interface` | yes | `scene-document` | `flight-scene-document` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/FlightDocumentFieldSchema.ts:1-2` | `FlightDocumentScalar` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentFieldSchema.ts:3-6` | `FlightDocumentValue` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentFieldSchema.ts:7-10` | `FlightDocumentFields` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentFieldSchema.ts:11-14` | `FlightDocumentFieldValidator` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentFieldSchema.ts:15-21` | `FlightDocumentFieldSchema` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:6-7` | `FlightDocumentInteractiveStateProperty` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:8-9` | `FlightDocumentInteractiveStateValue` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:10-14` | `FlightDocumentInteractiveStateExtensionDescriptor` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:15-24` | `FlightDocumentInteractiveState` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:25-30` | `FlightDocumentInteractiveStates` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:31-37` | `FlightDocumentInteractiveStateTransitionDescriptor` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveState.ts:38-43` | `FlightDocumentInteractiveStateBinding` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentInteractiveStateExtensionSchema.ts:6-12` | `FlightDocumentInteractiveStateExtensionSchema` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/FlightDocumentInteractiveStateTransitionSchema.ts:5-10` | `FlightDocumentInteractiveStateTransitionSchema` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/FlightDocumentLayout.ts:7-8` | `FlightDocumentLayoutNode` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentLayout.ts:9-14` | `FlightDocumentLayoutTree` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentLayout.ts:15-21` | `FlightDocumentLayoutDescriptor` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentLayout.ts:22-26` | `FlightDocumentLayoutBinding` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentNodeSchema.ts:8-9` | `FlightDocumentResourceLookup` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentNodeSchema.ts:10-14` | `FlightDocumentNodeFactory` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentNodeSchema.ts:15-22` | `FlightDocumentNodeFieldWriter` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentNodeSchema.ts:23-29` | `FlightDocumentNodeSchema` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentRefusalExplanation.ts:6-69; packages/types/src/FlightDocumentRefusalExplanation.ts:70-74` | `FlightDocumentRefusalReason` | `const,type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentRefusalExplanation.ts:75-92` | `FlightDocumentRefusalExplanation` | `interface` | yes | `scene-document` | `flight-scene-document` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentResource.ts:6-11` | `FlightDocumentResourceDescriptor` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentResource.ts:12-17` | `FlightDocumentResourceResolver` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentResource.ts:18-21` | `FlightDocumentResourceResolverRegistry` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentResourceSchema.ts:4-8` | `FlightDocumentResourceSchema` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/FlightDocumentSchemaRegistry.ts:10-17` | `FlightDocumentSchemaRegistry` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/FlightDocumentText.ts:3-4` | `FlightDocumentText` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlightDocumentToken.ts:8-17` | `FlightDocumentToken` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/FlightDocumentToken.ts:18-23` | `FlightDocumentTokenValues` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/FlightDocumentToken.ts:24-30` | `FlightDocumentTokenResolution` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/FlightDocumentToken.ts:31-38` | `FlightDocumentTokenResolver` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/FlightDocumentToken.ts:39-42` | `FlightDocumentTokenResolverRegistry` | `interface` | yes | `scene-document` | `flight-scene-document` | `direct` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Flow.ts:16-28` | `FlowState` | `interface` | yes | `flow` | `flight-flow` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Flow.ts:29-33` | `FlowStack` | `interface` | yes | `flow` | `flight-flow` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/FlyCameraController.ts:13-25` | `FlyCameraController` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FlyCameraController.ts:26-34` | `FlyCameraControllerOptions` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusEventData.ts:13-18` | `FocusEventData` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusManager.ts:5-19` | `FocusDirection` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusManager.ts:20-25` | `FocusManager` | `interface` | yes | `interaction` | `flight-interaction` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusManager.ts:26-31` | `FocusManagerOptions` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusManager.ts:32-39` | `FocusNavigationOptions` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FocusManager.ts:40-41` | `FocusNavigationInput` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FogModifier.ts:8-13; packages/types/src/FogModifier.ts:14-22` | `FogModifierMode` | `const,type` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FogModifier.ts:23-33` | `FogModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FogModifier.ts:34-35` | `FogModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FogModifierOptions.ts:3-11` | `FogModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FontMetrics.ts:4-14` | `FontMetrics` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FontResource.ts:3-7` | `FontResource` | `interface` | yes | `font` | `flight-font` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FontResource.ts:8-12` | `FontUrl` | `interface` | yes | `font` | `flight-font` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FontVariation.ts:1-4` | `FontVariation` | `interface` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariation.ts:5` | `FontVariationItalic` | `const` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariation.ts:6` | `FontVariationOpticalSize` | `const` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariation.ts:7` | `FontVariationSlant` | `const` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariation.ts:8` | `FontVariationWeight` | `const` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariation.ts:9-10` | `FontVariationWidth` | `const` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/FontVariationAxis.ts:1-8` | `FontVariationAxis` | `interface` | yes | `font` | `flight-font` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/ForceFalloff.ts:3-4` | `ForceFalloff` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FrameScript.ts:5-6` | `FrameScript` | `type` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Frustum.ts:8-16` | `Frustum` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Frustum.ts:17-18` | `FrustumLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/FxaaEffect.ts:3-9` | `FxaaEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GamepadAxisKind.ts:1-7; packages/types/src/GamepadAxisKind.ts:8-9` | `GamepadAxisKind` | `const,type` | yes | `input` | `flight-input` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GamepadButtonKind.ts:1-21; packages/types/src/GamepadButtonKind.ts:22-23` | `GamepadButtonKind` | `const,type` | yes | `input` | `flight-input` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GamepadMappingKind.ts:10-11` | `GamepadMappingKind` | `type` | yes | `input` | `flight-input` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:8-21` | `GeolocationPosition` | `interface` | yes | `geolocation` | `flight-geolocation` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:22-25` | `GeolocationErrorReason` | `type` | yes | `geolocation` | `flight-geolocation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:26-30` | `GeolocationPositionResult` | `interface` | yes | `geolocation` | `flight-geolocation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:31-51` | `GeolocationRequestOptions` | `interface` | yes | `geolocation` | `flight-geolocation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:52-62` | `GeolocationAccessOutcome` | `type` | yes | `geolocation` | `flight-geolocation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Geolocation.ts:63-79` | `HostGeolocationCapability` | `interface` | yes | `geolocation` | `flight-geolocation` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoAlignment.ts:1-3` | `GizmoAlignment` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoAlignment.ts:4-10` | `GizmoSmartGuideResult` | `interface` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:10-11` | `GizmoStateNodeTypeKey` | `const` | no | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:12-20` | `GizmoHandleKind` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:21-22` | `GizmoMode` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:23-24` | `GizmoPivot` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:25-26` | `GizmoSpace` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:27-32` | `GizmoTransformMode` | `type` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:33-38` | `GizmoNode2DFeatures` | `interface` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:39-47` | `GizmoCreateOptions` | `interface` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:48-61` | `GizmoSignals` | `interface` | yes | `gizmo` | `flight-gizmo` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GizmoState.ts:62-65` | `GizmoState` | `interface` | yes | `gizmo` | `flight-gizmo` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlassExtendedPbrMaterialOptions.ts:8-12` | `GlassExtendedPbrMaterialOptions` | `interface` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCapabilities.ts:1-13` | `GlCapabilities` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlClassicProgram.ts:6-12` | `GlClassicLightingModel` | `type` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlClassicProgram.ts:13-38` | `GlClassicDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlClassicProgram.ts:39-50` | `GlClassicProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlColorAdjustmentResources.ts:3-9` | `GlColorAdjustmentResources` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlColorLutTextureCache.ts:8-12` | `GlColorLutTextureCache` | `interface` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCompressedTextureDecoder.ts:10-16` | `GlCompressedTextureDecoder` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCompressedTextureSupport.ts:12-20` | `GlCompressedTextureSupport` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCompressedTextureUploader.ts:15-21` | `GlCompressedTextureUploader` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/GlContext.ts:5-249` | `GlContextMember` | `type` | no | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/GlContext.ts:250-253` | `GlContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/GlContext.ts:254-259` | `GlContextOptions` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/GlContextLoss.ts:4-8` | `GlContextLossSignals` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlContextRuntime.ts:21-60` | `GlContextRuntime` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlContextState.ts:4-7` | `GlContextState` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCubeRenderTarget.ts:8-19` | `GlCubeRenderTarget` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCubeRenderTarget.ts:20-23` | `GlCubeRenderTargetOptions` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlCullFaceKind.ts:1-2` | `GlCullFaceKind` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlCustomMaterialShaderSource.ts:2-6` | `GlCustomMaterialShaderSource` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlDebugProgram.ts:9-19` | `GlDebugProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlDebugProgram.ts:20-26` | `GlDebugDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlDepthFuncKind.ts:1-10` | `GlDepthFuncKind` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlEffectState.ts:15-26` | `GlEffectContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlEffectState.ts:27-55` | `GlEffectRunner` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlEffectState.ts:56-65` | `GlEffectApplicationStatus` | `type` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEffectState.ts:66-82` | `GlEffectApplicationExplanation` | `interface` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEffectState.ts:83-86` | `GlEffectResolver` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlEffectState.ts:87-96` | `GlEffectRegistration` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlEffectState.ts:97-106` | `GlCustomShaderSourceGuard` | `type` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEffectState.ts:107-108` | `GlEffectStateSkipGuard` | `type` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEffectState.ts:109-113` | `GlEffectApplicationGuard` | `type` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEffectState.ts:114-125` | `EffectStateOptions` | `interface` | yes | `effects` | `flight-effects` | `none` | no | text-host-ownership.md:C2 |
| `packages/types/src/GlEffectState.ts:126-141` | `GlEffectState` | `interface` | yes | `effects-gl` | `flight-effects-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlEnvironmentCaptureOptions.ts:4-10` | `GlEnvironmentCaptureOptions` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlFramebufferStatusKind.ts:1-9` | `GlFramebufferStatusKind` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlFullscreenProgram.ts:5-12` | `GlFullscreenProgram` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlitchEffect.ts:5-12` | `GlitchEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlLitProgram.ts:9-35` | `GlLitProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlMatcapProgram.ts:6-17` | `GlMatcapDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlMatcapProgram.ts:18-24` | `GlMatcapProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlMeshMaterialRenderer.ts:24-43` | `GlMeshMaterialRenderer` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlMeshProgram.ts:7-45` | `GlMeshProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlModifierSnippet.ts:13-32` | `GlModifierBindContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlModifierSnippet.ts:33-38` | `GlModifierSnippet` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlParticleResources.ts:3-8` | `GlParticleResources` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/GlPbrExtensionBindContext.ts:6-18` | `GlPbrExtensionBindContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlPbrExtensionIssue.ts:3-10` | `GlPbrExtensionIssueCode` | `type` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlPbrExtensionIssue.ts:11-15` | `GlPbrExtensionIssue` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlPbrExtensionRegistration.ts:8-16` | `GlPbrExtensionRegistration` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlPbrExtensionShaderContext.ts:4-8` | `GlPbrExtensionShaderContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlPbrExtensionShaderContribution.ts:3-29` | `GlPbrExtensionShaderContribution` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlPbrProgram.ts:11-33` | `GlPbrProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlPbrProgram.ts:34-52` | `GlPbrDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlPbrTransmissionSceneColor.ts:3-9` | `GlPbrTransmissionSceneColor` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlQuadBatchResources.ts:3-10` | `GlQuadBatchResources` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/GlQuadMaterialRenderer.ts:19-33` | `GlQuadMaterialRenderer` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlRenderOptions.ts:5-16` | `GlRenderOptions` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/GlRenderPass.ts:10-15` | `GlRenderPass` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:31-39` | `GlRenderState` | `interface` | yes | `render-gl` | `flight-render-gl` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:40-65` | `GlRenderRegistries` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:66-73` | `GlBlendRealization` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:74-82` | `GlBlendSignature` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:83-87` | `GlBoundShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:88-89` | `GlBlendFactor` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:90-102` | `GlBlendEquation` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:103-118` | `GlColorAdjustmentMaterialFeature` | `interface` | yes | `scene2d-gl` | `flight-scene2d-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlRenderState.ts:119-127` | `GlColorAdjustmentMaterialFeatureGuard` | `type` | yes | `scene2d-gl` | `flight-scene2d-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlRenderState.ts:128-188` | `GlRenderStateRuntime` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/GlRenderState.ts:189-202` | `GlParticleShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:203-218` | `GlQuadBatchShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:219-229` | `GlColorScaleBiasInstancedShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:230-243` | `GlUniformColorScaleBiasShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:244-253` | `GlShapeMeshColorScaleBiasShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:254-262` | `GlScissorRect` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderState.ts:263-269` | `GlViewportRect` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderStateOptions.ts:22-39` | `GlRenderStateOptions` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/GlRenderStats.ts:1-9` | `GlRenderStats` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlRenderTarget.ts:15-26` | `GlRenderTarget` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderTarget.ts:27-39` | `GlScreenRenderTarget` | `interface` | yes | `render-gl` | `flight-render-gl` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/GlRenderTarget.ts:40-59` | `GlTextureRenderTarget` | `interface` | yes | `render-gl` | `flight-render-gl` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/GlRenderTarget.ts:60-63` | `GlTextureRenderTargetPool` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/GlRenderTexture.ts:7-8` | `GlRenderTextureStatus` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderTexture.ts:9-14` | `GlRenderTextureExplanation` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderTexture.ts:15-21` | `GlRenderTextureEntry` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRenderTexture.ts:22-29` | `GlRenderTexturePool` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/GlRenderTexture.ts:30-35` | `GlRenderTextureGuard` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlRichTextOverlay.ts:4-12` | `GlRichTextOverlay` | `type` | yes | `scene2d-gl` | `flight-scene2d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DForwardLightList.ts:7-11` | `GlScene3DForwardLightList` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:21-34` | `GlScene3DShadow` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:35-48` | `GlScene3DIbl` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:49-82` | `GlScene3DDrawEntry` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:83-102` | `GlMeshSkinFeature` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:103-109` | `GlScene3DPass` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlScene3DRuntime.ts:110-196` | `GlScene3DRuntime` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlScene3DRuntime.ts:197-213` | `GlMeshUpload` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/GlShadedProgram.ts:8-31` | `GlShadedDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlShadedProgram.ts:32-43` | `GlShadedProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlShader.ts:5-9` | `GlShader` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlShaderLocations.ts:4-15` | `GlShaderLocations` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlShaderLocations.ts:16-20` | `GlBitmapShader` | `type` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/GlShapeMesh.ts:6-13` | `GlShapeMesh` | `interface` | yes | `scene2d-gl` | `flight-scene2d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlShapeMeshBinding.ts:4-12` | `GlShapeMeshBinding` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlShapeMeshResources.ts:4-9` | `GlShapeMeshResources` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/GlShapeRendererData.ts:14-24` | `GlShapeRendererData` | `interface` | yes | `scene2d-gl` | `flight-scene2d-gl` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlSkinPaletteTexture.ts:11-16` | `GlSkinPaletteTexture` | `interface` | yes | `render-gl` | `flight-render-gl` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlSurface.ts:9-13` | `GlSurface` | `interface` | yes | `render-gl` | `flight-render-gl` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/GlTextureDescriptor.ts:3-12` | `GlTextureDescriptor` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlTextureDescriptor.ts:13-23` | `GlTextureInternalFormat` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlTextureFilterKind.ts:1-8` | `GlTextureFilterKind` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GlTextureResolver.ts:6-13` | `GlTextureRealization` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlTextureResolver.ts:14-20` | `GlTextureResolver` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlTextureWrapKind.ts:1-2` | `GlTextureWrapKind` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/GltfDraco.ts:11-25` | `GltfDracoMesh` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfDraco.ts:26-30` | `GltfDracoDecoder` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:10-15` | `GltfAccessorData` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:16-24` | `GltfAccessorFault` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:25-44` | `GltfCoreFeatureContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:45-60` | `GltfCoreFeatureHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:61-71` | `GltfExtensionContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:72-79` | `GltfExtensionHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfExtension.ts:80-85` | `GltfImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:10-30` | `GltfDocument` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:31-47` | `GltfCamera` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:48-52` | `GltfDocumentExtensions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:53-63` | `GltfPunctualLight` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:64-69` | `GltfAnimation` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:70-76` | `GltfAnimationChannel` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:77-85` | `GltfAnimationSampler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:86-119` | `GltfMaterial` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:120-127` | `GltfMaterialsAnisotropy` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:128-133` | `GltfMaterialsIor` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:134-146` | `GltfMaterialsIridescence` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:147-156` | `GltfMaterialsPbrSpecularGlossiness` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:157-165` | `GltfMaterialsSpecular` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:166-173` | `GltfMaterialsTransmission` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:174-184` | `GltfMaterialsVolume` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:185-194` | `GltfMaterialsClearcoat` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:195-200` | `GltfMaterialsEmissiveStrength` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:201-207` | `GltfMaterialsSheen` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:208-222` | `GltfPbrMetallicRoughness` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:223-232` | `GltfTextureInfo` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:233-239` | `GltfTextureTransform` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:240-244` | `GltfNormalTextureInfo` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:245-252` | `GltfOcclusionTextureInfo` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:253-263` | `GltfTexture` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:264-272` | `GltfSampler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:273-278` | `GltfImage` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:279-283` | `GltfScene3D` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:284-301` | `GltfNode` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:302-308` | `GltfSkin` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:309-319` | `GltfMesh` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:320-325` | `GltfMorphTarget` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:326-349` | `GltfPrimitive` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:350-355` | `GltfDracoMeshCompression` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:356-357` | `GltfComponentType` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:358-371` | `GltfAccessor` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:372-377` | `GltfAccessorSparse` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:378-384` | `GltfBufferView` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GltfSchema.ts:385-390` | `GltfBuffer` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlToonProgram.ts:8-24` | `GlToonDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlToonProgram.ts:25-32` | `GlToonProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlUnlitProgram.ts:6-19` | `GlUnlitDefineKey` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlUnlitProgram.ts:20-26` | `GlUnlitProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlVelocityWriter.ts:11-18` | `GlVelocityContext` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlVelocityWriter.ts:19-20` | `GlVelocityWriter` | `type` | yes | `render-gl` | `flight-render-gl` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/GlWireframeProgram.ts:5-16` | `GlWireframeProgram` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlWireframeProgram.ts:17-23` | `GlWireframeUpload` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/GlyphAtlasEntryExplanation.ts:4-22` | `GlyphAtlasEntryExplanation` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphAtlasEntryExplanation.ts:23-24` | `GlyphAtlasEntryBlockReason` | `type` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphExtents.ts:4-10` | `GlyphExtents` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphOutlineSource.ts:7-22` | `GlyphOutlineMetrics` | `interface` | yes | `font` | `flight-font` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphOutlineSource.ts:23-29` | `GlyphOutlineSource` | `interface` | yes | `font` | `flight-font` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:16-48` | `GlyphSource` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:49-64` | `GlyphEntry` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:65-74` | `GlyphMetrics` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:A3 |
| `packages/types/src/GlyphSource.ts:75-85` | `GlyphRasterizedBitmap` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:A3 |
| `packages/types/src/GlyphSource.ts:86-95` | `GlyphRasterizeOptions` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:A3 |
| `packages/types/src/GlyphSource.ts:96-107` | `HostGlyphRasterizerCapability` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:A3 |
| `packages/types/src/GlyphSource.ts:108-132` | `GlyphAtlasOptions` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:133-142` | `GlyphAtlasShelf` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:143-184` | `GlyphAtlasRuntime` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GlyphSource.ts:185-191` | `GlyphAtlas` | `interface` | yes | `glyphatlas` | `flight-glyphatlas` | `direct` | no | dissolve-types-owners-firstpass.json:a-pkgname |
| `packages/types/src/GlyphSource.ts:192-193` | `GlyphRasterizerOperation` | `type` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:A3 |
| `packages/types/src/GodRaysEffect.ts:3-32` | `GodRaysEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GradientBevelEffect.ts:7-42` | `GradientBevelEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GradientGlowEffect.ts:7-18` | `GradientGlowEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GradientSpread.ts:9-10` | `GradientSpread` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GrayscaleAdjustment.ts:3-7` | `GrayscaleAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GridSliceOptions.ts:1-27` | `GridSliceOptions` | `interface` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Group.ts:2` | `Group` | `interface` | yes | `DROPPED` | `` | `transitive` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/Group.ts:3` | `GroupRuntime` | `type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/Group.ts:4-5` | `GroupKind` | `const` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/GuiController.ts:9-10` | `GuiOrientation` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiController.ts:11-12` | `GuiTransitionProperty` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiController.ts:13-18` | `GuiTransitionValue` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiController.ts:19-20` | `GuiTransitionRequest` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiController.ts:21-22` | `GuiTransitionDescriptor` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiController.ts:23-26` | `GuiControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:7-8` | `GuiDialogTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:9-12` | `GuiDialog` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:13-14` | `GuiDialogCloseReason` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:15-20` | `GuiDialogCloseResult` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:21-27` | `GuiDialogEntry` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:28-32` | `GuiDialogOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/GuiDialog.ts:33-38` | `GuiDialogSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HalftoneEffect.ts:3-17` | `HalftoneEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Haptics.ts:4` | `HapticImpactStyle` | `type` | yes | `haptics` | `flight-haptics` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Haptics.ts:5-8` | `HapticNotificationType` | `type` | yes | `haptics` | `flight-haptics` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Haptics.ts:9-16` | `HapticsCapabilities` | `interface` | yes | `haptics` | `flight-haptics` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Haptics.ts:17-40` | `HostHapticsCapability` | `interface` | yes | `haptics` | `flight-haptics` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Haptics.ts:41-42` | `HapticsOperation` | `type` | yes | `haptics` | `flight-haptics` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasAppearance.ts:8-17` | `HasAppearance` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasAppearance.ts:18-24` | `HasAppearanceRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasAppearance.ts:25-26` | `AppearanceNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBlendMode.ts:8-11` | `HasBlendMode` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBlendMode.ts:12-13` | `BlendModeNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBoundsRectangle.ts:6-11` | `HasBoundsRectangle` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBoundsRectangle.ts:12-22` | `HasBoundsRectangleRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBoundsRectangle.ts:23` | `BoundsNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBoundsRectangle.ts:24-25` | `BoundsNodeAny` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasBoundsRectangle.ts:26-27` | `Spatial2DNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasClip.ts:5-13` | `HasClip` | `interface` | yes | `clip` | `flight-clip` | `direct` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/HasClip.ts:14-15` | `ClipNode` | `type` | yes | `clip` | `flight-clip` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/HasColorScaleBias.ts:11-14` | `HasColorScaleBias` | `interface` | yes | `node` | `flight-node` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HasColorScaleBias.ts:15-16` | `ColorScaleBiasNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | text-host-ownership.md:C5 |
| `packages/types/src/HasMaterial.ts:8-14` | `HasMaterial` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasMaterial.ts:15-16` | `MaterialNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform2D.ts:5-21` | `HasTransform2D` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform2D.ts:22-29` | `HasTransform2DRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform2D.ts:30-31` | `Transform2DNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform3D.ts:12-17` | `HasTransform3D` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform3D.ts:18-27` | `HasTransform3DRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HasTransform3D.ts:28-29` | `Transform3DNode` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HemisphereLight.ts:6-16` | `HemisphereLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HemisphereLight.ts:17-18` | `HemisphereLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HemisphereLightOptions.ts:3-13` | `HemisphereLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HierarchyNode.ts:8-10` | `HierarchyNode` | `type` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HierarchyNode.ts:11-12` | `HierarchyNodeAny` | `type` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HitTestFunction.ts:7-14` | `HitTestFunction` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HitTestFunction.ts:15-16` | `HitTestPreciseFunction` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HitTestResult.ts:7-13` | `HitTestResult` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Host.ts:218-271` | `Host` | `interface` | yes | `host` | `flight-host` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Host.ts:272-275` | `HostAccessibilityCapabilities` | `interface` | yes | `accessibility` | `flight-accessibility` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:276-303` | `HostAppCapabilities` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:304-309` | `HostAudioCapabilities` | `interface` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:310-314` | `HostBitmapCapabilities` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:315-322` | `HostClipboardCapabilities` | `interface` | yes | `clipboard` | `flight-clipboard` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:323-327` | `HostCompressCapabilities` | `interface` | yes | `compression` | `flight-compression` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:328-333` | `HostConnectivityCapabilities` | `interface` | yes | `connectivity` | `flight-connectivity` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:334-337` | `HostDeviceCapabilities` | `interface` | yes | `device` | `flight-device` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:338-348` | `HostDialogCapabilities` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:349-352` | `HostFileSystemCapabilities` | `interface` | yes | `filesystem` | `flight-filesystem` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:353-356` | `HostFontCapabilities` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:357-360` | `HostFullscreenCapabilities` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:361-364` | `HostGeolocationCapabilities` | `interface` | yes | `geolocation` | `flight-geolocation` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:365-368` | `HostCanvasCapabilities` | `interface` | yes | `surface` | `flight-surface` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:369-372` | `HostGlCapabilities` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:373-376` | `HostGlyphCapabilities` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:377-380` | `HostHapticsCapabilities` | `interface` | yes | `haptics` | `flight-haptics` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:381-384` | `HostImageCapabilities` | `interface` | yes | `image` | `flight-image` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:385-392` | `HostInputCapabilities` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:393-400` | `HostIpcCapabilities` | `interface` | yes | `ipc` | `flight-ipc` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:401-404` | `HostLifecycleCapabilities` | `interface` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:405-409` | `HostMediaSessionCapabilities` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:410-416` | `HostMenuCapabilities` | `interface` | yes | `menu` | `flight-menu` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:417-421` | `HostMidiCapabilities` | `interface` | yes | `midi` | `flight-midi` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:422-425` | `HostNetCapabilities` | `interface` | yes | `net` | `flight-net` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:426-439` | `HostNotificationCapabilities` | `interface` | yes | `notification` | `flight-notification` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:440-443` | `HostPermissionsCapabilities` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:444-447` | `HostPlatformCapabilities` | `interface` | yes | `platform` | `flight-platform` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:448-458` | `HostPowerCapabilities` | `interface` | yes | `power` | `flight-power` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:459-465` | `HostPreferencesCapabilities` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:466-474` | `HostProtocolCapabilities` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:475-481` | `HostScreenCapabilities` | `interface` | yes | `screen` | `flight-screen` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:482-483` | `WebScreenCapabilities` | `type` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Host.ts:484-487` | `HostSensorsCapabilities` | `interface` | yes | `sensors` | `flight-sensors` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:488-492` | `HostShareCapabilities` | `interface` | yes | `share` | `flight-share` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:493-502` | `HostShellCapabilities` | `interface` | yes | `shell` | `flight-shell` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:503-507` | `HostShortcutCapabilities` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:508-511` | `HostSocketCapabilities` | `interface` | yes | `socket` | `flight-socket` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:512-521` | `HostSoftKeyboardCapabilities` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:522-530` | `HostStatusBarCapabilities` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:531-535` | `HostSurfaceCapabilities` | `interface` | yes | `surface` | `flight-surface` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:536-543` | `HostTextSegmentCapabilities` | `interface` | yes | `textsegment` | `flight-textsegment` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:544-549` | `HostDecompressCapabilities` | `interface` | yes | `compression` | `flight-compression` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:550-553` | `HostTextShaperCapabilities` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:554-571` | `HostTrayCapabilities` | `interface` | yes | `tray` | `flight-tray` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:572-575` | `HostUpdaterCapabilities` | `interface` | yes | `updater` | `flight-updater` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:576-579` | `HostVideoCapabilities` | `interface` | yes | `video` | `flight-video` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:580-583` | `HostWgpuCapabilities` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/Host.ts:584-602` | `HostWindowCapabilities` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostAppExit.ts:1-4` | `HostAppExitCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAppLoop.ts:1-6` | `HostAppLoopCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioCodec.ts:1-4` | `HostAudioCodecCapability` | `interface` | yes | `audio` | `flight-audio` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioDecode.ts:12-24` | `HostAudioDecodeFormatCapability` | `interface` | yes | `audio` | `flight-audio` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioDecode.ts:25-34` | `HostAudioDecodeCapabilities` | `interface` | yes | `audio` | `flight-audio` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioDevice.ts:4-44` | `HostAudioDeviceCapability` | `interface` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioDevice.ts:45-46` | `AudioDeviceOperation` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioMixer.ts:3-4` | `AudioBusNodeHandle` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioMixer.ts:5-6` | `AudioMixerGraphHandle` | `type` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostAudioMixer.ts:7-20` | `HostAudioMixerCapability` | `interface` | yes | `media` | `flight-media` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapEncode.ts:6-10` | `HostBitmapEncodeCapability` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapEncode.ts:11-12` | `BitmapEncodeOperation` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapReadback.ts:7-8` | `BitmapReadbackMode` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapReadback.ts:9-10` | `BitmapReadbackBackendReason` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapReadback.ts:11-15` | `BitmapReadbackOutcome` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostBitmapReadback.ts:16-19` | `HostBitmapReadbackCapability` | `interface` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostCanvas.ts:11-26` | `HostCanvasCapability` | `interface` | yes | `surface` | `flight-surface` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostExplanation.ts:4-13` | `HostExplanation` | `interface` | yes | `host` | `flight-host` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostExplanation.ts:14-19` | `HostCapabilityGroupExplanation` | `interface` | yes | `host` | `flight-host` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostExplanation.ts:20-27` | `HostCapabilityBackend` | `interface` | yes | `host` | `flight-host` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostExplanation.ts:28-38` | `HostCapabilityExplanation` | `interface` | yes | `host` | `flight-host` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostExplanation.ts:39-45` | `HostCapabilityCoverage` | `interface` | yes | `host` | `flight-host` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostFileDialog.ts:10-13` | `HostDirectoryOpenDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostFileDialog.ts:14-17` | `HostFileOpenDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostFileDialog.ts:18-21` | `HostFileSaveDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostFontLoading.ts:1-7` | `HostFontLoadingCapability` | `interface` | yes | `font` | `flight-font` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostFullscreen.ts:3-4` | `FullscreenTargetHandle` | `type` | yes | `app` | `flight-app` | `direct` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostFullscreen.ts:5-10` | `HostElementFullscreenCapability` | `interface` | yes | `app` | `flight-app` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostGl.ts:12-23` | `HostGlCapability` | `interface` | yes | `render-gl` | `flight-render-gl` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageDecode.ts:4-7` | `HostImageDecodeFormatCapability` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageDecode.ts:8-16` | `HostImageDecodeCapabilities` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageDimensions.ts:4-12` | `HostImageDimensions` | `interface` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostImageDimensions.ts:13-14` | `HostImageDimensionResolver` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HostImageEncode.ts:4-7` | `HostImageEncodeFormatCapability` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageEncode.ts:8-13` | `HostImageEncodeCapabilities` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageOpenDialog.ts:3-6` | `HostImageOpenDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostImageSource.ts:4-5` | `HostImageSource` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostInput.ts:6-11` | `HostInputDropFileCapability` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInput.ts:12-20` | `HostInputFocusCapability` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInput.ts:21-24` | `InputPointerLockExitOutcome` | `type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInput.ts:25-28` | `InputPointerLockRequestOutcome` | `type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInput.ts:29-33` | `HostInputPointerLockCapability` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInputIngress.ts:11-13` | `InputIngressSource` | `type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostInputIngress.ts:14-36` | `InputIngressSink` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostInputIngress.ts:37-53` | `HostInputIngressCapability` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostInputTarget.ts:7-13` | `InputTargetHandle` | `interface` | yes | `input` | `flight-input` | `direct` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostInputTarget.ts:14-17` | `HostInputTargetCapability` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:B3 |
| `packages/types/src/HostMessageDialog.ts:4-8` | `HostMessageDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostPhotoCaptureDialog.ts:3-6` | `HostPhotoCaptureDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostPromptDialog.ts:3-6` | `HostPromptDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostSurface.ts:9-13` | `HostSurfaceDisplayCapability` | `interface` | yes | `surface` | `flight-surface` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostSurface.ts:14-17` | `HostSurfaceResizeCapability` | `interface` | yes | `surface` | `flight-surface` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostVideo.ts:4-31` | `HostVideoCapability` | `interface` | yes | `video` | `flight-video` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HostVideoCaptureDialog.ts:3-6` | `HostVideoCaptureDialogCapability` | `interface` | yes | `dialog` | `flight-dialog` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/HslColor.ts:3-4` | `HslColor` | `type` | yes | `color` | `flight-color` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HsvColor.ts:3-4` | `HsvColor` | `type` | yes | `color` | `flight-color` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HtmlView.ts:3-8` | `HtmlViewData` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/HtmlView.ts:9-10` | `HtmlViewRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/HtmlView.ts:11-14` | `HtmlView` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HtmlView.ts:15-16` | `HtmlViewKind` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/HueSaturationAdjustment.ts:3-9` | `HueSaturationAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageBitmapComposition.ts:10-14` | `ImageBitmapComposition` | `interface` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageBitmapComposition.ts:15-22` | `ImageBitmapComposer` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageBitmapComposition.ts:23-28` | `ImageBitmapCompositionResolver` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageChannel.ts:1-7; packages/types/src/ImageChannel.ts:8-9` | `ImageChannel` | `const,type` | yes | `bitmap` | `flight-bitmap` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ImageDecodeOptions.ts:4-7` | `ImageDecodeOptions` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/ImageDecoder.ts:6-10` | `ImageDecoder` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageDecoder.ts:11-16` | `ImageDecodeFallback` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageEncodeOptions.ts:3-6` | `ImageEncodeOptions` | `interface` | yes | `image-codec` | `flight-image-codec` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageEncoder.ts:6-10` | `ImageEncoder` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/ImageFormat.ts:1-2` | `ImageFormat` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResource.ts:12-26` | `ImageResource` | `interface` | yes | `image` | `flight-image` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResource.ts:27-42` | `HostImageCapability` | `interface` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResource.ts:43-44` | `ImageOperation` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResourceReference.ts:28-32; packages/types/src/ImageResourceReference.ts:33-34` | `ImageResourceReferenceKind` | `const,type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResourceReference.ts:35-39; packages/types/src/ImageResourceReference.ts:40-43` | `ImageResourceFailureKind` | `const,type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResourceReference.ts:44-49` | `ImageResourceFailure` | `interface` | yes | `image` | `flight-image` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ImageResourceReference.ts:50-65` | `ImageResourceReferenceBase` | `interface` | no | `image` | `flight-image` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResourceReference.ts:66-82` | `EmbeddedImageResourceReference` | `interface` | yes | `image` | `flight-image` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ImageResourceReference.ts:83-88` | `ExternalImageResourceReference` | `interface` | yes | `image` | `flight-image` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ImageResourceReference.ts:89-96` | `ImageResourceReference` | `type` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImageResourceReference.ts:97-101` | `ImageResourceFetch` | `type` | yes | `image` | `flight-image` | `none` | no | Principal f5929ea4 batch13: image is the lowest namer; scene3d-resources imports it (replaces dissolve-types-owners-firstpass.json:a-srcfile) |
| `packages/types/src/ImageResourceReference.ts:102-108` | `ImageResourceReferenceResolutionExplanation` | `interface` | yes | `image` | `flight-image` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ImportDiagnostic.ts:17-58` | `ImportDiagnostic` | `interface` | yes | `importdiagnostics` | `flight-importdiagnostics` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ImportDiagnostic.ts:59-65; packages/types/src/ImportDiagnostic.ts:66-67` | `ImportDiagnosticSeverity` | `const,type` | yes | `importdiagnostics` | `flight-importdiagnostics` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/InnerGlowEffect.ts:7-19` | `InnerGlowEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InnerShadowEffect.ts:7-42` | `InnerShadowEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputGamepadData.ts:1-7` | `InputGamepadAxisData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputGamepadData.ts:8-14` | `InputGamepadButtonData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputGamepadData.ts:15-20` | `InputGamepadConnectData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputGamepadData.ts:21-22` | `GamepadMapping` | `type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputKeyboardData.ts:1-16` | `InputKeyboardData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputKeyRepeatOptions.ts:1-5` | `InputKeyRepeatOptions` | `interface` | yes | `input` | `flight-input` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputKeyRepeatTimer.ts:7-12` | `InputKeyRepeatTimer` | `interface` | yes | `input` | `flight-input` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputManager.ts:3-6` | `AttachInputOptions` | `interface` | yes | `input` | `flight-input` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputManager.ts:7-10` | `InputManager` | `interface` | yes | `input` | `flight-input` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputPointerData.ts:4-27` | `InputPointerData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InputSignals.ts:8-25` | `InputSignals` | `interface` | yes | `input` | `flight-input` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputState.ts:3-13` | `InputState` | `interface` | yes | `input` | `flight-input` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InputTextData.ts:1-5` | `InputTextData` | `interface` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/InstancedMesh.ts:7-28` | `InstancedMesh` | `interface` | yes | `scene3d` | `flight-scene3d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InstancedMesh.ts:29-36` | `InstancedMeshCullRuntime` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InstancedMesh.ts:37-40` | `InstancedMeshSignalsRuntime` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InstancedMesh.ts:41` | `InstancedMeshRuntime` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InstancedMesh.ts:42-43` | `InstancedMeshKind` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InstancedMeshSignals.ts:13-18` | `InstancedMeshSignals` | `interface` | yes | `scene3d` | `flight-scene3d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionConnectGuard.ts:4-5` | `InteractionConnectGuard` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionHitEligibility.ts:2-8` | `InteractionHitEligibility` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:15` | `InteractionSignalName` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:16` | `AnyInteractionSignalSlot` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:17-22` | `InteractionDispatchLayer` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:23-26` | `InteractionDispatchLayerOptions` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:27-62` | `InteractionManager` | `interface` | yes | `interaction` | `flight-interaction` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:63-73` | `InteractionManagerOptions` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:74-78` | `InteractionInputSource` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:79-89` | `InteractionPointerOptions` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionManager.ts:90-102` | `InteractionPointerState` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InteractionSignals.ts:7-27` | `InteractionSignals` | `interface` | yes | `interaction` | `flight-interaction` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/InvertAdjustment.ts:3-7` | `InvertAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ipc.ts:7-10` | `HostIpcHandleCapability` | `interface` | yes | `ipc` | `flight-ipc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ipc.ts:11-14` | `HostIpcInvokeCapability` | `interface` | yes | `ipc` | `flight-ipc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ipc.ts:15-19` | `HostIpcMessageCapability` | `interface` | yes | `ipc` | `flight-ipc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ipc.ts:20-25` | `HostIpcSendCapability` | `interface` | yes | `ipc` | `flight-ipc` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ipc.ts:26-29` | `HostIpcTargetedSendCapability` | `interface` | yes | `ipc` | `flight-ipc` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/IridescencePbrExtension.ts:5-16` | `IridescencePbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/IridescencePbrExtension.ts:17-18` | `IridescencePbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:3` | `SoftKeyboardResizeMode` | `type` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:4` | `SoftKeyboardResizeNoneKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:5` | `SoftKeyboardResizeBodyKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:6` | `SoftKeyboardStyleKind` | `type` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:7` | `SoftKeyboardStyleDefaultKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:8-9` | `SoftKeyboardStyleDarkKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:10-16` | `SoftKeyboardInfo` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:17-22` | `SoftKeyboard` | `interface` | yes | `keyboard` | `flight-keyboard` | `factory` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Keyboard.ts:23` | `SoftKeyboardVisibilityResult` | `type` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:24` | `SoftKeyboardVisibilityOkKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:25-26` | `SoftKeyboardVisibilityOperationFailedKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:27` | `SoftKeyboardSetterResult` | `type` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:28` | `SoftKeyboardSetterOkKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:29` | `SoftKeyboardSetterOperationUnavailableKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:30-31` | `SoftKeyboardSetterOperationFailedKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:32` | `SoftKeyboardAttachResult` | `type` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:33` | `SoftKeyboardAttachOkKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:34-35` | `SoftKeyboardAttachAcquisitionFailedKind` | `const` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:36-39` | `HostSoftKeyboardInfoCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:40-44` | `SoftKeyboardChangeSubscription` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:45-48` | `HostSoftKeyboardChangeCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:49-53` | `HostSoftKeyboardVisibilityCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:54-57` | `HostSoftKeyboardResizeModeWriteCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:58-61` | `HostSoftKeyboardStyleCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:62-65` | `HostSoftKeyboardAccessoryBarCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Keyboard.ts:66-69` | `HostSoftKeyboardScrollAssistCapability` | `interface` | yes | `keyboard` | `flight-keyboard` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/KeyboardEventData.ts:1-9` | `KeyboardEventData` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/KeyCode.ts:1-238; packages/types/src/KeyCode.ts:239-240` | `KeyCode` | `const,type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/KeyModifier.ts:1-19; packages/types/src/KeyModifier.ts:20-21` | `KeyModifier` | `const,type` | yes | `host-web` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/KuwaharaEffect.ts:3-7` | `KuwaharaEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LambertMaterial.ts:6-13` | `LambertMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LambertMaterial.ts:14-15` | `LambertMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LassoSelection.ts:4-5` | `LassoSelection` | `interface` | yes | `selection` | `flight-selection` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LassoSelectionRuntime.ts:4-8` | `LassoSelectionRuntime` | `interface` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:4` | `AnchorLayoutKind` | `const` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:5` | `FlexLayoutKind` | `const` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:6-9` | `GridLayoutKind` | `const` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:10-19` | `AnchorLayoutItemStyle` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:20` | `FlexLayoutAlign` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:21` | `FlexLayoutDirection` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:22` | `FlexLayoutJustify` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:23-24` | `FlexLayoutWrap` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:25-36` | `FlexLayoutContainerStyle` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:37-43` | `FlexLayoutItemStyle` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:44-48` | `GridLayoutTrack` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:49-61` | `GridLayoutContainerStyle` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:62-71` | `GridLayoutItemStyle` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:72-78` | `LayoutNode` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:79-82` | `LayoutTree` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:83-91; packages/types/src/Layout.ts:92-94` | `LayoutResolutionFailureKind` | `const,type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:95-106` | `LayoutResolutionExplanation` | `interface` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:107-114` | `LayoutResolver` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:115-116` | `LayoutResolutionGuard` | `type` | yes | `layout` | `flight-layout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Layout.ts:117-127` | `LayoutState` | `interface` | yes | `layout` | `flight-layout` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LensDirtEffect.ts:5-11` | `LensDirtEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LensDistortionEffect.ts:3-8` | `LensDistortionEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LensFlareEffect.ts:3-10` | `LensFlareEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxAtlasSchema.ts:6-9` | `LibgdxAtlasDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxAtlasSchema.ts:10-26` | `LibgdxAtlasPage` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxAtlasSchema.ts:27-45` | `LibgdxAtlasRegion` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxAtlasSchema.ts:46-50` | `LibgdxAtlasParseOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:16-27` | `LibgdxRangeValue` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:28-32` | `LibgdxActiveRangeValue` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:33-69` | `LibgdxParticleDocument` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:70-75` | `LibgdxParseOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:76-83` | `LibgdxParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LibgdxParticleSchema.ts:84-89` | `LibgdxSerializeOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Lifecycle.ts:4-7` | `AppLifecycleState` | `type` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Lifecycle.ts:8-11` | `AppLaunchKind` | `type` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Lifecycle.ts:12-16` | `AppMemoryPressure` | `type` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Lifecycle.ts:17-30` | `HostLifecycleCapability` | `interface` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Lifecycle.ts:31-46` | `AppLifecycle` | `interface` | yes | `lifecycle` | `flight-lifecycle` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Lifecycle.ts:47-48` | `LifecycleOperation` | `type` | yes | `lifecycle` | `flight-lifecycle` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LiftGammaGainAdjustment.ts:3-9` | `LiftGammaGainAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Light.ts:22-25` | `Light` | `interface` | yes | `lighting` | `flight-lighting` | `direct` | no | dissolve-types.md:appendix-b |
| `packages/types/src/LightLayerMask.ts:4-5` | `ALL_LIGHT_LAYERS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightProbe.ts:8-23` | `LIGHT_PROBE_SH_FLOATS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightProbe.ts:24-39` | `LightProbe` | `interface` | yes | `lighting` | `flight-lighting` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightProbe.ts:40-46` | `LightProbeGrid` | `interface` | yes | `lighting` | `flight-lighting` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/LightUnit.ts:1` | `LightUnit` | `type` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightUnit.ts:2` | `CandelaLightUnit` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightUnit.ts:3` | `LumenLightUnit` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightUnit.ts:4` | `LuxLightUnit` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LightUnit.ts:5-6` | `UnitlessLightUnit` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LinearColor.ts:4-5` | `LinearColor` | `type` | yes | `color` | `flight-color` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ListController.ts:7-8` | `ListControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ListController.ts:9-12` | `ListController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ListController.ts:13-21` | `ListControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ListController.ts:22-26` | `ListControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Load.ts:2-7` | `LoadProgress` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Load.ts:8-12` | `LoadOptions` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LocaleInput.ts:10-11` | `LocaleInput` | `type` | yes | `intl` | `flight-intl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LodMesh.ts:3-6` | `LodLevel` | `interface` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:7-10` | `LodMesh` | `interface` | yes | `DROPPED` | `` | `transitive` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:11` | `LodMeshRuntime` | `type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/LodMesh.ts:12-13` | `LodMeshKind` | `const` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/Log.ts:8-17` | `LogLevel` | `enum` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:18-21` | `LogData` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:22-28` | `LogContext` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Log.ts:29-32` | `LogDataProvider` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:33-36` | `LogFormatter` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:37-44` | `LogSpan` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Log.ts:45-51` | `LogTimer` | `interface` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:52-58` | `LogTransportWriteOutcome` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:59-65` | `LogTransportDeliveryBoundary` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:66-71` | `LogTransportFlushOutcome` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:72-85` | `LogTransportDestroyOutcome` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:86-93` | `LogTransport` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:94-103` | `LogEntry` | `interface` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Log.ts:104-105` | `LogSink` | `type` | yes | `log` | `flight-log` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LogSignals.ts:7-11` | `LogSignals` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LookupTableGradeAdjustment.ts:8-13` | `LookupTableGradeAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:7-11` | `LottieBezierHandle` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:12-30` | `LottieKeyframe` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:31-37` | `LottieStaticProperty` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:38-44` | `LottieAnimatedProperty` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:45-46` | `LottieAnimatable` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:47-53` | `LottieSeparatedPositionProperty` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:54-55` | `LottiePositionProperty` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:56-74` | `LottieTransform` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:75-85` | `LottieShapePath` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:86-95` | `LottieShapeItemBase` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:96-101` | `LottieShapeGroup` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:102-109` | `LottieShapePathItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:110-121` | `LottieRectangleShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:122-129` | `LottieEllipseShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:130-147` | `LottiePolystarShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:148-159` | `LottieFillShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:160-166` | `LottieDashEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:167-183` | `LottieStrokeShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:184-190` | `LottieGradient` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:191-219` | `LottieGradientShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:220-223` | `LottieTransformShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:224-229` | `LottieRepeaterTransform` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:230-238` | `LottieTrimPathShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:239-246` | `LottieRepeaterShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:247-252` | `LottieMergePathShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:253-257` | `LottieRoundedCornersShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:258-261` | `LottieUnknownShapeItem` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:262-277` | `LottieShapeItem` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:278-289` | `LottieMask` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieDocument.ts:290-308` | `LottieTextDocument` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:309-318` | `LottieTextData` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:319-327` | `LottieEffect` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:328-367` | `LottieLayer` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:368-378` | `LottieImageAsset` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:379-386` | `LottiePrecompositionAsset` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:387-388` | `LottieAsset` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:389-395` | `LottieFont` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:396-402` | `LottieMarker` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocument.ts:403-422` | `LottieDocument` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocumentImport.ts:13-19` | `LottieDocumentImportOptions` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieDocumentImport.ts:20-27` | `LottieDocumentImportResult` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/LottieRegistry.ts:18-26; packages/types/src/LottieRegistry.ts:27-28` | `LottieLayerKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:29-40; packages/types/src/LottieRegistry.ts:41-49` | `LottieShapeItemKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:50-59; packages/types/src/LottieRegistry.ts:60-61` | `LottieMaskKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:62-66` | `LottieAdvancedBlend` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:67-73` | `LottieFillPaint` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:74-85` | `LottieStrokePaint` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:86-103` | `LottieGradientPaint` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/LottieRegistry.ts:104-114` | `LottiePaint` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:115-126` | `LottieShapePainter` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:127-128` | `LottieShapeModifier` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:129-141` | `LottieImportContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:142-147` | `LottieLayerContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:148-149` | `LottieLayerHandler` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:150-154` | `LottieLayerHandlerEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:155-161` | `LottieMaskContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:162-163` | `LottieMaskHandler` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:164-169` | `LottieMaskHandlerEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:170-173` | `LottieMutableAnimationTarget` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:174-192` | `LottieShapeItemContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:193-194` | `LottieShapeItemHandler` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:195-199` | `LottieShapeItemHandlerEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/LottieRegistry.ts:200-205` | `LottieRegistry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupClassResolver.ts:9-10` | `MarkupClassResolver` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupColorResolver.ts:7-8` | `MarkupColorResolver` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupTagHandler.ts:14-15` | `MarkupTagResult` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupTagHandler.ts:16-31` | `MarkupTagEffect` | `interface` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupTagHandler.ts:32-36` | `MarkupTagHandler` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarkupTagRegistry.ts:10-23` | `MarkupTagRegistry` | `interface` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarqueeSelection.ts:3-5` | `MarqueeSelectionMode` | `type` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarqueeSelection.ts:6-7` | `MarqueeSelection` | `interface` | yes | `selection` | `flight-selection` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MarqueeSelectionRuntime.ts:4-10` | `MarqueeSelectionRuntime` | `interface` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MatcapMaterial.ts:7-12` | `MatcapMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MatcapMaterial.ts:13-14` | `MatcapMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material.ts:30-31` | `MaterialDimensionKey` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material.ts:32-42` | `Material` | `interface` | yes | `materials` | `flight-materials` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material.ts:43-47` | `MaterialLike` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material.ts:48-49` | `MaterialData` | `interface` | yes | `materials` | `flight-materials` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material2D.ts:12-16` | `Material2D` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types.md:rule-c |
| `packages/types/src/Material3D.ts:7-22` | `MaterialAlphaMode` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material3D.ts:23-32` | `Material3D` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Material3DOptions.ts:11-17` | `Material3DOptions` | `interface` | yes | `materials` | `flight-materials` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/MaterialConversionExplanation.ts:13-20` | `MaterialConversionExplanation` | `interface` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MaterialConversionExplanation.ts:21-25` | `MaterialConversionDropReason` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MaterialConversionExplanation.ts:26-30` | `MaterialConversionGuard` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix.ts:3-11` | `Matrix` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix.ts:12-13` | `MatrixLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix3.ts:3-6` | `Matrix3` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix3.ts:7-8` | `Matrix3Like` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix4.ts:3-6` | `Matrix4` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Matrix4.ts:7-8` | `Matrix4Like` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md2SectionHandler.ts:13-26` | `Md2Frame` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md2SectionHandler.ts:27-61` | `Md2ParseContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md2SectionHandler.ts:62-74` | `Md2SectionHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md2SectionHandler.ts:75-78` | `Md2ImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5Schema.ts:5-21` | `Md5Joint` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5Schema.ts:22-32` | `Md5Vertex` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5Schema.ts:33-44` | `Md5Weight` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5Schema.ts:45-55` | `Md5Mesh` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:10-22` | `Md5DropTally` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:23-36` | `Md5MeshSection` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:37-69` | `Md5ParseContext` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:70-75` | `Md5SectionHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:76-78` | `MD5_MATERIAL_FEATURE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:79-92` | `MD5_SKELETON_FEATURE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Md5SectionHandler.ts:93-96` | `Md5ImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaChannelSignals.ts:2-9` | `MediaReadyState` | `type` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaChannelSignals.ts:10-25` | `MediaChannelSignals` | `interface` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MedianEffect.ts:6-10` | `MedianEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:7-14` | `MediaSessionArtwork` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:15-23` | `MediaSessionMetadata` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:24-37` | `MediaSessionAction` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:38-46` | `MediaSessionActionDetails` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:47-50` | `MediaSessionPlaybackState` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:51-58` | `MediaSessionPositionState` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:59-68` | `MediaSessionOperationBlockReason` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:69-74` | `MediaSessionOperationOutcome` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:75-78` | `MediaSessionSetMetadataOutcome` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:79-82` | `MediaSessionClearMetadataOutcome` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:83-86` | `MediaSessionSetPlaybackStateOutcome` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:87-95` | `MediaSessionSetPositionStateOutcome` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:96-101` | `MediaSessionClearPositionStateOutcome` | `type` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:102-114` | `HostMediaSessionCapability` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:115-128` | `HostMediaSessionActionCapability` | `interface` | yes | `mediasession` | `flight-mediasession` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MediaSession.ts:129-133` | `MediaSessionActionSignal` | `interface` | yes | `mediasession` | `flight-mediasession` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/MemoryLogSink.ts:6-9` | `MemoryLogSink` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:11-17` | `MenuItemType` | `type` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:18-19` | `MenuItemRole` | `type` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:20-54` | `MenuItemTemplate` | `interface` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Menu.ts:55-62` | `HostAppMenuCapability` | `interface` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:63-67` | `HostMenuHighlightCapability` | `interface` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:68-73` | `HostMenuPopupCapability` | `interface` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:74-77` | `HostMenuSelectCapability` | `interface` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Menu.ts:78-79` | `ElectronMenuCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Menu.ts:80-81` | `TauriMenuCapabilities` | `type` | yes | `host-tauri` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/MenuHighlight.ts:9-12` | `MenuHighlight` | `interface` | yes | `menu` | `flight-menu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MenuSelect.ts:8-11` | `MenuSelect` | `interface` | yes | `menu` | `flight-menu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MenuSignals.ts:13-19` | `MenuSignals` | `interface` | yes | `menu` | `flight-menu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Mesh.ts:26-47` | `Mesh` | `interface` | yes | `scene3d` | `flight-scene3d` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Mesh.ts:48-51` | `MeshDeformRuntime` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Mesh.ts:52-53` | `MeshRuntime` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Mesh.ts:54-55` | `MeshKind` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/MeshAttachment2D.ts:17-24` | `MeshAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types.md:appendix-b |
| `packages/types/src/MeshAttachment2D.ts:25-26` | `MeshAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/MeshDeformer.ts:10-11` | `MeshDeformer` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MeshDeformer.ts:12` | `MeshDeformerMorph` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MeshDeformer.ts:13` | `MeshDeformerNone` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MeshDeformer.ts:14-15` | `MeshDeformerSkeletal` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MeshGeometry.ts:16-18` | `VertexSemantic` | `type` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:19-21` | `VertexFormat` | `type` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:22-26` | `PrimitiveTopology` | `type` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:27-35` | `VertexAttribute` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:36-43` | `VertexAttributeLayout` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:44-55` | `MeshSubset` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:56-68` | `MeshGeometry` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `direct` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:69-75` | `MeshGeometryGlData` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:76-95` | `MeshGeometryWgpuData` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometry.ts:96-105` | `MeshGeometryRuntime` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometryFromAttributesOptions.ts:5-11` | `MeshGeometryFromAttributesOptions` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometryOptions.ts:8-15` | `MeshGeometryOptions` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshGeometryUvSetExplanation.ts:14-20` | `MeshGeometryUvSetExplanation` | `interface` | yes | `scene3d-gl` | `flight-scene3d-gl` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MeshMorphBindPose.ts:11-19` | `MeshMorphBindPose` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshSkinBindPose.ts:14-24` | `MeshSkinBindPose` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MeshTriangleVertexIndices.ts:3-8` | `MeshTriangleVertexIndices` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MethodsOf.ts:1-4` | `MethodsOf` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:7-8` | `MidiAccess` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:9` | `MidiPortConnection` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:10-11` | `MidiPortState` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:12-19` | `MidiInputPort` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:20-27` | `MidiOutputPort` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:28-29` | `MidiPort` | `type` | yes | `midi` | `flight-midi` | `transitive` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Midi.ts:30-34` | `MidiInputMessage` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:35-38` | `MidiAccessRequestOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:39-42` | `MidiAccessPortsOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:43-50` | `MidiAccessLifecycleFailure` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:51-57` | `MidiAccessDisposeOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:58-61` | `MidiPortCloseOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:62-65` | `MidiPortOpenOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:66-69` | `MidiPortConnectionOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:70-73` | `MidiPortStateOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:74-77` | `MidiPortLifecycleFailure` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:78-84` | `MidiPortDisposeOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:85-95` | `MidiMessageSendOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:96-99` | `MidiEventReleaseOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:100-103` | `MidiEventAttachment` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:104-107` | `MidiEventBackendAttachOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:108-115` | `MidiSubscriptionAttachOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:116-119` | `MidiSubscriptionDetachOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:120-127` | `MidiSubscriptionDisposeOutcome` | `type` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:128-131` | `MidiAccessStateSubscription` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Midi.ts:132-135` | `MidiInputMessageSubscription` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Midi.ts:136-139` | `MidiPortStateSubscription` | `interface` | yes | `midi` | `flight-midi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Midi.ts:140-143` | `HostMidiAccessCapability` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:144-147` | `HostMidiPermissionCapability` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Midi.ts:148-153` | `MidiAccessResourceOperations` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:154-161` | `MidiPortResourceOperations` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:162-165` | `MidiInputPortResourceOperations` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Midi.ts:166-169` | `MidiOutputPortResourceOperations` | `interface` | yes | `midi` | `flight-midi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Modifier.ts:19-23` | `Modifier` | `interface` | yes | `shading` | `flight-shading` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ModifierDefinition.ts:16-21` | `ModifierDefinition` | `interface` | yes | `shading` | `flight-shading` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ModifierKind.ts:8-9` | `ModifierKind` | `type` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ModifierRegistry.ts:9-12` | `ModifierRegistry` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ModifierSlot.ts:18-26; packages/types/src/ModifierSlot.ts:27-28` | `ModifierSlot` | `const,type` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:6-10` | `MorphShapePathBinding` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:11-16` | `MorphShapeColorEndpoint` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:17-25` | `MorphShapeGradientEndpoint` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:26-32` | `MorphShapeGradientEndpointExplanation` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:33-39` | `MorphShapeGradientEndpointReason` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:40-43` | `MorphShapeLineEndpoint` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:44-54` | `MorphShapeColorPaintBinding` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:55-72` | `MorphShapeGradientPaintBinding` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:73-85` | `MorphShapeLinePaintBinding` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:86-93` | `MorphShapeTexturePaintBinding` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:94-103` | `MorphShapePaintBinding` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:104-111` | `MorphShapeData` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/MorphShape.ts:112-113` | `MorphShapeRuntime` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/MorphShape.ts:114-117` | `MorphShape` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShape.ts:118-119` | `MorphShapeKind` | `const` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphShapeAnimationTarget.ts:7-10` | `MorphShapeAnimationTarget` | `interface` | yes | `shape` | `flight-shape` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MorphTarget.ts:10-21` | `MorphTarget` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MorphTarget.ts:22-26` | `MeshMorph` | `interface` | yes | `meshgeometry` | `flight-meshgeometry` | `none` | no | design-decisions.md:D8-meshgeometry |
| `packages/types/src/MotionBlurEffect.ts:3-8` | `MotionBlurEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MotionPath.ts:14-23` | `MotionPathLoopMode` | `type` | yes | `motionpath` | `flight-motionpath` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MotionPath.ts:24-32` | `MotionPath` | `interface` | yes | `motionpath` | `flight-motionpath` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MouseButton.ts:1-6; packages/types/src/MouseButton.ts:7-8` | `MouseButton` | `const,type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/MouseWheelMode.ts:1-2` | `MouseWheelMode` | `type` | yes | `input` | `flight-input` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/MovieClip.ts:5-8` | `MovieClipData` | `interface` | yes | `movieclip` | `flight-movieclip` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/MovieClip.ts:9-12` | `MovieClipRuntime` | `interface` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/MovieClip.ts:13-16` | `MovieClip` | `interface` | yes | `movieclip` | `flight-movieclip` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MovieClip.ts:17-18` | `MovieClipKind` | `const` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MovieClipSignals.ts:5-6` | `MovieClipSignals` | `type` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/MutableNumberArray.ts:9-10` | `MutableNumberArray` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NativeText.ts:14-26` | `NativeTextStyle` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NativeText.ts:27-39` | `NativeTextData` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/NativeText.ts:40-51` | `NativeTextRuntime` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/NativeText.ts:52-55` | `NativeText` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NativeText.ts:56-57` | `NativeTextKind` | `const` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:14-17` | `NetMethod` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:18-21` | `NetResponseType` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:22-25` | `NetCredentials` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:26-30` | `NetRedirect` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:31-35` | `NetBody` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:36-39` | `NetResponseBody` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:40-53` | `NetRequest` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:54-59` | `NetGuardNotice` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:60-64` | `NetGuard` | `type` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:65-77` | `NetResponse` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:78-88` | `NetResponseExplanation` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:89-96` | `NetProgress` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:97-103` | `NetRequestOptions` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Net.ts:104-107` | `HostNetCapability` | `interface` | yes | `net` | `flight-net` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:6; packages/types/src/Node.ts:7-9` | `NodeTraitsKey` | `const,type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:10` | `NodeData` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:11` | `NodeDataFactory` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:12` | `NodeRuntimeFactory` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:13-18` | `NodeTraits` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:19-21` | `Node` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:22` | `NodeOf` | `type` | yes | `node` | `flight-node` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:23-54` | `NodeRuntime` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Node.ts:55` | `NodeKind` | `const` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:56-57` | `NullScene3D` | `const` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node.ts:58-60` | `NodeAny` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:9-12` | `Node2D` | `type` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:13-16` | `Node2DTraits` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:17` | `Node2DData` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:18` | `DisplayObjectKind` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:19-24` | `Node2DTraitsKey` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:25-28` | `Node2DRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Node2D.ts:29` | `Node2DDataFactory` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2D.ts:30-31` | `Node2DRuntimeFactory` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node2DAnimationPath.ts:3-19` | `Node2DAnimationPath` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:20` | `Node2DAnimationPathAlpha` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:21` | `Node2DAnimationPathPivot` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:22` | `Node2DAnimationPathPivotX` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:23` | `Node2DAnimationPathPivotY` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:24` | `Node2DAnimationPathPosition` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:25` | `Node2DAnimationPathRotation` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:26` | `Node2DAnimationPathScale` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:27` | `Node2DAnimationPathScaleX` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:28` | `Node2DAnimationPathScaleY` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:29` | `Node2DAnimationPathSkew` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:30` | `Node2DAnimationPathSkewX` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:31` | `Node2DAnimationPathSkewY` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:32` | `Node2DAnimationPathVisible` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:33` | `Node2DAnimationPathX` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationPath.ts:34-35` | `Node2DAnimationPathY` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DAnimationTarget.ts:6-10` | `Node2DAnimationTarget` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Node2DInteractionSignals.ts:3-4` | `Node2DInteractionSignals` | `type` | yes | `interaction` | `flight-interaction` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Node3D.ts:4` | `Node3DKind` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node3D.ts:5` | `Node3DTraits` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node3D.ts:6` | `Node3D` | `type` | yes | `scene3d` | `flight-scene3d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node3D.ts:7` | `Node3DRuntime` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Node3D.ts:8-9` | `Node3DTraitsKey` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Node3DVisitor.ts:2-3` | `Node3DVisitor` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/NodeDescendantVisitor.ts:6-7` | `NodeDescendantVisitor` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeInteraction.ts:21-22` | `HitArea` | `type` | yes | `interaction` | `flight-interaction` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeInteractionState.ts:19-44` | `NodeInteractionState` | `interface` | yes | `interaction` | `flight-interaction` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeInteractiveStateBinding.ts:5-6` | `NodeInteractiveStateBindingBrand` | `const` | no | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:7-10` | `NodeInteractiveStateBinding` | `interface` | yes | `scene-document` | `flight-scene-document` | `direct` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:11-14` | `NodeInteractiveStateBindingRuntime` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:15-20` | `NodeInteractiveStateFlags` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:21-22` | `NodeInteractiveStateProperty` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:23-24` | `NodeInteractiveStateTransitionValue` | `type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:25-32` | `NodeInteractiveStateTransitionRequest` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:33-36` | `NodeInteractiveStateTransition` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:37-45` | `NodeInteractiveStateExtensionRuntime` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:46-54; packages/types/src/NodeInteractiveStateBinding.ts:55-57` | `NodeInteractiveStateRefusalReason` | `const,type` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeInteractiveStateBinding.ts:58-63` | `NodeInteractiveStateExplanation` | `interface` | yes | `scene-document` | `flight-scene-document` | `none` | no | dissolve-types-fixes.json:INVERT |
| `packages/types/src/NodeOrderList.ts:3-7` | `NodeOrderList` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeOrderList.ts:8-13` | `NodeOrderListEntryVisitor` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeRenderer.ts:7-23` | `NodeRenderer` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NodeSignals.ts:5-12` | `NodeSignals` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NonEntityCreateResult.ts:15-21` | `NonEntityCreateResult` | `type` | yes | `entity` | `flight-entity` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/NormalMaterial.ts:7-12` | `NormalMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/NormalMaterial.ts:13-14` | `NormalMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:4-9` | `NotificationAction` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:10-28` | `NotificationRequest` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:29` | `NotificationRequestField` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:30-31` | `NotificationPermission` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:32-38` | `NotificationSchedule` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:39-44` | `Notification` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:45-50` | `ScheduledNotification` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:51-54` | `NotificationPermissionQueryOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:55-58` | `NotificationPermissionRequestOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:59-66` | `NotificationDeliveryOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:67-78` | `NotificationScheduleOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:79-81` | `NotificationCloseOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:82-85` | `NotificationCancelOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:86-92` | `NotificationActiveListOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:93-99` | `NotificationPendingListOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:100-104` | `NotificationLifecycleFailure` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:105-111` | `NotificationLifecycleOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:112-115` | `NotificationEventReleaseOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:116-119` | `NotificationEventAttachment` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:120-123` | `NotificationEventBackendAttachOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:124-131` | `NotificationSubscriptionAttachOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:132-135` | `NotificationSubscriptionDetachOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:136-143` | `NotificationSubscriptionDisposeOutcome` | `type` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:144-147` | `NotificationActionSubscription` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Notification.ts:148-151` | `NotificationClickSubscription` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Notification.ts:152-155` | `NotificationDismissSubscription` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Notification.ts:156-159` | `NotificationReplySubscription` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Notification.ts:160-163` | `NotificationReceivedSubscription` | `interface` | yes | `notification` | `flight-notification` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Notification.ts:164-168` | `HostNotificationPermissionCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:169-172` | `HostNotificationDeliveryCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:173-181` | `HostNotificationSchedulingCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:182-185` | `HostNotificationCloseCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:186-189` | `HostNotificationActiveListCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:190-195` | `HostNotificationActionCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:196-199` | `HostNotificationClickCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:200-203` | `HostNotificationDismissCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:204-209` | `HostNotificationReplyCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:210-213` | `HostNotificationReceivedCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:214-217` | `HostNotificationLifecycleCapability` | `interface` | yes | `notification` | `flight-notification` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Notification.ts:218-227` | `WebPageNotificationCapabilities` | `type` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:228-238` | `WebServiceWorkerNotificationCapabilities` | `type` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:239-247` | `ElectronNotificationCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:248-253` | `ElectronMacosNotificationCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:254-259` | `TauriNotificationCapabilities` | `type` | yes | `host-tauri` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:260-268` | `CapacitorNotificationCapabilities` | `type` | yes | `host-capacitor` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:269-285` | `WebNotificationOptions` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:286-293` | `WebPageNotificationInstance` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:294-299` | `WebPageNotificationApi` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:300-306` | `WebServiceWorkerNotificationInstance` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:307-311` | `WebServiceWorkerNotificationRegistration` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:312-319` | `WebServiceWorkerNotificationApi` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Notification.ts:320-325` | `WebServiceWorkerNotificationEvent` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Obb.ts:6-18` | `Obb` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Obb.ts:19-20` | `ObbLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjMaterialHandler.ts:18-47` | `ObjMaterialHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjMaterialHandler.ts:48-52` | `ObjImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjMaterialHandler.ts:53-55` | `OBJ_MATERIAL_BLINN_PHONG_FEATURE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjMaterialHandler.ts:56-57` | `OBJ_MATERIAL_STANDARD_PBR_FEATURE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjSchema.ts:15-68` | `ObjMaterial` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ObjSchema.ts:69-72` | `ObjMaterialLibrary` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OpenTypeFontExplanation.ts:6-50` | `OpenTypeFontExplanation` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OpenTypeFontExplanation.ts:51-59` | `OpenTypeFontExplanationReason` | `type` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OrbitCameraController.ts:14-30` | `OrbitCameraController` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OrbitCameraController.ts:31-42` | `OrbitCameraControllerOptions` | `interface` | yes | `camera-controls` | `flight-camera-controls` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OrthographicProjectionOptions.ts:2-6` | `OrthographicProjectionOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OuterGlowEffect.ts:7-19` | `OuterGlowEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/OutlineEffect.ts:3-10` | `OutlineEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PanniniProjectionEffect.ts:2-7` | `PanniniProjectionEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParsedAccelerator.ts:13-17` | `ParsedAccelerator` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PartialNode.ts:1-4` | `PartialNode` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ParticleBurstSchedule.ts:2-14` | `ParticleBurstEntry` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/ParticleBurstSchedule.ts:15-16` | `ParticleBurstSchedule` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/ParticleCollider.ts:7-8` | `ParticleCollider` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleConfigIssue.ts:3-8` | `ParticleConfigIssue` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleConfigParse.ts:8-10` | `ParseParticleConfigOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleConfigParse.ts:11-20` | `ParticleConfigParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleCurve.ts:1-2` | `ParticleCurve` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ParticleCurve.ts:3-7` | `CurveKeyframe` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ParticleCurve.ts:8-14` | `ColorKeyframe` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ParticleDesignerSchema.ts:8-9` | `ParticleDesignerEmitterType` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleDesignerSchema.ts:10-83` | `ParticleDesignerDocument` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleDesignerSchema.ts:84-85` | `ParticleDesignerRawDict` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleDesignerSchema.ts:86-91` | `ParticleDesignerParseOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleDesignerSchema.ts:92-99` | `ParticleDesignerParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleDesignerSchema.ts:100-105` | `ParticleDesignerSerializeOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitter2D.ts:5-21` | `ParticleEmitterData` | `interface` | yes | `particleemitter` | `flight-particleemitter` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ParticleEmitter2D.ts:22-25` | `ParticleEmitter2DRuntime` | `interface` | yes | `particleemitter` | `flight-particleemitter` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ParticleEmitter2D.ts:26-29` | `ParticleEmitter2D` | `interface` | yes | `particleemitter` | `flight-particleemitter` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitter2D.ts:30-31` | `ParticleEmitter2DKind` | `const` | yes | `particleemitter` | `flight-particleemitter` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitter3D.ts:5-12` | `ParticleEmitter3D` | `interface` | yes | `particleemitter` | `flight-particleemitter` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitter3D.ts:13-14` | `ParticleEmitter3DRuntime` | `type` | yes | `particleemitter` | `flight-particleemitter` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitter3D.ts:15-16` | `ParticleEmitter3DKind` | `const` | yes | `particleemitter` | `flight-particleemitter` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitterCallbacks.ts:1-6` | `ParticleEmitterCallbacks` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ParticleEmitterConfig.ts:3-7` | `ParticleEmitterShape` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitterConfig.ts:8-9` | `ParticleBlendMode` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitterConfig.ts:10-64` | `ParticleEmitterConfig` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitterSignals.ts:4-13` | `ParticleEmitterSignals` | `interface` | yes | `particles` | `flight-particles` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleEmitterState.ts:4-19` | `ParticleEmitterState` | `interface` | yes | `particles` | `flight-particles` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleForce.ts:8-9` | `ParticleForce` | `type` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatCodec.ts:6-24` | `ParticleFormatCodec` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatDescriptor.ts:14-38` | `ParticleFormatDescriptor` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatDescriptor.ts:39-42` | `ParticleImportOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:2-3` | `ParticleDesignerFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:4-5` | `SpineParticleFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:6-7` | `UnityParticleFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:8-9` | `LibgdxParticleFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:10-11` | `StarlingPexFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:12-14` | `PixiParticleFormatKind` | `const` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatKind.ts:15-23` | `ParticleFormatKind` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleFormatWarning.ts:5-14` | `ParticleFormatWarning` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/ParticleObject.ts:5-6` | `ParticleObject` | `type` | yes | `particles` | `flight-particles` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleObjectsState.ts:4-16` | `ParticleObjectsState` | `interface` | yes | `particles` | `flight-particles` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleObjectsUpdateOptions.ts:3-8` | `ParticleObjectsUpdateOptions` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ParticleSerializeResult.ts:8-15` | `ParticleSerializeResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Path.ts:11-21; packages/types/src/Path.ts:22-23` | `PathCommand` | `const,type` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Path.ts:24-29` | `Path` | `interface` | yes | `path` | `flight-path` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathAttachment2D.ts:36-46` | `PathAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathAttachment2D.ts:47-48` | `PathAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanContour.ts:5-6` | `PathBooleanContour` | `type` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanExplanation.ts:1-5` | `PathBooleanExplanation` | `interface` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanFillRule.ts:11-12` | `PathBooleanFillRule` | `type` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanKernel.ts:16-24` | `PathBooleanKernel` | `interface` | yes | `path-boolean` | `flight-path-boolean` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanOperation.ts:5-6` | `PathBooleanOperation` | `type` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathBooleanOptions.ts:8-12` | `PathBooleanOptions` | `interface` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathMesh.ts:7-11` | `PathMesh` | `interface` | yes | `path` | `flight-path` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/PathMeshTyped.ts:7-11` | `PathMeshTyped` | `interface` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathMorph.ts:8-14` | `PathMorph` | `interface` | yes | `path` | `flight-path` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathMorphCreationExplanation.ts:6-11` | `PathMorphCreationExplanation` | `interface` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathMorphCreationReason.ts:1-7` | `PathMorphCreationReason` | `type` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathOffsetEnd.ts:5-6` | `PathOffsetEnd` | `type` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathOffsetJoin.ts:7-8` | `PathOffsetJoin` | `type` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathOffsetOptions.ts:13-20` | `PathOffsetOptions` | `interface` | yes | `path-boolean` | `flight-path-boolean` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PathSegment.ts:12-42` | `PathSegment` | `type` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PbrExtension.ts:5-8` | `PbrUvSet` | `type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PbrExtension.ts:9-12` | `PbrExtension` | `interface` | yes | `materials` | `flight-materials` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:7-21` | `PermissionName` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:22-23` | `PermissionState` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:24-27` | `PermissionQueryFailureReason` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:28-36` | `PermissionQueryOutcome` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:37-45` | `PermissionRequestFailureReason` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:46-57` | `PermissionRequestOutcome` | `type` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Permission.ts:58-64` | `HostPermissionsCapability` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PerspectiveProjectionOptions.ts:2-6` | `PerspectiveProjectionOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PhongMaterial.ts:7-17` | `PhongMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PhongMaterial.ts:18-19` | `PhongMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PhotometricLightLike.ts:11-15` | `PhotometricLightLike` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:21-32` | `Physics2DBodyType` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:33-42` | `Physics2DMaterial` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:43-65` | `Physics2DCollisionFilter` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:66-83` | `Physics2DCollider` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:84-103` | `Physics2DMassData` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:104-167` | `RigidBody2D` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:168-201` | `Physics2DContactPoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:202-232` | `Physics2DContact` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:233-234` | `Physics2DContactCallback` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:235-249` | `Physics2DContactHooks` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:250-278` | `Physics2DSolverConfig` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:279-297` | `Physics2DStepExplanation` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:298-363` | `Physics2DWorld` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:364-376` | `Physics2DJointKind` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:377-422` | `Physics2DJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:423-432` | `Physics2DBrokenJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:433-439` | `Physics2DJointEvents` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:440-448` | `Physics2DDistanceJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:449-476` | `Physics2DRevoluteJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:477-483` | `Physics2DWeldJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:484-490` | `Physics2DRopeJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:491-499` | `Physics2DPulleyJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:500-506` | `Physics2DGearCoordinateKind` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:507-519` | `Physics2DGearJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:520-549` | `Physics2DPrismaticJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:550-565` | `Physics2DWheelJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:566-576` | `Physics2DMouseJoint` | `interface` | yes | `physics2d` | `flight-physics2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:577-589` | `Physics2DJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:590-595` | `Physics2DDistanceJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:596-608` | `Physics2DRevoluteJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:609-612` | `Physics2DWeldJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:613-616` | `Physics2DRopeJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:617-625` | `Physics2DPulleyJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:626-636` | `Physics2DGearJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:637-651` | `Physics2DPrismaticJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:652-664` | `Physics2DWheelJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:665-687` | `Physics2DMouseJointOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:688-748` | `Physics2DJointSolver` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:749-756` | `Physics2DContactEvents` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:757-764` | `Physics2DQueryHit` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:765-772` | `Physics2DQueryResult` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:773-781` | `Physics2DQueryFilter` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:782-791` | `Physics2DRayHit` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:792-820` | `Physics2DRayResult` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:821-837` | `Physics2DShapeCastResult` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:838-842` | `Physics2DCollisionExplanation` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:843-851` | `Physics2DJointResolutionStatus` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:852-863` | `Physics2DJointResolution` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:864-884` | `Physics2DJointResolutionExplanation` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:885-893` | `Physics2DJointReaction` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:894-897` | `Physics2DStepGuard` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:898-906` | `Physics2DContactIntakeGuard` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:907-908` | `Physics2DJointResolutionGuard` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:909-913` | `Physics2DDebugFeature` | `type` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:914-923` | `Physics2DDebugLine` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:924-934` | `Physics2DDebugCircle` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2D.ts:935-941` | `Physics2DDebugGeometry` | `interface` | yes | `physics2d` | `flight-physics2d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2D.ts:942-951` | `Physics2DDebugGeometryOptions` | `interface` | yes | `physics2d` | `flight-physics2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:13` | `Physics2DAbiWorldHandle` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:14` | `Physics2DAbiObjectId` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:15-19` | `Physics2DAbiWorldStatus` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:20-32` | `Physics2DAbiExecutionStatus` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:33-42` | `Physics2DAbiExecutionResult` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:43-51` | `Physics2DAbiCommandBuffer` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:52-59` | `Physics2DAbiBodyBuffer` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:60-64` | `Physics2DAbiContactSelection` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:65-83` | `Physics2DAbiContactBuffer` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:84-85` | `Physics2DAbiContactHook` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:86-91` | `Physics2DAbiContactHooks` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:92-96` | `Physics2DAbiStepStatus` | `type` | yes | `physics2d-abi` | `flight-physics2d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics2DAbi.ts:97-107` | `Physics2DAbiJointBuffer` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:108-120` | `Physics2DAbiQueryBuffer` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics2DAbi.ts:121-182` | `Physics2DAbi` | `interface` | yes | `physics2d-abi` | `flight-physics2d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:29-37` | `Physics3DBodyType` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:38-47` | `Physics3DMaterial` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:48-69` | `Physics3DCollisionFilter` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:70-96` | `Physics3DCollider` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:97-120` | `Physics3DMassData` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:121-248` | `RigidBody3D` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:249-277` | `Physics3DContactPoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:278-312` | `Physics3DContact` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:313-327` | `Physics3DContactEvents` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:328-329` | `Physics3DContactCallback` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:330-342` | `Physics3DContactHooks` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:343-362` | `Physics3DContactConstraintPoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:363-384` | `Physics3DContactConstraint` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:385-400` | `Physics3DSequentialImpulseState` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:401-415` | `Physics3DSequentialImpulseConfig` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:416-458` | `Physics3DSolverConfig` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:459-478` | `Physics3DRotationalCcdEnvelope` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:479-483` | `Physics3DCollisionExplanation` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:484-500` | `Physics3DStepExplanation` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:501-504` | `Physics3DStepGuard` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:505-509` | `Physics3DContactIntakeGuard` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:510-513` | `Physics3DJointResolutionGuard` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:514-526` | `Physics3DJointExplanation` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:527-538` | `Physics3DJointKind` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:539-596` | `Physics3DJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:597-645` | `Physics3DJointSolver` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:646-667` | `Physics3DJointFrames` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:668-679` | `Physics3DJointReaction` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:680-683` | `Physics3DJointEvents` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:684-699` | `Physics3DJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:700-716` | `Physics3DJointFrameOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:717` | `Physics3DBallAndSocketJoint` | `type` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:718-738` | `Physics3DBallAndSocketJointOptions` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:739-761` | `Physics3DDistanceJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:762-775` | `Physics3DDistanceJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:776` | `Physics3DFixedJoint` | `type` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:777-786` | `Physics3DFixedJointOptions` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:787-824` | `Physics3DHingeJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:825-841` | `Physics3DHingeJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:842-870` | `Physics3DSliderJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:871-894` | `Physics3DSliderJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:895-924` | `Physics3DConeTwistJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:925-950` | `Physics3DConeTwistJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:951-989` | `Physics3DGeneric6DofJoint` | `interface` | yes | `physics3d` | `flight-physics3d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:990-1016` | `Physics3DGeneric6DofJointOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1017-1087` | `Physics3DWorld` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1088-1096` | `Physics3DQueryHit` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1097-1105` | `Physics3DQueryResult` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1106-1117` | `Physics3DQueryFilter` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1118-1127` | `Physics3DRayHit` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1128-1151` | `Physics3DRayResult` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1152-1165` | `Physics3DShapeCastResult` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1166-1170` | `Physics3DDebugFeature` | `type` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1171-1185` | `Physics3DDebugLine` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1186-1197` | `Physics3DDebugSphere` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3D.ts:1198-1204` | `Physics3DDebugGeometry` | `interface` | yes | `physics3d` | `flight-physics3d` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3D.ts:1205-1213` | `Physics3DDebugGeometryOptions` | `interface` | yes | `physics3d` | `flight-physics3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:13` | `Physics3DAbiWorldHandle` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:14` | `Physics3DAbiObjectId` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:15-19` | `Physics3DAbiWorldStatus` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:20-32` | `Physics3DAbiExecutionStatus` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:33-42` | `Physics3DAbiExecutionResult` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:43-51` | `Physics3DAbiCommandBuffer` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:52-59` | `Physics3DAbiBodyBuffer` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:60-64` | `Physics3DAbiContactSelection` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:65-82` | `Physics3DAbiContactBuffer` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:83-84` | `Physics3DAbiContactHook` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:85-90` | `Physics3DAbiContactHooks` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:91-94` | `Physics3DAbiStepStatus` | `type` | yes | `physics3d-abi` | `flight-physics3d-abi` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Physics3DAbi.ts:95-105` | `Physics3DAbiJointBuffer` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:106-118` | `Physics3DAbiQueryBuffer` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Physics3DAbi.ts:119-184` | `Physics3DAbi` | `interface` | yes | `physics3d-abi` | `flight-physics3d-abi` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PixelateEffect.ts:3-7` | `PixelateEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PixelFormat.ts:11-12` | `PixelFormat` | `type` | yes | `texture` | `flight-texture` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/PixelOrder.ts:1-2` | `PixelOrder` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PixiParseResult.ts:4-10` | `PixiParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PixiParseResult.ts:11-12` | `PixiParsed` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Plane.ts:7-13` | `Plane` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Plane.ts:14-15` | `PlaneLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PlaneCollider.ts:3-10` | `PlaneCollider` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PlaneCollider.ts:11-12` | `PlaneColliderKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:6-8` | `PlatformName` | `type` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:9-11` | `PlatformEndianness` | `type` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:12-13` | `PlatformEngine` | `type` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:14-17` | `PlatformKind` | `type` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:18-19` | `PlatformRuntime` | `type` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Platform.ts:20-49` | `PlatformInfo` | `interface` | yes | `platform` | `flight-platform` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Platform.ts:50-54` | `HostPlatformCapability` | `interface` | yes | `platform` | `flight-platform` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PlayMode.ts:1-2` | `PlayMode` | `type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/PointAttachment2D.ts:13-19` | `PointAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PointAttachment2D.ts:20-21` | `PointAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PointerEventData.ts:3-23` | `PointerEventData` | `interface` | yes | `interaction` | `flight-interaction` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/PointerEventData.ts:24-25` | `PointerType` | `type` | yes | `input` | `flight-input` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/PointGravityWellForce.ts:11-24` | `PointGravityWellForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/PointGravityWellForce.ts:25-26` | `PointGravityWellForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:orphan-recommendation |
| `packages/types/src/PointLight.ts:14-49` | `PointLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PointLight.ts:50-51` | `PointLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PointLightOptions.ts:6-30` | `PointLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PosterizeEffect.ts:3-7` | `PosterizeEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:7-10` | `PowerIdleState` | `type` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:11-13` | `PowerKeepAwakeMode` | `type` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:14-15` | `PowerThermalState` | `type` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:16-43` | `PowerStatus` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:44-45` | `PowerKeepAwakeAcquireReason` | `type` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:46-47` | `PowerKeepAwakeReleaseReason` | `type` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:48-51` | `PowerKeepAwakeAcquireResult` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:52-67` | `PowerKeepAwakeReleaseResult` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:68-73` | `HostPowerStatusCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:74-80` | `HostPowerChangeCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:81-89` | `HostPowerKeepAwakeCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:90-97` | `HostPowerIdleCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:98-104` | `HostPowerSessionLockCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:105-110` | `HostPowerSuspensionCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:111-117` | `HostPowerBatteryHealthCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:118-122` | `HostPowerThermalCapability` | `interface` | yes | `power` | `flight-power` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Power.ts:123-130` | `ElectronPowerCapabilities` | `type` | yes | `host-electron` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Power.ts:131-132` | `WebPowerReadingCapabilities` | `type` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Power.ts:133-145` | `WebPowerCapabilities` | `type` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Power.ts:146-157` | `Power` | `interface` | yes | `power` | `flight-power` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/PowerBatteryHealth.ts:4-15` | `PowerBatteryHealth` | `interface` | yes | `power` | `flight-power` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/PowerBatteryHealth.ts:16-17` | `PowerBatteryHealthState` | `type` | yes | `power` | `flight-power` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ProgressBarController.ts:5-6` | `ProgressBarControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ProgressBarController.ts:7-10` | `ProgressBarController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ProgressBarController.ts:11-19` | `ProgressBarControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:6-13` | `ParsedProtocolUrl` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:14-17` | `ProtocolHandler` | `interface` | yes | `protocol` | `flight-protocol` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Protocol.ts:18-23` | `HostProtocolDefaultCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:24-27` | `HostProtocolLaunchCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:28-31` | `HostProtocolOpenCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:32-36` | `HostProtocolRegistrationCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:37-40` | `HostProtocolRegistrationQueryCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Protocol.ts:41-44` | `HostProtocolUnregistrationCapability` | `interface` | yes | `protocol` | `flight-protocol` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/QuadBatch.ts:7-19` | `QuadBatchData` | `interface` | yes | `quadbatch` | `flight-quadbatch` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/QuadBatch.ts:20-30` | `QuadBatchRuntime` | `interface` | yes | `quadbatch` | `flight-quadbatch` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/QuadBatch.ts:31-34` | `QuadBatch` | `interface` | yes | `quadbatch` | `flight-quadbatch` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/QuadBatch.ts:35-36` | `QuadBatchKind` | `const` | yes | `quadbatch` | `flight-quadbatch` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/QuadBatchSignals.ts:4-9` | `QuadBatchSignals` | `interface` | yes | `quadbatch` | `flight-quadbatch` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/QuadTransformType.ts:1-2` | `QuadTransformType` | `type` | yes | `quadbatch` | `flight-quadbatch` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Quaternion.ts:6-12` | `Quaternion` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Quaternion.ts:13-14` | `QuaternionLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RadialBlurEffect.ts:3-25` | `RadialBlurEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RadioGroupController.ts:5-6` | `RadioGroupControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RadioGroupController.ts:7-10` | `RadioGroupController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RadioGroupController.ts:11-15` | `RadioGroupControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RadioGroupController.ts:16-19` | `RadioGroupControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RandomSource.ts:1-2` | `RandomSource` | `type` | yes | `math` | `flight-math` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RateLimitedLogSink.ts:5-8` | `RateLimitedLogSink` | `interface` | yes | `log` | `flight-log` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RawProjectionOptions.ts:4-7` | `RawProjectionOptions` | `interface` | yes | `camera` | `flight-camera` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ray3D.ts:6-10` | `Ray3D` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Ray3D.ts:11-12` | `Ray3DLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Rectangle.ts:3-9` | `Rectangle` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Rectangle.ts:10-11` | `RectangleLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RectangleCollider.ts:3-11` | `RectangleCollider` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RectangleCollider.ts:12-13` | `RectangleColliderKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RegionAttachment2D.ts:10-19` | `RegionAttachment2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RegionAttachment2D.ts:20-21` | `RegionAttachment2DKind` | `const` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RegistryTable.ts:6-10` | `OrdinalTable` | `interface` | yes | `registry` | `flight-registry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderBlendStateEntry.ts:2-6` | `RenderBlendStateEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/RenderCache.ts:15-19` | `RenderCache` | `interface` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderCache.ts:20; packages/types/src/RenderCache.ts:21-22` | `RenderCacheKind` | `const,type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderCacheAdapter.ts:9-16` | `RenderCacheAdapter` | `type` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderCacheAdapterSignals.ts:3-6` | `RenderCacheAdapterSignals` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/RenderCacheRefreshOptions.ts:1-8` | `RenderCacheRefreshOptions` | `type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/RenderDrawContext.ts:5-11` | `RenderBatchKey` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/RenderDrawContext.ts:12-18` | `RenderDrawContext` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/RendererData.ts:3-4` | `RendererData` | `interface` | yes | `node` | `flight-node` | `direct` | no | text-host-ownership.md:C5 |
| `packages/types/src/RenderProxy.ts:9-47` | `RenderProxy` | `interface` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderProxy2D.ts:9-24` | `RenderProxy2D` | `interface` | yes | `render` | `flight-render` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderProxyAdapter.ts:5-8` | `RenderProxyAdapter` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderProxyResolver.ts:5-8` | `RenderProxyResolver` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/RenderProxyVisitor.ts:7-13` | `RenderProxyVisitor` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderQueue.ts:3` | `RenderSortKey` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderQueue.ts:4-7` | `RenderQueueEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderQueue.ts:8-12` | `RenderQueue` | `interface` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderRegistrySignals.ts:9-20` | `RenderRegistryTable` | `enum` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderRegistrySignals.ts:21-25` | `RenderRegistriesMiss` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderRegistrySignals.ts:26-30` | `RenderRegistriesMissExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderRegistrySignals.ts:31-34` | `RenderRegistrySignals` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:25-26` | `Scene3DGraphSyncPolicy` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:27-43` | `RenderState` | `interface` | yes | `render` | `flight-render` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:44-63` | `RenderRegistries` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:64` | `ColorAdjustmentUnsupportedGuard` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:65-85` | `RenderRootGuard` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:86-96` | `StrokeTessellator` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderState.ts:97-119` | `RenderStateRuntime` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RenderStateOptions.ts:13-22` | `RenderStateOptions` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderStateStats.ts:1-6` | `RenderStateStats` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/RenderTarget.ts:13-17` | `RenderTargetDimensions` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:18-21` | `RenderTargetFormat` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:22-23` | `RenderTargetFormatPolicy` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:24-30` | `RenderTargetDepth` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:31-35` | `RenderTargetColorSpace` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/RenderTarget.ts:36-46` | `RenderTargetAxes` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:47-52` | `RenderTargetAxisDifference` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:53-58` | `RenderTargetExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:59-81` | `RenderTargetDescriptor` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:82-87` | `RenderTarget` | `interface` | yes | `render` | `flight-render` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTarget.ts:88-89` | `ResolvedRenderTargetDescriptor` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RenderTargetClear.ts:7-13` | `RenderTargetClear` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/RenderTexture.ts:4-7` | `RenderTexture` | `interface` | yes | `render` | `flight-render` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Requirement.ts:7-13` | `Requirement` | `interface` | yes | `requirement` | `flight-requirement` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Requirement.ts:14-18` | `RequirementSet` | `interface` | yes | `requirement` | `flight-requirement` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/RequirementCatalog.ts:8-96` | `RequirementCatalogEntry` | `interface` | yes | `requirement-catalog` | `flight-requirement-catalog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCatalog.ts:97-110` | `RequirementTranslation` | `interface` | yes | `requirement-catalog` | `flight-requirement-catalog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCatalog.ts:111-134` | `RequirementBackend` | `interface` | yes | `requirement-catalog` | `flight-requirement-catalog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCatalog.ts:135-142` | `RequirementDisposition` | `interface` | yes | `requirement-catalog` | `flight-requirement-catalog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCatalog.ts:143-159` | `RequirementCatalog` | `interface` | yes | `requirement-catalog` | `flight-requirement-catalog` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCodegen.ts:6-20` | `RequirementCodegenPlan` | `interface` | yes | `requirement-codegen` | `flight-requirement-codegen` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementCodegen.ts:21-25` | `RequirementDeclination` | `interface` | yes | `requirement-codegen` | `flight-requirement-codegen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RequirementFacet.ts:3-15; packages/types/src/RequirementFacet.ts:16-17` | `RequirementFacet` | `const,type` | yes | `requirement` | `flight-requirement` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ResourceLoadBytes.ts:8-19` | `ResourceLoadBytes` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadBytesReporter.ts:11-12` | `ResourceLoadBytesReporter` | `type` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadCounts.ts:5-18` | `ResourceLoadCounts` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoader.ts:5-18` | `ResourceLoader` | `interface` | yes | `loader` | `flight-loader` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoaderItemSignals.ts:4-10` | `ResourceLoaderItemSignals` | `interface` | yes | `loader` | `flight-loader` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoaderOptions.ts:1-13` | `ResourceLoaderOptions` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadHandle.ts:1-5` | `ResourceLoadHandle` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadItem.ts:3-18` | `ResourceLoadItem` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadItemStatus.ts:1-2` | `ResourceLoadItemStatus` | `type` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadReport.ts:1-9` | `ResourceLoadReport` | `interface` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceLoadReport.ts:10-11` | `ResourceLoadReportStatus` | `type` | yes | `loader` | `flight-loader` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ResourceResolutionState.ts:13-19; packages/types/src/ResourceResolutionState.ts:20-21` | `ResourceResolutionState` | `const,type` | yes | `resource` | `flight-resource` | `none` | no | design-decisions.md:D8-resource |
| `packages/types/src/RichText.ts:9-42` | `RichTextData` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RichText.ts:43-57` | `RichTextRuntime` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RichText.ts:58-61` | `RichText` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RichText.ts:62-63` | `RichTextKind` | `const` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RichTextContent.ts:4-8` | `RichTextContent` | `interface` | yes | `textlayout` | `flight-textlayout` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RimModifier.ts:9-18` | `RimModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RimModifier.ts:19-20` | `RimModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RimModifierOptions.ts:1-8` | `RimModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:29-39; packages/types/src/RiveDocument.ts:40-50` | `RiveFieldType` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:51-57` | `RiveValue` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:58-67` | `RiveProperty` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:68-73` | `RiveCoreObject` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:74-83` | `RivePropertyFieldType` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:84-91` | `RiveDocumentHeader` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:92-103` | `RiveDocument` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:104-120` | `RiveArtboardGraph` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:121-130` | `RiveObjectGraph` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/RiveDocument.ts:131-147` | `RiveFileAsset` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:148-155` | `RiveStateMachineTransition` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:156-161` | `RiveStateMachineState` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:162-167` | `RiveStateMachineLayer` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:168-173` | `RiveStateMachineInput` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:174-184` | `RiveStateMachineDescriptor` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:185-194` | `RiveAdvancedBlend` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:195-203; packages/types/src/RiveDocument.ts:204-218` | `RiveAnimationLoop` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:219-231` | `RiveSkeleton2DImport` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveDocument.ts:232-259` | `RiveAnimationClip` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:260-269` | `RiveLayoutImport` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:270-297` | `RiveArtboardImport` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:298-306; packages/types/src/RiveDocument.ts:307-316` | `RiveWeightedPointKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:317-328` | `RiveWeightedPoint` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveDocument.ts:329-341` | `RivePathRecord` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveDocument.ts:342-349` | `RiveScene2DDocumentResult` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveDocument.ts:350-355` | `RiveDocumentImportResult` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveImportOptions.ts:8-17` | `RiveRegistrar` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveImportOptions.ts:18-39` | `RivePathBooleanRegistrar` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveImportOptions.ts:40-44` | `RiveImportOptions` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveImportRegistry.ts:43-56` | `RiveCoreObjectHandler` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/RiveImportRegistry.ts:57-86` | `RiveArtboardImportContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveImportRegistry.ts:87-100` | `RiveDocumentImportContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/RiveImportRegistry.ts:101-104` | `RiveImportRegistry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sampler.ts:4-7` | `TextureWrap` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sampler.ts:8-18` | `TextureFilter` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sampler.ts:19-27` | `Sampler` | `interface` | yes | `texture` | `flight-texture` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sampler.ts:28-29` | `SamplerLike` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScalarRemap.ts:1-2` | `ScalarRemap` | `type` | yes | `easing` | `flight-easing` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scale9Mapper.ts:1-5` | `Scale9Mapper` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scale9Shape.ts:4-7` | `Scale9ShapeData` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scale9Shape.ts:8-9` | `Scale9ShapeRuntime` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scale9Shape.ts:10-13` | `Scale9Shape` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scale9Shape.ts:14-15` | `Scale9ShapeKind` | `const` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scale9Sprite.ts:4-7` | `Scale9SpriteData` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scale9Sprite.ts:8-9` | `Scale9SpriteRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scale9Sprite.ts:10-13` | `Scale9Sprite` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scale9Sprite.ts:14-15` | `Scale9SpriteKind` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScanlinesEffect.ts:3-8` | `ScanlinesEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2D.ts:15-23` | `Scene2D` | `interface` | yes | `scene2d` | `flight-scene2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2D.ts:24-27` | `Scene2DRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scene2DAlign.ts:1-2` | `Scene2DAlign` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/Scene2DDisplayState.ts:1-2` | `Scene2DDisplayState` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/Scene2DDocument.ts:9-35` | `Scene2DSlotReference` | `interface` | yes | `scene2d` | `flight-scene2d` | `direct` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Scene2DDocument.ts:36-47` | `Scene2DDocument` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DFitContext.ts:5-10` | `Scene2DFitContext` | `interface` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DKindUsage.ts:16-26` | `Scene2DKindUsage` | `interface` | yes | `scene2d` | `flight-scene2d` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DPipelineCoverageExplanation.ts:3-9` | `Scene2DPipelineCoverageExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DQuality.ts:1-2` | `Scene2DQuality` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/Scene2DRenderBlankReason.ts:4-5` | `Scene2DRenderBlankReason` | `type` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DRenderer.ts:7-13` | `Scene2DRenderer` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene2DRenderer.ts:14-23` | `Scene2DClipHooks` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene2DRenderExplanation.ts:8-28` | `Scene2DRenderExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:9-14` | `Scene2DDocumentFetchProgress` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:15-20` | `Scene2DDocumentFetcher` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:21-25` | `Scene2DDocumentImportContext` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:26-30` | `Scene2DDocumentImporter` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:31-35` | `Scene2DDocumentImporterMatcher` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:36-41` | `Scene2DDocumentImporterEntry` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:42-45` | `Scene2DDocumentImporterRegistry` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Scene2DResources.ts:46-52` | `Scene2DDocumentLoadOptions` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:53-54` | `Scene2DSlotContentResolver` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:55-59` | `Scene2DSlotResolution` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:60-66` | `Scene2DResources` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:67-71` | `ResolveScene2DResourcesOptions` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:72-79` | `Scene2DImageResourceLoadProgress` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:80-85` | `Scene2DImageResources` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:86-94` | `LoadScene2DImageResourcesOptions` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:95-100` | `Scene2DAudioResourceLoadProgress` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:101-106` | `Scene2DAudioResources` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:107-123` | `LoadScene2DAudioResourcesOptions` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:124-130` | `Scene2DResourceCoverageCount` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:131-137` | `Scene2DResourceCoverageExplanation` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:138-144` | `Scene2DResourceFailureOperation` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:145-154` | `Scene2DResourceFailureReason` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:155-162` | `Scene2DResourceFailureNotice` | `interface` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DResources.ts:163-164` | `Scene2DResourceFailureGuard` | `type` | yes | `scene2d-resources` | `flight-scene2d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene2DScaleMode.ts:1-2` | `Scene2DScaleMode` | `type` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/Scene2DSignals.ts:4-9` | `Scene2DSignals` | `interface` | yes | `scene2d` | `flight-scene2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3D.ts:19-25` | `Scene3D` | `interface` | yes | `scene3d` | `flight-scene3d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3D.ts:26-27` | `Scene3DRuntime` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DAnimationPath.ts:9-10` | `Scene3DAnimationPath` | `type` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DAnimationPath.ts:11` | `Scene3DAnimationPathRotation` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DAnimationPath.ts:12` | `Scene3DAnimationPathScale` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DAnimationPath.ts:13` | `Scene3DAnimationPathTranslation` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DAnimationPath.ts:14-15` | `Scene3DAnimationPathWeights` | `const` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DAnimationTarget.ts:9-13` | `Scene3DAnimationTarget` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DDocument.ts:39-57` | `Scene3DDocument` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:58-66` | `Scene3DDocumentAnimation` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:67-76` | `Scene3DDocumentAnimationChannel` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:77-101` | `Scene3DDocumentCamera` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:102-112` | `Scene3DDocumentLight` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:113-124` | `Scene3DDocumentMesh` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:125-134` | `Scene3DDocumentNode` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:135-142` | `Scene3DDocumentScene` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DDocument.ts:143-147` | `Scene3DDocumentSkin` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Scene3DForwardLightSelection.ts:9-17` | `Scene3DForwardLightSelection` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DForwardLightSelectionExplanation.ts:4-10` | `Scene3DForwardLightSelectionExplanation` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DHit.ts:12-26` | `Scene3DHit` | `interface` | yes | `picking` | `flight-picking` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DKindUsage.ts:18-31` | `Scene3DKindUsage` | `interface` | yes | `scene3d` | `flight-scene3d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DLightBlock.ts:16-31` | `Scene3DLightBlock` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:32-38` | `MAX_FORWARD_LIGHTS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:39` | `SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:40` | `SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:41` | `SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:42-45` | `SCENE_LIGHT_HEAD_FLOATS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:46` | `SCENE_LIGHT_POINT_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:47-50` | `SCENE_LIGHT_POINT_STRIDE` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:51` | `SCENE_LIGHT_SPOT_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:52-55` | `SCENE_LIGHT_SPOT_STRIDE` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:56` | `SCENE_LIGHT_HEMISPHERE_OFFSET` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:57-59` | `SCENE_LIGHT_HEMISPHERE_STRIDE` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLightBlock.ts:60-62` | `SCENE_LIGHT_BLOCK_FLOATS` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DLights.ts:17-27` | `Scene3DLights` | `interface` | yes | `lighting` | `flight-lighting` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DLights.ts:28-29` | `Scene3DLightsLike` | `type` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DMetadata.ts:4-9` | `Scene3DMetadata` | `interface` | yes | `scene3d` | `flight-scene3d` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/Scene3DPickOptions.ts:7-12` | `Scene3DPickOptions` | `interface` | yes | `picking` | `flight-picking` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DPipelineCoverageExplanation.ts:3-13` | `Scene3DPipelineCoverageExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DRenderList.ts:20-28` | `Scene3DRenderList` | `interface` | yes | `render` | `flight-render` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DRenderProxy.ts:28-63` | `Scene3DRenderProxy` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Scene3DResources.ts:15-16` | `Scene3DMaterialTextureLister` | `type` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:17-18` | `Scene3DPbrExtensionTextureLister` | `type` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:19-23` | `Scene3DMaterialTextureRegistry` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scene3DResources.ts:24-28` | `Scene3DResourceEvent` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:29-36` | `Scene3DResourceSignals` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scene3DResources.ts:37-42` | `Scene3DResourceResolver` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Scene3DResources.ts:43-51` | `Scene3DResourceResolverOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:52-57` | `Scene3DResourceInFlight` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:58-64` | `Scene3DResourceResolverRuntime` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:65-66` | `Scene3DResourceResolverRuntimeKey` | `const` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:67-73` | `Scene3DResourceResolverWithRuntime` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:74-80` | `Scene3DDocumentLoadProgress` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:81-87` | `Scene3DDocumentLoadOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:88-93` | `GltfScene3DDocumentLoadOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:94-98` | `Scene3DResourceLoadProgress` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:99-102` | `LoadScene3DResourcesOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:103-106` | `ResolveScene3DResourcesOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:107-112` | `Scene3DResourceResolution` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:113-118` | `Scene3DResources` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:119-123` | `Scene3DResourceWorkingSet` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:124-127` | `UpdateScene3DResourceStreamingOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Scene3DResources.ts:128-133` | `Scene3DResourceRevealOptions` | `interface` | yes | `scene3d-resources` | `flight-scene3d-resources` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SceneCoverageCatalog.ts:6-12` | `CatalogRegistration` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageCatalog.ts:13-20` | `CatalogEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageCatalog.ts:21-22` | `SceneCoverageCatalog` | `type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:8-15; packages/types/src/SceneCoverageEntry.ts:16-30` | `SceneCoverage` | `const,type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:31-36` | `SceneCoverageEntryBase` | `interface` | no | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:37-41` | `SceneCoverageRemedy` | `interface` | no | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:42-45` | `SatisfiedSceneCoverageEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:46-49` | `UnregisteredSceneCoverageEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:50-53` | `UnavailableSceneCoverageEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:54-57` | `FallbackRemediableSceneCoverageEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:58-63` | `FallbackUnavailableSceneCoverageEntry` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/SceneCoverageEntry.ts:64-70` | `SceneCoverageEntry` | `type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Screen.ts:15-57` | `ScreenInfo` | `interface` | yes | `screen` | `flight-screen` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Screen.ts:58-59` | `ScreenPermissionState` | `type` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Screen.ts:60-66` | `HostScreenQueryCapability` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Screen.ts:67-70` | `HostScreenChangeCapability` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Screen.ts:71-75` | `HostScreenDetailsCapability` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Screen.ts:76-79` | `HostScreenPermissionChangeCapability` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScreenChangeEvent.ts:5-8` | `ScreenChangeKind` | `type` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ScreenChangeEvent.ts:9-17` | `ScreenChangedMetrics` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ScreenChangeEvent.ts:18-23` | `ScreenChangeEvent` | `interface` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ScreenColorSpace.ts:3-4` | `ScreenColorSpace` | `type` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ScreenMode.ts:6-14` | `ScreenMode` | `interface` | yes | `screen` | `flight-screen` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScreenOrientation.ts:3-4` | `ScreenOrientation` | `type` | yes | `screen` | `flight-screen` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ScreenSignals.ts:9-14` | `ScreenSignals` | `interface` | yes | `screen` | `flight-screen` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScreenSignals.ts:15-18` | `ScreenPermissionChange` | `interface` | yes | `screen` | `flight-screen` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/ScreenSpaceFogEffect.ts:3-11` | `ScreenSpaceFogEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollBarController.ts:6-7` | `ScrollBarControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollBarController.ts:8-11` | `ScrollBarController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollBarController.ts:12-25` | `ScrollBarControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollBarController.ts:26-29` | `ScrollBarControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollViewController.ts:7-8` | `ScrollViewControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollViewController.ts:9-12` | `ScrollViewController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollViewController.ts:13-20` | `ScrollViewControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ScrollViewController.ts:21-24` | `ScrollViewControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectableRichTextManager.ts:4-7` | `SelectableRichTextManager` | `interface` | yes | `textinput` | `flight-textinput` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectionState.ts:5-6` | `SelectionStateNodeTypeKey` | `const` | no | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectionState.ts:7-13` | `SelectionModifierState` | `interface` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectionState.ts:14-19` | `SelectionSignals` | `interface` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectionState.ts:20-23` | `SelectionState` | `interface` | yes | `selection` | `flight-selection` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SelectionStateRuntime.ts:5-11` | `SelectionStateRuntime` | `interface` | yes | `selection` | `flight-selection` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:5-8` | `SensorAccuracy` | `type` | yes | `sensors` | `flight-sensors` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:9-12` | `SensorsPermissionState` | `type` | yes | `sensors` | `flight-sensors` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:13-18` | `SensorSubscribeOptions` | `interface` | yes | `sensors` | `flight-sensors` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:19-25` | `SensorReading` | `interface` | yes | `sensors` | `flight-sensors` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:26-31` | `AmbientLightReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:32-38` | `MotionReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:39-49` | `OrientationReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:50-56` | `PressureReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:57-63` | `ProximityReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:64-71` | `QuaternionReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:72-83` | `RotationRateReading` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sensors.ts:84-159` | `HostSensorsCapability` | `interface` | yes | `sensors` | `flight-sensors` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sensors.ts:160-173` | `Sensors` | `interface` | yes | `sensors` | `flight-sensors` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SepiaAdjustment.ts:3-7` | `SepiaAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SfntTableDirectory.ts:8-14` | `SfntTableDirectory` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SfntTableDirectory.ts:15-19` | `SfntTableRange` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShadedMaterial.ts:23-34` | `ShadedMaterial` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShadedMaterial.ts:35-36` | `ShadedMaterialKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShadedMaterialOptions.ts:8-18` | `ShadedMaterialOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shape.ts:4-7` | `ShapeData` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Shape.ts:8-11` | `ShapeRuntime` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Shape.ts:12-15` | `Shape` | `interface` | yes | `shape` | `flight-shape` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shape.ts:16-17` | `ShapeKind` | `const` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:4-7` | `ShapeBoundsMode` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:8-14` | `ShapeCommandArgumentCursor` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:15-29` | `ShapeBoundsContext` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:30-36` | `ShapeBoundsCommandHandler` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:37-42` | `ShapeBoundsCommand` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:43-48` | `ShapeBoundsExplanation` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeBounds.ts:49-50` | `ShapeBoundsGuard` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeCommand.ts:5-6` | `CapsStyle` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:7-8` | `GradientType` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:9-10` | `PathWinding` | `type` | yes | `path` | `flight-path` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/ShapeCommand.ts:11-12` | `InterpolationMethod` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:13-14` | `JointStyle` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:15-16` | `LineScaleMode` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:17-19` | `SpreadMethod` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:20-78` | `ShapeCommandRegistry` | `interface` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:79-87` | `ShapeCommandKey` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommand.ts:88-89` | `ShapeCommandToken` | `type` | yes | `shape` | `flight-shape` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommandSchema.ts:7-12` | `ShapeCommandSchema` | `interface` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommandSchema.ts:13-17` | `ShapeCommandSchemaArgument` | `interface` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeCommandSchema.ts:18-26` | `ShapeCommandSchemaArgumentType` | `type` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapedRun.ts:4-12` | `ShapedGlyph` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapedRun.ts:13-22` | `ShapedRun` | `interface` | yes | `textshaper` | `flight-textshaper` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeFillRegion.ts:7-14` | `ShapeFillRegion` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeJson.ts:8-11` | `ShapeTextureReference` | `interface` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeJson.ts:12-16` | `ShapeJsonFormatOptions` | `interface` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeJson.ts:17-23` | `ShapeJsonParseOptions` | `interface` | yes | `shape-formats` | `flight-shape-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeRasterizer.ts:15-20` | `ShapeRasterizer` | `type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShapeStrokeRegion.ts:7-10` | `ShapeStrokeRegion` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeTessellationExplanation.ts:1-2` | `ShapeTessellationStatus` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeTessellationExplanation.ts:3-21` | `ShapeTessellationBlocker` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShapeTessellationExplanation.ts:22-26` | `ShapeTessellationExplanation` | `interface` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:6-10` | `ShareContent` | `type` | yes | `share` | `flight-share` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:11-20` | `ShareFilesContent` | `interface` | yes | `share` | `flight-share` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:21-26` | `ShareResult` | `interface` | yes | `share` | `flight-share` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:27-32` | `HostShareContentCapability` | `interface` | yes | `share` | `flight-share` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:33-40` | `HostShareFilesCapability` | `interface` | yes | `share` | `flight-share` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Share.ts:41-44` | `CapacitorShareContentOptions` | `interface` | yes | `host-capacitor` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Share.ts:45-52` | `HostCapacitorShareContentCapability` | `interface` | yes | `host-capacitor` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/ShareFile.ts:4-9` | `ShareFile` | `interface` | yes | `share` | `flight-share` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ShareSignals.ts:7-10` | `ShareSignals` | `interface` | yes | `share` | `flight-share` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SharpenEffect.ts:3-7` | `SharpenEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SheenPbrExtension.ts:5-15` | `SheenPbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SheenPbrExtension.ts:16-17` | `SheenPbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:6-9` | `ShellExternalUrlPolicy` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:10-13` | `ShellExternalOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:14-17` | `ShellPathOpenOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:18-19` | `ShellPathRevealOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:20-23` | `ShellShortcutLinkReadOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:24-25` | `ShellShortcutLinkWriteOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:26-29` | `ShellTrashOutcome` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:30-37` | `ShellProcessOptions` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:38-45` | `ShellProcessExitStatus` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:46-57` | `ShellProcess` | `interface` | yes | `shell` | `flight-shell` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:58-61` | `HostShellBeepCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:62-65` | `HostShellExternalCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:66-69` | `HostShellPathOpenCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:70-76` | `HostShellPathRevealCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:77-80` | `HostShellProcessCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:81-89` | `HostShellShortcutLinkCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:90-95` | `HostShellTrashCapability` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:96-106` | `ShellShortcutLink` | `interface` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shell.ts:107-108` | `ShellShortcutWriteOperation` | `type` | yes | `shell` | `flight-shell` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:8-14` | `GlobalShortcut` | `interface` | yes | `shortcut` | `flight-shortcut` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:15-16` | `ShortcutTriggerSubscription` | `interface` | yes | `shortcut` | `flight-shortcut` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:17-20` | `CreateGlobalShortcutOutcome` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:21-30` | `GlobalShortcutAttachOutcome` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:31-34` | `GlobalShortcutDetachOutcome` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:35-38` | `GlobalShortcutQueryOutcome` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:39-42` | `ShortcutTriggerSubscribeOutcome` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:43-49` | `ShortcutTriggerUnsubscribeOutcome` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:50-57` | `HostShortcutTriggerCapability` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Shortcut.ts:58-61` | `HostShortcutQueryCapability` | `interface` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:10-20` | `ShortcutKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:21-22` | `ShortcutDigitKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:23-24` | `ShortcutEditingKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:25-50` | `ShortcutFunctionKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:51-78` | `ShortcutLetterKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:79-80` | `ShortcutLockKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:81-89` | `ShortcutMediaKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:90-99` | `ShortcutNavigationKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:100-117` | `ShortcutNumpadKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutKeyName.ts:118-131` | `ShortcutPunctuationKeyName` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ShortcutModifier.ts:3-4` | `ShortcutModifier` | `type` | yes | `shortcut` | `flight-shortcut` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Signal.ts:4-12` | `Signal` | `interface` | yes | `signals` | `flight-signals` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Signal.ts:13-20` | `SignalData` | `interface` | yes | `signals` | `flight-signals` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SignalConnection.ts:10-23` | `SignalConnection` | `interface` | yes | `signals` | `flight-signals` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SignalConnectOptions.ts:1-5` | `SignalConnectOptions` | `interface` | yes | `signals` | `flight-signals` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SignalScope.ts:12-15` | `SignalScope` | `interface` | yes | `signals` | `flight-signals` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SignalThrottleOptions.ts:1-13` | `SignalThrottleOptions` | `interface` | yes | `signals` | `flight-signals` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SignalTrackedConnectOptions.ts:9-13` | `SignalTrackedConnectOptions` | `interface` | yes | `signals` | `flight-signals` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2D.ts:26-34` | `Skeleton2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DAnimationPath.ts:36-48; packages/types/src/Skeleton2DAnimationPath.ts:49-50` | `Skeleton2DAnimationPath` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Skeleton2DAnimationTarget.ts:13-18` | `Skeleton2DAnimationTarget` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DAnimationTargetBinder.ts:14-21` | `Skeleton2DAnimationTargetBinder` | `type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DAnimationTargetKind.ts:13-20; packages/types/src/Skeleton2DAnimationTargetKind.ts:21-22` | `Skeleton2DAnimationTargetKind` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DConstraint.ts:13-27` | `Skeleton2DConstraint` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DConstraint.ts:28-33` | `Skeleton2DConstraintSolver` | `type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DConstraint.ts:34-39; packages/types/src/Skeleton2DConstraint.ts:40-41` | `Skeleton2DConstraintKind` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DDeformAnimationTarget.ts:17-23` | `Skeleton2DDeformAnimationTarget` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DDeformLengthExplanation.ts:11-21` | `Skeleton2DDeformLengthExplanation` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DDrawOrderAnimationTarget.ts:25-30` | `Skeleton2DDrawOrderAnimationTarget` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DDrawOrderTimeline.ts:19-24` | `Skeleton2DDrawOrderTimeline` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/Skeleton2DGuards.ts:10-26` | `Skeleton2DCoercedInterpolation` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DGuards.ts:27-36` | `Skeleton2DDeformLengthMismatch` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DGuards.ts:37-39` | `Skeleton2DCoercedInterpolationGuard` | `type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DGuards.ts:40-41` | `Skeleton2DDeformLengthGuard` | `type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DIkConstraint.ts:22-30` | `Skeleton2DIkConstraint` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DImport.ts:11-25` | `Skeleton2DImport` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DImport.ts:26-31` | `Skeleton2DImportAnimation` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DJsonAnalysis.ts:1-5` | `Skeleton2DJsonAnalysis` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DPathConstraint.ts:19-38` | `Skeleton2DPathConstraint` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DPathConstraint.ts:39-43; packages/types/src/Skeleton2DPathConstraint.ts:44-45` | `Skeleton2DPathPositionMode` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DPathConstraint.ts:46-50; packages/types/src/Skeleton2DPathConstraint.ts:51-52` | `Skeleton2DPathRotateMode` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DPathConstraint.ts:53-58; packages/types/src/Skeleton2DPathConstraint.ts:59-60` | `Skeleton2DPathSpacingMode` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DSlotAnimationTarget.ts:18-22; packages/types/src/Skeleton2DSlotAnimationTarget.ts:23-48` | `Skeleton2DSlotAnimationPath` | `const,type` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DSlotAnimationTarget.ts:49-55` | `Skeleton2DSlotAnimationTarget` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DSlotDeform.ts:21-30` | `Skeleton2DSlotDeform` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton2DTransformConstraint.ts:21-38` | `Skeleton2DTransformConstraint` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton3D.ts:13-39` | `Skeleton3D` | `interface` | yes | `skeleton3d` | `flight-skeleton3d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skeleton3DValidationDiagnostic.ts:2-12` | `Skeleton3DValidationDiagnostic` | `interface` | yes | `skeleton3d` | `flight-skeleton3d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SketchEffect.ts:3-7` | `SketchEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Skin.ts:13-17` | `Skin` | `interface` | yes | `skeleton3d` | `flight-skeleton3d` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Skin2D.ts:14-18` | `Skin2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SkinInfluence.ts:3-7` | `SkinInfluence` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SliderController.ts:6-7` | `SliderControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SliderController.ts:8-11` | `SliderController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SliderController.ts:12-21` | `SliderControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SliderController.ts:22-25` | `SliderControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Slot2D.ts:11-21` | `Slot2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/SmaaEffect.ts:3-7` | `SmaaEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Snapshot.ts:13-24` | `DeepReadonly` | `type` | yes | `snapshot` | `flight-snapshot` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Snapshot.ts:25-32` | `Snapshot` | `type` | yes | `snapshot` | `flight-snapshot` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Snapshot.ts:33-34` | `SnapshotSchema` | `type` | yes | `snapshot` | `flight-snapshot` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:13-16` | `SocketReadyState` | `type` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:17-24` | `SocketMessage` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:25-32` | `SocketOptions` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:33-40` | `SocketCloseInfo` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:41-51` | `SocketSignals` | `interface` | yes | `socket` | `flight-socket` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:52-61` | `SocketEventSink` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:62-71` | `SocketConnection` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:72-80` | `TcpSocketOptions` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:81-90` | `TcpSocketConnection` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:91-98` | `HostSocketCapability` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:99-112` | `SocketRuntime` | `interface` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:113-119` | `Socket` | `interface` | yes | `socket` | `flight-socket` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:120-130` | `SocketSendFailureExplanation` | `type` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:131-142` | `SocketGuardNotice` | `type` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Socket.ts:143-144` | `SocketGuard` | `type` | yes | `socket` | `flight-socket` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:31-36` | `SpatialObjectId` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:37-47` | `SpatialAabb2D` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:48-63` | `SpatialAabb3D` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:64-81` | `SpatialPair` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:82-92` | `SpatialFrustum3D` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:93-125` | `SpatialIndexBackend2D` | `interface` | yes | `spatial` | `flight-spatial` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:126-133` | `SpatialIndexRuntime2D` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:134-147` | `SpatialIndex2D` | `interface` | yes | `spatial` | `flight-spatial` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Spatial.ts:148-178` | `SpatialIndexBackend3D` | `interface` | yes | `spatial` | `flight-spatial` | `factory` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:179-187` | `SpatialIndexRuntime3D` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spatial.ts:188-191` | `SpatialIndex3D` | `interface` | yes | `spatial` | `flight-spatial` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/SpatialIndexing.ts:7-24` | `SpatialIndexingExplanation` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:25-28` | `SpatialIndexingMode` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:29-31` | `SpatialDeclineReason` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:32-36` | `SpatialIndexingOperation` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:37-41` | `SpatialIndexingReason` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:42-55` | `SpatialIndexingNotice` | `interface` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpatialIndexing.ts:56-57` | `SpatialIndexingGuard` | `type` | yes | `spatial` | `flight-spatial` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/SpecularGlossinessPbrMaterial.ts:8-23` | `SpecularGlossinessPbrMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpecularGlossinessPbrMaterial.ts:24-25` | `SpecularGlossinessPbrMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpecularPbrExtension.ts:5-15` | `SpecularPbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpecularPbrExtension.ts:16-17` | `SpecularPbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SphereCollider.ts:3-11` | `SphereCollider` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SphereCollider.ts:12-13` | `SphereColliderKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:13-23; packages/types/src/SpineBinaryRegistry.ts:24-27` | `SpineBinarySectionKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:28-38; packages/types/src/SpineBinaryRegistry.ts:39-43` | `SpineBinaryTimelineKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:44-56` | `SpineBinarySectionContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:57-58` | `SpineBinarySectionHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:59-65` | `SpineBinarySectionHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:66-73` | `SpineBinaryTimelineContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:74-75` | `SpineBinaryTimelineHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:76-82` | `SpineBinaryTimelineHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryRegistry.ts:83-87` | `SpineBinaryRegistry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryVersion.ts:13-27` | `SpineBinaryParser` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryVersion.ts:28-29` | `SpineBinaryVersionFailureReason` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineBinaryVersion.ts:30-39` | `SpineBinaryVersionFailure` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:9-19; packages/types/src/SpineJsonRegistry.ts:20-21` | `SpineJsonSectionKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:22-32; packages/types/src/SpineJsonRegistry.ts:33-34` | `SpineJsonTimelineKind` | `const,type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:35-45` | `SpineJsonSectionContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:46-47` | `SpineJsonSectionHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:48-52` | `SpineJsonSectionHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:53-60` | `SpineJsonTimelineContext` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:61-66` | `SpineJsonTimelineHandler` | `type` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:67-71` | `SpineJsonTimelineHandlerEntry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineJsonRegistry.ts:72-76` | `SpineJsonRegistry` | `interface` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:11-12` | `SpineBlendMode` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:13-17` | `SpineRangeValue` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:18-22` | `SpineAlphaKeyframe` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:23-28` | `SpineTintKeyframe` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:29-69` | `SpineParticleDocument` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpineParticleSchema.ts:70-77` | `SpineParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SplitPaneController.ts:6-7` | `SplitPaneControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SplitPaneController.ts:8-11` | `SplitPaneController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SplitPaneController.ts:12-23` | `SplitPaneControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SplitPaneController.ts:24-27` | `SplitPaneControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpotLight.ts:12-52` | `SpotLight` | `interface` | yes | `lighting` | `flight-lighting` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpotLight.ts:53-54` | `SpotLightKind` | `const` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpotLightConeAngles.ts:1-5` | `SpotLightConeAngles` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpotLightOptions.ts:6-37` | `SpotLightOptions` | `interface` | yes | `lighting` | `flight-lighting` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spring.ts:12-24` | `Spring` | `interface` | yes | `spring` | `flight-spring` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Spring.ts:25-32` | `SpringConfig` | `interface` | yes | `spring` | `flight-spring` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Spring.ts:33-39` | `Spring2D` | `interface` | yes | `spring` | `flight-spring` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Spring.ts:40-46` | `Spring3D` | `interface` | yes | `spring` | `flight-spring` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Sprite.ts:4-7` | `SpriteData` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sprite.ts:8-12` | `SpriteRuntime` | `interface` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Sprite.ts:13-16` | `Sprite` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Sprite.ts:17-18` | `SpriteKind` | `const` | yes | `scene2d` | `flight-scene2d` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpriteIdentityRendererData.ts:4-8` | `SpriteIdentityRendererData` | `interface` | yes | `scene2d` | `flight-scene2d` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpriteRenderer.ts:7-11` | `SpriteRenderer` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Spritesheet.ts:6-11` | `Spritesheet` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetAnimation.ts:4-14` | `SpritesheetAnimation` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetAnimationData.ts:4-15` | `SpritesheetAnimationData` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetAnimationDirection.ts:1-2` | `SpritesheetAnimationDirection` | `type` | yes | `spritesheet` | `flight-spritesheet` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/SpritesheetData.ts:5-13` | `SpritesheetData` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:1` | `SpritesheetFormatKindAseprite` | `const` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:2` | `SpritesheetFormatKindCocosPlist` | `const` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:3` | `SpritesheetFormatKindLibgdxAtlas` | `const` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:4` | `SpritesheetFormatKindStarling` | `const` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:5-10` | `SpritesheetFormatKindTexturePacker` | `const` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormat.ts:11-12` | `SpritesheetFormatKind` | `type` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormatDescriptor.ts:11-23` | `SpritesheetFormatEntry` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormatDescriptor.ts:24-47` | `SpritesheetFormatDescriptor` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFormatDescriptor.ts:48-51` | `SpritesheetImportOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFrame.ts:3-12` | `SpritesheetFrame` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetFrameData.ts:3-18` | `SpritesheetFrameData` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetParseDiagnostic.ts:1` | `SpritesheetParseDiagnosticSeverity` | `type` | yes | `spritesheet` | `flight-spritesheet` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/SpritesheetParseDiagnostic.ts:2-12` | `SpritesheetParseDiagnostic` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/SpritesheetParseOptions.ts:1-9` | `SpritesheetParseOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetPlayer.ts:5-16` | `SpritesheetPlayer` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetTimelineSourceExplanation.ts:5-8` | `SpritesheetTimelineSourceUnsupportedField` | `type` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetTimelineSourceExplanation.ts:9-15` | `SpritesheetTimelineSourceExplanation` | `interface` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetTimelineSourceExplanation.ts:16-20` | `SpritesheetTimelineSourceGuard` | `type` | yes | `movieclip` | `flight-movieclip` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetValidationDiagnostic.ts:2-3` | `SpritesheetValidationSeverity` | `type` | yes | `spritesheet` | `flight-spritesheet` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SpritesheetValidationDiagnostic.ts:4-14` | `SpritesheetValidationDiagnostic` | `interface` | yes | `spritesheet` | `flight-spritesheet` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SsaoEffect.ts:3-10` | `SsaoEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SsrEffect.ts:3-9` | `SsrEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StandardMaterial.ts:6-9` | `StandardMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StandardMaterial.ts:10; packages/types/src/StandardMaterial.ts:11-12` | `StandardMaterialKind` | `const,type` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StandardPbrMaterial.ts:11-29` | `StandardPbrMaterialProperties` | `interface` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/StandardPbrMaterial.ts:30-33` | `StandardPbrMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StandardPbrMaterial.ts:34-35` | `StandardPbrMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:18-25` | `StarlingPexColor` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:26-67` | `StarlingPexDocument` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:68-73` | `StarlingPexParseOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:74-81` | `StarlingPexParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:82-83` | `StarlingPexParsed` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingPexSchema.ts:84-89` | `StarlingPexSerializeOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingSchema.ts:8-34` | `StarlingSubTexture` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingSchema.ts:35-41` | `StarlingDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingSchema.ts:42-46` | `StarlingParsed` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StarlingSchema.ts:47-55` | `StarlingParseOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:6-11; packages/types/src/Statechart.ts:12-15` | `StatechartInputKind` | `const,type` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:16-24; packages/types/src/Statechart.ts:25-28` | `StatechartComparison` | `const,type` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:29` | `StatechartAtomicStateKind` | `const` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:30-32` | `StatechartNestedStateKind` | `const` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:33-39` | `StatechartInput` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:40-47` | `StatechartCondition` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:48-56` | `StatechartTransition` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:57-63` | `StatechartState` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:64-70` | `StatechartRegion` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:71-78` | `Statechart` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:79-89` | `StatechartDurationGuard` | `type` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:90-103` | `StatechartInstance` | `interface` | yes | `statechart` | `flight-statechart` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Statechart.ts:104-113; packages/types/src/Statechart.ts:114-115` | `StatechartTransitionStatus` | `const,type` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Statechart.ts:116-125` | `StatechartTransitionExplanation` | `interface` | yes | `statechart` | `flight-statechart` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatechartSignals.ts:6-9` | `StatechartSignals` | `interface` | yes | `statechart` | `flight-statechart` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:7-10` | `StatusBarStyle` | `type` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:11-14` | `StatusBarAnimation` | `type` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:15-18` | `StatusBarStyleEntryHandle` | `type` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:19-31` | `StatusBarInfo` | `interface` | yes | `statusbar` | `flight-statusbar` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/StatusBar.ts:32-40` | `StatusBarStyleEntry` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:41-45` | `HostStatusBarChangeCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:46-50` | `HostStatusBarInfoCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:51-54` | `HostStatusBarOverlaysCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:55-58` | `HostStatusBarStyleCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:59-64` | `HostStatusBarColorCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:65-69` | `HostStatusBarVisibilityCapability` | `interface` | yes | `statusbar` | `flight-statusbar` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StatusBar.ts:70-73` | `StatusBar` | `interface` | yes | `statusbar` | `flight-statusbar` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StepPosition.ts:4-8` | `StepPosition` | `type` | yes | `easing` | `flight-easing` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StepPosition.ts:9-10` | `EasingStepsGuard` | `type` | yes | `easing` | `flight-easing` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StlFeatures.ts:8-16` | `StlVariant` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StlFeatures.ts:17-21` | `StlFeatures` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StlImportOptions.ts:17-27` | `StlNormalPolicy` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StlImportOptions.ts:28-31` | `StlImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StopTweenOptions.ts:1-7` | `StopTweenOptions` | `interface` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:5-6` | `StorageClearFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:7-12` | `StorageGetItemFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:13-14` | `StorageKeysFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:15-16` | `StorageRemoveItemFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:17-18` | `StorageSetItemFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:19` | `StorageReadFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:20-24` | `StorageWriteFailureReason` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:25-28` | `StorageMutationOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:29` | `StorageClearResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:30` | `StorageRemoveItemResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:31` | `StorageSetItemResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:32-35` | `StorageJsonWriteResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:36-39` | `StorageValueOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:40` | `StorageGetItemResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:41` | `StorageKeysResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:42` | `StorageBooleanResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:43` | `StorageItemCountResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:44` | `StorageItemOrResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:45` | `StorageNumberResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:46-49` | `StoragePresenceResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:50-53` | `StorageFallbackOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:54` | `StorageBooleanOrResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:55` | `StorageJsonOrResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:56-57` | `StorageNumberOrResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:58-62` | `StorageJsonResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:63-67` | `StoragePersistenceOutcome` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Storage.ts:68-71` | `HostPreferencesPersistenceQueryCapability` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Storage.ts:72-77` | `HostPreferencesPersistenceRequestCapability` | `interface` | yes | `permissions` | `flight-permissions` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/Storage.ts:78-82` | `WebWorkerStoragePersistenceApi` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Storage.ts:83-86` | `WebWindowStoragePersistenceApi` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Storage.ts:87-90` | `WebWorkerStoragePersistenceCapabilities` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Storage.ts:91-98` | `WebWindowStoragePersistenceCapabilities` | `interface` | yes | `host-web` | `` | `none` | yes | text-host-ownership.md:B3; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/Storage.ts:99-106` | `StorageQueryOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:107` | `StorageByteSizeResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:108` | `StorageEntriesResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:109-112` | `StorageItemsResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:113-116` | `StorageBatchMutationOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:117-119` | `StorageClearNamespaceResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:120` | `StorageRemoveItemsResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:121-124` | `StorageSetItemsResult` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:125-134` | `HostPreferencesCapability` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:135-140` | `HostPreferencesChangeCapability` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:141-149` | `StorageChange` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:150-154` | `StorageMigration` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:155-171` | `StorageMigrationOutcome` | `type` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:172-177` | `StorageNamespace` | `interface` | yes | `preferences` | `flight-preferences` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Storage.ts:178-181` | `StorageSignals` | `interface` | yes | `preferences` | `flight-preferences` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/StrokePathTessellationExplanation.ts:5-10` | `StrokePathTessellationExplanation` | `interface` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StrokePathTessellationReason.ts:3-10` | `StrokePathTessellationReason` | `type` | yes | `path` | `flight-path` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/StrokeStyle.ts:1-9` | `StrokeStyle` | `interface` | yes | `path` | `flight-path` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/Surface.ts:6-10` | `NativeSurfaceHandle` | `type` | yes | `surface` | `flight-surface` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Surface.ts:11-16` | `Surface` | `interface` | yes | `surface` | `flight-surface` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Surface.ts:17-20` | `SurfaceRuntime` | `interface` | yes | `surface` | `flight-surface` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgDocumentImport.ts:4-9` | `SvgDocumentImportOptions` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgPathDataFormatOptions.ts:2-6` | `SvgPathDataFormatOptions` | `interface` | yes | `path-formats` | `flight-path-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:9-16; packages/types/src/SvgRegistry.ts:17-28` | `SvgElementKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:29-32; packages/types/src/SvgRegistry.ts:33-34` | `SvgClipKind` | `const,type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:35-40` | `SvgClipContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:41-42` | `SvgClipHandler` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:43-47` | `SvgClipHandlerEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:48-52` | `SvgColor` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/SvgRegistry.ts:53-59` | `SvgCssRule` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:60-65` | `SvgElementContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:66-67` | `SvgElementHandler` | `type` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:68-72` | `SvgElementHandlerEntry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:73-89` | `SvgGradient` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/SvgRegistry.ts:90-94` | `SvgGradientStop` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:95-111` | `SvgImportContext` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:112-116` | `SvgRegistry` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SvgRegistry.ts:117-141` | `SvgStyle` | `interface` | yes | `scene2d-formats` | `flight-scene2d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/SwfContentCapabilities.ts:14-20` | `SwfContentCapabilities` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfDocumentImport.ts:13-24` | `SwfDocumentImport` | `interface` | yes | `swf` | `flight-swf` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfDocumentImport.ts:25-46` | `SwfJpegAlphaPayload` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfDocumentImport.ts:47-59` | `SwfNodeAppearance` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfFilterListGuard.ts:3-4` | `SwfFilterListGuard` | `type` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfHeader.ts:10-20` | `SwfHeader` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfMorphShapePaths.ts:6-10` | `SwfMorphShapePaths` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfParseOptions.ts:21-35` | `SwfParseOptions` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagHandler.ts:27-67` | `SwfTagHandler` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagHandler.ts:68-91` | `SwfTagHandlerInstantiation` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagHandler.ts:92-102` | `SwfTagHandlerResources` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagHandler.ts:103-104` | `SwfTagHandlerDispatch` | `type` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:22-40` | `SwfTagReader` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:41-48` | `SwfTagRectangle` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:49-58` | `SwfTagMatrix` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:59-79` | `SwfTagPlacement` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:80-91` | `SwfTimeline` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:92-152` | `SwfTagParseState` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:153-168` | `SwfTagTimelineState` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/SwfTagParseState.ts:169-172` | `SwfTagParseResult` | `interface` | yes | `swf` | `flight-swf` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TaaEffect.ts:3-7` | `TaaEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TabBarController.ts:6-7` | `TabBarControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TabBarController.ts:8-11` | `TabBarController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TabBarController.ts:12-16` | `TabBarControllerItem` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TabBarController.ts:17-21` | `TabBarControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TabBarController.ts:22-25` | `TabBarControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TauriApi.ts:30-45` | `TauriApi` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:46-53` | `TauriAppModule` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:54-61` | `TauriProcessPlugin` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:62-67` | `TauriClipboardManager` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:68-72` | `TauriDialogFilter` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:73-80` | `TauriDialogOpenOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:81-86` | `TauriDialogSaveOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:87-95` | `TauriDialogMessageOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:96-103` | `TauriDialogPlugin` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:104-105` | `TauriNotificationPermission` | `type` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:106-114` | `TauriNotificationOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:115-122` | `TauriNotificationPlugin` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:123-130` | `TauriOpenerPlugin` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:131-139` | `TauriOsModule` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:140-146` | `TauriShortcutEvent` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:147-155` | `TauriGlobalShortcutPlugin` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:156-164` | `TauriMenuModule` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:165-168` | `TauriMenuFactory` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:169-172` | `TauriMenuItemFactory` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:173-176` | `TauriSubmenuFactory` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:177-180` | `TauriPredefinedMenuItemFactory` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:181-184` | `TauriMenuOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:185-192` | `TauriMenuItemOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:193-199` | `TauriSubmenuOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:200-203` | `TauriPredefinedMenuItemOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:204-207` | `TauriMenuItemHandle` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:208-215` | `TauriMenu` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:216-220` | `TauriTrayModule` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:221-224` | `TauriTrayIconFactory` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:225-235` | `TauriTrayIconOptions` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:236-246` | `TauriTrayIconEvent` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:247-258` | `TauriTrayIcon` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:259-264` | `TauriWindowModule` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:265-268` | `TauriLogicalPositionConstructor` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:269-274` | `TauriLogicalSizeConstructor` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:275-279` | `TauriPhysicalPositionLike` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:280-285` | `TauriLogicalSizeLike` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:286-287` | `TauriUnlisten` | `type` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:288-315` | `TauriWindow` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:a-srcfile; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriApi.ts:316-319` | `TauriCloseRequestedEvent` | `interface` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriAppCapabilities.ts:3-6` | `TauriAppCapabilities` | `type` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriHost.ts:16-49` | `TauriHost` | `type` | yes | `host-tauri` | `` | `transitive` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriTrayCapabilitiesFor.ts:4-6` | `TauriCommonTrayCapabilities` | `type` | no | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriTrayCapabilitiesFor.ts:7` | `TauriLinuxTrayCapabilities` | `type` | no | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriTrayCapabilitiesFor.ts:8-9` | `TauriMacosTrayCapabilities` | `type` | no | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriTrayCapabilitiesFor.ts:10-12` | `TauriWindowsTrayCapabilities` | `type` | no | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TauriTrayCapabilitiesFor.ts:13-18` | `TauriTrayCapabilitiesFor` | `type` | yes | `host-tauri` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/TextAutoSize.ts:1-2` | `TextAutoSize` | `type` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextBoundsSpec.ts:7-8` | `TextBoundsSpec` | `type` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextDirection.ts:1` | `TextDirection` | `type` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextDirection.ts:2` | `TextDirectionLeftToRight` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextDirection.ts:3` | `TextDirectionRightToLeft` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextDirection.ts:4-5` | `TextDirectionTopToBottom` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextFeature.ts:1-6` | `TextFeature` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:7` | `TextFeatureCapitals` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:8` | `TextFeatureContextualAlternates` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:9` | `TextFeatureDiscretionaryLigatures` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:10` | `TextFeatureFractions` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:11` | `TextFeatureKerning` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:12` | `TextFeatureLigatures` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:13` | `TextFeatureOldStyleFigures` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:14` | `TextFeatureSmallCaps` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:15` | `TextFeatureStylisticAlternates` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:16` | `TextFeatureSubscript` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:17` | `TextFeatureSuperscript` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFeature.ts:18-19` | `TextFeatureTabularFigures` | `const` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TextFieldSignals.ts:5-10` | `TextFieldChangeEvent` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextFieldSignals.ts:11-17` | `TextFieldLinkEvent` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextFieldSignals.ts:18-26` | `TextFieldScrollEvent` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextFieldSignals.ts:27-32` | `TextFieldSignals` | `interface` | yes | `text` | `flight-text` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextFormat.ts:3-6` | `TextFormatAlign` | `type` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/TextFormat.ts:7-8` | `TextFormatListMarker` | `type` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/TextFormat.ts:9-36` | `TextFormat` | `interface` | yes | `textformat` | `flight-textformat` | `none` | no | design-decisions.md:D8-textformat |
| `packages/types/src/TextFormatRange.ts:4-9` | `TextFormatRange` | `interface` | yes | `textformat` | `flight-textformat` | `direct` | no | design-decisions.md:D8-textformat |
| `packages/types/src/TextInputController.ts:9-10` | `TextInputControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputController.ts:11-14` | `TextInputController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputController.ts:15-22` | `TextInputControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputController.ts:23-27` | `TextInputControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputController.ts:28-29` | `TextInputControllerKeyboardData` | `type` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputEditingOptions.ts:3-10` | `HandleTextInputKeyboardOptions` | `interface` | yes | `textinput` | `flight-textinput` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputEditingOptions.ts:11-18` | `ReplaceTextInputOptions` | `interface` | yes | `textinput` | `flight-textinput` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputEditRecord.ts:1-10` | `TextInputEditRecord` | `interface` | yes | `textinput` | `flight-textinput` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextInputManager.ts:5-8` | `TextInputSource` | `interface` | yes | `textinput` | `flight-textinput` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputManager.ts:9-13` | `TextInputManager` | `interface` | yes | `textinput` | `flight-textinput` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextInputState.ts:10-19` | `TextInputHistoryEntry` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextInputState.ts:20-43` | `TextInputState` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextInputState.ts:44-55` | `TextInputOptions` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextItem.ts:2-8` | `TextItem` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextJustification.ts:3-4` | `TextJustification` | `type` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextLabel.ts:7-17` | `TextLabelData` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/TextLabel.ts:18-34` | `TextLabelRuntime` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/TextLabel.ts:35-38` | `TextLabel` | `interface` | yes | `text` | `flight-text` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextLabel.ts:39-40` | `TextLabelKind` | `const` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextLabelContentExplanation.ts:1-7` | `TextLabelContentExplanation` | `interface` | yes | `text` | `flight-text` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextLayout.ts:9-10` | `TextMeasureFunction` | `type` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextLayout.ts:11-26` | `TextLayoutGroup` | `interface` | yes | `textlayout` | `flight-textlayout` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/TextLayout.ts:27-49` | `TextLayoutParams` | `interface` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextLayout.ts:50-61` | `TextLayoutResult` | `interface` | yes | `textlayout` | `flight-textlayout` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/TextLineMetrics.ts:1-9` | `TextLineMetrics` | `interface` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextListMarker.ts:7-8` | `TextListMarker` | `type` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/TextMarkupExplanation.ts:1-4` | `TextMarkupIssueKind` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextMarkupExplanation.ts:5-13` | `TextMarkupIssue` | `interface` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextMarkupExplanation.ts:14-18` | `TextMarkupExplanation` | `interface` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextMarkupExplanation.ts:19-20` | `TextMarkupGuard` | `type` | yes | `text-markup` | `flight-text-markup` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextMetrics.ts:7-12` | `TextMetrics` | `interface` | yes | `textlayout` | `flight-textlayout` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:10-14` | `TextSegmentGranularity` | `type` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:15-23` | `TextSegment` | `interface` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:24-32` | `TextSegmentRange` | `interface` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:33-36` | `HostTextSegmenterCapability` | `interface` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:37-39` | `TextSegmenterKind` | `type` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:40-46` | `TextSegmenterExplanation` | `interface` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSegment.ts:47-48` | `TextSegmentGuard` | `type` | yes | `textsegment` | `flight-textsegment` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextSelectionRange.ts:1-6` | `TextSelectionRange` | `interface` | yes | `DROPPED` | `` | `none` | no | principal-c58e70ce:dead-code; dropped: unused (principal) |
| `packages/types/src/TextSelectionRectangle.ts:1-8` | `TextSelectionRectangle` | `interface` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TextShaper.ts:23-27` | `ShapeRunOptions` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextShaper.ts:28-54` | `HostTextShaperCapability` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextShaper.ts:55-56` | `TextShaperOperation` | `type` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextShaperCache.ts:4-5` | `TextShaperCache` | `interface` | yes | `textshaper` | `flight-textshaper` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextShaperOptions.ts:4-11` | `TextShaperOptions` | `interface` | yes | `textshaper` | `flight-textshaper` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextShaperSignals.ts:4-7` | `TextShaperSignals` | `interface` | yes | `textshaper` | `flight-textshaper` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Texture.ts:11-14` | `TextureColorSpace` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Texture.ts:15-25` | `TextureSourceCubeFaces` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Texture.ts:26-33` | `TextureCommon` | `interface` | no | `texture` | `flight-texture` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Texture.ts:34-38` | `Texture2D` | `interface` | yes | `texture` | `flight-texture` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Texture.ts:39-53` | `Texture` | `type` | yes | `texture` | `flight-texture` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Texture.ts:54-55` | `TextureLikeFrom` | `type` | no | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Texture.ts:56-57` | `TextureLike` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlas.ts:5-18` | `TextureAtlas` | `interface` | yes | `textureatlas` | `flight-textureatlas` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:6-12` | `TextureAtlasAsepriteRect` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:13-17` | `TextureAtlasAsepriteSize` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:18-29` | `TextureAtlasAsepriteFrameTag` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:30-39` | `TextureAtlasAsepriteBaseFrame` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:40-41` | `TextureAtlasAsepriteHashFrame` | `type` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:42-45` | `TextureAtlasAsepriteArrayFrame` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:46-55` | `TextureAtlasAsepriteMeta` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:56-60` | `TextureAtlasAsepriteHashDocument` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:61-65` | `TextureAtlasAsepriteArrayDocument` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasAsepriteSchema.ts:66-67` | `TextureAtlasAsepriteDocument` | `type` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatDescriptor.ts:11-23` | `TextureAtlasFormatEntry` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatDescriptor.ts:24-48` | `TextureAtlasFormatDescriptor` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatDescriptor.ts:49-52` | `TextureAtlasImportOptions` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:2-3` | `TextureAtlasFormatKind` | `type` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:4-5` | `TextureAtlasFormatKindTexturePacker` | `const` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:6-7` | `TextureAtlasFormatKindAseprite` | `const` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:8-9` | `TextureAtlasFormatKindStarling` | `const` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:10-11` | `TextureAtlasFormatKindLibgdxAtlas` | `const` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasFormatKind.ts:12-13` | `TextureAtlasFormatKindCocosPlist` | `const` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasParseOptions.ts:10-11` | `TextureAtlasParseOptions` | `type` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegion.ts:3-8` | `TextureAtlasRotation` | `enum` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegion.ts:9-34` | `TextureAtlasRegion` | `interface` | yes | `textureatlas` | `flight-textureatlas` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegion.ts:35-36` | `TextureAtlasRegionLike` | `type` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegionTextureExplanation.ts:3-4` | `TextureAtlasRegionTextureStatus` | `type` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegionTextureExplanation.ts:5-8` | `TextureAtlasRegionTextureExplanation` | `interface` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureAtlasRegionTextureExplanation.ts:9-14` | `TextureAtlasRegionTextureGuard` | `type` | yes | `textureatlas` | `flight-textureatlas` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureContainer.ts:18-29` | `TextureContainer` | `interface` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/TextureContainerFormat.ts:13-73` | `TextureContainerFormat` | `type` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/TextureContainerKind.ts:1-2` | `TextureContainerKind` | `type` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureContainerLevel.ts:9-15` | `TextureContainerLevel` | `interface` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureContainerParseExplanation.ts:4-8` | `TextureContainerParseExplanation` | `interface` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureContainerParseFailureReason.ts:1-7` | `TextureContainerParseFailureReason` | `type` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureContainerSupercompression.ts:10-11` | `TextureContainerSupercompression` | `type` | yes | `texture-formats` | `flight-texture-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureCubeFace.ts:2` | `CubeFacePositiveX` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureCubeFace.ts:3` | `CubeFaceNegativeX` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureCubeFace.ts:4` | `CubeFacePositiveY` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureCubeFace.ts:5` | `CubeFaceNegativeY` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureCubeFace.ts:6` | `CubeFacePositiveZ` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureCubeFace.ts:7-8` | `CubeFaceNegativeZ` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureDimension.ts:3-4` | `TextureDimension` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureKind.ts:1` | `SamplerKind` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TextureKind.ts:2-3` | `TextureKind` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types.md:rule-d |
| `packages/types/src/TexturePackerAtlasParseOptions.ts:1-5` | `TexturePackerAtlasParseOptions` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:5-11` | `TexturePackerAtlasRect` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:12-16` | `TexturePackerAtlasSize` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:17-21` | `TexturePackerAtlasPivot` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:22-28` | `TexturePackerAtlasFrameTag` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:29-37` | `TexturePackerAtlasHashFrame` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:38-41` | `TexturePackerAtlasArrayFrame` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:42-52` | `TexturePackerAtlasMeta` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:53-58` | `TexturePackerAtlasHashDocument` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:59-63` | `TexturePackerAtlasArrayDocument` | `interface` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerAtlasSchema.ts:64-65` | `TexturePackerAtlasDocument` | `type` | yes | `textureatlas-formats` | `flight-textureatlas-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:7-13` | `TexturePackerRect` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:14-18` | `TexturePackerSize` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:19-23` | `TexturePackerPivot` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:24-30` | `TexturePackerFrameTag` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:31-39` | `TexturePackerHashFrame` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:40-43` | `TexturePackerArrayFrame` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:44-54` | `TexturePackerMeta` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:55-60` | `TexturePackerHashDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:61-65` | `TexturePackerArrayDocument` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:66-68` | `TexturePackerDocument` | `type` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:69-73` | `TexturePackerParsed` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TexturePackerSchema.ts:74-78` | `TexturePackerSerializeOptions` | `interface` | yes | `spritesheet-formats` | `flight-spritesheet-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextureResolutionExplanation.ts:3-8` | `TextureResolutionStatus` | `type` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/TextureResolutionExplanation.ts:9-13` | `TextureResolutionExplanation` | `interface` | yes | `render` | `flight-render` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/TextureSource.ts:27-45` | `TextureSource` | `interface` | yes | `texture` | `flight-texture` | `direct` | no | text-host-ownership.md:C5 |
| `packages/types/src/TextureSourceKind.ts:3-4` | `TextureSourceKind` | `type` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:5` | `BitmapTextureSourceKind` | `const` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:6` | `CompressedImageTextureSourceKind` | `const` | yes | `image` | `flight-image` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:7` | `ExternalTextureSourceKind` | `const` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:8` | `ImageTextureSourceKind` | `const` | yes | `image` | `flight-image` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:9` | `RenderTargetTextureSourceKind` | `const` | yes | `render` | `flight-render` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureSourceKind.ts:10-11` | `VoxelGridTextureSourceKind` | `const` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/TextureUvTransform.ts:13-20` | `TextureUvTransform` | `interface` | yes | `texture` | `flight-texture` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TextVerticalAlign.ts:9-10` | `TextVerticalAlign` | `type` | yes | `textlayout` | `flight-textlayout` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/ThreeDsChunkHandler.ts:20-33` | `ThreeDsChunkHandler` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsChunkHandler.ts:34-53` | `ThreeDsParseState` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsChunkHandler.ts:54-66` | `ThreeDsChunkDispatch` | `type` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/ThreeDsChunkHandler.ts:67-70` | `ThreeDsImportOptions` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:11` | `THREE_DS_MAIN` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:12` | `THREE_DS_EDITOR` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:13-18` | `THREE_DS_KEYFRAME` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:19` | `THREE_DS_KEYFRAME_OBJECT_NODE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:20` | `THREE_DS_KEYFRAME_NODE_HEADER` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:21-23` | `THREE_DS_KEYFRAME_PIVOT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:24` | `THREE_DS_OBJECT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:25` | `THREE_DS_TRIMESH` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:26` | `THREE_DS_VERTICES` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:27` | `THREE_DS_FACES` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:28` | `THREE_DS_FACE_MATERIAL` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:29` | `THREE_DS_UV_COORDS` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:30` | `THREE_DS_SMOOTH_GROUP` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:31-34` | `THREE_DS_TRANSFORM_MATRIX` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:35` | `THREE_DS_LIGHT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:36` | `THREE_DS_LIGHT_SPOT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:37` | `THREE_DS_LIGHT_OFF` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:38` | `THREE_DS_LIGHT_INNER_RANGE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:39` | `THREE_DS_LIGHT_OUTER_RANGE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:40-42` | `THREE_DS_LIGHT_MULTIPLIER` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:43` | `THREE_DS_CAMERA` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:44-49` | `THREE_DS_CAMERA_RANGES` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:50-52` | `THREE_DS_CAMERA_APERTURE_MM` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:53` | `THREE_DS_MATERIAL` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:54` | `THREE_DS_MATERIAL_NAME` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:55` | `THREE_DS_MATERIAL_AMBIENT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:56` | `THREE_DS_MATERIAL_DIFFUSE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:57` | `THREE_DS_MATERIAL_SPECULAR` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:58` | `THREE_DS_MATERIAL_SHININESS` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:59` | `THREE_DS_MATERIAL_TRANSPARENCY` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:60` | `THREE_DS_MATERIAL_TEXTURE_MAP` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:61` | `THREE_DS_MATERIAL_OPACITY_MAP` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:62` | `THREE_DS_MATERIAL_TEXTURE_FILENAME` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:63-65` | `THREE_DS_MATERIAL_BUMP_MAP` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:66` | `THREE_DS_COLOR_FLOAT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:67-70` | `THREE_DS_COLOR_BYTE` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:71` | `THREE_DS_PERCENT_INT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:72-74` | `THREE_DS_PERCENT_FLOAT` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:75-81` | `THREE_DS_CHUNK_HEADER_BYTES` | `const` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:82-98` | `ThreeDsMaterial` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:99-114` | `ThreeDsDropTally` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:115-133` | `ThreeDsLight` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:134-147` | `ThreeDsCamera` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:148-163` | `ThreeDsMaterialGroup` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThreeDsSchema.ts:164-173` | `ThreeDsMesh` | `interface` | yes | `scene3d-formats` | `flight-scene3d-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ThresholdOperation.ts:1-2` | `ThresholdOperation` | `type` | yes | `bitmap` | `flight-bitmap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledGid.ts:5-13` | `TiledGid` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:9-30` | `TiledLayerBase` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:31-40` | `TiledTileLayer` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:41-45` | `TiledObjectGroup` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:46-54` | `TiledImageLayer` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:55-59` | `TiledGroupLayer` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayer.ts:60-61` | `TiledLayer` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayerDataExplanation.ts:9-10` | `TiledLayerDataFailure` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledLayerDataExplanation.ts:11-15` | `TiledLayerDataExplanation` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledMap.ts:6-8` | `TiledStaggerAxis` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledMap.ts:9-12` | `TiledStaggerIndex` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledMap.ts:13-16` | `TiledOrientation` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledMap.ts:17-23` | `TiledRenderOrder` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledMap.ts:24-48` | `TiledMap` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledObject.ts:9-34` | `TiledObject` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledParseOptions.ts:7-12` | `TiledCompression` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledParseOptions.ts:13-15` | `TiledInflate` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledParseOptions.ts:16-22` | `TiledParseOptions` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledParseOptions.ts:23-26` | `TiledTilesetResolver` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledProperty.ts:7-8` | `TiledPropertyType` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledProperty.ts:9-14` | `TiledProperty` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledTileset.ts:6-14` | `TiledTilesetTileFrame` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledTileset.ts:15-31` | `TiledTilesetTile` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledTileset.ts:32-43` | `TiledObjectAlignment` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledTileset.ts:44-69` | `TiledTileset` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiledTileset.ts:70-75` | `TiledTilesetRef` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tilemap.ts:5-16` | `TilemapData` | `interface` | yes | `tilemap` | `flight-tilemap` | `transitive` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Tilemap.ts:17-18` | `TilemapRuntime` | `interface` | yes | `tilemap` | `flight-tilemap` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Tilemap.ts:19-22` | `Tilemap` | `interface` | yes | `tilemap` | `flight-tilemap` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tilemap.ts:23-24` | `TilemapKind` | `const` | yes | `tilemap` | `flight-tilemap` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapFormatKind.ts:5-6` | `TilemapFormatKind` | `type` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapFormatKind.ts:7-8` | `TilemapFormatKindTiledTmx` | `const` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapFormatKind.ts:9-10` | `TilemapFormatKindTiledTmj` | `const` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapFormatKind.ts:11-12` | `TilemapFormatKindTiledTsx` | `const` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapFormatKind.ts:13-14` | `TilemapFormatKindTiledTsj` | `const` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapImportOptions.ts:15-20` | `TilemapFormatEntry` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapImportOptions.ts:21-26` | `TilemapFormatDescriptor` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapImportOptions.ts:27-32` | `TilesetFormatEntry` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapImportOptions.ts:33-56` | `TilesetFormatDescriptor` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapImportOptions.ts:57-61` | `TilemapImportOptions` | `interface` | yes | `tilemap-formats` | `flight-tilemap-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TilemapSignals.ts:4-9` | `TilemapSignals` | `interface` | yes | `tilemap` | `flight-tilemap` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TiltShiftEffect.ts:3-19` | `TiltShiftEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Timeline.ts:13-33` | `Timeline` | `interface` | yes | `timeline` | `flight-timeline` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TimelineCue.ts:29` | `TimelineAudioCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:30` | `TimelineGotoCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:31` | `TimelineNextFrameCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:32` | `TimelinePlayCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:33` | `TimelinePreviousFrameCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:34` | `TimelineStopCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:35-39` | `TimelineStreamAudioCueKind` | `const` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:40-46; packages/types/src/TimelineCue.ts:47-50` | `TimelineFrameEntryCause` | `const,type` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:51-58` | `TimelineCue` | `interface` | yes | `timeline` | `flight-timeline` | `direct` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:59-70` | `TimelineAudioEnvelopePoint` | `interface` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:71-99` | `TimelineAudioCue` | `interface` | yes | `timeline` | `flight-timeline` | `transitive` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:100-108` | `TimelineStreamAudioCue` | `interface` | yes | `timeline` | `flight-timeline` | `transitive` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:109-116` | `TimelineGotoCue` | `interface` | yes | `timeline` | `flight-timeline` | `transitive` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:117-122` | `TimelinePlaybackCue` | `interface` | yes | `timeline` | `flight-timeline` | `transitive` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:123-128` | `TimelineCueHandler` | `type` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:129-141` | `TimelineCueHandlerEntry` | `interface` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineCue.ts:142-145` | `TimelineCueRegistry` | `interface` | yes | `timeline` | `flight-timeline` | `direct` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelineFrameEvent.ts:4-8` | `TimelineFrameEvent` | `interface` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TimelineLabel.ts:1-5` | `TimelineLabel` | `interface` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TimelinePlayMode.ts:3-4` | `TimelinePlayMode` | `type` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TimelineSignals.ts:6-13` | `TimelineSignals` | `interface` | yes | `timeline` | `flight-timeline` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TimelineSource.ts:11-29` | `TimelineSource` | `interface` | yes | `timeline` | `flight-timeline` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TintAdjustment.ts:8-11` | `TintAdjustment` | `interface` | yes | `adjustments` | `flight-adjustments` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TintMaterialData.ts:7-10` | `TintMaterialData` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | text-host-ownership.md:C5 |
| `packages/types/src/ToggleController.ts:6-7` | `ToggleControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToggleController.ts:8-11` | `ToggleController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToggleController.ts:12-19` | `ToggleControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToggleController.ts:20-23` | `ToggleControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToneMapEffect.ts:3-4` | `ToneMapOperator` | `type` | yes | `effects` | `flight-effects` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToneMapEffect.ts:5-11` | `ToneMapEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TooltipController.ts:6-7` | `TooltipControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TooltipController.ts:8-11` | `TooltipController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TooltipController.ts:12-18` | `TooltipControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToonMaterial.ts:7-15` | `ToonMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToonMaterial.ts:16-17` | `ToonMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToonModifier.ts:10-16` | `ToonModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToonModifier.ts:17-18` | `ToonModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ToonModifierOptions.ts:1-5` | `ToonModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Transform2D.ts:7-18` | `Transform2D` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Transform2D.ts:19-20` | `Transform2DLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Transform3D.ts:10-15` | `Transform3D` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Transform3D.ts:16-17` | `Transform3DLike` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TransformInherit2D.ts:17-23` | `TransformInherit2D` | `interface` | yes | `skeleton2d` | `flight-skeleton2d` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/TransformMode2D.ts:16-23` | `TransformMode2D` | `const` | yes | `skeleton2d-formats` | `flight-skeleton2d-formats` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/TransmissionVolumePbrExtension.ts:6-19` | `TransmissionVolumePbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TransmissionVolumePbrExtension.ts:20-21` | `TransmissionVolumePbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:9-12` | `DesktopOsProfile` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:13-14` | `TrayIconSource` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:15-22` | `TrayIconOptions` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:23-33` | `TrayBalloonOptions` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:34-35` | `TrayIcon` | `interface` | yes | `tray` | `flight-tray` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/Tray.ts:36-45` | `TrayInteractionEvent` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:46-49` | `TrayMenuSelectionEvent` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:50-53` | `TrayBalloonEvent` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:54-57` | `TrayDropEvent` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:58-64` | `TrayCreateCapabilityResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:65-68` | `TrayCreateResult` | `type` | yes | `tray` | `flight-tray` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:69-73` | `TrayDestroyFailure` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:74-77` | `TrayDestroyCapabilityResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:78-79` | `TrayDestroyResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:80-85` | `TrayImageUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:86-90` | `TrayTitleUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:91-95` | `TrayTooltipUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:96-100` | `TrayTemplateImageUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:101-106` | `TrayPressedImageUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:107-111` | `TrayDoubleClickPolicyUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:112-117` | `TrayMenuUpdateResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:118-122` | `TrayTitleReadResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:123-127` | `TrayTooltipReadResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:128-132` | `TrayBoundsResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:133-138` | `TrayPopupMenuResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:139-143` | `TrayBalloonDisplayResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:144-149` | `TrayBalloonRemoveResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:150-154` | `TrayReleaseResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:155-158` | `TrayEventRelease` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:159-163` | `TrayEventAttachResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:164-168` | `TrayAnimationStartResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:169-172` | `TrayAnimationStopResult` | `type` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:173-179` | `HostTrayLifecycleCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:180-183` | `HostTrayImageCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:184-188` | `HostTrayTitleCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:189-193` | `HostTrayTooltipCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:194-197` | `HostTrayMenuCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:198-201` | `HostTrayTemplateImageCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:202-205` | `HostTrayBoundsCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:206-209` | `HostTrayPopupMenuCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:210-213` | `HostTrayDoubleClickPolicyCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:214-217` | `HostTrayPressedImageCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:218-222` | `HostTrayBalloonCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:223-226` | `HostTrayInteractionEventsCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:227-230` | `HostTrayMenuSelectionEventsCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:231-234` | `HostTrayBalloonEventsCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tray.ts:235-238` | `HostTrayDropEventsCapability` | `interface` | yes | `tray` | `flight-tray` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TreeViewController.ts:6-7` | `TreeViewControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TreeViewController.ts:8-11` | `TreeViewController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TreeViewController.ts:12-17` | `TreeViewControllerItem` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TreeViewController.ts:18-22` | `TreeViewControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TreeViewController.ts:23-28` | `TreeViewControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TriangleCulling.ts:1-2` | `TriangleCulling` | `type` | yes | `shape` | `flight-shape` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TurbulenceForce.ts:1-6` | `TurbulenceForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/TurbulenceForce.ts:7-8` | `TurbulenceForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/Tween.ts:6-7` | `NumericProps` | `type` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Tween.ts:8-31` | `Tween` | `interface` | yes | `tween` | `flight-tween` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TweenManager.ts:7-12` | `TweenManager` | `interface` | yes | `tween` | `flight-tween` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TweenManagerOptions.ts:3-7` | `TweenManagerOptions` | `interface` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TweenOptions.ts:3-15` | `TweenOptions` | `interface` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TweenPropertyDetail.ts:1-6` | `TweenPropertyDetail` | `interface` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/TweenStaggerOptions.ts:3-20` | `TweenStaggerOptions` | `interface` | yes | `tween` | `flight-tween` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:12-21` | `UnityParticleShapeType` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:22-29` | `UnityColor` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:30-36` | `UnityMinMaxValue` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:37-43` | `UnityBurst` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:44-48` | `UnityEmission` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:49-60` | `UnityShape` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:61-66` | `UnityGradientColorKey` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:67-72` | `UnityGradientAlphaKey` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:73-78` | `UnityGradient` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:79-84` | `UnityCurveKey` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:85-88` | `UnityAnimationCurve` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:89-98` | `UnityColorOverLifetime` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:99-107` | `UnitySizeOverLifetime` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:108-114` | `UnityRotationOverLifetime` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:115-134` | `UnityParticleDocument` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:135-140` | `UnityParseOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:141-149` | `UnityParseResult` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:150-151` | `UnityParsed` | `type` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnitySchema.ts:152-156` | `UnitySerializeOptions` | `interface` | yes | `particles-formats` | `flight-particles-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnlitMaterial.ts:8-14` | `UnlitMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/UnlitMaterial.ts:15-16` | `UnlitMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Updater.ts:5-16` | `UpdateInfo` | `interface` | yes | `updater` | `flight-updater` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Updater.ts:17-20` | `DownloadedUpdate` | `interface` | yes | `updater` | `flight-updater` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Updater.ts:21-24` | `AppUpdateCheckOutcome` | `type` | yes | `updater` | `flight-updater` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Updater.ts:25-30` | `AppUpdateInstallOutcome` | `interface` | yes | `updater` | `flight-updater` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Updater.ts:31-36` | `HostUpdaterCommandCapability` | `interface` | yes | `updater` | `flight-updater` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector2.ts:3-7` | `Vector2` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector2.ts:8-9` | `Vector2Like` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector3.ts:3-8` | `Vector3` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector3.ts:9-10` | `Vector3Like` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector4.ts:3-9` | `Vector4` | `interface` | yes | `geometry` | `flight-geometry` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Vector4.ts:10-11` | `Vector4Like` | `type` | yes | `geometry` | `flight-geometry` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Velocity.ts:11-19` | `Velocity2D` | `interface` | yes | `velocity` | `flight-velocity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Velocity.ts:20-30` | `VelocitySample` | `interface` | yes | `velocity` | `flight-velocity` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Velocity.ts:31-38` | `VelocityField` | `interface` | yes | `velocity` | `flight-velocity` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/Velocity.ts:39-40` | `VelocityContributor` | `type` | yes | `velocity` | `flight-velocity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Velocity.ts:41-49` | `VelocityExplanation` | `interface` | yes | `velocity` | `flight-velocity` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexColorMaterial.ts:6-10` | `VertexColorMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexColorMaterial.ts:11-12` | `VertexColorMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexDisplaceModifier.ts:10-14; packages/types/src/VertexDisplaceModifier.ts:15-27` | `VertexDisplaceModifierSource` | `const,type` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexDisplaceModifier.ts:28-39` | `VertexDisplaceModifier` | `interface` | yes | `shading` | `flight-shading` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexDisplaceModifier.ts:40-41` | `VertexDisplaceModifierKind` | `const` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VertexDisplaceModifierOptions.ts:5-14` | `VertexDisplaceModifierOptions` | `interface` | yes | `shading` | `flight-shading` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VideoResource.ts:5-6` | `VideoChannelState` | `type` | yes | `video` | `flight-video` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VideoResource.ts:7-19` | `VideoChannel` | `interface` | yes | `media` | `flight-media` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/VideoResource.ts:20-26` | `VideoPlayOptions` | `interface` | yes | `video` | `flight-video` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VideoResource.ts:27-44` | `VideoResource` | `interface` | yes | `video` | `flight-video` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VideoResource.ts:45-54` | `VideoResourceLoadOptions` | `interface` | yes | `video` | `flight-video` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VideoResource.ts:55-59` | `VideoResourceUrl` | `interface` | yes | `video` | `flight-video` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Viewport.ts:9-16` | `Viewport` | `interface` | yes | `node` | `flight-node` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Viewport.ts:17-18` | `ViewportLike` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/ViewportAlign.ts:1-2` | `ViewportAlign` | `type` | yes | `layout` | `flight-layout` | `none` | no | text-host-ownership.md:C5 |
| `packages/types/src/ViewportScaleMode.ts:1-2` | `ViewportScaleMode` | `type` | yes | `node` | `flight-node` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/VignetteEffect.ts:3-10` | `VignetteEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VolumetricLightEffect.ts:2-30` | `VolumetricLightEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/VortexForce.ts:3-15` | `VortexForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/VortexForce.ts:16-17` | `VortexForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/VoxelGrid.ts:7-13` | `VoxelGrid` | `interface` | yes | `texture` | `flight-texture` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WebHost.ts:43-134` | `WebHost` | `type` | yes | `host-web` | `` | `none` | yes | dissolve-types-owners-firstpass.json:file; D11 TS-only owner; no Rust crate is planned |
| `packages/types/src/WellKnownMenuItemRole.ts:18-69` | `WellKnownMenuItemRole` | `const` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WellKnownMenuItemRole.ts:70-71` | `WellKnownMenuItemRoleValue` | `type` | yes | `menu` | `flight-menu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuAdapterCapabilities.ts:1-7` | `WgpuAdapterCapabilities` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuClassicPipeline.ts:6-8` | `WgpuClassicLightingModel` | `type` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuClassicPipeline.ts:9-17` | `WgpuClassicPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuClassicPipeline.ts:18-30` | `WgpuClassicDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuColorLutTextureCache.ts:8-13` | `WgpuColorLutTextureCache` | `interface` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuCompressedTextureDecoder.ts:6-12` | `WgpuCompressedTextureDecoder` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuCompressedTextureSupport.ts:3-8` | `WgpuCompressedTextureSupport` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuCompressedTextureUploader.ts:7-13` | `WgpuCompressedTextureUploader` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/WgpuCustomMaterialShaderSource.ts:7-8` | `WgpuCustomMaterialShaderSource` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuDebugPipeline.ts:7-12` | `WgpuDebugDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDebugPipeline.ts:13-14` | `WgpuDebugPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDeviceRuntime.ts:13-49` | `WgpuDeviceRuntime` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDeviceRuntime.ts:50-56` | `WgpuDeviceRuntimeResources` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDeviceSignals.ts:11-14` | `WgpuDeviceSignals` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDeviceState.ts:3-6` | `WgpuDeviceState` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuDualSourceEffectPipeline.ts:3-4` | `WgpuDualSourceEffectPipeline` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectBlendMode.ts:1-2` | `WgpuEffectBlendMode` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectPipeline.ts:4-15` | `WgpuEffectPipeline` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:14-25` | `WgpuEffectContext` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuEffectState.ts:26-27` | `WgpuEffectRunner` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuEffectState.ts:28-29` | `WgpuEffectResolver` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuEffectState.ts:30-38` | `WgpuEffectRegistration` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuEffectState.ts:39-57` | `WgpuEffectState` | `interface` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:58-67` | `WgpuEffectApplicationStatus` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:68-78` | `WgpuEffectApplicationExplanation` | `interface` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:79-82` | `WgpuEffectStateSkipGuard` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:83-88` | `WgpuEffectStateSampleCountGuard` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuEffectState.ts:89-93` | `WgpuEffectApplicationGuard` | `type` | yes | `effects-wgpu` | `flight-effects-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuFullscreenPipeline.ts:3-9` | `WgpuFullscreenPipeline` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuHost.ts:15-19` | `WgpuPresentationSurface` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuHost.ts:20-31` | `WgpuHostAcquisition` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/WgpuHost.ts:32-40` | `WgpuHostAcquisitionOptions` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuHost.ts:41-58` | `HostWgpuCapability` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuHost.ts:59-63` | `WgpuSurfaceAttachResult` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuHost.ts:64-73` | `WgpuSurfaceAttachment` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuMatcapPipeline.ts:6-12` | `WgpuMatcapDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuMatcapPipeline.ts:13-14` | `WgpuMatcapPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuMeshMaterialRenderer.ts:24-43` | `WgpuMeshMaterialRenderer` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuMeshPipeline.ts:7-17` | `WgpuMeshPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuMeshPipeline.ts:18-22` | `WgpuScene3DLayouts` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuModifierSnippet.ts:5-9` | `WgpuModifierCompileContext` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuModifierSnippet.ts:10-17` | `WgpuModifierContribution` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuModifierSnippet.ts:18-29` | `WgpuModifierSnippet` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuParticleResources.ts:1-7` | `WgpuParticleResources` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuPbrPipeline.ts:9-18` | `WgpuPbrPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuPbrPipeline.ts:19-39` | `WgpuPbrDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuQuadBatchResources.ts:1-9` | `WgpuQuadBatchResources` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuQuadMaterialRenderer.ts:15-39` | `WgpuQuadMaterialRenderer` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuRenderOptions.ts:5-17` | `WgpuRenderOptions` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/WgpuRenderPass.ts:15-32` | `WgpuRenderPass` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderPass.ts:33-39` | `WgpuRenderPassViewport` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderPass.ts:40-50` | `WgpuSavedPassState` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:34-49` | `WgpuRenderState` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:50-57` | `WgpuOffscreenRenderStateResult` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:58-84` | `WgpuRenderRegistries` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:85-106` | `WgpuColorAdjustmentMaterialFeature` | `interface` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuRenderState.ts:107-114` | `WgpuColorAdjustmentMaterialFeatureGuard` | `type` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuRenderState.ts:115-124` | `WgpuColorAdjustmentFlush` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:125-129` | `WgpuBindGroupLayouts` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/WgpuRenderState.ts:130-351` | `WgpuRenderStateRuntime` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/WgpuRenderState.ts:352-363` | `WgpuBitmapShader` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:364-374` | `WgpuClipContourEntry` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:375-382` | `WgpuClipContourPipelines` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:383-393` | `WgpuScissorRect` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:394-410` | `WgpuShapeMeshBuffers` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:411-418` | `WgpuShapeMeshPipeline` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:419-428` | `WgpuQuadBatchWriterBufferSlot` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:429-439` | `WgpuMeshInstanceBufferSlot` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:440-458` | `WgpuTextureResource` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:459-462` | `WgpuTextureBindings` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:463-471` | `WgpuTextureEntry` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:a-ctor |
| `packages/types/src/WgpuRenderState.ts:472-475` | `WgpuTextureSourceTextureEntry` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderState.ts:476-482` | `WgpuVideoTextureEntry` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderStateOptions.ts:18-33` | `WgpuRenderStateOptions` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderStats.ts:2-12` | `WgpuRenderStats` | `interface` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTarget.ts:18-40` | `WgpuRenderTarget` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTarget.ts:41-50` | `WgpuRenderTargetPool` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WgpuRenderTarget.ts:51-99` | `WgpuScreenRenderTarget` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WgpuRenderTarget.ts:100-110` | `WgpuScreenRenderTargetOptions` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTarget.ts:111-121` | `WgpuTextureRenderTarget` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WgpuRenderTexture.ts:6-7` | `WgpuRenderTextureStatus` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTexture.ts:8-14` | `WgpuRenderTextureExplanation` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTexture.ts:15-21` | `WgpuRenderTextureEntry` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRenderTexture.ts:22-29` | `WgpuRenderTexturePool` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `direct` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WgpuRenderTexture.ts:30-35` | `WgpuRenderTextureGuard` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuRichTextOverlay.ts:4-12` | `WgpuRichTextOverlay` | `type` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DForwardLightList.ts:5-9` | `WgpuScene3DForwardLightList` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:18-38` | `WgpuScene3DShadow` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:39-49` | `WgpuScene3DIbl` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:50-56` | `WgpuScene3DFrameBinding` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:57-76` | `WgpuScene3DDrawEntry` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:77-88` | `WgpuScene3DPass` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuScene3DRuntime.ts:89-238` | `WgpuScene3DRuntime` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuScene3DRuntime.ts:239-258` | `WgpuMeshUpload` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WgpuScene3DRuntime.ts:259-270` | `WgpuMaterialBinding` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuShapeMesh.ts:1-8` | `WgpuShapeMesh` | `interface` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuShapeRendererData.ts:16-27` | `WgpuShapeRendererData` | `interface` | yes | `scene2d-wgpu` | `flight-scene2d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuSkinningAdapter.ts:5-23` | `WgpuSkinningAdapter` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuSurface.ts:7-11` | `WgpuSurface` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `transitive` | no | dissolve-types-fixes.json:RELOCATE |
| `packages/types/src/WgpuTextureResolver.ts:6-12` | `WgpuTextureResolver` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuToonPipeline.ts:9-16` | `WgpuToonDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuToonPipeline.ts:17-18` | `WgpuToonPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuUniformEndianness.ts:3-4` | `WgpuUniformEndiannessStatus` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuUniformEndianness.ts:5-9` | `WgpuUniformEndiannessExplanation` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuUnlitPipeline.ts:6-12` | `WgpuUnlitDefineKey` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuUnlitPipeline.ts:13-14` | `WgpuUnlitPipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuVelocityWriter.ts:11-18` | `WgpuVelocityContext` | `interface` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuVelocityWriter.ts:19-20` | `WgpuVelocityWriter` | `type` | yes | `render-wgpu` | `flight-render-wgpu` | `none` | no | dissolve-types.md:appendix-b |
| `packages/types/src/WgpuWireframePipeline.ts:4-10` | `WgpuWireframePipeline` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WgpuWireframePipeline.ts:11-17` | `WgpuWireframeUpload` | `interface` | yes | `scene3d-wgpu` | `flight-scene3d-wgpu` | `none` | no | dissolve-types-owners-firstpass.json:a-srcfile |
| `packages/types/src/WhiteBalanceEffect.ts:3-8` | `WhiteBalanceEffect` | `interface` | yes | `effects` | `flight-effects` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WindForce.ts:1-7` | `WindForce` | `interface` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/WindForce.ts:8-9` | `WindForceKind` | `const` | yes | `particles` | `flight-particles` | `none` | no | dissolve-types.md:rule-c |
| `packages/types/src/WindowController.ts:7-8` | `WindowControllerTypeKey` | `const` | no | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WindowController.ts:9-12` | `WindowController` | `interface` | yes | `gui` | `flight-gui` | `direct` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WindowController.ts:13-24` | `WindowControllerOptions` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WindowController.ts:25-30` | `WindowControllerSignals` | `interface` | yes | `gui` | `flight-gui` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WireframeMaterial.ts:5-11` | `WireframeMaterial` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WireframeMaterial.ts:12-13` | `WireframeMaterialKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Woff2GlyfStreams.ts:5-24` | `Woff2GlyfStreams` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Woff2TableDirectory.ts:7-17` | `Woff2TableDirectory` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/Woff2TableDirectory.ts:18-31` | `Woff2TableEntry` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WoffChecksumMismatch.ts:8-15` | `WoffChecksumMismatch` | `interface` | yes | `font-formats` | `flight-font-formats` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WrappedDiffusePbrExtension.ts:6-17` | `WrappedDiffusePbrExtension` | `interface` | yes | `materials` | `flight-materials` | `transitive` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/WrappedDiffusePbrExtension.ts:18-19` | `WrappedDiffusePbrExtensionKind` | `const` | yes | `materials` | `flight-materials` | `none` | no | dissolve-types-owners-firstpass.json:file |
| `packages/types/src/XmlElement.ts:4-14` | `XmlElement` | `interface` | yes | `xml` | `flight-xml` | `none` | no | dissolve-types.md:appendix-b |
