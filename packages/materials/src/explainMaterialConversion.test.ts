import { describe, expect, it } from 'vitest';

import { createPhongMaterial } from './classicMaterials';
import { explainPhongConversion, explainSpecularGlossinessConversion } from './explainMaterialConversion';
import { createSpecularGlossinessPbrMaterial } from './pbrMaterials';

const texture = {} as never;

describe('explainPhongConversion', () => {
  it('names specularMap as dropped, because standard PBR has no slot for that quantity', () => {
    const phong = createPhongMaterial({ specularMap: texture });
    expect(explainPhongConversion(phong)).toEqual({
      droppedMaps: ['specularMap'],
      reason: 'unsupported-by-target-model',
    });
  });

  it('reports an empty list when there is nothing to lose', () => {
    // The case a caller has to be able to tell apart from the lossy one: a lossless conversion and a
    // lossy one must not read the same.
    expect(explainPhongConversion(createPhongMaterial())).toEqual({ droppedMaps: [], reason: null });
  });
});

describe('explainSpecularGlossinessConversion', () => {
  it('names the packed map and why no assignment could have preserved it', () => {
    const source = createSpecularGlossinessPbrMaterial({ specularGlossinessMap: texture });
    // incompatible-channel-semantics, not unsupported: the target HAS a texture slot, but assigning to
    // it would be wrong rather than lossy — specular/glossiness and metallic/roughness pack different
    // quantities. That distinction is what tells a caller to bake rather than to look for a copy.
    expect(explainSpecularGlossinessConversion(source)).toEqual({
      droppedMaps: ['specularGlossinessMap'],
      reason: 'incompatible-channel-semantics',
    });
  });

  it('reports an empty list for a factor-only source', () => {
    expect(explainSpecularGlossinessConversion(createSpecularGlossinessPbrMaterial())).toEqual({
      droppedMaps: [],
      reason: null,
    });
  });

  it('retains nothing, so repeated queries agree', () => {
    const source = createSpecularGlossinessPbrMaterial({ specularGlossinessMap: texture });
    expect(explainSpecularGlossinessConversion(source)).toEqual(explainSpecularGlossinessConversion(source));
  });
});
