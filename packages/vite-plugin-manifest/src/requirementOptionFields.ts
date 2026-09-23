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
 * Canvas and DOM reach their registries by different routes, and the sets reflect that rather than
 * pretending the four backends are alike. A canvas fragment is a `Partial<CanvasRenderRegistries>`
 * spread into constructor argument 1; a DOM fragment is a `Partial<DomRenderOptions>` whose registry
 * fields the constructor seeds into the runtime. Neither carries `blendRealizations`, and DOM carries
 * no material or effect tables, so a row naming one is reported rather than emitted into a field that
 * does not exist.
 */
export const BACKEND_OPTION_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  // C1: canvas fragments are Partial<CanvasRenderRegistries>, spreadable into createCanvasRenderState
  // ARGUMENT 1 rather than its options parameter, so the fields are the registries' kind-keyed ones.
  canvas: new Set(['canvasShapeCommands', 'effectPaddingResolvers', 'effects', 'materialRenderers', 'nodeRenderers']),
  // D3: DomRenderOptions now declares registry fields, seeded into the runtime at construction.
  dom: new Set(['canvasShapeCommands', 'effectPaddingResolvers', 'nodeRenderers', 'textureResolvers']),
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
