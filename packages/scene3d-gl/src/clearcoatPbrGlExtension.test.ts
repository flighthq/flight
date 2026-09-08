import { createClearcoatPbrExtension } from '@flighthq/materials/contract';
import type { Texture } from '@flighthq/types/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { clearcoatPbrGlExtension, registerGlClearcoatPbrExtension } from './clearcoatPbrGlExtension';
import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

describe('clearcoatPbrGlExtension', () => {
  it('contributes energy-conserving punctual and IBL clearcoat source', () => {
    const contribution = clearcoatPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createClearcoatPbrExtension(),
    );
    expect(contribution.contributePunctual).toContain('direct * (1.0 - flightClearcoatF)');
    expect(contribution.contributeIbl).toContain('ambient * (1.0 - flightClearcoatF)');
  });

  it('keeps the clearcoat normal on the coat lobe in both lighting paths', () => {
    const normalMap = {} as Texture;
    const contribution = clearcoatPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: (texture) => texture === normalMap },
      createClearcoatPbrExtension({ clearcoatNormalMap: normalMap }),
    );

    expect(contribution.applySurface).toBe('');
    expect(contribution.fragmentFunctions).toContain('vec3 flightClearcoatNormal(');
    expect(contribution.fragmentFunctions).toContain('u_flightClearcoatNormalMapTransform');
    expect(contribution.contributePunctual).toContain('flightClearcoatNormal(N, tangentDir, bitangentDir)');
    expect(contribution.contributeIbl).toContain('flightClearcoatNormal(N, tangentDir, bitangentDir)');
  });
});

describe('registerGlClearcoatPbrExtension', () => {
  it('registers only the clearcoat extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlClearcoatPbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, ClearcoatPbrExtensionKind)).toBe(clearcoatPbrGlExtension);
  });
});
