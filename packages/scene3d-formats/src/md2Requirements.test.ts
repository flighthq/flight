import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { parseMd2Requirements } from './md2Requirements.ts';
import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from './md2Schema.ts';

describe('parseMd2Requirements', () => {
  it('emits namespaced document.format requirements per feature present', () => {
    const header = buildMd2Header({ numFrames: 1, numTriangles: 10 });
    const set = parseMd2Requirements(header);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md2.Mesh' });
  });

  it('claims no material kind for a mesh-only model with no skins', () => {
    const header = buildMd2Header({ numFrames: 1, numTriangles: 10 });
    const set = parseMd2Requirements(header);
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('claims BlinnPhong when skins are present', () => {
    const header = buildMd2Header({ numFrames: 1, numSkins: 1, numTriangles: 10 });
    const set = parseMd2Requirements(header);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('emits Animation requirement when frames > 1', () => {
    const header = buildMd2Header({ numFrames: 5, numTriangles: 10 });
    const set = parseMd2Requirements(header);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md2.Animation' });
  });

  it('emits no requirements for an unreadable file', () => {
    const set = parseMd2Requirements(new Uint8Array(10));
    expect(set.requirements).toEqual([]);
  });

  it('declares both facets it covers', () => {
    expect(parseMd2Requirements(new Uint8Array(10)).covers).toEqual([
      RequirementFacet.DocumentFormat,
      RequirementFacet.SceneMaterialKind,
    ]);
  });

  it('is deterministic for a full model', () => {
    const header = buildMd2Header({ numFrames: 10, numSkins: 1, numTriangles: 50 });
    const a = parseMd2Requirements(header);
    const b = parseMd2Requirements(header);
    expect(a.requirements).toEqual(b.requirements);
  });

  it('emits all three format requirements for a full model', () => {
    const header = buildMd2Header({ numFrames: 10, numSkins: 1, numTriangles: 50 });
    const set = parseMd2Requirements(header);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toContain('md2.Animation');
    expect(formatKeys).toContain('md2.Material');
    expect(formatKeys).toContain('md2.Mesh');
  });
});

function buildMd2Header(overrides: { numFrames?: number; numSkins?: number; numTriangles?: number }): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, overrides.numSkins ?? 0, true);
  view.setInt32(32, overrides.numTriangles ?? 0, true);
  view.setInt32(40, overrides.numFrames ?? 0, true);
  return new Uint8Array(buf);
}
