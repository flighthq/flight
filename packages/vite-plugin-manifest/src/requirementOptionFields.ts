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
 * Per-backend field name overrides for facets whose implementation shape differs across backends.
 *
 * Canvas blend mode application is a single function (`blendModeApplication`), not a per-mode Map
 * (`blendRealizations`). The global `REQUIREMENT_OPTION_FIELDS` names the GL/WGPU field; this table
 * redirects the facet to the correct field on backends where the shape differs.
 */
export const BACKEND_OPTION_FIELD_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze(
  {
    canvas: Object.freeze({ [RequirementFacet.SceneBlendMode]: 'blendModeApplication' }),
  },
);

/**
 * Fields that carry a single implementation value rather than a kind-keyed Map.
 *
 * The codegen emits `field: symbol` instead of `field: new Map([...])`. If multiple catalog rows
 * land on the same scalar field for one backend, only the first is emitted and the rest are reported
 * as conflicts — a scalar cannot hold two implementations.
 */
export const SCALAR_OPTION_FIELDS: ReadonlySet<string> = new Set(['blendModeApplication']);

/**
 * The kind-keyed fields each backend's options type ACTUALLY declares, taken from the types package.
 *
 * Backend sets are not interchangeable and the differences are real: `GlRenderStateOptions` has
 * `blendRealizations`, `pbrExtensions` and `customEffectShaders`; `WgpuRenderStateOptions` has NONE of
 * those three. Emitting one into the other would produce a fragment that typechecks nowhere and
 * silently does nothing when spread, so routing is per backend and a row naming a field its backend
 * does not accept is REPORTED rather than emitted.
 *
 * All four backends now take ONE options object, and every set below is derived from the options type
 * that backend actually declares rather than from a guess about which fields it ought to have.
 * `CanvasRenderStateOptions` carries the registries and texture resolvers directly, so a canvas
 * fragment spreads into `createCanvasRenderState(options)` like every other backend's. DOM's registry
 * fields are seeded into the runtime at construction. Neither canvas nor DOM declares
 * `blendRealizations`, and DOM declares no material or effect tables, so a row naming one is reported
 * rather than emitted into a field that does not exist.
 */
export const BACKEND_OPTION_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  // Derived from the landed CanvasRenderStateOptions: it extends RenderStateOptions and
  // CanvasRenderOptions and adds effects and materialRenderers, so these are its kind-keyed fields.
  canvas: new Set([
    'blendModeApplication',
    'canvasShapeCommands',
    'effectPaddingResolvers',
    'effects',
    'materialRenderers',
    'nodeRenderers',
  ]),
  // D3: DomRenderOptions declares registry fields, seeded into the runtime at construction.
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
