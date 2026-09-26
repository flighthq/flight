import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet, XmlElement } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { COLLADA_FEATURE_SCENE_REQUIREMENTS } from './colladaFeatureRequirements.ts';
import { COLLADA_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * The COLLADA features a build can be asked to support, and the element that EVIDENCES each one.
 *
 * ★ TWO TIERS OF GRANULARITY. The coarse tier (`Camera`, `Light`, `Material`, etc.) matches the
 * decoder families and the catalog entries — it is the level at which the parser opts into features.
 * The fine tier (`Camera.Perspective`, `Light.Point`, `Effect.Phong`, etc.) is the level at which
 * the census reports what a file actually contains — it is the native unit of content the format
 * defines, and it is what enables a build to resolve the narrowest set of implementations the
 * content needs.
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
  ['Camera.Orthographic', ['orthographic']],
  ['Camera.Perspective', ['perspective']],
  ['Controller', ['controller']],
  ['Controller.Morph', ['morph']],
  ['Controller.Skin', ['skin']],
  ['Effect.Blinn', ['blinn']],
  ['Effect.Lambert', ['lambert']],
  ['Effect.Phong', ['phong']],
  ['Geometry', ['geometry']],
  ['Image', ['image']],
  ['Light', ['light']],
  ['Light.Ambient', ['ambient']],
  ['Light.Directional', ['directional']],
  ['Light.Point', ['point']],
  ['Light.Spot', ['spot']],
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

  visit(root, (element) => {
    const name = localName(element);
    const coarseFeature = COLLADA_COARSE_ELEMENT_FEATURES.get(name);
    if (coarseFeature !== undefined) {
      found.add(coarseFeature);
      const subFeatures = COLLADA_SUB_ELEMENT_FEATURES.get(name);
      if (subFeatures !== undefined) {
        visit(element, (descendant) => {
          const sub = subFeatures.get(localName(descendant));
          if (sub !== undefined) found.add(sub);
        });
      }
    }
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
    const sceneRequirements = COLLADA_FEATURE_SCENE_REQUIREMENTS.get(feature);
    if (sceneRequirements !== undefined) {
      for (const req of sceneRequirements) requirements.push(req);
    }
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

const COLLADA_COARSE_ELEMENT_FEATURES: ReadonlyMap<string, string> = new Map([
  ['animation', 'Animation'],
  ['camera', 'Camera'],
  ['controller', 'Controller'],
  ['effect', 'Material'],
  ['geometry', 'Geometry'],
  ['image', 'Image'],
  ['light', 'Light'],
  ['material', 'Material'],
]);

const COLLADA_SUB_ELEMENT_FEATURES: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  [
    'camera',
    new Map([
      ['orthographic', 'Camera.Orthographic'],
      ['perspective', 'Camera.Perspective'],
    ]),
  ],
  [
    'controller',
    new Map([
      ['morph', 'Controller.Morph'],
      ['skin', 'Controller.Skin'],
    ]),
  ],
  [
    'effect',
    new Map([
      ['blinn', 'Effect.Blinn'],
      ['lambert', 'Effect.Lambert'],
      ['phong', 'Effect.Phong'],
    ]),
  ],
  [
    'light',
    new Map([
      ['ambient', 'Light.Ambient'],
      ['directional', 'Light.Directional'],
      ['point', 'Light.Point'],
      ['spot', 'Light.Spot'],
    ]),
  ],
]);
