import { RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

import {
  COLLADA_FEATURE_ELEMENTS,
  collectColladaFeatures,
  isReadableCollada,
  parseColladaRequirements,
} from './colladaFeatures.ts';

describe('COLLADA_FEATURE_ELEMENTS', () => {
  it('covers the six features the decoders read, each keyed on a content element', () => {
    expect([...COLLADA_FEATURE_ELEMENTS.keys()].sort()).toEqual([
      'Animation',
      'Camera',
      'Controller',
      'Geometry',
      'Light',
      'Material',
    ]);
    for (const elements of COLLADA_FEATURE_ELEMENTS.values()) expect(elements.length).toBeGreaterThan(0);
  });

  // ★ NOT THE LIBRARY WRAPPERS. Keying on `library_geometries` would report geometry for the many files
  // that carry the empty library an exporter writes regardless, which is the coarseness this replaces.
  it('names no library wrapper, so an empty library evidences nothing', () => {
    for (const elements of COLLADA_FEATURE_ELEMENTS.values()) {
      for (const element of elements) expect(element.startsWith('library_')).toBe(false);
    }
  });
});

describe('collectColladaFeatures', () => {
  it('reports only the features a MINIMAL document contains', () => {
    expect([...collectColladaFeatures(collada('<library_geometries><geometry/></library_geometries>'))]).toEqual([
      'Geometry',
    ]);
  });

  // The distinction the whole analyzer exists for: every library present, none of them populated.
  it('reports nothing for a document whose libraries are all EMPTY', () => {
    const empty = collada(
      '<library_geometries/><library_materials/><library_effects/><library_cameras/><library_lights/>' +
        '<library_controllers/><library_animations/>',
    );
    expect([...collectColladaFeatures(empty)]).toEqual([]);
  });

  it('reports every feature a FULL document contains', () => {
    expect([...collectColladaFeatures(fullDocument())].sort()).toEqual([
      'Animation',
      'Camera',
      'Controller',
      'Geometry',
      'Light',
      'Material',
    ]);
  });

  it('accepts either material or effect content as evidence of shading', () => {
    expect([...collectColladaFeatures(collada('<library_materials><material/></library_materials>'))]).toEqual([
      'Material',
    ]);
    expect([...collectColladaFeatures(collada('<library_effects><effect/></library_effects>'))]).toEqual(['Material']);
  });

  // Real exporter output is namespace-prefixed, and a walk that matched on the raw element name would
  // see nothing in it while reporting no error.
  it('reads a namespace-prefixed document, root and elements alike', () => {
    const prefixed =
      '<?xml version="1.0"?><c:COLLADA xmlns:c="http://www.collada.org/2005/11/COLLADASchema">' +
      '<c:library_geometries><c:geometry/></c:library_geometries><c:library_cameras><c:camera/></c:library_cameras>' +
      '</c:COLLADA>';
    expect([...collectColladaFeatures(prefixed)].sort()).toEqual(['Camera', 'Geometry']);
  });

  it('finds content nested at any depth, not only directly under a library', () => {
    expect([...collectColladaFeatures(collada('<scene><node><instance><camera/></instance></node></scene>'))]).toEqual([
      'Camera',
    ]);
  });

  it.each([
    ['empty input', ''],
    ['not XML at all', 'this is not xml'],
    ['well-formed XML that is not COLLADA', '<?xml version="1.0"?><scene><geometry/></scene>'],
  ])('reports nothing for %s rather than throwing', (_label, xml) => {
    expect([...collectColladaFeatures(xml)]).toEqual([]);
  });

  // ★ RECOVERY IS THE XML PACKAGE'S CALL, NOT THIS ANALYZER'S. `parseXmlDocument` deliberately recovers
  // from a missing close tag and returns the content it did read, so a truncated document still reports
  // the features it carries. Pinned because the tempting assumption is the opposite — I wrote this test
  // asserting an empty set first, on strictness the parser does not have. An analyzer that re-imposed
  // strictness here would disagree with the importer about the same file, which is exactly the drift a
  // manifest exists to prevent; read-integrity belongs to one place.
  it('reports the content a truncated document did yield, matching the XML parser it shares', () => {
    expect([...collectColladaFeatures('<COLLADA><library_geometries><geometry/>')]).toEqual(['Geometry']);
  });
});

describe('isReadableCollada', () => {
  // Readability is asked SEPARATELY because an empty feature set means both "needs nothing" and "could
  // not be read", and a build that cannot tell those apart ships without what the content needed.
  it('separates an unreadable file from one that needs nothing', () => {
    expect(isReadableCollada(collada(''))).toBe(true);
    expect(isReadableCollada('not xml')).toBe(false);
    expect(isReadableCollada('<?xml version="1.0"?><scene/>')).toBe(false);
  });
});

describe('parseColladaRequirements', () => {
  it('emits one namespaced document.format requirement per feature present', () => {
    const set = parseColladaRequirements(collada('<library_geometries><geometry/></library_geometries>'));
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'dae.Geometry' }]);
  });

  // ★ THE MATERIAL CLAIM IS NOW CONDITIONAL. It used to be emitted for every `.dae`, which wired a PBR
  // material path into builds whose documents carried geometry and no shading at all.
  it('claims no material kind for a document with geometry and no shading', () => {
    const set = parseColladaRequirements(collada('<library_geometries><geometry/></library_geometries>'));
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('claims StandardPbr exactly when material or effect content exists', () => {
    for (const content of [
      '<library_materials><material/></library_materials>',
      '<library_effects><effect/></library_effects>',
    ]) {
      const set = parseColladaRequirements(collada(content));
      expect(set.requirements, content).toContainEqual({
        facet: RequirementFacet.SceneMaterialKind,
        key: StandardPbrMaterialKind,
      });
    }
  });

  it('declares both facets it covers, so a consumer can tell inspected from never-looked', () => {
    expect(parseColladaRequirements(collada('')).covers).toEqual([
      RequirementFacet.DocumentFormat,
      RequirementFacet.SceneMaterialKind,
    ]);
  });

  it('returns an empty set that still declares coverage for an unreadable document', () => {
    const set = parseColladaRequirements('not xml');
    expect(set.requirements).toEqual([]);
    expect(set.covers.length).toBeGreaterThan(0);
  });

  it('is deterministic regardless of the order features appear in the document', () => {
    const forward = collada(
      '<library_cameras><camera/></library_cameras><library_geometries><geometry/></library_geometries>',
    );
    const reverse = collada(
      '<library_geometries><geometry/></library_geometries><library_cameras><camera/></library_cameras>',
    );
    expect(parseColladaRequirements(forward).requirements).toEqual(parseColladaRequirements(reverse).requirements);
  });
});

function collada(body: string): string {
  return `<?xml version="1.0"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">${body}</COLLADA>`;
}

function fullDocument(): string {
  return collada(
    '<library_geometries><geometry/></library_geometries>' +
      '<library_materials><material/></library_materials>' +
      '<library_effects><effect/></library_effects>' +
      '<library_cameras><camera/></library_cameras>' +
      '<library_lights><light/></library_lights>' +
      '<library_controllers><controller><skin/></controller></library_controllers>' +
      '<library_animations><animation/></library_animations>',
  );
}
