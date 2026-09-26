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

describe('parseObjRequirements material models', () => {
  const OBJ = 'mtllib a.mtl\nusemtl Red\nv 0 0 0\nf 1 1 1\n';

  // ★ THE PRECISION THIS EXISTS FOR. With the referenced MTL read, a classic library claims the classic
  // model and its renderer ONLY — the PBR key and the StandardPbr renderer are both absent, which is the
  // bundle weight the coarse key used to cost every OBJ.
  it('claims only the classic model and renderer for a classic library', () => {
    const keys = keysOf(parseObjRequirements(OBJ, ['newmtl Red\nKd 1 0 0\n']));
    expect(keys).toContain('obj.MaterialBlinnPhong');
    expect(keys).not.toContain('obj.MaterialStandardPbr');
    expect(keys).toContain(BlinnPhongMaterialKind);
    expect(keys).not.toContain(StandardPbrMaterialKind);
  });

  it('claims only the PBR model and renderer for a PBR library', () => {
    const keys = keysOf(parseObjRequirements(OBJ, ['newmtl Red\nPr 0.3\n']));
    expect(keys).toContain('obj.MaterialStandardPbr');
    expect(keys).not.toContain('obj.MaterialBlinnPhong');
    expect(keys).toContain(StandardPbrMaterialKind);
    expect(keys).not.toContain(BlinnPhongMaterialKind);
  });

  it('claims both when the library mixes models', () => {
    const keys = keysOf(parseObjRequirements(OBJ, ['newmtl A\nKd 1 0 0\nnewmtl B\nPr 0.3\n']));
    expect(keys).toContain('obj.MaterialBlinnPhong');
    expect(keys).toContain('obj.MaterialStandardPbr');
  });

  // The safe superset, and the reason it is safe: with no library text the models are unknown, so claiming
  // both keeps the build working. It costs precision, never correctness.
  it('claims both models when no library text is supplied', () => {
    const keys = keysOf(parseObjRequirements(OBJ));
    expect(keys).toContain('obj.MaterialBlinnPhong');
    expect(keys).toContain('obj.MaterialStandardPbr');
  });

  // The coarse key must never survive alongside the precise ones — no catalog row resolves it, so emitting
  // it would put an unresolvable requirement next to the answers.
  it('never emits the coarse obj.Material key', () => {
    for (const libraries of [undefined, ['newmtl Red\nKd 1 0 0\n']]) {
      expect(keysOf(parseObjRequirements(OBJ, libraries))).not.toContain('obj.Material');
    }
  });

  it('claims no material model for a file that references none', () => {
    const keys = keysOf(parseObjRequirements('v 0 0 0\nf 1 1 1\n'));
    expect(keys).not.toContain('obj.MaterialBlinnPhong');
    expect(keys).not.toContain('obj.MaterialStandardPbr');
    expect(keys).toContain('obj.Face');
  });
});

function keysOf(set: ReturnType<typeof parseObjRequirements>): readonly string[] {
  return set.requirements.map((requirement) => requirement.key);
}
