import { BlinnPhongMaterialKind, RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

import { parseObjRequirements } from './objRequirements.ts';

describe('parseObjRequirements', () => {
  it('emits one namespaced document.format requirement per feature present', () => {
    const set = parseObjRequirements('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3');
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'obj.Face' }]);
  });

  it('claims no material kind for a document with geometry and no material directives', () => {
    const set = parseObjRequirements('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3');
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('claims both BlinnPhong and StandardPbr when material directives are present', () => {
    const set = parseObjRequirements('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl stone\nf 1 2 3');
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('claims material kinds from mtllib alone', () => {
    const set = parseObjRequirements('mtllib scene.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3');
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('declares both facets it covers, so a consumer can tell inspected from never-looked', () => {
    expect(parseObjRequirements('').covers).toEqual([
      RequirementFacet.DocumentFormat,
      RequirementFacet.SceneMaterialKind,
    ]);
  });

  it('returns an empty set for empty input, still declaring coverage', () => {
    const set = parseObjRequirements('');
    expect(set.requirements).toEqual([]);
    expect(set.covers.length).toBeGreaterThan(0);
  });

  it('is deterministic regardless of directive order in the source', () => {
    const faceFirst = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nl 1 2';
    const lineFirst = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nl 1 2\nf 1 2 3';
    expect(parseObjRequirements(faceFirst).requirements).toEqual(parseObjRequirements(lineFirst).requirements);
  });

  it('emits Face, Line, and Point requirements for a file with all topology types', () => {
    const source = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nl 1 2\np 1';
    const set = parseObjRequirements(source);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toContain('obj.Face');
    expect(formatKeys).toContain('obj.Line');
    expect(formatKeys).toContain('obj.Point');
  });

  it('emits no requirements for comments-only input', () => {
    const set = parseObjRequirements('# just a comment\n# another one');
    expect(set.requirements).toEqual([]);
  });
});
