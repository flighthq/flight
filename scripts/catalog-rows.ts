import {
  createRiveImportRegistry,
  getRiveCoreTypeName,
  lottieAllLayerHandlers,
  lottieAllShapeItemHandlers,
  lottieEllipseShapeItemHandler,
  lottieFillShapeItemHandler,
  lottieGradientFillShapeItemHandler,
  lottieGradientStrokeShapeItemHandler,
  lottieImageLayerHandler,
  lottieNullLayerHandler,
  lottiePathShapeItemHandler,
  lottiePolystarShapeItemHandler,
  lottiePrecompositionLayerHandler,
  lottieRectangleShapeItemHandler,
  lottieShapeLayerHandler,
  lottieSolidLayerHandler,
  lottieStrokeShapeItemHandler,
  lottieTextLayerHandler,
  lottieTrimPathShapeItemHandler,
  LOTTIE_REQUIREMENT_KEY_NAMESPACE,
  riveAllPathBooleanRegistrars,
  riveAllRegistrars,
  RIVE_REQUIREMENT_KEY_NAMESPACE,
} from '@flighthq/scene2d-formats/contract';
import {
  awd2CameraHandler,
  awd2ContainerHandler,
  awd2LightHandler,
  awd2LightPickerHandler,
  awd2MaterialHandler,
  awd2MeshInstanceHandler,
  awd2SkeletonAnimationHandler,
  awd2SkeletonBlockHandler,
  awd2SkeletonPoseHandler,
  awd2TextureHandler,
  awd2TriangleGeometryHandler,
  colladaAllElementDecoders,
  colladaAnimationDecoder,
  colladaCameraDecoder,
  colladaControllerDecoder,
  colladaGeometryDecoder,
  colladaLightDecoder,
  colladaMaterialDecoder,
  md2AllSectionHandlers,
  md2AnimationHandler,
  md2SkinHandler,
  md5AllSectionHandlers,
  md5MaterialHandler,
  md5SkeletonHandler,
  objAllMaterialHandlers,
  objBlinnPhongMaterialHandler,
  objStandardPbrMaterialHandler,
  threeDsAllChunkHandlers,
  threeDsCameraHandler,
  threeDsKeyframeHandler,
  threeDsLightHandler,
  threeDsMaterialHandler,
  threeDsMeshHandler,
} from '@flighthq/scene3d-formats';
import {
  AWD2_REQUIREMENT_KEY_NAMESPACE,
  COLLADA_REQUIREMENT_KEY_NAMESPACE,
  getAwd2BlockName,
  getThreeDsChunkName,
  MD2_REQUIREMENT_KEY_NAMESPACE,
  MD5_REQUIREMENT_KEY_NAMESPACE,
  OBJ_REQUIREMENT_KEY_NAMESPACE,
  THREE_DS_REQUIREMENT_KEY_NAMESPACE,
} from '@flighthq/scene3d-formats/contract';
import {
  dragonBonesAllSectionHandlers,
  dragonBonesAllTimelineHandlers,
  dragonBonesAnimationsSectionHandler,
  dragonBonesBonesSectionHandler,
  dragonBonesBoneTimelineHandler,
  dragonBonesDeformTimelineHandler,
  dragonBonesIkConstraintsSectionHandler,
  dragonBonesIkTimelineHandler,
  DRAGONBONES_REQUIREMENT_KEY_NAMESPACE,
  dragonBonesSkinsSectionHandler,
  dragonBonesSlotsSectionHandler,
  dragonBonesSlotTimelineHandler,
  dragonBonesZOrderTimelineHandler,
  spineBinaryAllSectionHandlers,
  spineBinaryAllTimelineHandlers,
  spineBinaryAnimationsSectionHandler,
  spineBinaryBonesSectionHandler,
  spineBinaryBoneTimelineHandler,
  spineBinaryDeformTimelineHandler,
  spineBinaryDrawOrderTimelineHandler,
  spineBinaryEventsSectionHandler,
  spineBinaryEventTimelineHandler,
  spineBinaryIkConstraintsSectionHandler,
  spineBinaryIkTimelineHandler,
  spineBinaryPathConstraintsSectionHandler,
  spineBinaryPathTimelineHandler,
  spineBinarySkinsSectionHandler,
  spineBinarySlotsSectionHandler,
  spineBinarySlotTimelineHandler,
  SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE,
  spineBinaryTransformConstraintsSectionHandler,
  spineBinaryTransformTimelineHandler,
  spineJsonAllSectionHandlers,
  spineJsonAllTimelineHandlers,
  spineJsonAnimationsSectionHandler,
  spineJsonBonesSectionHandler,
  spineJsonBoneTimelineHandler,
  spineJsonDeformTimelineHandler,
  spineJsonDrawOrderTimelineHandler,
  spineJsonEventsSectionHandler,
  spineJsonEventTimelineHandler,
  spineJsonIkConstraintsSectionHandler,
  spineJsonIkTimelineHandler,
  SPINE_JSON_REQUIREMENT_KEY_NAMESPACE,
  spineJsonPathConstraintsSectionHandler,
  spineJsonPathTimelineHandler,
  spineJsonSkinsSectionHandler,
  spineJsonSlotsSectionHandler,
  spineJsonSlotTimelineHandler,
  spineJsonTransformConstraintsSectionHandler,
  spineJsonTransformTimelineHandler,
} from '@flighthq/skeleton2d-formats/contract';
import {
  swfControlHandler,
  swfDefineMorphShapeHandler,
  swfDefineShapeHandler,
  swfEditTextHandler,
  swfFontHandler,
  swfJpegBitmapHandler,
  swfLosslessBitmapHandler,
  swfPlaceObject3Handler,
  swfPlaceObjectHandler,
  swfScriptHandler,
  swfSoundHandler,
  swfSpriteHandler,
  swfStaticTextHandler,
  swfVideoHandler,
} from '@flighthq/swf';
import { getSwfTagName, SWF_REQUIREMENT_KEY_NAMESPACE } from '@flighthq/swf/contract';
import type { PathBooleanKernel, RiveImportRegistry } from '@flighthq/types/contract';
import type {
  Awd2BlockHandler,
  ColladaElementDecoder,
  DragonBonesSectionHandler,
  DragonBonesTimelineHandler,
  LottieLayerHandler,
  LottieShapeItemHandler,
  Md2SectionHandler,
  Md5SectionHandler,
  ObjMaterialHandler,
  RequirementCatalogEntry,
  SpineBinarySectionHandler,
  SpineBinaryTimelineHandler,
  SpineJsonSectionHandler,
  SpineJsonTimelineHandler,
  SwfTagHandler,
  ThreeDsChunkHandler,
} from '@flighthq/types/contract';
import {
  DragonBonesSectionKind,
  DragonBonesTimelineKind,
  RequirementFacet,
  SpineBinarySectionKind,
  SpineBinaryTimelineKind,
  SpineJsonSectionKind,
  SpineJsonTimelineKind,
} from '@flighthq/types/contract';

/**
 * The built-in ownership rows, DERIVED from the handlers themselves rather than transcribed.
 *
 * Every row answers one question factually: which shipped symbol does a build import to satisfy this
 * requirement? The tag and block codes are not written here — each handler already declares the codes
 * it claims (`SwfTagHandler.tags`, `Awd2BlockHandler.blockTypes`), and the names come from the same
 * vocabulary the analyzers key their requirements with. So the catalog cannot drift from what the
 * handlers actually claim: a handler that gains a tag gains a row on the next generate, and a row for a
 * tag no handler claims cannot be written at all.
 *
 * ★ ROWS NAME A HANDLER, NEVER A FAMILY. A family is a convenience array spanning several handlers, so
 * resolving `swf.DefineShape` to `swfShapeTagFamily` would also drag in the morph-shape handler, and
 * `swf.DefineText` would drag in the edit-text handler and the text-input machinery behind it. The
 * requirement is precise, so the answer must be too — otherwise resolution quietly re-inflates exactly
 * the cost the per-file manifest exists to avoid. AWD2 shows the same effect more sharply: its handlers
 * claim ONE block type each, so a family-shaped row for `awd2.Skeleton` would pull in skeleton POSE and
 * skeleton ANIMATION as well. The handler is the floor — it is the unit that owns a parse routine, and
 * the versioned tags one handler claims (`DefineShape` through `DefineShape4`) share that routine.
 *
 * ONLY THE PARSER BACKEND IS POPULATED, and that is a statement of fact rather than an omission. A
 * `document.format` requirement names a TAG (`swf.DefineShape`), while a node renderer is keyed by a
 * NODE KIND (`Shape`). Nothing in the repo declares which kinds a tag becomes — the relationship exists
 * only at runtime inside each handler's `createPlacementNode` — so a canvas/gl/wgpu/dom row here would
 * be a guess, and a wrong one binds a renderer to a kind no node ever carries, which fails silently.
 * Render rows arrive when the format-to-render translation lands.
 *
 * The handlers are listed explicitly rather than swept out of the module namespace: the list is the
 * declaration of what ships, it greps, and `catalog-rows.test.ts` fails if it ever stops matching the
 * handlers the format packages actually export.
 */
export const SWF_TAG_HANDLERS: ReadonlyMap<string, Readonly<SwfTagHandler>> = new Map([
  ['swfControlHandler', swfControlHandler],
  ['swfDefineMorphShapeHandler', swfDefineMorphShapeHandler],
  ['swfDefineShapeHandler', swfDefineShapeHandler],
  ['swfEditTextHandler', swfEditTextHandler],
  ['swfFontHandler', swfFontHandler],
  ['swfJpegBitmapHandler', swfJpegBitmapHandler],
  ['swfLosslessBitmapHandler', swfLosslessBitmapHandler],
  ['swfPlaceObject3Handler', swfPlaceObject3Handler],
  ['swfPlaceObjectHandler', swfPlaceObjectHandler],
  ['swfScriptHandler', swfScriptHandler],
  ['swfSoundHandler', swfSoundHandler],
  ['swfSpriteHandler', swfSpriteHandler],
  ['swfStaticTextHandler', swfStaticTextHandler],
  ['swfVideoHandler', swfVideoHandler],
]);

export const AWD2_BLOCK_HANDLERS: ReadonlyMap<string, Readonly<Awd2BlockHandler>> = new Map([
  ['awd2CameraHandler', awd2CameraHandler],
  ['awd2ContainerHandler', awd2ContainerHandler],
  ['awd2LightHandler', awd2LightHandler],
  ['awd2LightPickerHandler', awd2LightPickerHandler],
  ['awd2MaterialHandler', awd2MaterialHandler],
  ['awd2MeshInstanceHandler', awd2MeshInstanceHandler],
  ['awd2SkeletonAnimationHandler', awd2SkeletonAnimationHandler],
  ['awd2SkeletonBlockHandler', awd2SkeletonBlockHandler],
  ['awd2SkeletonPoseHandler', awd2SkeletonPoseHandler],
  ['awd2TextureHandler', awd2TextureHandler],
  ['awd2TriangleGeometryHandler', awd2TriangleGeometryHandler],
]);

/**
 * The 3DS chunk handlers, keyed by the symbol a generated module imports.
 *
 * Each handler declares the chunk IDs it claims, and `getThreeDsChunkName` turns an ID into the same
 * feature name `parseThreeDsRequirements` emits under `document.format` — so a `3ds.Trimesh` row is
 * derived from the handler's own claim rather than asserted alongside it.
 */
export const THREE_DS_CHUNK_HANDLERS: ReadonlyMap<string, Readonly<ThreeDsChunkHandler>> = new Map([
  ['threeDsCameraHandler', threeDsCameraHandler],
  ['threeDsKeyframeHandler', threeDsKeyframeHandler],
  ['threeDsLightHandler', threeDsLightHandler],
  ['threeDsMaterialHandler', threeDsMaterialHandler],
  ['threeDsMeshHandler', threeDsMeshHandler],
]);

/**
 * The COLLADA element decoders, keyed by the symbol a generated module imports.
 *
 * A decoder states the features it decodes in its own `features` array — both the coarse feature
 * (`Camera`) and the sub-element features (`Camera.Perspective`, `Camera.Orthographic`) — and those
 * strings are the feature names `parseColladaRequirements` emits under `document.format`. So
 * `dae.Camera.Perspective` resolves to the decoder that says it handles Camera, with nothing in
 * between to get out of step.
 */
export const COLLADA_ELEMENT_DECODERS: ReadonlyMap<string, Readonly<ColladaElementDecoder>> = new Map([
  ['colladaAnimationDecoder', colladaAnimationDecoder],
  ['colladaCameraDecoder', colladaCameraDecoder],
  ['colladaControllerDecoder', colladaControllerDecoder],
  ['colladaGeometryDecoder', colladaGeometryDecoder],
  ['colladaLightDecoder', colladaLightDecoder],
  ['colladaMaterialDecoder', colladaMaterialDecoder],
]);

/**
 * The MD2 section handlers, keyed by the symbol a generated module imports.
 *
 * Each handler declares the `feature` it satisfies, and that string is the same feature
 * `collectMd2Features` reports and `parseMd2Requirements` emits under `document.format` — so an
 * `md2.Material` row resolves to the handler that says it satisfies `Material`, derived rather than
 * asserted alongside it.
 *
 * MD2's `Mesh` feature intentionally has NO handler and therefore no row: the header, triangles, texcoords
 * and frame 0 are read unconditionally, because without them there is no model. Only the two features a
 * build can genuinely do without are named here.
 */
export const MD2_SECTION_HANDLERS: ReadonlyMap<string, Readonly<Md2SectionHandler>> = new Map([
  ['md2AnimationHandler', md2AnimationHandler],
  ['md2SkinHandler', md2SkinHandler],
]);

/**
 * The MD5 mesh section handlers, keyed by the symbol a generated module imports.
 *
 * As with MD2, each declares the feature it satisfies and the row is derived from that. MD5's `Mesh`
 * feature has no handler and no row for the same reason: the geometry is what makes the file a model.
 */
export const MD5_SECTION_HANDLERS: ReadonlyMap<string, Readonly<Md5SectionHandler>> = new Map([
  ['md5MaterialHandler', md5MaterialHandler],
  ['md5SkeletonHandler', md5SkeletonHandler],
]);

/**
 * The OBJ material handlers, keyed by the symbol a generated module imports.
 *
 * ★ THESE ROWS ONLY BECAME POSSIBLE WHEN THE KEY SPLIT. Both handlers used to answer one coarse
 * `obj.Material` requirement, and the catalog gives one implementation per backend/facet/kind — so two rows
 * for that key collided and OBJ got none at all. The analyzer reads the referenced MTL now and emits
 * `obj.MaterialBlinnPhong` / `obj.MaterialStandardPbr`, each handler declares which model it reads, and the
 * rows derive from that.
 */
export const OBJ_MATERIAL_HANDLERS: ReadonlyMap<string, Readonly<ObjMaterialHandler>> = new Map([
  ['objBlinnPhongMaterialHandler', objBlinnPhongMaterialHandler],
  ['objStandardPbrMaterialHandler', objStandardPbrMaterialHandler],
]);

/**
 * The Spine binary section handlers, keyed by symbol and paired with the section kind each handles.
 *
 * Spine handlers are plain functions registered by kind rather than objects that declare their own
 * metadata, so the kind is an explicit pairing rather than a derivation from handler properties.
 */
export const SPINE_BINARY_SECTION_HANDLERS: readonly (readonly [string, SpineBinarySectionHandler, string])[] = [
  ['spineBinaryAnimationsSectionHandler', spineBinaryAnimationsSectionHandler, SpineBinarySectionKind.Animations],
  ['spineBinaryBonesSectionHandler', spineBinaryBonesSectionHandler, SpineBinarySectionKind.Bones],
  ['spineBinaryEventsSectionHandler', spineBinaryEventsSectionHandler, SpineBinarySectionKind.Events],
  [
    'spineBinaryIkConstraintsSectionHandler',
    spineBinaryIkConstraintsSectionHandler,
    SpineBinarySectionKind.IkConstraints,
  ],
  [
    'spineBinaryPathConstraintsSectionHandler',
    spineBinaryPathConstraintsSectionHandler,
    SpineBinarySectionKind.PathConstraints,
  ],
  ['spineBinarySkinsSectionHandler', spineBinarySkinsSectionHandler, SpineBinarySectionKind.Skins],
  ['spineBinarySlotsSectionHandler', spineBinarySlotsSectionHandler, SpineBinarySectionKind.Slots],
  [
    'spineBinaryTransformConstraintsSectionHandler',
    spineBinaryTransformConstraintsSectionHandler,
    SpineBinarySectionKind.TransformConstraints,
  ],
];

/**
 * The Spine binary timeline handlers, keyed by symbol and paired with the timeline kind each handles.
 */
export const SPINE_BINARY_TIMELINE_HANDLERS: readonly (readonly [string, SpineBinaryTimelineHandler, string])[] = [
  ['spineBinaryBoneTimelineHandler', spineBinaryBoneTimelineHandler, SpineBinaryTimelineKind.Bone],
  ['spineBinaryDeformTimelineHandler', spineBinaryDeformTimelineHandler, SpineBinaryTimelineKind.Deform],
  ['spineBinaryDrawOrderTimelineHandler', spineBinaryDrawOrderTimelineHandler, SpineBinaryTimelineKind.DrawOrder],
  ['spineBinaryEventTimelineHandler', spineBinaryEventTimelineHandler, SpineBinaryTimelineKind.Event],
  ['spineBinaryIkTimelineHandler', spineBinaryIkTimelineHandler, SpineBinaryTimelineKind.Ik],
  ['spineBinaryPathTimelineHandler', spineBinaryPathTimelineHandler, SpineBinaryTimelineKind.Path],
  ['spineBinarySlotTimelineHandler', spineBinarySlotTimelineHandler, SpineBinaryTimelineKind.Slot],
  ['spineBinaryTransformTimelineHandler', spineBinaryTransformTimelineHandler, SpineBinaryTimelineKind.Transform],
];

export const SPINE_JSON_SECTION_HANDLERS: readonly (readonly [string, SpineJsonSectionHandler, string])[] = [
  ['spineJsonAnimationsSectionHandler', spineJsonAnimationsSectionHandler, SpineJsonSectionKind.Animations],
  ['spineJsonBonesSectionHandler', spineJsonBonesSectionHandler, SpineJsonSectionKind.Bones],
  ['spineJsonEventsSectionHandler', spineJsonEventsSectionHandler, SpineJsonSectionKind.Events],
  ['spineJsonIkConstraintsSectionHandler', spineJsonIkConstraintsSectionHandler, SpineJsonSectionKind.IkConstraints],
  [
    'spineJsonPathConstraintsSectionHandler',
    spineJsonPathConstraintsSectionHandler,
    SpineJsonSectionKind.PathConstraints,
  ],
  ['spineJsonSkinsSectionHandler', spineJsonSkinsSectionHandler, SpineJsonSectionKind.Skins],
  ['spineJsonSlotsSectionHandler', spineJsonSlotsSectionHandler, SpineJsonSectionKind.Slots],
  [
    'spineJsonTransformConstraintsSectionHandler',
    spineJsonTransformConstraintsSectionHandler,
    SpineJsonSectionKind.TransformConstraints,
  ],
];

export const SPINE_JSON_TIMELINE_HANDLERS: readonly (readonly [string, SpineJsonTimelineHandler, string])[] = [
  ['spineJsonBoneTimelineHandler', spineJsonBoneTimelineHandler, SpineJsonTimelineKind.Bone],
  ['spineJsonDeformTimelineHandler', spineJsonDeformTimelineHandler, SpineJsonTimelineKind.Deform],
  ['spineJsonDrawOrderTimelineHandler', spineJsonDrawOrderTimelineHandler, SpineJsonTimelineKind.DrawOrder],
  ['spineJsonEventTimelineHandler', spineJsonEventTimelineHandler, SpineJsonTimelineKind.Event],
  ['spineJsonIkTimelineHandler', spineJsonIkTimelineHandler, SpineJsonTimelineKind.Ik],
  ['spineJsonPathTimelineHandler', spineJsonPathTimelineHandler, SpineJsonTimelineKind.Path],
  ['spineJsonSlotTimelineHandler', spineJsonSlotTimelineHandler, SpineJsonTimelineKind.Slot],
  ['spineJsonTransformTimelineHandler', spineJsonTransformTimelineHandler, SpineJsonTimelineKind.Transform],
];

export const DRAGONBONES_SECTION_HANDLERS: readonly (readonly [string, DragonBonesSectionHandler, string])[] = [
  ['dragonBonesAnimationsSectionHandler', dragonBonesAnimationsSectionHandler, DragonBonesSectionKind.Animations],
  ['dragonBonesBonesSectionHandler', dragonBonesBonesSectionHandler, DragonBonesSectionKind.Bones],
  [
    'dragonBonesIkConstraintsSectionHandler',
    dragonBonesIkConstraintsSectionHandler,
    DragonBonesSectionKind.IkConstraints,
  ],
  ['dragonBonesSkinsSectionHandler', dragonBonesSkinsSectionHandler, DragonBonesSectionKind.Skins],
  ['dragonBonesSlotsSectionHandler', dragonBonesSlotsSectionHandler, DragonBonesSectionKind.Slots],
];

export const DRAGONBONES_TIMELINE_HANDLERS: readonly (readonly [string, DragonBonesTimelineHandler, string])[] = [
  ['dragonBonesBoneTimelineHandler', dragonBonesBoneTimelineHandler, DragonBonesTimelineKind.Bone],
  ['dragonBonesDeformTimelineHandler', dragonBonesDeformTimelineHandler, DragonBonesTimelineKind.Deform],
  ['dragonBonesIkTimelineHandler', dragonBonesIkTimelineHandler, DragonBonesTimelineKind.Ik],
  ['dragonBonesSlotTimelineHandler', dragonBonesSlotTimelineHandler, DragonBonesTimelineKind.Slot],
  ['dragonBonesZOrderTimelineHandler', dragonBonesZOrderTimelineHandler, DragonBonesTimelineKind.ZOrder],
];

export const LOTTIE_LAYER_HANDLERS: readonly (readonly [string, LottieLayerHandler, string])[] = [
  ['lottieImageLayerHandler', lottieImageLayerHandler, 'layer.image'],
  ['lottieNullLayerHandler', lottieNullLayerHandler, 'layer.null'],
  ['lottiePrecompositionLayerHandler', lottiePrecompositionLayerHandler, 'layer.precomposition'],
  ['lottieShapeLayerHandler', lottieShapeLayerHandler, 'layer.shape'],
  ['lottieSolidLayerHandler', lottieSolidLayerHandler, 'layer.solid'],
  ['lottieTextLayerHandler', lottieTextLayerHandler, 'layer.text'],
];

export const LOTTIE_SHAPE_ITEM_HANDLERS: readonly (readonly [string, LottieShapeItemHandler, string])[] = [
  ['lottieEllipseShapeItemHandler', lottieEllipseShapeItemHandler, 'shape.ellipse'],
  ['lottieFillShapeItemHandler', lottieFillShapeItemHandler, 'shape.fill'],
  ['lottieGradientFillShapeItemHandler', lottieGradientFillShapeItemHandler, 'shape.gradientFill'],
  ['lottieGradientStrokeShapeItemHandler', lottieGradientStrokeShapeItemHandler, 'shape.gradientStroke'],
  ['lottiePathShapeItemHandler', lottiePathShapeItemHandler, 'shape.path'],
  ['lottiePolystarShapeItemHandler', lottiePolystarShapeItemHandler, 'shape.polystar'],
  ['lottieRectangleShapeItemHandler', lottieRectangleShapeItemHandler, 'shape.rectangle'],
  ['lottieStrokeShapeItemHandler', lottieStrokeShapeItemHandler, 'shape.stroke'],
  ['lottieTrimPathShapeItemHandler', lottieTrimPathShapeItemHandler, 'shape.trimPath'],
];

/**
 * The two `parserOptions` fields a Rive row lands in, matching `RiveImportOptions`.
 *
 * Rive is the one format whose families split by DEPENDENCY rather than by kind: ten registrars need only the
 * registry, one also needs a path-boolean kernel, and a build that omits the second never links a path-boolean
 * implementation. Each row carries the field it belongs in, so the emitter writes two arrays and a consumer
 * spreads the result straight into `RiveImportOptions`.
 */
export const RIVE_REGISTRAR_PARSER_FIELD = 'registrars';
export const RIVE_PATH_BOOLEAN_PARSER_FIELD = 'pathBooleanRegistrars';

/** The backend whose rows become `parserOptions` rather than a render-state fragment. */
export const CATALOG_PARSER_BACKEND = 'parser';

/** Builds every built-in row, sorted so the generated source is byte-stable across runs. */
export function buildRequirementCatalogRows(): readonly RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const [symbol, handler] of SWF_TAG_HANDLERS) {
    for (const code of handler.tags) {
      rows.push(row('@flighthq/swf', symbol, `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}`));
    }
  }
  for (const [symbol, handler] of AWD2_BLOCK_HANDLERS) {
    for (const blockType of handler.blockTypes) {
      rows.push(
        row('@flighthq/scene3d-formats', symbol, `${AWD2_REQUIREMENT_KEY_NAMESPACE}.${getAwd2BlockName(0, blockType)}`),
      );
    }
  }
  // ★ THE FAMILY ARRAY IS THE ORDER, AND IT IS READ HERE RATHER THAN RESTATED. `indexOf` against the
  // shipped array is what makes `familyOrder` a fact about the family: reordering
  // `colladaAllElementDecoders` moves the numbers on the next generate, and a decoder absent from the
  // family gets no position rather than a plausible wrong one.
  for (const [symbol, handler] of THREE_DS_CHUNK_HANDLERS) {
    for (const chunkId of handler.chunkIds) {
      rows.push(
        row(
          '@flighthq/scene3d-formats',
          symbol,
          `${THREE_DS_REQUIREMENT_KEY_NAMESPACE}.${getThreeDsChunkName(chunkId)}`,
          familyOrderOf(threeDsAllChunkHandlers, handler),
        ),
      );
    }
  }
  // ★ ROWS DERIVED BY RUNNING THE SHIPPED REGISTRARS, NEVER BY TRANSCRIBING THE OBJECT MODEL. Rive identifies
  // objects by number across 368 core types; a hand-written key table would be the single largest thing in this
  // file and the first to fall out of date. Each registrar is applied to a throwaway registry and the keys it
  // installs are read back, so a family that gains or loses a core type changes these rows on the same edit.
  //
  // The two lists are declared separately by the format package, so nothing here inspects a function to decide
  // how to call it — the arity comes from which list a registrar is in. `Function.name` supplies the symbol,
  // which is the same identity a generated module imports.
  for (const registrar of riveAllRegistrars) {
    for (const kind of riveRegistrarKinds((registry) => registrar(registry))) {
      rows.push(riveRow(registrar.name, kind, RIVE_REGISTRAR_PARSER_FIELD));
    }
  }
  for (const registrar of riveAllPathBooleanRegistrars) {
    for (const kind of riveRegistrarKinds((registry) => registrar(RIVE_PROBE_KERNEL, registry))) {
      rows.push(riveRow(registrar.name, kind, RIVE_PATH_BOOLEAN_PARSER_FIELD));
    }
  }
  for (const [symbol, handler] of MD2_SECTION_HANDLERS) {
    rows.push(
      row(
        '@flighthq/scene3d-formats',
        symbol,
        `${MD2_REQUIREMENT_KEY_NAMESPACE}.${handler.feature}`,
        familyOrderOf(md2AllSectionHandlers, handler),
      ),
    );
  }
  for (const [symbol, handler] of MD5_SECTION_HANDLERS) {
    rows.push(
      row(
        '@flighthq/scene3d-formats',
        symbol,
        `${MD5_REQUIREMENT_KEY_NAMESPACE}.${handler.feature}`,
        familyOrderOf(md5AllSectionHandlers, handler),
      ),
    );
  }
  for (const [symbol, handler] of OBJ_MATERIAL_HANDLERS) {
    rows.push(
      row(
        '@flighthq/scene3d-formats',
        symbol,
        `${OBJ_REQUIREMENT_KEY_NAMESPACE}.${handler.feature}`,
        familyOrderOf(objAllMaterialHandlers, handler),
      ),
    );
  }
  for (const [symbol, decoder] of COLLADA_ELEMENT_DECODERS) {
    for (const feature of decoder.features) {
      rows.push(
        row(
          '@flighthq/scene3d-formats',
          symbol,
          `${COLLADA_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
          familyOrderOf(colladaAllElementDecoders, decoder),
        ),
      );
    }
  }
  for (const [symbol, handler, kind] of SPINE_BINARY_SECTION_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(spineBinaryAllSectionHandlers, handler),
        'sectionHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of SPINE_BINARY_TIMELINE_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(spineBinaryAllTimelineHandlers, handler),
        'timelineHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of SPINE_JSON_SECTION_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(spineJsonAllSectionHandlers, handler),
        'sectionHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of SPINE_JSON_TIMELINE_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(spineJsonAllTimelineHandlers, handler),
        'timelineHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of DRAGONBONES_SECTION_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(dragonBonesAllSectionHandlers, handler),
        'sectionHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of DRAGONBONES_TIMELINE_HANDLERS) {
    rows.push(
      row(
        '@flighthq/skeleton2d-formats/contract',
        symbol,
        `${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(dragonBonesAllTimelineHandlers, handler),
        'timelineHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of LOTTIE_LAYER_HANDLERS) {
    rows.push(
      row(
        '@flighthq/scene2d-formats',
        symbol,
        `${LOTTIE_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(lottieAllLayerHandlers, handler),
        'layerHandlers',
      ),
    );
  }
  for (const [symbol, handler, kind] of LOTTIE_SHAPE_ITEM_HANDLERS) {
    rows.push(
      row(
        '@flighthq/scene2d-formats',
        symbol,
        `${LOTTIE_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
        familyOrderOf(lottieAllShapeItemHandlers, handler),
        'shapeItemHandlers',
      ),
    );
  }
  return rows.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.implementationSymbol.localeCompare(b.implementationSymbol),
  );
}

function row(
  module: string,
  symbol: string,
  kind: string,
  familyOrder?: number,
  parserField?: string,
): RequirementCatalogEntry {
  return {
    backend: CATALOG_PARSER_BACKEND,
    facet: RequirementFacet.DocumentFormat,
    familyOrder,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
    parserField,
  };
}

// Runs one registrar against a FRESH registry and reports the requirement kinds its keys correspond to. The
// registry is created here and handed to the caller's callback, so each registrar is measured alone and cannot
// see another's keys.
function riveRegistrarKinds(apply: (registry: RiveImportRegistry) => void): readonly string[] {
  const registry: RiveImportRegistry = createRiveImportRegistry();
  apply(registry);
  return [...registry.handlers.keys()]
    .map((key) => `${RIVE_REQUIREMENT_KEY_NAMESPACE}.${getRiveCoreTypeName(key) ?? `Unknown(${key})`}`)
    .sort();
}

function riveRow(symbol: string, kind: string, parserField: string): RequirementCatalogEntry {
  return { ...row('@flighthq/scene2d-formats', symbol, kind), parserField };
}

// Only stored by the clipping registrar, never invoked while collecting registrations.
const RIVE_PROBE_KERNEL = {} as Readonly<PathBooleanKernel>;

// Membership by IDENTITY, not by name or feature: the family holds the very values the maps above do, so
// a decoder that is not the same object is not in the family regardless of what it claims to decode.
function familyOrderOf<T>(family: readonly T[], member: T): number | undefined {
  const index = family.indexOf(member);
  return index === -1 ? undefined : index;
}
