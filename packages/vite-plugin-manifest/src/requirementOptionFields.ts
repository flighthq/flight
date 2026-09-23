import { RequirementFacet } from '@flighthq/types/contract';

/**
 * Which render-state options field collects each facet's implementations.
 *
 * A catalog row names a facet, a kind and an implementation, but not the options field that holds it —
 * deliberately, because a row is a fact about ownership and should not encode one consumer's option
 * shape. This table is where the plugin decides, stated once as data so an unmapped facet is a
 * reported gap rather than a silent drop.
 *
 * Every field here is kind-keyed, so entries collect into a `Map`. Ordered parser handler lists are
 * NOT in this table: those are routed by the row's backend, because the same `document.format`
 * requirement resolves to a tag handler for the parser and to a node renderer for a render backend.
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

/** The parser options field each content format spreads its ordered handler list into. */
export const PARSER_HANDLER_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  '.awd': 'blocks',
  '.awd2': 'blocks',
  '.swf': 'tags',
});
