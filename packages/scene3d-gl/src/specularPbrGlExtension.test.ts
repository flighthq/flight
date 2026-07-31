import { createSpecularPbrExtension } from '@flighthq/materials/contract';
import { SpecularPbrExtensionKind } from '@flighthq/types/contract';

import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlSpecularPbrExtension, specularPbrGlExtension } from './specularPbrGlExtension';

describe('registerGlSpecularPbrExtension', () => {
  it('registers only the specular extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlSpecularPbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, SpecularPbrExtensionKind)).toBe(specularPbrGlExtension);
  });
});

describe('specularPbrGlExtension', () => {
  it('contributes dielectric F0 source', () => {
    const contribution = specularPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createSpecularPbrExtension(),
    );
    expect(contribution.applySurface).toContain('f0 = mix');
  });
});
