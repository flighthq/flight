import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet, XmlElement } from '@flighthq/types/contract';
import { RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { COLLADA_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * The COLLADA features a build can be asked to support, and the element that EVIDENCES each one.
 *
 * ★ CONTENT ELEMENTS, NOT LIBRARY WRAPPERS. A `.dae` written by any exporter carries the library
 * elements it has no content for — `<library_geometries/>` sitting empty is ordinary — so keying on the
 * wrapper would report every feature for every file and make the inventory worthless. Each entry below
 * names the element that only appears when the feature is actually present.
 *
 * `Material` is evidenced by either `<material>` or `<effect>`: COLLADA splits a material into a
 * material that names an effect and the effect that carries the shading, and an exporter may emit the
 * effect library alone. Requiring both would miss those files; requiring either matches what the
 * importer actually reads.
 *
 * `Controller` covers `<skin>` and `<morph>` through their shared `<controller>` parent, which is the
 * granularity the decoders work at — `decodeColladaControllers` and `decodeColladaMorphs` both walk
 * controllers.
 */
export const COLLADA_FEATURE_ELEMENTS: ReadonlyMap<string, readonly string[]> = new Map([
  ['Animation', ['animation']],
  ['Camera', ['camera']],
  ['Controller', ['controller']],
  ['Geometry', ['geometry']],
  ['Light', ['light']],
  ['Material', ['material', 'effect']],
]);

/**
 * Which features one COLLADA document actually contains.
 *
 * Build-time only, and deliberately NOT a parse: it reads the element vocabulary and stops, so an
 * inventory costs an XML walk rather than a full import. That is also why it lives apart from
 * `parseCollada` — analysis must not drag the geometry, material and animation decoding a build may
 * never need into a module a build tool imports.
 *
 * Returns an empty set for anything that is not a readable COLLADA document, so a caller can tell
 * "inspected, found nothing" from "never looked" by checking readability separately.
 */
export function collectColladaFeatures(xml: string): ReadonlySet<string> {
  const found = new Set<string>();
  const root = parseXmlDocument(xml);
  if (root === null || !isColladaRoot(root)) return found;

  // One walk, checked against every feature, rather than a descendant search per feature: a document
  // with no controllers should not cost six traversals to discover that.
  const byElement = new Map<string, string>();
  for (const [feature, elements] of COLLADA_FEATURE_ELEMENTS) {
    for (const element of elements) byElement.set(element, feature);
  }
  visit(root, (element) => {
    const feature = byElement.get(localName(element));
    if (feature !== undefined) found.add(feature);
  });
  return found;
}

/**
 * Whether the bytes are a COLLADA document at all.
 *
 * Separate from `collectColladaFeatures` because an analyzer reports an empty set both for a file that
 * needs nothing and for one it could not read, and a build that cannot tell those apart ships a bundle
 * missing every implementation the content needed.
 */
export function isReadableCollada(xml: string): boolean {
  const root = parseXmlDocument(xml);
  return root !== null && isColladaRoot(root);
}

/**
 * Build-time inventory of what one COLLADA file asks a build to support.
 *
 * ★ PER FEATURE, NOT PER FORMAT. The coarse version emitted one `dae` requirement for every `.dae`
 * file and an unconditional `StandardPbr` material requirement beside it. That told a build nothing it
 * did not already know from the file extension, and the material claim was false for the many COLLADA
 * files that carry geometry and no shading at all — so a build wired in a PBR material path it never
 * used, which is the bundle cost this inventory exists to remove.
 *
 * `StandardPbr` is now emitted ONLY when the document carries material or effect content, because that
 * is the only case in which the importer produces a material. Geometry alone implies no material kind.
 *
 * Keys are namespaced by format (`dae.Geometry`) for the same reason every other format's are: the
 * `document.format` facet is shared, and `Camera`, `Light` and `Material` are names a second 3D format
 * will certainly reuse.
 */
export function parseColladaRequirements(xml: string): RequirementSet {
  const features = collectColladaFeatures(xml);
  const requirements: Requirement[] = [];
  // Sorted by feature name so the walk order of the document is never an ordering claim; RequirementSet
  // canonicalizes anyway, and emitting in a stable order keeps a diff of two inventories readable.
  for (const feature of [...features].sort()) {
    requirements.push({
      facet: RequirementFacet.DocumentFormat,
      key: `${COLLADA_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
    });
  }
  if (features.has('Material')) {
    requirements.push({ facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind });
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}

// Accepts a namespace-prefixed root (`<c:COLLADA>`), which real exporter output carries.
function isColladaRoot(root: Readonly<XmlElement>): boolean {
  return localName(root) === 'COLLADA';
}

function localName(element: Readonly<XmlElement>): string {
  const separator = element.name.indexOf(':');
  return separator === -1 ? element.name : element.name.slice(separator + 1);
}

function visit(element: Readonly<XmlElement>, seen: (entry: Readonly<XmlElement>) => void): void {
  seen(element);
  for (const child of element.children) visit(child, seen);
}
