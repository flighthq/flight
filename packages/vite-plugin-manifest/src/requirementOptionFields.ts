import { RequirementFacet } from '@flighthq/types/contract';

/**
 * The render-state options field that collects each facet's implementations.
 *
 * A catalog row names a facet, a kind and an implementation, but not the options field that holds it —
 * deliberately, because a row is a fact about ownership and should not encode one consumer's option
 * shape. This table is where the plugin decides.
 *
 * `document.format` maps to `nodeRenderers` for a render backend: a document's content kinds are the
 * nodes the importer produces, so that is the field a renderer needs them in.
 */
export const REQUIREMENT_OPTION_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  [RequirementFacet.DocumentFormat]: 'nodeRenderers',
  [RequirementFacet.SceneBlendMode]: 'blendRealizations',
  [RequirementFacet.SceneMaterialKind]: 'materialRenderers',
  [RequirementFacet.SceneModifierKind]: 'modifierSnippets',
  [RequirementFacet.SceneNodeKind]: 'nodeRenderers',
  [RequirementFacet.SceneShapeCommand]: 'canvasShapeCommands',
  [RequirementFacet.SceneTextureSourceKind]: 'textureResolvers',
});

/**
 * The kind-keyed fields each backend's options type ACTUALLY declares, taken from the types package.
 *
 * Backend sets are not interchangeable and the differences are real: `GlRenderStateOptions` has
 * `blendRealizations`, `pbrExtensions` and `customEffectShaders`; `WgpuRenderStateOptions` has NONE of
 * those three. Emitting one into the other would produce a fragment that typechecks nowhere and
 * silently does nothing when spread, so routing is per backend and a row naming a field its backend
 * does not accept is REPORTED rather than emitted.
 *
 * `canvas` and `dom` are deliberately EMPTY. `CanvasRenderOptions` and `DomRenderOptions` declare no
 * kind-keyed fields at all — canvas takes its registries as a separate constructor parameter and DOM
 * accepts none — so there is no options field on either for a fragment to spread into today. Their
 * fragments are emitted empty and every row aimed at them is reported, rather than inventing a field
 * that does not exist. See this package's status note for the open API question.
 */
export const BACKEND_OPTION_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  canvas: new Set<string>(),
  dom: new Set<string>(),
  gl: new Set([
    'blendRealizations',
    'canvasShapeCommands',
    'customEffectShaders',
    'customMaterialShaders',
    'effectPaddingResolvers',
    'effects',
    'materialRenderers',
    'modifierSnippets',
    'nodeRenderers',
    'pbrExtensions',
    'textureResolvers',
    'velocityWriters',
  ]),
  wgpu: new Set([
    'canvasShapeCommands',
    'customMaterialShaders',
    'effectPaddingResolvers',
    'effects',
    'materialRenderers',
    'modifierSnippets',
    'nodeRenderers',
    'textureResolvers',
    'velocityWriters',
  ]),
});

/** The parser options field each content format spreads its ordered handler list into. */
export const PARSER_HANDLER_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  '.awd': 'blocks',
  '.awd2': 'blocks',
  '.swf': 'tags',
});
