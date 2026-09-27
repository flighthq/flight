import { encodeUTF8 } from '@flighthq/encoding/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { STL_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';
import { parseStlRequirements } from './stlRequirements.ts';
import { buildAsciiStl, buildBinaryStl, STL_SQUARE_FACETS } from './stlTestHelper.ts';

describe('parseStlRequirements', () => {
  // ★ ONE KEY, WHICHEVER ENCODING AND HOWEVER LARGE. The encoding is a fact about the file, not about what a
  // build needs — both are read by the same parser — so a census difference must not become a requirement
  // difference.
  it('emits only stl.Mesh, for either encoding and any triangle count', () => {
    const expected = [{ facet: RequirementFacet.DocumentFormat, key: 'stl.Mesh' }];
    expect(parseStlRequirements(buildBinaryStl(STL_SQUARE_FACETS)).requirements).toEqual(expected);
    expect(parseStlRequirements(encodeUTF8(buildAsciiStl(STL_SQUARE_FACETS))).requirements).toEqual(expected);
    expect(parseStlRequirements(buildBinaryStl([STL_SQUARE_FACETS[0]])).requirements).toEqual(expected);
  });

  it('builds the key from the namespace constant the catalog also builds from', () => {
    expect(STL_REQUIREMENT_KEY_NAMESPACE).toBe('stl');
    expect(parseStlRequirements(buildBinaryStl(STL_SQUARE_FACETS)).requirements[0].key).toBe(
      `${STL_REQUIREMENT_KEY_NAMESPACE}.Mesh`,
    );
  });

  // ★ NOTHING BEYOND document.format IS CLAIMED, and the facet list is where that promise lives. STL carries no
  // materials, no animation and no node kinds, so claiming `scene.material-kind` — as the richer 3D formats
  // legitimately do — would put a material renderer in the bundle for content that cannot reference one.
  it('covers document.format alone, because STL describes nothing else', () => {
    const set = parseStlRequirements(buildBinaryStl(STL_SQUARE_FACETS));
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    for (const requirement of set.requirements) {
      expect(requirement.facet).toBe(RequirementFacet.DocumentFormat);
    }
  });

  it.each([
    ['empty bytes', ''],
    ['prose containing the word solid', 'this solid object is not a model'],
    ['a solid line with no facets', 'solid empty\nendsolid empty'],
    ['an OBJ', 'v 0 0 0\nf 1 1 1\n'],
  ])('emits nothing for %s', (_label, text) => {
    expect(parseStlRequirements(encodeUTF8(text)).requirements).toEqual([]);
  });

  // A truncated binary file is the case where "requires nothing" and "could not be read" are genuinely different
  // answers, and the reason `collectStlFeatures` is the paired readability question rather than a count nobody
  // checks: an empty set here means a build links no STL parser at all.
  it('emits nothing for a truncated binary file', () => {
    expect(parseStlRequirements(buildBinaryStl(STL_SQUARE_FACETS).subarray(0, 120)).requirements).toEqual([]);
  });
});
