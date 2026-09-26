import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { parseMd5MeshRequirements } from './md5MeshRequirements.ts';

describe('parseMd5MeshRequirements', () => {
  it('emits namespaced document.format requirements per feature present', () => {
    const source = 'joints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader "body"\n}\n';
    const set = parseMd5MeshRequirements(source);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Material' });
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Mesh' });
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Skeleton' });
  });

  it('claims no material kind when no shader is present', () => {
    const source = 'joints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader ""\n}\n';
    const set = parseMd5MeshRequirements(source);
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('claims BlinnPhong when shader references are present', () => {
    const source = 'mesh {\nshader "models/body"\n}\n';
    const set = parseMd5MeshRequirements(source);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('emits no requirements for empty input', () => {
    const set = parseMd5MeshRequirements('');
    expect(set.requirements).toEqual([]);
  });

  it('declares both facets it covers', () => {
    expect(parseMd5MeshRequirements('').covers).toEqual([
      RequirementFacet.DocumentFormat,
      RequirementFacet.SceneMaterialKind,
    ]);
  });

  it('is deterministic regardless of section order in source', () => {
    const meshFirst = 'mesh {\nshader "x"\n}\njoints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\n';
    const jointsFirst = 'joints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader "x"\n}\n';
    expect(parseMd5MeshRequirements(meshFirst).requirements).toEqual(
      parseMd5MeshRequirements(jointsFirst).requirements,
    );
  });

  it('emits Mesh and Skeleton but not Material for a mesh with empty shader', () => {
    const source = 'joints {\n"root" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader ""\n}\n';
    const set = parseMd5MeshRequirements(source);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toContain('md5.Mesh');
    expect(formatKeys).toContain('md5.Skeleton');
    expect(formatKeys).not.toContain('md5.Material');
  });

  it('emits no requirements for comments-only input', () => {
    const set = parseMd5MeshRequirements('// just a comment\n// another one');
    expect(set.requirements).toEqual([]);
  });
});
