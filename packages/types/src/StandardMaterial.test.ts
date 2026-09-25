import { StandardMaterialKind } from './StandardMaterial.ts';

describe('StandardMaterialKind', () => {
  it('is the canonical standard material registry key', () => {
    const kind: 'StandardMaterial' = StandardMaterialKind;
    expect(kind).toBe('StandardMaterial');
  });
});
