import { RequirementFacet } from '@flighthq/types/contract';

import { parseMd5AnimRequirements } from './md5AnimRequirements.ts';

describe('parseMd5AnimRequirements', () => {
  it('emits namespaced document.format requirements per feature present', () => {
    const source = 'hierarchy {\n"root" -1 63 0\n}\nframe 0 {\n0 0 0\n}\n';
    const set = parseMd5AnimRequirements(source);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Animation' });
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Hierarchy' });
  });

  it('never claims any material kind', () => {
    const source = 'hierarchy {\n"root" -1 63 0\n}\nframe 0 {\n0 0 0\n}\n';
    const set = parseMd5AnimRequirements(source);
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('emits no requirements for empty input', () => {
    const set = parseMd5AnimRequirements('');
    expect(set.requirements).toEqual([]);
  });

  it('declares both facets it covers', () => {
    expect(parseMd5AnimRequirements('').covers).toEqual([
      RequirementFacet.DocumentFormat,
      RequirementFacet.SceneMaterialKind,
    ]);
  });

  it('is deterministic regardless of section order', () => {
    const hierarchyFirst = 'hierarchy {\n"a" -1 0 0\n}\nframe 0 {\n0\n}\n';
    const frameFirst = 'frame 0 {\n0\n}\nhierarchy {\n"a" -1 0 0\n}\n';
    expect(parseMd5AnimRequirements(hierarchyFirst).requirements).toEqual(
      parseMd5AnimRequirements(frameFirst).requirements,
    );
  });

  it('emits only Hierarchy when no frame sections exist', () => {
    const source = 'hierarchy {\n"root" -1 0 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\n';
    const set = parseMd5AnimRequirements(source);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toEqual(['md5.Hierarchy']);
  });

  it('emits only Animation when no hierarchy section exists', () => {
    const source = 'frame 0 {\n0 0 0\n}\n';
    const set = parseMd5AnimRequirements(source);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toEqual(['md5.Animation']);
  });

  it('emits no requirements for comments-only input', () => {
    const set = parseMd5AnimRequirements('// just a comment\n// another one');
    expect(set.requirements).toEqual([]);
  });
});
