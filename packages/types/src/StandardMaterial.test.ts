import { StandardMaterialKind } from './StandardMaterial';

describe('StandardMaterialKind', () => {
  it('is the canonical standard material registry key', () => {
    const kind: 'StandardMaterial' = StandardMaterialKind;
    expect(kind).toBe('StandardMaterial');
  });
});
