import { RequirementFacet } from './RequirementFacet';

describe('RequirementFacet', () => {
  it('is a sorted, dot-namespaced declared vocabulary', () => {
    const values = Object.values(RequirementFacet);
    expect(values).toEqual(values.slice().sort());
    expect(values.every((value) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value))).toBe(true);
  });

  it('is a superset of facets the current scene walks emit', () => {
    expect(RequirementFacet.CompressionKind).toBe('compression.kind');
    expect(RequirementFacet.DocumentFormat).toBe('document.format');
    expect(RequirementFacet.Physics2DJointKind).toBe('physics2d.joint-kind');
  });
});
